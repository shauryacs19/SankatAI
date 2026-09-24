"""Presigned WebSocket URLs for Amazon Transcribe Streaming.

Single responsibility: turning (region, language, sample rate) into a SigV4
query-signed ``wss://`` URL. Presigning is a local HMAC computation — there is
no network call — so the private backend needs no route to Transcribe at all.
The client opens the URL itself and streams audio directly to AWS.

Credentials come from the default boto3 chain: the EC2 instance role in
production, the mounted ``~/.aws`` profile in development. Never static keys.

⚠️ The returned URL embeds the role's session token. Never log it.
"""

from __future__ import annotations

from typing import Optional

import boto3
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.credentials import ReadOnlyCredentials
from botocore.exceptions import NoCredentialsError

_PATH = "/stream-transcription-websocket"
_SERVICE = "transcribe"

# Built once: resolving the credential chain (IMDS on EC2) is the slow part.
# The returned credentials object refreshes itself before the role expires.
_session: Optional[boto3.session.Session] = None


def _credentials() -> ReadOnlyCredentials:
    global _session
    if _session is None:
        _session = boto3.session.Session()
    creds = _session.get_credentials()
    if creds is None:
        raise NoCredentialsError()
    # Frozen: access key, secret and token read atomically, so a refresh
    # mid-signature cannot mix two credential generations.
    return creds.get_frozen_credentials()


def presign_stream_url(
    region: str,
    language_options: list[str],
    preferred_language: str,
    sample_rate: int,
    expires: int,
    vocabulary_names: Optional[list[str]] = None,
    credentials: Optional[ReadOnlyCredentials] = None,
) -> str:
    """Return a ``wss://`` URL for StartStreamTranscriptionWebSocket with
    streaming language identification: Transcribe picks the spoken language
    from ``language_options`` (so no ``language-code``) and reports it on each
    result as ``LanguageCode`` / ``LanguageIdentification``.

    Only ``host`` is signed, as the WebSocket handshake adds headers the
    signer cannot predict. The payload hash is SHA-256 of the empty string
    (botocore's default for a bodyless non-HTTPS URL), which is what the
    Transcribe WebSocket documentation specifies.
    """
    creds = credentials or _credentials()
    params = {
        "identify-language": "true",
        "language-options": ",".join(language_options),
        "preferred-language": preferred_language,
        "media-encoding": "pcm",
        "sample-rate": str(sample_rate),
        "enable-partial-results-stabilization": "true",
    }
    if vocabulary_names:
        params["vocabulary-names"] = ",".join(vocabulary_names)
    request = AWSRequest(
        method="GET",
        url=f"wss://transcribestreaming.{region}.amazonaws.com:8443{_PATH}",
        params=params,
    )
    SigV4QueryAuth(creds, _SERVICE, region, expires=expires).add_auth(request)
    return request.url
