"""Validate an uploaded photo and strip its metadata.

The bytes are decoded with Pillow (so the type comes from the content, not the
client's Content-Type), bounded in size and pixel count (decompression bombs),
rotated per EXIF orientation, then RE-ENCODED from pixels only: EXIF (GPS,
device, time), XMP and comments do not survive.
"""

from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps

from app.core import config

_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
_SAVE = {"JPEG": {"quality": 90, "optimize": True}, "PNG": {"optimize": True}, "WEBP": {"quality": 90}}


class ImageRejected(ValueError):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _open(data: bytes) -> Image.Image:
    if not data:
        raise ImageRejected(400, "The photo is empty.")
    if len(data) > config.TRIAGE_IMAGE_MAX_BYTES:
        raise ImageRejected(413, "The photo is too large.")
    Image.MAX_IMAGE_PIXELS = config.TRIAGE_IMAGE_MAX_PIXELS
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()  # structure check; the object is unusable afterwards
        image = Image.open(io.BytesIO(data))
        image.load()
    except (Image.DecompressionBombError, OSError, SyntaxError, ValueError) as err:  # incl. UnidentifiedImageError
        raise ImageRejected(415, "This file is not a supported photo (JPEG, PNG or WebP).") from err
    if image.format not in _FORMATS:
        raise ImageRejected(415, "This file is not a supported photo (JPEG, PNG or WebP).")
    return image


def sanitize(data: bytes, declared_type: str | None = None) -> tuple[bytes, str]:
    """Clean bytes + their real MIME type. Raises ImageRejected."""
    image = _open(data)
    fmt = image.format
    mime = _FORMATS[fmt]
    if declared_type and declared_type.lower() != mime:
        raise ImageRejected(415, "The photo's content does not match its file type.")
    upright = ImageOps.exif_transpose(image)  # bake orientation in before EXIF goes
    mode = "RGBA" if fmt in ("PNG", "WEBP") and upright.mode in ("RGBA", "LA", "P") else "RGB"
    pixels = Image.frombytes(mode, upright.size, upright.convert(mode).tobytes())  # pixels only, no info/exif
    out = io.BytesIO()
    pixels.save(out, format=fmt, **_SAVE[fmt])
    return out.getvalue(), mime


def for_vision(data: bytes, max_side: int = 1024) -> tuple[str, str]:
    """Base64 JPEG, at most ``max_side`` px, for the vision model."""
    image = ImageOps.exif_transpose(_open(data)).convert("RGB")
    image.thumbnail((max_side, max_side))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=85)
    return base64.b64encode(out.getvalue()).decode("ascii"), "image/jpeg"
