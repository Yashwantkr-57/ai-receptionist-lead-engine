"""
config.py - Central configuration for AI Receptionist backend.

Loads API keys and settings from environment variables or .env file.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_csv(name: str, default: str) -> list[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


# ── OpenRouter / AI Model ─────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1",
).rstrip("/")
AI_MODEL = os.getenv(
    "AI_MODEL",
    "qwen/qwen3-next-80b-a3b-instruct:free",
)


# ── Hindsight Memory ──────────────────────────────────────────────────────────
USE_HINDSIGHT = _get_bool("USE_HINDSIGHT", True)
HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
HINDSIGHT_BASE_URL = os.getenv(
    "HINDSIGHT_BASE_URL",
    "https://api.hindsight.vectorize.io",
).rstrip("/")
HINDSIGHT_BANK_ID = os.getenv("HINDSIGHT_BANK_ID", "ai-receptionist")


# ── App Settings ──────────────────────────────────────────────────────────────
APP_NAME = os.getenv("APP_NAME", "AI Receptionist & Lead Conversion Engine")
APP_VERSION = "1.0.0"
DEBUG = _get_bool("DEBUG", False)

BUSINESS_NAME = os.getenv("BUSINESS_NAME", "Priya Fitness Studio")
BUSINESS_PHONE = os.getenv("BUSINESS_PHONE", "+91-90000-00000")
BUSINESS_LOCATION = os.getenv("BUSINESS_LOCATION", "Pune, India")
BUSINESS_CONTEXT = os.getenv(
    "BUSINESS_CONTEXT",
    f"""You are an intelligent AI receptionist for {BUSINESS_NAME}.

Business details:
- Location: {BUSINESS_LOCATION}
- Phone: {BUSINESS_PHONE}
- Offers: gym memberships, personal training, trial classes, weight loss programs, 6-month plans, and evening batches.

Your goals:
1. Greet visitors warmly.
2. Understand what the visitor wants.
3. Qualify the lead naturally using interest, budget, urgency, and engagement.
4. Use recalled memory when available, but do not invent details.
5. If the visitor is interested or urgent, guide them toward booking a visit/call/trial.
6. If the visitor says they will think about it, offer a polite follow-up.
7. Keep replies under 120 words, human, concise, and professional.
""",
)

FRONTEND_ORIGINS = _get_csv(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000,null",
)


# Scoring required by guide: 25 + 25 + 25 + 25 = 100
SCORING_WEIGHTS = {
    "interest": 25,
    "budget": 25,
    "urgency": 25,
    "engagement": 25,
}


def validate_config() -> bool:
    """Print warnings but do not crash the server during demo setup."""
    missing = []
    if not OPENROUTER_API_KEY:
        missing.append("OPENROUTER_API_KEY")
    if USE_HINDSIGHT and not HINDSIGHT_API_KEY:
        missing.append("HINDSIGHT_API_KEY")

    if missing:
        print(f"WARNING: Missing env vars: {', '.join(missing)}")
        print("Create a .env file in the backend folder and add these values.")
        return False

    if DEBUG:
        print("Config loaded successfully.")
    return True


CONFIG_OK = validate_config()
