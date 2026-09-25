"""Transactional email through Amazon SES (the project's only mail provider).

The role may send only From SES_SENDER_EMAIL. While the account is in the SES
sandbox, mail is delivered only to verified recipient addresses.
"""

from __future__ import annotations

import boto3
from botocore.config import Config

from app.core import config

_client = None


def configured() -> bool:
    return bool(config.SES_SENDER_EMAIL and config.APP_URL)


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "ses",
            region_name=config.AWS_REGION,
            config=Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 2}),
        )
    return _client


def send(to_address: str, subject: str, text: str, html: str) -> None:
    client().send_email(
        Source=config.SES_SENDER_EMAIL,
        Destination={"ToAddresses": [to_address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text, "Charset": "UTF-8"}, "Html": {"Data": html, "Charset": "UTF-8"}},
        },
    )
