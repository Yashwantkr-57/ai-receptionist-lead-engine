"""
hindsight.py - Hindsight memory save/recall wrapper.

Uses Hindsight Cloud REST API through httpx.
Also keeps local_memory.json as backup so the demo still works if API key/rate limit fails.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from config import (
    DEBUG,
    HINDSIGHT_API_KEY,
    HINDSIGHT_BANK_ID,
    HINDSIGHT_BASE_URL,
    USE_HINDSIGHT,
)

LOCAL_MEMORY_FILE = Path("local_memory.json")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_customer_tag(customer_id: str) -> str:
    safe = "".join(
        char if char.isalnum() or char in {"-", "_"} else "-"
        for char in customer_id.lower()
    ).strip("-")
    return f"customer:{safe or 'unknown'}"


def read_local_memory() -> dict[str, list[str]]:
    if not LOCAL_MEMORY_FILE.exists():
        return {}
    try:
        return json.loads(LOCAL_MEMORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_local_memory(data: dict[str, list[str]]) -> None:
    LOCAL_MEMORY_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def build_memory_context(memory: dict[str, Any]) -> str:
    """
    Converts recalled memory object into prompt text for ai_agent.py.
    """
    memories = memory.get("memories", []) or []
    if not memories:
        return ""

    lines = [
        "Relevant remembered customer context from previous interactions:",
    ]
    for item in memories[:8]:
        lines.append(f"- {item}")

    lines.append(
        "Use this context only when relevant. Do not mention technical memory systems to the customer."
    )
    return "\n".join(lines)


class HindsightMemory:
    def __init__(self) -> None:
        self.enabled = bool(USE_HINDSIGHT and HINDSIGHT_API_KEY)
        self.bank_id = HINDSIGHT_BANK_ID
        self.base_url = HINDSIGHT_BASE_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {HINDSIGHT_API_KEY}",
            "Content-Type": "application/json",
        }

    @property
    def retain_url(self) -> str:
        return f"{self.base_url}/v1/default/banks/{self.bank_id}/memories"

    @property
    def recall_url(self) -> str:
        return f"{self.base_url}/v1/default/banks/{self.bank_id}/memories/recall"

    async def recall_memory(
        self,
        customer_id: str,
        user_message: str,
        customer_name: str | None = None,
        max_tokens: int = 1200,
    ) -> dict[str, Any]:
        """
        Recall past customer details from Hindsight.
        Falls back to local memory if Hindsight is unavailable.
        """
        local_memories = read_local_memory().get(customer_id, [])[-6:]

        if not self.enabled:
            return {
                "source": "local",
                "memories": local_memories,
                "error": "Hindsight disabled or HINDSIGHT_API_KEY missing",
            }

        query = (
            f"Customer id: {customer_id}. Customer name: {customer_name or 'unknown'}. "
            f"Current message: {user_message}. "
            "Recall previous needs, budget, urgency, preferred timings, contact details, objections, and follow-up commitments for this customer."
        )
        payload = {
            "query": query,
            "budget": "mid",
            "max_tokens": max_tokens,
            "tags": [make_customer_tag(customer_id)],
            "tags_match": "any_strict",
        }

        try:
            async with httpx.AsyncClient(timeout=20) as http:
                response = await http.post(self.recall_url, headers=self.headers, json=payload)
                response.raise_for_status()
                data = response.json()

            memories: list[str] = []
            for result in data.get("results", []):
                if isinstance(result, dict):
                    text = result.get("text") or result.get("content") or result.get("memory")
                    if text:
                        memories.append(str(text))
                elif isinstance(result, str):
                    memories.append(result)

            if DEBUG:
                print(f"Hindsight recall: {len(memories)} memories for {customer_id}")

            # If cloud returns empty but local has instant demo memory, use local.
            if not memories and local_memories:
                return {
                    "source": "local_after_empty_hindsight",
                    "memories": local_memories,
                    "error": None,
                }

            return {"source": "hindsight", "memories": memories, "error": None}

        except Exception as exc:
            if DEBUG:
                print(f"Hindsight recall error: {exc}")
            return {
                "source": "local_after_hindsight_error",
                "memories": local_memories,
                "error": str(exc),
            }

    async def save_memory(
        self,
        customer_id: str,
        user_message: str,
        ai_reply: str,
        lead_score: dict[str, Any],
        customer_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ) -> dict[str, Any]:
        """
        Save current interaction to Hindsight and local backup.
        """
        timestamp = now_iso()
        content = (
            f"Customer {customer_name or customer_id} with id {customer_id} interacted with the AI receptionist at {timestamp}.\n"
            f"Customer message: {user_message}\n"
            f"AI reply: {ai_reply}\n"
            f"Lead score: {lead_score.get('score')}/100. Status: {lead_score.get('status')}.\n"
            f"Breakdown: {json.dumps(lead_score.get('breakdown', {}), ensure_ascii=False)}.\n"
            f"Sentiment: {lead_score.get('sentiment')}.\n"
            f"Follow-up required: {lead_score.get('follow_up_required')}. Reason: {lead_score.get('follow_up_reason')}.\n"
            f"Email: {email or 'unknown'}. Phone: {phone or 'unknown'}."
        )

        # Local backup first.
        local_data = read_local_memory()
        local_data.setdefault(customer_id, []).append(content)
        local_data[customer_id] = local_data[customer_id][-30:]
        write_local_memory(local_data)

        if not self.enabled:
            return {
                "saved_to_hindsight": False,
                "saved_to_local": True,
                "error": "Hindsight disabled or HINDSIGHT_API_KEY missing",
            }

        item: dict[str, Any] = {
            "content": content,
            "context": "AI receptionist customer conversation",
            "timestamp": timestamp,
            "document_id": f"chat-{customer_id}",
            "update_mode": "append",
            "metadata": {
                "app": "ai-receptionist",
                "customer_id": customer_id,
                "customer_name": customer_name or "unknown",
                "lead_score": str(lead_score.get("score")),
                "lead_status": str(lead_score.get("status")),
            },
            "tags": [make_customer_tag(customer_id), "app:ai-receptionist"],
        }

        if customer_name:
            item["entities"] = [{"text": customer_name, "type": "PERSON"}]

        payload = {"items": [item]}

        try:
            async with httpx.AsyncClient(timeout=30) as http:
                response = await http.post(self.retain_url, headers=self.headers, json=payload)
                response.raise_for_status()

            if DEBUG:
                print(f"Hindsight retain saved for {customer_id}")

            return {"saved_to_hindsight": True, "saved_to_local": True, "error": None}

        except Exception as exc:
            if DEBUG:
                print(f"Hindsight retain error: {exc}")
            return {"saved_to_hindsight": False, "saved_to_local": True, "error": str(exc)}


# Shared memory instance used by main.py
memory = HindsightMemory()


# Convenience wrappers if any other file imports these names.
async def recall_memory(customer_id: str, user_message: str, customer_name: str | None = None) -> dict[str, Any]:
    return await memory.recall_memory(customer_id, user_message, customer_name)


async def save_memory(
    customer_id: str,
    user_message: str,
    ai_reply: str,
    lead_score: dict[str, Any],
    customer_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
) -> dict[str, Any]:
    return await memory.save_memory(
        customer_id=customer_id,
        user_message=user_message,
        ai_reply=ai_reply,
        lead_score=lead_score,
        customer_name=customer_name,
        email=email,
        phone=phone,
    )
