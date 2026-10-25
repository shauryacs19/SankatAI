"""Triage engine: red-flag overrides, the LLM's own questions, LLM settings, contract."""

from __future__ import annotations

import json
import random

import pytest

from app.core import config
from app.ml import red_flags, severity_model
from app.ml.features import SEVERITIES, Turn, build_features
from app.ml.severity_model import Prediction, SeverityModel
from app.schemas.triage import Message
from app.services import bandit_service, triage_engine, triage_service


class Forced(SeverityModel):
    """The bundled model, with a fixed prediction."""

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
        return json.dumps(ASSESSMENT)


ASSESSMENT = {"type": "assessment", "reasoning": "Because of X.", "advice": "Rest and drink water.", "likelyCauses": ["Viral infection"],
              "homeCare": ["Rest"], "warningSigns": ["Breathing trouble"], "seekCare": "Clinic if not better in 3 days."}
QUESTIONS = {"type": "questions", "intro": "A few quick questions.", "questions": [
    {"label": "How long", "question": "Since when has this been going on?", "kind": "choice",
     "options": ["Today", "1-3 days", "More than 3 days"], "allowOther": True},
    {"label": "Fever", "question": "Do you have a fever?", "kind": "yes_no"},
    {"label": "Anything else", "question": "What makes it better or worse?", "kind": "text"},
]}


def run(texts, provider=None, session="s1", **kw):
    msgs = [Message(role="user", content=t) for t in texts]
    return triage_engine.run(msgs, None, provider=provider, session_id=session, **kw).reply


# --- red-flag overrides ----------------------------------------------------

@pytest.mark.parametrize("text", [
    "I have chest pain", "his face is drooping and speech is slurred", "I can't breathe", "difficulty breathing since an hour",
    "bleeding heavily and it won't stop", "coughing up blood", "she is unconscious", "my son is having a seizure",
    "throat is swelling after a bee sting", "swallowed pesticide", "I want to kill myself", "snake bite on my leg",
    "worst headache of my life", "seene mein dard ho raha hai", "saans nahi aa rahi", "सीने में दर्द है", "बेहोश हो गए",
    "my oxygen level is 85%", "bp is 80/50", "my 2 month old baby has a fever", "her lips are turning blue",
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


# --- the LLM's own questions -----------------------------------------------

def test_the_llms_questions_are_shown_as_a_questionnaire(model):
    model("MODERATE", 0.4)
    r = run(["I have a headache"], FakeProvider(QUESTIONS))
    items = r["questionnaire"]
    assert r["severity"] is None and r["triage"]["mode"] == "ask" and r["reasoning"] == "A few quick questions."
    assert [it["question"] for it in items] == r["followUpQuestions"] == [q["question"] for q in QUESTIONS["questions"]]
    assert [it["kind"] for it in items] == ["choice", "yes_no", "text"]
    assert [o["label"] for o in items[0]["options"]] == ["Today", "1-3 days", "More than 3 days"] and items[0]["allowOther"]
    assert [o["label"] for o in items[1]["options"]] == ["Yes", "No"] and "allowOther" not in items[1]
    assert items[2]["options"] == [] and items[0]["short"] == "How long"


def test_malformed_questions_are_made_safe_or_dropped(model, monkeypatch):
    model("MODERATE", 0.4)
    monkeypatch.setattr(config, "TRIAGE_MAX_QUESTIONS", 3)
    raw = {"type": "questions", "intro": "x" * 999, "questions": [
        {"question": "Is it hard to breathe?", "kind": "yes_no", "options": ["Y", "N", "Maybe"]},  # yes/no = exactly two
        {"question": "Which side?", "kind": "choice", "options": ["Left"]},  # one option: becomes a text question
        {"question": "", "kind": "text"}, "not a dict",  # dropped
        {"question": "Q4", "kind": "weird", "options": ["a", "a", "b"]},  # unknown kind with options: choice, deduped
        {"question": "Q5", "kind": "text"},  # over the limit of 3
    ]}
    items = run(["my side hurts"], FakeProvider(raw))["questionnaire"]
    assert [it["kind"] for it in items] == ["yes_no", "text", "choice"]
    assert [o["label"] for o in items[0]["options"]] == ["Yes", "No"]
    assert [o["label"] for o in items[2]["options"]] == ["a", "b"]


def test_no_questions_in_an_emergency_or_right_after_answers(model):
    model("LOW", 0.99)
    llm = FakeProvider(QUESTIONS)
    r = run(["I have chest pain"], llm)
    assert r["severity"] == "EMERGENCY" and "questionnaire" not in r
    assert "give the assessment now, with no questions" in llm.calls[0]["messages"][0]["content"]

    model("MODERATE", 0.4)
    first = run(["I have a headache"], FakeProvider(QUESTIONS))
    msgs = [Message(role="user", content="I have a headache"), Message(role="assistant", content=json.dumps(first)),
            Message(role="user", content="My answers: ...")]
    llm = FakeProvider(QUESTIONS)  # the LLM tries to ask again: ignored, the assessment follows
    r = triage_engine.run(msgs, None, provider=llm, session_id="s").reply
    assert "just answered your questions" in llm.calls[0]["messages"][0]["content"]
    assert r["triage"]["mode"] == "final" and r["severity"] == "MODERATE"


def test_the_llm_may_assess_straight_away(model):
    model("MODERATE", 0.9)
    r = run(["burning when I urinate for 2 days"], FakeProvider())
    assert r["triage"]["mode"] == "final" and r["severity"] == "MODERATE" and r["advice"] == "Rest and drink water."


def test_offline_never_invents_questions(model):
    model("MODERATE", 0.4)
    r = run(["I have a headache since morning"])  # no provider
    assert r["triage"]["mode"] == "final" and r["severity"] == "MODERATE" and "questionnaire" not in r
    hello = run(["hello"])
    assert hello["triage"]["mode"] == "describe" and hello["severity"] is None and "questionnaire" not in hello


def test_a_what_is_wrong_question_does_not_use_up_the_round(model):
    model("MODERATE", 0.4)
    ask_complaint = {"type": "questions", "intro": "", "questions": [{"question": "What is bothering you?", "kind": "text"}]}
    first = run(["hi"], FakeProvider(ask_complaint))
    msgs = [Message(role="user", content="hi"), Message(role="assistant", content=json.dumps(first)),
            Message(role="user", content="I have had a headache for two days")]
    llm = FakeProvider(QUESTIONS)
    r = triage_engine.run(msgs, None, provider=llm, session_id="s").reply
    assert r["triage"]["mode"] == "ask"  # real follow-ups are still allowed


def test_follow_up_after_an_assessment_is_answered(model):
    model("LOW", 0.5)
    final = run(["runny nose"], FakeProvider())
    msgs = [Message(role="user", content="runny nose"), Message(role="assistant", content=json.dumps(final)),
            Message(role="user", content="can I take paracetamol?")]
    llm = FakeProvider()
    r = triage_engine.run(msgs, None, provider=llm, session_id="s").reply
    assert r["triage"]["mode"] == "final" and r["triage"]["stop"] == "follow_up"
    assert "follow-up question, answer it inside 'advice'" in llm.calls[0]["messages"][0]["content"]


def test_bandit_prefers_the_variant_people_liked():
    bandit_service.reset_for_tests({"prompt#final.concise": (200, 2), "prompt#final.structured": (2, 200)})
    picks = [bandit_service.pick(triage_engine.PROMPT_VARIANTS, random.Random(i)) for i in range(20)]
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
    assert "TRIAGE ENGINE STATE" in system and "fever: yes" in system and "up to 5 short follow-up questions" in system
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
    assert r["triage"]["modelVersion"] == "forced" and r["triage"]["variant"] in triage_engine.PROMPT_VARIANTS


# --- care focus (nearby hospitals / clinics) --------------------------------

def test_assessment_carries_the_llms_care_focus(model):
    model("MODERATE", 0.9)
    llm = FakeProvider({**ASSESSMENT, "care": {"issue": "Ankle sprain", "specialty": "Orthopaedics"}})
    r = run(["I twisted my ankle while running"], llm)
    assert r["care"] == {"issue": "Ankle sprain", "specialty": "orthopaedics"}
    assert "orthopaedics | " in llm.calls[0]["messages"][0]["content"]  # the prompt lists the specialties


def test_care_focus_falls_back_to_the_persons_words(model):
    model("MODERATE", 0.9)
    bad = run(["toothache since two days, gums swollen"], FakeProvider({**ASSESSMENT, "care": {"specialty": "astrology"}}))
    assert bad["care"] == {"issue": "Viral infection", "specialty": "dentistry"}  # issue from the first likely cause
    offline = run(["I have a skin rash and itching"])  # no LLM: template assessment
    assert offline["care"]["specialty"] == "dermatology" and offline["care"]["issue"]
