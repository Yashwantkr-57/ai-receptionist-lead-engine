"""
main.py - FastAPI server for AI Receptionist & Lead Conversion Engine.

Endpoints:
- GET  /health
- POST /chat
- POST /score
- GET  /leads
- GET  /leads/{customer_id}
- POST /followup
"""

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ai_agent import get_ai_response, trim_conversation_history
from config import (
    AI_MODEL,
    APP_NAME,
    APP_VERSION,
    BUSINESS_NAME,
    FRONTEND_ORIGINS,
    HINDSIGHT_BANK_ID,
    OPENROUTER_API_KEY,
)
from hindsight import memory, recall_memory, save_memory
from lead_scorer import score_lead

LEADS_FILE = Path("leads.json")
SESSIONS_FILE = Path("sessions.json")
FOLLOWUPS_FILE = Path("followups.json")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    customer_id: str | None = None
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class ScoreRequest(BaseModel):
    message: str = Field(..., min_length=1)
    memory_text: str = ""
    ai_reply: str = ""
    interaction_count: int = 1


class FollowupRequest(BaseModel):
    customer_id: str
    note: str = "Manual follow-up requested"
    due: str | None = None


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Backend API for AI chat, Hindsight memory, lead scoring, and lead dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or f"customer-{uuid.uuid4().hex[:8]}"


def make_customer_id(req: ChatRequest) -> str:
    if req.customer_id:
        return slugify(req.customer_id)
    if req.phone:
        return slugify(req.phone)
    if req.email:
        return slugify(req.email.split("@")[0])
    if req.name:
        return slugify(req.name)
    return f"customer-{uuid.uuid4().hex[:8]}"


def read_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json_file(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def get_sessions() -> dict[str, list[dict]]:
    return read_json_file(SESSIONS_FILE, {})


def save_sessions(sessions: dict[str, list[dict]]) -> None:
    write_json_file(SESSIONS_FILE, sessions)


def get_leads() -> dict[str, dict[str, Any]]:
    return read_json_file(LEADS_FILE, {})


def save_leads(leads: dict[str, dict[str, Any]]) -> None:
    write_json_file(LEADS_FILE, leads)


def get_followups() -> list[dict[str, Any]]:
    return read_json_file(FOLLOWUPS_FILE, [])


def save_followups(followups: list[dict[str, Any]]) -> None:
    write_json_file(FOLLOWUPS_FILE, followups)


def create_followup_if_needed(customer_id: str, lead: dict[str, Any]) -> dict[str, Any] | None:
    if not lead.get("follow_up_required"):
        return None

    followup = {
        "id": f"followup-{uuid.uuid4().hex[:8]}",
        "customer_id": customer_id,
        "name": lead.get("name"),
        "phone": lead.get("phone"),
        "email": lead.get("email"),
        "reason": lead.get("follow_up_reason"),
        "status": "pending",
        "created_at": now_iso(),
        "due": "soon",
    }

    followups = get_followups()
    followups.append(followup)
    save_followups(followups)
    return followup


def upsert_lead(
    customer_id: str,
    req: ChatRequest,
    ai_reply: str,
    scoring: dict[str, Any],
    memory_source: str,
) -> dict[str, Any]:
    leads = get_leads()
    old = leads.get(customer_id, {})
    history = old.get("history", [])
    history.append(
        {
            "timestamp": now_iso(),
            "customer_message": req.message,
            "ai_reply": ai_reply,
            "score": scoring.get("score"),
            "status": scoring.get("status"),
            "sentiment": scoring.get("sentiment"),
        }
    )
    history = history[-20:]

    lead = {
        "customer_id": customer_id,
        "name": req.name or old.get("name") or "Unknown",
        "email": req.email or old.get("email"),
        "phone": req.phone or old.get("phone"),
        "score": scoring.get("score"),
        "status": scoring.get("status"),
        "breakdown": scoring.get("breakdown"),
        "sentiment": scoring.get("sentiment"),
        "follow_up_required": scoring.get("follow_up_required"),
        "follow_up_reason": scoring.get("follow_up_reason"),
        "recommended_action": scoring.get("recommended_action"),
        "last_message": req.message,
        "last_reply": ai_reply,
        "memory_source": memory_source,
        "interaction_count": len(history),
        "first_seen": old.get("first_seen") or now_iso(),
        "last_seen": now_iso(),
        "history": history,
    }

    leads[customer_id] = lead
    save_leads(leads)
    return lead


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "AI Receptionist backend is running",
        "docs": "http://127.0.0.1:8000/docs",
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    leads = get_leads()
    followups = get_followups()
    return {
        "status": "ok",
        "app": APP_NAME,
        "business": BUSINESS_NAME,
        "model": AI_MODEL,
        "openrouter_configured": bool(OPENROUTER_API_KEY),
        "hindsight_enabled": memory.enabled,
        "hindsight_bank_id": HINDSIGHT_BANK_ID,
        "lead_count": len(leads),
        "hot_leads": len([lead for lead in leads.values() if lead.get("status") == "HOT"]),
        "followups_pending": len([item for item in followups if item.get("status") == "pending"]),
    }


@app.post("/score")
async def score_endpoint(req: ScoreRequest) -> dict[str, Any]:
    return score_lead(
        message=req.message,
        memory_text=req.memory_text,
        ai_reply=req.ai_reply,
        interaction_count=req.interaction_count,
    )


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    customer_id = make_customer_id(req)

    sessions = get_sessions()
    history = sessions.get(customer_id, [])
    history = trim_conversation_history(history)
    interaction_count = int(len(history) / 2) + 1

    recalled = await recall_memory(
        customer_id=customer_id,
        user_message=req.message,
        customer_name=req.name,
    )
    memories = recalled.get("memories", []) or []
    memory_text = "\n".join(str(item) for item in memories)

    preliminary_score = score_lead(
        message=req.message,
        memory_text=memory_text,
        interaction_count=interaction_count,
    )

    ai_reply = await get_ai_response(
        user_message=req.message,
        conversation_history=history,
        memory=recalled,
        session_id=customer_id,
    )

    final_score = score_lead(
        message=req.message,
        memory_text=memory_text,
        ai_reply=ai_reply,
        interaction_count=interaction_count,
    )

    history.append({"role": "user", "content": req.message})
    history.append({"role": "assistant", "content": ai_reply})
    sessions[customer_id] = trim_conversation_history(history)
    save_sessions(sessions)

    lead = upsert_lead(
        customer_id=customer_id,
        req=req,
        ai_reply=ai_reply,
        scoring=final_score,
        memory_source=str(recalled.get("source")),
    )

    retain_result = await save_memory(
        customer_id=customer_id,
        user_message=req.message,
        ai_reply=ai_reply,
        lead_score=final_score,
        customer_name=req.name,
        email=req.email,
        phone=req.phone,
    )

    followup = create_followup_if_needed(customer_id, lead)

    return {
        "reply": ai_reply,
        "customer_id": customer_id,
        "lead_score": final_score,
        "lead": lead,
        "followup": followup,
        "memory": {
            "source": recalled.get("source"),
            "items_used": memories[:6],
            "recall_error": recalled.get("error"),
            "retain": retain_result,
        },
    }


@app.get("/leads")
async def leads_endpoint(
    status: str | None = Query(None, description="Optional filter: HOT, WARM, COLD"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    leads = list(get_leads().values())
    if status:
        leads = [lead for lead in leads if str(lead.get("status", "")).upper() == status.upper()]

    leads.sort(key=lambda item: int(item.get("score") or 0), reverse=True)
    return {"count": len(leads[:limit]), "leads": leads[:limit]}


@app.get("/leads/{customer_id}")
async def lead_detail(customer_id: str) -> dict[str, Any]:
    customer_id = slugify(customer_id)
    lead = get_leads().get(customer_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@app.get("/followups")
async def followups_endpoint() -> dict[str, Any]:
    followups = get_followups()
    return {"count": len(followups), "followups": followups}


@app.post("/followup")
async def create_manual_followup(req: FollowupRequest) -> dict[str, Any]:
    followup = {
        "id": f"followup-{uuid.uuid4().hex[:8]}",
        "customer_id": slugify(req.customer_id),
        "note": req.note,
        "due": req.due or "soon",
        "status": "pending",
        "created_at": now_iso(),
    }
    followups = get_followups()
    followups.append(followup)
    save_followups(followups)
    return followup


@app.delete("/demo/reset")
async def reset_demo() -> dict[str, bool]:
    """Reset local demo files. Does not delete Hindsight cloud memories."""
    for path in [LEADS_FILE, SESSIONS_FILE, FOLLOWUPS_FILE, Path("local_memory.json")]:
        if path.exists():
            path.unlink()
    return {"reset": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
