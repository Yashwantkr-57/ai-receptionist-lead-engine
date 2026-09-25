"""
Optional quick test client.

Usage:
1. Start backend: python main.py
2. In another terminal: python test_backend.py
"""

import json

import httpx

BASE_URL = "http://127.0.0.1:8000"


def show(title: str, data):
    print(f"\n--- {title} ---")
    print(json.dumps(data, indent=2, ensure_ascii=False))


health = httpx.get(f"{BASE_URL}/health", timeout=20).json()
show("HEALTH", health)

payload = {
    "customer_id": "rahul-demo",
    "name": "Rahul",
    "phone": "9876543210",
    "message": "Hi, I want to join this week. My budget is ₹3000 per month. Do you have evening batches?",
}

chat1 = httpx.post(f"{BASE_URL}/chat", json=payload, timeout=90).json()
show("CHAT 1", chat1)

payload["message"] = "Do you remember my budget and evening preference? I might visit tomorrow."
chat2 = httpx.post(f"{BASE_URL}/chat", json=payload, timeout=90).json()
show("CHAT 2 MEMORY TEST", chat2)

leads = httpx.get(f"{BASE_URL}/leads", timeout=20).json()
show("LEADS", leads)

followups = httpx.get(f"{BASE_URL}/followups", timeout=20).json()
show("FOLLOWUPS", followups)
