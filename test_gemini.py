#!/usr/bin/env python3
"""
Smoke-test Gemini from the backend without hardcoding or printing API keys.
Run from backend/: ./venv/bin/python test_gemini.py
"""
import os
import sys
from pathlib import Path


def load_env_file():
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main():
    load_env_file()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        print("GEMINI_API_KEY is not configured. Add it to backend/.env.")
        return 1

    try:
        from google import genai
    except ImportError:
        print("google-genai is not installed. Run: ./venv/bin/pip install google-genai")
        return 1

    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents="Reply with a short hello from CropGuard AI.",
    )

    print(f"Gemini smoke test succeeded using model: {model}")
    print((response.text or "").strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
