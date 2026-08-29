"""Shared JSON-over-HTTP client for calling the ai-doc REST API."""
import json
import urllib.request
import urllib.error
from typing import Any


class AiDocClientError(RuntimeError):
    pass


def generate_document(base_url: str, format_: str, payload: dict[str, Any], timeout: int = 120) -> dict[str, Any]:
    """POST /api/documents/<format> and return the generated document metadata.

    The metadata contains a public ``url`` download link together with the
    filename, size, and mime type.
    """
    if not base_url:
        raise AiDocClientError("Missing 'base_url': configure the ai-doc service address.")
    base = base_url.rstrip("/")
    url = f"{base}/api/documents/{format_}"
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AiDocClientError(f"ai-doc returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise AiDocClientError(f"Failed to reach ai-doc service: {exc.reason}") from exc

    if not data.get("url"):
        raise AiDocClientError(f"ai-doc returned an invalid response: {data}")
    return data
