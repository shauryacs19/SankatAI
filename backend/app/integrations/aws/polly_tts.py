"""Speech synthesis (Amazon Polly) and the optional S3 cache for its output.

Single responsibility: (text, voice) -> MP3 bytes, and get/put/presign of cached
MP3s under the `tts/` prefix. Knows nothing about users or messages. Text and
audio are never logged.
"""

from __future__ import annotations

from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core import config

_polly = None
_s3 = None
CACHE_PREFIX = "tts/"


def _polly_client():
    global _polly
    if _polly is None:
        _polly = boto3.client("polly", region_name=config.AWS_REGION, config=Config(read_timeout=15, retries={"max_attempts": 2}))
    return _polly


def _s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=config.AWS_REGION, config=Config(signature_version="s3v4"))
    return _s3


def synthesize(text: str, voice: dict) -> bytes:
    """One SynthesizeSpeech call (text must be within Polly's per-request limit)."""
    resp = _polly_client().synthesize_speech(
        Text=text,
        TextType="text",
        OutputFormat="mp3",
        SampleRate="24000",
        VoiceId=voice["VoiceId"],
        Engine=voice.get("Engine", "neural"),
        LanguageCode=voice.get("LanguageCode"),
    )
    with resp["AudioStream"] as stream:
        return stream.read()


def cache_exists(bucket: str, key: str) -> bool:
    try:
        _s3_client().head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def cache_put(bucket: str, key: str, audio: bytes) -> None:
    _s3_client().put_object(
        Bucket=bucket, Key=key, Body=audio, ContentType="audio/mpeg", ServerSideEncryption="AES256",
    )


def cache_url(bucket: str, key: str, expires: int = 60, filename: Optional[str] = None) -> str:
    params = {"Bucket": bucket, "Key": key, "ResponseContentType": "audio/mpeg"}
    if filename:
        params["ResponseContentDisposition"] = f'inline; filename="{filename}"'
    return _s3_client().generate_presigned_url("get_object", Params=params, ExpiresIn=expires)
