"""Triage engine: red-flag overrides, adaptive questions, LLM settings, contract."""

from __future__ import annotations

import json
import random

import pytest

from app.core import config
from app.ml import question_policy, red_flags, severity_model
from app.ml.features import SEVERITIES, Turn, build_features
from app.ml.severity_model import Prediction, SeverityModel
from app.schemas.triage import Message
from app.services import bandit_service, triage_engine, triage_service


class Forced(SeverityModel):
    """The bundled model for information gain, with a fixed prediction."""

    def __init__(self, severity: str, confidence: float = 0.99):
        super().__init__(json.loads(severity_model.BUNDLED_PATH.read_text(encoding="utf-8")))
        self.forced = (severity, confidence)

    def predict(self, f):
        sev, conf = self.forced
        probs = {s: conf if s == sev else round((1 - conf) / 3, 4) for s in SEVERITIES}
        return Prediction(probs, sev, conf, "forced")


@pytest.fixture
def model():
    def use(severity="LOW", confidence=0.99):
        severity_model.reset_for_tests(Forced(severity, confidence))
    return use


class FakeProvider:
    def __init__(self, reply=None, fail=False):
        self.calls = []
        self.reply = reply
        self.fail = fail

    def generate(self, messages, *, seed=None, timeout=None):
        self.calls.append({"messages": messages, "seed": seed, "timeout": timeout})
        if self.fail:
            raise RuntimeError("model down")
        if self.reply is not None:
            return json.dumps(self.reply)
        if "TASK: Ask" in messages[0]["content"] or "TASK: The person has not" in messages[0]["content"]:
            return json.dumps({"question": "Since when has this been going on?", "reasoning": "Duration matters."})
        return json.dumps({"reasoning": "Because of X.", "advice": "Rest and drink water.", "likelyCauses": ["Viral infection"],
                           "homeCare": ["Rest"], "warningSigns": ["Breathing trouble"], "seekCare": "Clinic if not better in 3 days."})


def run(texts, provider=None, session="s1", **kw):
    msgs = [Message(role="user", content=t) for t in texts]
    return triage_engine.run(msgs, None, provider=provider, session_id=session, **kw).reply


# --- red-flag overrides ----------------------------------------------------

@pytest.mark.parametrize("text", [
    "I have chest pain", "his face is drooping and speech is slurred", "I can't breathe", "difficulty breathing since an hour",
    "bleeding heavily and it won't stop", "coughing up blood", "she is unconscious", "my son is having a seizure",
    "throat is swelling after a bee sting", "swallowed pesticide", "I want to kill myself", "snake bite on my leg",
    "worst headache of my life", "seene mein dard ho raha hai", "saans nahi aa rahi", "सीने में दर्द है", "बेहोश हो गए",
    "my oxygen level is 85%", "bp is 80/50", "my 2 month old baby has a fever",
])
def test_red_flags_force_emergency_even_when_the_model_says_low(model, text):
    model("LOW", 0.99)
    r = run([text])
    assert r["severity"] == "EMERGENCY" and r["triage"]["source"] == "rules"
    assert r["followUpQuestions"] == [] and r["triage"]["mode"] == "final"  # never delayed by questions
    assert "108" in r["advice"] and r["riskScore"] >= 90 and r["confidence"] == 1.0


@pytest.mark.parametrize("text", [
    "no chest pain, just a mild cough", "chest pain nahi hai, bas khansi", "no difficulty breathing, runny nose",
    "coughing fits at night", "I feel fit otherwise",
])
def test_negated_or_unrelated_mentions_do_not_fire(text):
    assert "chest_pain" not in build_features([Turn("user", text)]).red_flags
    assert not {"breathing", "seizure"} & set(build_features([Turn("user", text)]).red_flags)


def test_high_floor_is_never_lowered_and_skips_home_care(model):
    model("LOW", 0.99)
    r = run(["I think I broke my arm, can't move it"], FakeProvider())
    assert r["severity"] == "HIGH" and r["triage"]["source"] == "rules" and r["homeCare"] == []
    assert run(["my 8 month old has a fever"])["severity"] == "HIGH"


def test_the_model_can_raise_but_rules_set_the_floor():
    f = build_features([Turn("user", "I have chest pain")])
    assert red_flags.apply_floor("LOW", f)[:2] == ("EMERGENCY", "rules")
    calm = build_features([Turn("user", "mild cough")])
    assert red_flags.apply_floor("EMERGENCY", calm)[:2] == ("EMERGENCY", "model")


def test_llm_cannot_downgrade_or_drop_emergency_guidance(model):
    model("LOW", 0.99)
    llm = FakeProvider({"severity": "LOW", "riskScore": 5, "advice": "Probably acidity, take an antacid.", "reasoning": "x"})
    r = run(["chest pain spreading to my arm"], llm)
    assert r["severity"] == "EMERGENCY" and r["riskScore"] >= 90
    assert r["advice"].startswith("Call 108")


def test_self_harm_adds_the_helpline(model):
    model("LOW", 0.99)
    assert "14416" in run(["I want to end my life"], FakeProvider())["advice"]


# --- adaptive questions ----------------------------------------------------

def test_asks_one_question_for_a_missing_feature_then_stops_at_five(model, monkeypatch):
    model("MODERATE", 0.4)
    monkeypatch.setattr(question_policy, "MIN_GAIN", -1.0)  # keep asking: test the hard cap
    msgs = [Message(role="user", content="I have a headache")]
    asked = []
    for _ in range(8):
        r = triage_engine.run(msgs, None, provider=FakeProvider(), session_id="cap").reply
        msgs.append(Message(role="assistant", content=json.dumps(r)))
        if r["triage"]["mode"] == "final":
            break
        assert len(r["followUpQuestions"]) == 1 and r["severity"] is None
        asked.append(r["triage"]["slot"])
        msgs.append(Message(role="user", content="not sure"))
    assert len(asked) == config.TRIAGE_MAX_QUESTIONS == 5
    assert len(set(asked)) == len(asked)  # never the same question twice
    assert r["triage"]["stop"] == "max_questions" and r["severity"] in SEVERITIES


def test_stops_as_soon_as_confident(model):
    model("MODERATE", 0.9)
    r = run(["burning when I urinate for 2 days"], FakeProvider())
    assert r["triage"]["mode"] == "final" and r["triage"]["stop"] == "confident" and r["severity"] == "MODERATE"


def test_known_features_are_not_asked(model):
    model("MODERATE", 0.4)
    r = run(["fever 102 f for 3 days, I am 30 years old, pain 4/10"], FakeProvider())
    assert r["triage"]["slot"] not in {"duration", "age", "pain", "fever", "temperature"}


def test_vague_opener_asks_for_the_complaint(model):
    model("MODERATE", 0.3)
    r = run(["hello"], FakeProvider())
    assert r["triage"]["slot"] == "complaint" and r["followUpQuestions"]


def test_follow_up_after_a_final_answer_is_not_another_questionnaire(model):
    model("LOW", 0.5)
    final = run(["runny nose"], FakeProvider(), )
    final["triage"]["mode"], final["severity"] = "final", "LOW"
    msgs = [Message(role="user", content="runny nose"), Message(role="assistant", content=json.dumps(final)),
            Message(role="user", content="can I take paracetamol?")]
    r = triage_engine.run(msgs, None, provider=FakeProvider(), session_id="s").reply
    assert r["triage"]["mode"] == "final" and r["triage"]["stop"] == "follow_up"


def test_bandit_weight_can_change_the_question():
    model = severity_model.load_bundled()
    f = build_features([Turn("user", "fever and cough for a day")])
    first = question_policy.choose(model, f, 0.3)
    other = question_policy.choose(model, f, 0.3, weight=lambda s, _r: 0.0 if s == first.slot.id else 1.0)
    assert first.slot and other.slot and other.slot.id != first.slot.id


def test_bandit_prefers_the_variant_people_liked():
    bandit_service.reset_for_tests({"prompt#final.concise": (200, 2), "prompt#final.structured": (2, 200)})
    picks = [bandit_service.pick(triage_engine.PROMPT_VARIANTS["final"], random.Random(i)) for i in range(20)]
    assert picks.count("final.concise") >= 18


# --- LLM settings and contract ---------------------------------------------

def test_seed_is_per_session_and_prompt_carries_the_state(model):
    model("MODERATE", 0.4)
    a, b = FakeProvider(), FakeProvider()
    run(["fever for 2 days"], a, session="one")
    run(["fever for 2 days"], b, session="two")
    run(["fever for 2 days"], b, session="two")
    assert a.calls[0]["seed"] == triage_engine.session_seed("one") != b.calls[0]["seed"] == b.calls[1]["seed"]
    system = a.calls[0]["messages"][0]["content"]
    assert "TRIAGE ENGINE STATE" in system and "fever: yes" in system and "Questions asked so far: 0 of at most 5" in system
    assert a.calls[0]["timeout"] <= config.AI_TIMEOUT


def test_openai_provider_uses_varied_sampling(monkeypatch):
    from app.integrations.ai import openai_provider

    seen = {}

    class Completions:
        def create(self, **kw):
            seen.update(kw)
            msg = type("M", (), {"content": '{"question": "q"}'})
            return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    class Client:
        chat = type("Chat", (), {"completions": Completions()})()

        def with_options(self, **_):
            return self

    p = openai_provider.OpenAIProvider()
    monkeypatch.setattr(openai_provider.OpenAIProvider, "_client", lambda self: Client())
    p.generate([{"role": "user", "content": "x"}], seed=42, timeout=5)
    assert (seen["temperature"], seen["top_p"], seen["seed"]) == (0.7, 0.9, 42)
    assert 0.6 <= config.AI_TEMPERATURE <= 0.8


def test_llm_failure_falls_back_to_templates_with_the_same_severity(model, monkeypatch):
    model("MODERATE", 0.9)
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    text, offline = triage_service.run_triage([Message(role="user", content="ear pain since yesterday")], None,
                                              provider=FakeProvider(fail=True), session_id="x")
    r = json.loads(text)
    assert offline and r["severity"] == "MODERATE" and r["advice"] and r["disclaimer"]


def test_reply_keeps_the_existing_contract(model):
    model("LOW", 0.95)
    r = run(["slight headache since morning"], FakeProvider())
    for key in ("reasoning", "followUpQuestions", "severity", "riskScore", "advice", "disclaimer"):
        assert key in r
    assert r["severity"] == "LOW" and r["riskScore"] <= 34 and r["likelyCauses"] == ["Viral infection"]
    assert r["triage"]["modelVersion"] == "forced" and r["triage"]["variant"] in triage_engine.PROMPT_VARIANTS["final"]
