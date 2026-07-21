"""The grant/outcome tokens are HMAC'd by Node on one side and Python on the
other. If the two implementations ever disagree - encoding, expiry handling,
tamper detection - assessments stop working or, worse, stop being verified.

These tests drive the REAL backend implementation via Node and check both
directions. Skipped when Node or the backend checkout is unavailable.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.security import tokens

_BACKEND_CV_TOKEN = Path(__file__).resolve().parents[2] / "backend" / "src" / "utils" / "cvToken.js"
_SECRET = "interop-test-secret-do-not-use-in-production"


def _node(script: str) -> str:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed; cannot check cross-language token interop")
    if not _BACKEND_CV_TOKEN.exists():
        pytest.skip(f"backend cvToken not found at {_BACKEND_CV_TOKEN}")
    env = {**os.environ, "CV_SIGNING_SECRET": _SECRET}
    preamble = f"const t = require({json.dumps(_BACKEND_CV_TOKEN.as_posix())});\n"
    result = subprocess.run([node, "-e", preamble + script], capture_output=True, text=True, env=env, check=True)
    return result.stdout.strip()


@pytest.fixture(autouse=True)
def _use_test_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tokens.settings, "cv_signing_secret", _SECRET)


class TestBackendToCvService:
    """A grant minted by the backend must verify here, values intact."""

    def test_grant_round_trips(self) -> None:
        token = _node(
            'process.stdout.write(t.sign("cv_grant", '
            '{ jti: "grant-1", cid: "abc123", tid: "chair_stand", sandbox: false, age: 82, sex: "male", height: 170 }, 600));'
        )
        payload = tokens.verify(token, "cv_grant")
        assert payload["jti"] == "grant-1"
        assert payload["cid"] == "abc123"
        assert payload["tid"] == "chair_stand"
        assert payload["age"] == 82
        assert payload["sex"] == "male"
        assert payload["height"] == 170
        assert payload["sandbox"] is False

    def test_unicode_and_nulls_survive_the_round_trip(self) -> None:
        token = _node(
            'process.stdout.write(t.sign("cv_grant", '
            '{ jti: "g", cid: null, tid: "sit_reach", sandbox: true, age: null, sex: "other", height: null, note: "\\u00e9\\u4e2d" }, 600));'
        )
        payload = tokens.verify(token, "cv_grant")
        assert payload["cid"] is None
        assert payload["age"] is None
        assert payload["height"] is None
        assert payload["note"] == "é中"

    def test_expired_grant_is_rejected(self) -> None:
        token = _node('process.stdout.write(t.sign("cv_grant", { jti: "old" }, -5));')
        with pytest.raises(tokens.TokenError):
            tokens.verify(token, "cv_grant")

    def test_wrong_type_is_rejected(self) -> None:
        token = _node('process.stdout.write(t.sign("cv_outcome", { jti: "x" }, 600));')
        with pytest.raises(tokens.TokenError):
            tokens.verify(token, "cv_grant")

    def test_tampered_payload_is_rejected(self) -> None:
        token = _node('process.stdout.write(t.sign("cv_grant", { jti: "g", age: 70 }, 600));')
        body, _, mac = token.partition(".")
        # Flip a character in the payload but keep the original signature.
        forged_body = ("A" if body[0] != "A" else "B") + body[1:]
        with pytest.raises(tokens.TokenError):
            tokens.verify(f"{forged_body}.{mac}", "cv_grant")

    def test_token_signed_with_another_secret_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        token = _node('process.stdout.write(t.sign("cv_grant", { jti: "g" }, 600));')
        monkeypatch.setattr(tokens.settings, "cv_signing_secret", "a-different-secret")
        with pytest.raises(tokens.TokenError):
            tokens.verify(token, "cv_grant")


class TestCvServiceToBackend:
    """An outcome signed here must verify in the backend, values intact."""

    def _verify_in_node(self, token: str, expected_type: str = "cv_outcome") -> dict | None:
        out = _node(
            f"const p = t.verify({json.dumps(token)}, {json.dumps(expected_type)});"
            "process.stdout.write(JSON.stringify(p));"
        )
        return json.loads(out)

    def test_outcome_round_trips(self) -> None:
        token = tokens.sign("cv_outcome", {
            "jti": "grant-9", "cid": "client-1", "tid": "chair_stand",
            "sandbox": False, "reps": 12, "measurement": None, "t5": 9.4, "early": False,
        }, 300)
        payload = self._verify_in_node(token)
        assert payload is not None
        assert payload["jti"] == "grant-9"
        assert payload["reps"] == 12
        assert payload["t5"] == 9.4
        assert payload["measurement"] is None
        assert payload["early"] is False

    def test_negative_measurement_survives(self) -> None:
        # Sit-reach short of the toes is negative; a sign flip in transport
        # would invert the clinical meaning.
        token = tokens.sign("cv_outcome", {"jti": "g", "cid": "c", "tid": "sit_reach", "measurement": -7.5}, 300)
        payload = self._verify_in_node(token)
        assert payload is not None
        assert payload["measurement"] == -7.5

    def test_expired_outcome_is_rejected_by_the_backend(self) -> None:
        token = tokens.sign("cv_outcome", {"jti": "g"}, -5)
        assert self._verify_in_node(token) is None

    def test_tampered_outcome_is_rejected_by_the_backend(self) -> None:
        token = tokens.sign("cv_outcome", {"jti": "g", "reps": 3}, 300)
        body, _, mac = token.partition(".")
        forged_body = ("A" if body[0] != "A" else "B") + body[1:]
        assert self._verify_in_node(f"{forged_body}.{mac}") is None

    def test_backend_rejects_a_grant_presented_as_an_outcome(self) -> None:
        token = tokens.sign("cv_grant", {"jti": "g"}, 300)
        assert self._verify_in_node(token) is None
