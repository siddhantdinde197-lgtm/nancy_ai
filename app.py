"""
Siddhant Voice Assistant - backend (Flask)

Endpoints
  GET  /api/health   -> server status
  POST /api/keys     -> create an assistant API key   (needs X-Admin-Password)
  POST /api/chat     -> talk to the assistant          (needs X-API-Key)
  GET  /             -> serves the frontend
"""
import os
import json
import time
import hmac
import hashlib
import secrets
import threading
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
KEYS_FILE = BASE_DIR / "keys.json"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
PORT = int(os.getenv("PORT", "5000"))

SYSTEM_PROMPT = """You are Siddhant Voice, a friendly, smart voice assistant powered by Siddhant.
Your replies are spoken aloud, so:
- Talk naturally, like a helpful friend. Keep answers short (1-4 sentences) unless asked for more.
- Never use markdown, bullet points, emojis, code blocks, or read out URLs letter by letter.
- If the user speaks Hindi or Hinglish, reply in the same language.
- If you are unsure, say so honestly instead of guessing."""

app = Flask(__name__, static_folder=None)
CORS(app)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# ---------------------------------------------------------------- API keys
_lock = threading.Lock()


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _load_keys() -> dict:
    if not KEYS_FILE.exists():
        return {}
    try:
        return json.loads(KEYS_FILE.read_text())
    except json.JSONDecodeError:
        return {}


def _save_keys(data: dict) -> None:
    KEYS_FILE.write_text(json.dumps(data, indent=2))


def _valid_key(key: str) -> bool:
    if not key:
        return False
    with _lock:
        return _hash(key) in _load_keys()


# Tiny in-memory rate limit: 30 requests / minute / key
_hits: dict = {}


def _rate_ok(key: str, limit: int = 30, window: int = 60) -> bool:
    now = time.time()
    h = _hash(key)
    recent = [t for t in _hits.get(h, []) if now - t < window]
    if len(recent) >= limit:
        _hits[h] = recent
        return False
    recent.append(now)
    _hits[h] = recent
    return True


# ---------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    return jsonify(
        status="ok",
        model=MODEL,
        llm_configured=client is not None,
        admin_configured=bool(ADMIN_PASSWORD),
    )


@app.post("/api/keys")
def create_key():
    if not ADMIN_PASSWORD:
        return jsonify(error="Set ADMIN_PASSWORD in backend/.env first."), 500
    supplied = request.headers.get("X-Admin-Password", "")
    if not hmac.compare_digest(supplied, ADMIN_PASSWORD):
        return jsonify(error="Wrong admin password."), 401

    body = request.get_json(silent=True) or {}
    label = str(body.get("label") or "My device")[:60]

    new_key = "sid-" + secrets.token_urlsafe(32)
    with _lock:
        keys = _load_keys()
        keys[_hash(new_key)] = {"label": label, "created": int(time.time())}
        _save_keys(keys)

    # The raw key is shown ONCE; only its hash is stored on disk.
    return jsonify(api_key=new_key, label=label)


@app.post("/api/chat")
def chat():
    key = request.headers.get("X-API-Key", "")
    if not _valid_key(key):
        return jsonify(error="Invalid or missing API key."), 401
    if not _rate_ok(key):
        return jsonify(error="Too many requests. Wait a moment."), 429
    if client is None:
        return jsonify(error="ANTHROPIC_API_KEY is not set in backend/.env"), 500

    data = request.get_json(silent=True) or {}
    raw = data.get("messages", [])
    messages = [
        {"role": m["role"], "content": str(m["content"])[:4000]}
        for m in raw
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and str(m.get("content", "")).strip()
    ][-20:]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages or messages[-1]["role"] != "user":
        return jsonify(error="Send at least one user message."), 400

    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
    except anthropic.AuthenticationError:
        return jsonify(error="Anthropic key rejected. Check ANTHROPIC_API_KEY."), 502
    except anthropic.APIError as e:
        return jsonify(error=f"AI service error: {e}"), 502

    reply = "".join(b.text for b in resp.content if b.type == "text").strip()
    return jsonify(reply=reply)


# ---------------------------------------------------------------- frontend
@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:name>")
def assets(name):
    return send_from_directory(FRONTEND_DIR, name)


if __name__ == "__main__":
    print(f"Siddhant Voice running at http://localhost:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=True)
