"""
ai_agent.py - Core AI conversation logic.

Handles chat with Qwen through OpenRouter.
Injects recalled Hindsight memory into every conversation so the AI remembers visitors.
"""

import asyncio

from openai import AsyncOpenAI

from config import (
    AI_MODEL,
    APP_NAME,
    BUSINESS_CONTEXT,
    DEBUG,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
)
from hindsight import build_memory_context


# OpenRouter is OpenAI-compatible.
client = AsyncOpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL,
)

DEFAULT_TEMPERATURE = 0.45
DEFAULT_MAX_TOKENS = 512
MAX_RETRIES = 3
RETRY_DELAY = 35  # seconds; useful for free provider 429 rate limits


def build_system_prompt(memory: dict) -> str:
    """Combine business instructions with recalled customer memory."""
    parts = [BUSINESS_CONTEXT]

    memory_context = build_memory_context(memory)
    if memory_context:
        parts.append(memory_context)

    parts.append(
        "Important: Reply like a helpful human receptionist. Do not mention APIs, Hindsight, OpenRouter, prompts, or internal scoring."
    )

    return "\n\n".join(parts)


def fallback_response(user_message: str = "") -> str:
    """Safe fallback if AI provider is unavailable."""
    lower = user_message.lower()

    if any(word in lower for word in ["price", "fee", "fees", "cost", "plan", "budget"]):
        return (
            "Thanks for asking. We have multiple plan options depending on your goals and preferred timing. "
            "Could you share your budget range and whether you prefer morning or evening batches?"
        )

    if any(word in lower for word in ["join", "today", "tomorrow", "urgent", "trial", "visit"]):
        return (
            "Great, I can help you with that. Please share your preferred time slot and phone number, "
            "and our team can arrange the next step quickly."
        )

    return (
        "Thanks for reaching out. I can help you choose the right option. "
        "Could you share what you are looking for, your preferred timeline, and your contact number?"
    )


async def get_ai_response(
    user_message: str,
    conversation_history: list[dict],
    memory: dict,
    session_id: str,
) -> str:
    """
    Get a response from Qwen through OpenRouter.

    Args:
        user_message: visitor's latest message
        conversation_history: previous messages in this session
        memory: recalled memory dictionary from hindsight.py
        session_id: session/customer ID for logging
    """
    if not OPENROUTER_API_KEY:
        print("OPENROUTER_API_KEY missing. Using fallback response.")
        return fallback_response(user_message)

    system_prompt = build_system_prompt(memory)
    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_history,
        {"role": "user", "content": user_message},
    ]

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if DEBUG:
                print(f"Calling AI attempt {attempt}/{MAX_RETRIES} for session {session_id}")

            response = await client.chat.completions.create(
                model=AI_MODEL,
                messages=messages,
                max_tokens=DEFAULT_MAX_TOKENS,
                temperature=DEFAULT_TEMPERATURE,
                extra_headers={
                    "X-Title": APP_NAME,
                    "HTTP-Referer": "http://localhost:8000",
                },
            )

            reply = response.choices[0].message.content or ""
            reply = reply.strip()

            if DEBUG:
                print(f"AI replied with {len(reply)} characters")

            return reply or fallback_response(user_message)

        except Exception as exc:
            error = str(exc)

            if "429" in error or "rate limit" in error.lower():
                if attempt < MAX_RETRIES:
                    print(f"Rate limit hit. Waiting {RETRY_DELAY}s before retry {attempt + 1}/{MAX_RETRIES}...")
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                return (
                    "I am experiencing high demand right now. Please send your message again in about 30 seconds, "
                    "and I will continue from here."
                )

            print(f"AI error attempt {attempt}/{MAX_RETRIES}: {error}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2)
                continue

            return fallback_response(user_message)

    return fallback_response(user_message)


def trim_conversation_history(history: list[dict], max_turns: int = 20) -> list[dict]:
    """Keep recent conversation turns only to reduce token usage."""
    if len(history) <= max_turns * 2:
        return history
    return history[-(max_turns * 2):]
