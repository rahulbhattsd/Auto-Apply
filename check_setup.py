"""
check_setup.py — Preflight verification for runtime configuration, files, and dependencies.
"""

import os
import sys
from pathlib import Path
import yaml


def get_playwright_browsers_path() -> Path:
    """Return the platform-specific Playwright browser cache directory."""
    env_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env_path:
        if env_path == "0":
            return Path.cwd()
        return Path(env_path)

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "ms-playwright"

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Caches" / "ms-playwright"

    return Path.home() / ".cache" / "ms-playwright"


def is_chromium_installed() -> bool:
    """
    Check if a Playwright Chromium build exists without launching it.
    Avoids sync/async Playwright API conflicts when called from an asyncio loop.
    """
    browsers_dir = get_playwright_browsers_path()
    if not browsers_dir.exists():
        return False

    try:
        for entry in browsers_dir.iterdir():
            if not entry.is_dir():
                continue
            name = entry.name.lower()
            if not (name.startswith("chromium-") or name.startswith("chromium_headless_shell-")):
                continue

            if sys.platform == "win32":
                candidates = [
                    entry / "chrome-win" / "chrome.exe",
                    entry / "chrome-win64" / "chrome.exe",
                    entry / "chrome.exe",
                ]
            elif sys.platform == "darwin":
                candidates = [
                    entry / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium",
                    entry / "chrome-mac" / "chrome",
                ]
            else:
                candidates = [
                    entry / "chrome-linux" / "chrome",
                ]

            for cand in candidates:
                if cand.exists():
                    return True
    except Exception:
        pass

    return False


def check_setup(exit_on_failure: bool = True) -> list[str]:
    """
    Verifies that required files, API keys, and system dependencies (e.g., Playwright Chromium)
    are properly set up before starting execution.

    Returns a list of error strings. If exit_on_failure is True and errors exist,
    prints error messages and exits with status code 1.
    """
    errors = []

    # 1. Check Playwright Chromium browser installation
    if not is_chromium_installed():
        errors.append(
            "Playwright Chromium browser binary is not installed.\n"
            "  -> Run: playwright install chromium"
        )

    # 2. Check config.yaml and Groq keys
    if not os.path.exists("config.yaml"):
        errors.append(
            "config.yaml is missing.\n"
            "  -> Copy config.example.yaml to config.yaml and fill in your real configuration and Groq API keys."
        )
    else:
        try:
            with open("config.yaml", "r", encoding="utf-8-sig") as f:
                config = yaml.safe_load(f) or {}

            groq_cfg = config.get("groq", {}) or {}
            groq_keys = config.get("groq_api_keys") or groq_cfg.get("keys") or []

            if not groq_keys:
                errors.append(
                    "config.yaml is missing Groq API keys under 'groq.keys' or 'groq_api_keys'."
                )
            else:
                placeholder_patterns = ("gsk_key_", "_here", "dummy_key", "your_groq_api_key")
                placeholders = [
                    str(k) for k in groq_keys
                    if any(pat in str(k) for pat in placeholder_patterns)
                ]
                if placeholders:
                    errors.append(
                        f"config.yaml contains placeholder Groq API keys: {', '.join(placeholders)}\n"
                        "  -> Please replace them with valid Groq API key(s) in config.yaml."
                    )
        except Exception as e:
            errors.append(f"Failed to parse config.yaml: {e}")

    # 3. Check profile.yaml and resume_base.json
    if not os.path.exists("profile.yaml"):
        errors.append(
            "profile.yaml is missing.\n"
            "  -> Create profile.yaml with your user profile details."
        )

    if not os.path.exists("resume_base.json"):
        errors.append(
            "resume_base.json is missing.\n"
            "  -> Create resume_base.json with your structured resume details."
        )

    if errors and exit_on_failure:
        print("\n" + "=" * 70, file=sys.stderr)
        print("PREFLIGHT CHECK FAILED: Setup is incomplete.", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        for idx, err in enumerate(errors, 1):
            print(f"[{idx}] {err}", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        sys.exit(1)

    return errors


if __name__ == "__main__":
    check_setup(exit_on_failure=True)
