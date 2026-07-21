"""Symmetric tokens shared with the backend (backend/src/utils/cvToken.js).

Two directions, one construction:

``cv_grant``    backend -> here. Authorises one assessment run and carries the
                client's REAL age/sex/height. We take the subject from this
                token and ignore whatever the browser claims, so a caller
                cannot pick an easier norm band by lying about their age.

``cv_outcome``  here -> backend. The raw measurements we actually produced,
                signed. The backend reads the score out of this token instead
                of the request body, so a score cannot be invented in between.

Format: ``<base64url(payload JSON)>.<base64url(HMAC-SHA256 over that string)>``.

"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

from app.config.settings import settings

log = logging.getLogger('hana.cv.tokens')

MAX_TOKEN_CHARS = 4096
_SCHEMA_VERSION = 1


class TokenError(Exception):
    """Raised when a token is absent, malformed, unsigned, or expired."""


def _secret() -> bytes:
    if not settings.cv_signing_secret:
        # create_app() refuses to start without this; reaching here means the
        # app was constructed some other way. Fail closed.
        raise TokenError('CV_SIGNING_SECRET is not configured')
    return settings.cv_signing_secret.encode('utf-8')


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _b64url_decode(text: str) -> bytes:
    padding = '=' * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _mac(body: str) -> str:
    return _b64url_encode(hmac.new(_secret(), body.encode('ascii'), hashlib.sha256).digest())


def sign(token_type: str, payload: dict[str, Any], ttl_seconds: int) -> str:
    issued = int(time.time())
    full = {'v': _SCHEMA_VERSION, 'typ': token_type, 'iat': issued, 'exp': issued + ttl_seconds, **payload}
    body = _b64url_encode(json.dumps(full, separators=(',', ':')).encode('utf-8'))
    return f'{body}.{_mac(body)}'


def verify(token: str | None, expected_type: str) -> dict[str, Any]:
    """Return the payload, or raise TokenError. Callers must not catch and continue."""
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_CHARS:
        raise TokenError('Missing or oversized token')
    body, separator, provided = token.partition('.')
    if not separator or not body or not provided:
        raise TokenError('Malformed token')

    # compare_digest is constant-time; a length difference is not secret.
    if not hmac.compare_digest(provided, _mac(body)):
        raise TokenError('Bad signature')

    try:
        payload = json.loads(_b64url_decode(body))
    except (ValueError, TypeError) as exc:
        raise TokenError('Unreadable payload') from exc
    if not isinstance(payload, dict):
        raise TokenError('Unreadable payload')
    if payload.get('v') != _SCHEMA_VERSION or payload.get('typ') != expected_type:
        raise TokenError('Unexpected token type')
    expires = payload.get('exp')
    if not isinstance(expires, int) or expires <= int(time.time()):
        raise TokenError('Token has expired')
    return payload
