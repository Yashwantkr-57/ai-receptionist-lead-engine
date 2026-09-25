"""
lead_scorer.py - Lead scoring logic.

Scores each visitor from 0 to 100 using:
Interest 25 + Budget 25 + Urgency 25 + Engagement 25.
"""

import re
from typing import Any


PHONE_RE = re.compile(r"(?:\+?91[-\s]?)?[6-9]\d{9}\b")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
MONEY_RE = re.compile(
    r"(?:₹|rs\.?|inr)?\s?\d{3,7}(?:\s?(?:rs|inr|rupees|/-))?",
    re.IGNORECASE,
)

INTEREST_HIGH = {
    "join", "joining", "enroll", "register", "start", "book", "booking",
    "trial", "demo", "visit", "appointment", "membership", "personal training",
    "weight loss", "fitness", "gym", "ready", "interested", "confirm",
}
INTEREST_MEDIUM = {
    "price", "pricing", "cost", "fee", "fees", "plan", "plans", "package",
    "details", "information", "timing", "timings", "batch", "batches",
    "classes", "schedule", "available", "offer", "discount",
}

BUDGET_SIGNALS = {
    "budget", "price", "pricing", "cost", "fee", "fees", "rs", "inr", "rupees",
    "₹", "monthly", "per month", "afford", "affordable", "payment", "emi",
}
PREMIUM_BUDGET_SIGNALS = {
    "annual", "yearly", "6 month", "six month", "premium", "personal trainer",
    "personal training", "advance payment",
}
LOW_BUDGET_SIGNALS = {"free", "cheap", "lowest", "too expensive", "costly", "no budget"}

URGENCY_HIGH = {
    "today", "tomorrow", "asap", "urgent", "immediately", "right away", "now",
    "this week", "tonight", "weekend", "quick", "quickly",
}
URGENCY_MEDIUM = {"soon", "next week", "few days", "coming days", "monday", "tuesday"}
URGENCY_LOW = {"later", "someday", "next month", "not now", "think about", "i'll think", "will think"}

FOLLOW_UP_TRIGGERS = {
    "think about it", "i'll think", "i will think", "will think", "call me later",
    "message me", "send details", "send me", "get back", "follow up", "remind me",
    "tomorrow", "next week", "later", "discuss with", "ask my", "talk to my",
}

POSITIVE = {"yes", "great", "good", "perfect", "interested", "ready", "nice", "awesome", "love"}
CONFUSED = {"confused", "not sure", "explain", "difference", "how does", "what is", "which plan"}
NEGATIVE = {"expensive", "costly", "bad", "angry", "problem", "issue", "cancel"}


def _contains_count(text: str, keywords: set[str]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


def detect_sentiment(message: str) -> str:
    text = message.lower()
    if _contains_count(text, URGENCY_HIGH) > 0:
        return "urgent"
    if _contains_count(text, CONFUSED) > 0:
        return "confused"
    if _contains_count(text, NEGATIVE) > 0:
        return "concerned"
    if _contains_count(text, POSITIVE) > 0 or _contains_count(text, INTEREST_HIGH) > 0:
        return "interested"
    return "neutral"


def detect_follow_up(message: str) -> tuple[bool, str]:
    text = message.lower()
    for trigger in FOLLOW_UP_TRIGGERS:
        if trigger in text:
            return True, f"Follow-up trigger detected: '{trigger}'"
    return False, "No follow-up trigger detected"


def score_interest(text: str) -> int:
    lower = text.lower()
    score = 0
    score += min(18, _contains_count(lower, INTEREST_HIGH) * 6)
    score += min(10, _contains_count(lower, INTEREST_MEDIUM) * 3)
    if "?" in text and score < 10:
        score += 4
    return max(0, min(25, score))


def score_budget(text: str) -> int:
    lower = text.lower()
    score = 0
    if MONEY_RE.search(text):
        score += 14
    score += min(8, _contains_count(lower, BUDGET_SIGNALS) * 3)
    score += min(5, _contains_count(lower, PREMIUM_BUDGET_SIGNALS) * 3)
    if _contains_count(lower, LOW_BUDGET_SIGNALS) > 0:
        score -= 5
    return max(0, min(25, score))


def score_urgency(text: str) -> int:
    lower = text.lower()
    score = 0
    score += min(20, _contains_count(lower, URGENCY_HIGH) * 10)
    score += min(10, _contains_count(lower, URGENCY_MEDIUM) * 5)
    if _contains_count(lower, URGENCY_LOW) > 0:
        score -= 6
    return max(0, min(25, score))


def score_engagement(text: str, interaction_count: int = 1) -> int:
    score = 0
    words = text.split()
    if len(words) >= 8:
        score += 5
    if len(words) >= 18:
        score += 5
    if "?" in text:
        score += 4
    if PHONE_RE.search(text):
        score += 5
    if EMAIL_RE.search(text):
        score += 5
    if interaction_count > 1:
        score += min(6, interaction_count * 2)
    return max(0, min(25, score))


def get_lead_status(score: int) -> str:
    if score >= 80:
        return "HOT"
    if score >= 55:
        return "WARM"
    return "COLD"


def get_recommended_action(status: str, follow_up_required: bool) -> str:
    if status == "HOT":
        return "Notify owner/team now and ask for a call or visit slot."
    if follow_up_required:
        return "Schedule a personalised follow-up using saved memory."
    if status == "WARM":
        return "Answer questions, collect contact details, and offer a trial/demo."
    return "Nurture politely and ask one qualifying question."


def score_lead(
    message: str,
    memory_text: str = "",
    ai_reply: str = "",
    interaction_count: int = 1,
) -> dict[str, Any]:
    """Return full lead score object for API/dashboard."""
    combined = " ".join([message or "", memory_text or "", ai_reply or ""]).strip()

    breakdown = {
        "interest": score_interest(combined),
        "budget": score_budget(combined),
        "urgency": score_urgency(combined),
        "engagement": score_engagement(combined, interaction_count),
    }
    total = int(sum(breakdown.values()))
    status = get_lead_status(total)
    follow_up_required, follow_up_reason = detect_follow_up(message)

    return {
        "score": total,
        "status": status,
        "breakdown": breakdown,
        "sentiment": detect_sentiment(message),
        "follow_up_required": follow_up_required,
        "follow_up_reason": follow_up_reason,
        "recommended_action": get_recommended_action(status, follow_up_required),
    }
