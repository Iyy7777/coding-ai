"""
server.py

Flask server that:
  1. Serves the static frontend (public/)
  2. Exposes a single POST /api/chat route that:
       a. Verifies the caller is a logged-in Supabase user (via their access
          token), so only signed-up/logged-in users can use the assistant.
       b. Forwards the conversation to a local Ollama server.

Ollama itself doesn't use an API key (it's local), so the only "secret" here
is making sure random visitors can't hit /api/chat without an account —
that's what the Supabase token check below is for.
"""

import os
import re
import requests
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

load_dotenv()

PORT = int(os.environ.get("PORT", 3000))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5-coder:7b")

# Ollama model tags look like "name:tag" (letters, digits, dots, dashes,
# underscores, colons). Anything else from the client is ignored in favor
# of the .env default, since this string gets sent straight to Ollama.
MODEL_TAG_RE = re.compile(r"^[A-Za-z0-9_.:\-]{1,100}$")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="")

SYSTEM_PROMPT = """You are Codey, an AI assistant trained specifically to write code and build small
working software projects (web pages, components, scripts, multi-file apps) for the person you're
talking to.

Guidelines for every response:
- Be concise in your prose. Lead with a short (1-3 sentence) explanation of your plan or answer.
- Whenever you produce runnable output, put it in fenced code blocks.
- For a SIMPLE, single-file demo, a plain ```html block (with <style>/<script> inline) is fine.
- For anything that naturally needs MULTIPLE files (e.g. index.html + style.css + script.js, or
  several Python modules), give each file its own fenced code block using this exact header format:
  the language, a colon, then the filename — with no space — like:
  ```html:index.html
  ...
  ```
  ```css:style.css
  ...
  ```
  ```javascript:script.js
  ...
  ```
  Use real, sensible filenames (index.html, style.css, script.js, utils.js, main.py, etc.) and keep
  each file's full, current contents in its block — don't show a diff or partial snippet for a file
  you're updating, repeat the whole file.
- Don't fabricate APIs, libraries, or file paths that don't exist.
- If a request is ambiguous, make a single reasonable assumption, state it briefly, and proceed —
  don't stall on clarifying questions for small tasks.
- Keep non-web code (Python, etc.) runnable and self-contained where possible."""


def verify_supabase_token(auth_header):
    """Returns the Supabase user dict if the bearer token is valid, else None.

    If SUPABASE_URL/SUPABASE_ANON_KEY aren't configured yet, verification is
    skipped (with a console warning) so the app still runs during local setup
    before you've wired up Supabase.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("[warning] SUPABASE_URL/SUPABASE_ANON_KEY not set — skipping auth check.")
        return {"id": "anonymous-dev-mode"}

    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY},
            timeout=10,
        )
    except requests.exceptions.RequestException as exc:
        print(f"Could not verify token with Supabase: {exc}")
        return None

    if not resp.ok:
        return None
    return resp.json()


@app.route("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    user = verify_supabase_token(request.headers.get("Authorization"))
    if not user:
        return jsonify({"error": "Not authenticated. Please log in and try again."}), 401

    body = request.get_json(silent=True) or {}
    messages = body.get("messages")

    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({"error": 'Request body must include a non-empty "messages" array.'}), 400

    requested_model = body.get("model")
    if isinstance(requested_model, str) and MODEL_TAG_RE.match(requested_model):
        model = requested_model
    else:
        model = OLLAMA_MODEL

    ollama_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        role = "assistant" if m.get("role") == "assistant" else "user"
        ollama_messages.append({"role": role, "content": str(m.get("content", ""))})

    try:
        upstream = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": ollama_messages,
                "stream": False,
                "options": {"temperature": 0.6},
            },
            timeout=300,
        )
    except requests.exceptions.RequestException as exc:
        print(f"Could not reach Ollama: {exc}")
        return jsonify({
            "error": (
                f"Couldn't reach Ollama at {OLLAMA_URL}. Make sure it's running "
                f'("ollama serve") and that OLLAMA_URL in .env is correct.'
            )
        }), 502

    try:
        data = upstream.json()
    except ValueError:
        data = {}

    if not upstream.ok:
        print("Ollama API error:", data)
        msg = data.get("error", "Ollama returned an error.")
        hint = f" Try: ollama pull {model}" if "not found" in msg.lower() else ""
        return jsonify({"error": msg + hint}), upstream.status_code

    text = (data.get("message") or {}).get("content", "")

    if not text:
        return jsonify({"error": "Ollama returned an empty response."}), 502

    return jsonify({"text": text})


# Fallback: send the SPA shell for any other GET route.
@app.route("/<path:path>")
def catch_all(path):
    full_path = os.path.join(PUBLIC_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(PUBLIC_DIR, path)
    return send_from_directory(PUBLIC_DIR, "index.html")


if __name__ == "__main__":
    print(f"Codey is running at http://localhost:{PORT}")
    print(f'Talking to Ollama at {OLLAMA_URL} using model "{OLLAMA_MODEL}"')
    if not SUPABASE_URL:
        print("[warning] Supabase is not configured yet — see README.md for setup.")
    app.run(host="0.0.0.0", port=PORT, debug=False)
