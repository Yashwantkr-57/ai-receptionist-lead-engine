# 🤖 AI Receptionist Lead Engine

An AI-powered receptionist and lead management system designed to handle customer conversations, remember customer preferences, score leads, and help businesses automate follow-ups.

The project combines a conversational AI assistant with customer memory, lead scoring, follow-up management, and business dashboards.

---

## 🚀 Features

### 💬 AI Receptionist

* Conversational AI for customer interactions
* Answers questions using business-specific knowledge
* Provides information about membership plans, pricing, timings, and services
* Maintains conversation context

### 🧠 Customer Memory

* Remembers important customer information
* Stores preferences and conversation context
* Reduces repetitive questions
* Enables more personalized responses

### 🎯 Lead Scoring

* Automatically evaluates customer interactions
* Generates a lead score based on customer intent and engagement
* Helps identify high-value prospects
* Supports hot-lead identification

### 🔔 Automated Follow-ups

* Tracks potential leads
* Provides follow-up information for sales teams
* Helps prevent promising leads from being forgotten

### 📊 Business Dashboards

The project includes dashboards for different business roles:

* **CEO Dashboard**
* **Employee Dashboard**
* **Follow-up Dashboard**

These dashboards provide a centralized view of leads and customer interactions.

---

## 🏗️ Project Structure

```text
AI Receptionist Lead/
│
├── backend/
│   ├── ai_agent.py
│   ├── config.py
│   ├── hindsight.py
│   ├── lead_scorer.py
│   ├── main.py
│   └── test.py
│
├── frontend/
│   ├── css/
│   │   └── style.css
│   │
│   ├── js/
│   │   ├── api.js
│   │   ├── chat.js
│   │   ├── ceo.js
│   │   ├── employee.js
│   │   └── followups.js
│   │
│   ├── index.html
│   ├── ceo_dashboard.html
│   ├── employee_dashboard.html
│   └── followups.html
│
├── requirements.txt
├── .gitignore
└── README.md
```

---

## ⚙️ Tech Stack

### Backend

* Python
* FastAPI
* Uvicorn
* OpenAI-compatible API integration
* OpenRouter
* JSON-based data storage

### Frontend

* HTML5
* CSS3
* JavaScript

### AI & Memory

* Conversational AI
* Customer memory
* Business knowledge base
* Lead scoring
* Automated follow-up logic

---

## 🔄 System Workflow

```text
Customer
   │
   ▼
AI Receptionist
   │
   ├── Business Knowledge
   │
   ├── Customer Memory
   │
   ▼
Conversation Analysis
   │
   ▼
Lead Scoring
   │
   ├── High-Intent Lead
   │
   └── Normal Lead
   │
   ▼
Follow-up Management
   │
   ▼
Business Dashboards
```

---

## 🏋️ Demo Business

The current implementation uses **IronPulse Fitness Studio** as the demonstration business.

### Business Information

**Location:** Koramangala 5th Block, Bangalore – 560095

### Operating Hours

| Day               | Timings            |
| ----------------- | ------------------ |
| Monday – Friday   | 5:00 AM – 11:00 PM |
| Saturday – Sunday | 6:00 AM – 10:00 PM |
| Holidays          | 7:00 AM – 1:00 PM  |

### Membership Plans

| Plan              |            Price |
| ----------------- | ---------------: |
| Monthly           | ₹3,499 / 30 days |
| Quarterly         |           ₹8,999 |
| Yoga-only Monthly |           ₹2,499 |

The AI receptionist uses this business information to provide relevant responses to customers.

---

## 💡 Example Use Case

A customer might tell the receptionist:

> "I can spend around ₹5,000 and I prefer morning batches."

Instead of asking the customer the same information repeatedly, the system can use the stored context to identify the customer's requirements and recommend a suitable membership plan.

This demonstrates how memory can be combined with business knowledge and lead scoring to create a more personalized receptionist experience.

---

## 🖥️ Running the Project Locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-receptionist-lead-engine.git
cd ai-receptionist-lead-engine
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the virtual environment

**Windows PowerShell:**

```powershell
venv\Scripts\Activate.ps1
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure environment variables

Create a `.env` file for your API configuration.

Example:

```env
OPENROUTER_API_KEY=your_api_key_here
```

**Never commit your actual API key to GitHub.**

The `.gitignore` file is configured to prevent `.env` files from being uploaded.

### 6. Start the backend

```bash
cd backend
python main.py
```

The backend runs on:

```text
http://127.0.0.1:8000
```

### 7. Start the frontend

Open another terminal:

```bash
cd frontend
python -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500/
```

---

## 🔌 API

### Health Check

```http
GET /health
```

Used to verify that the backend is running.

### Chat

```http
POST /chat
```

Used by the frontend to communicate with the AI receptionist.

---

## 🔐 Security

Sensitive and machine-specific files are excluded from the repository using `.gitignore`.

Examples include:

```text
.env
venv/
__pycache__/
backend/local_memory.json
backend/sessions.json
backend/leads.json
```

API keys and other credentials should always be stored in environment variables rather than directly inside source code.

---

## 🎯 Project Goals

This project demonstrates how AI can be integrated into a business workflow instead of being used only as a simple chatbot.

The main goals are:

* Automate customer conversations
* Personalize interactions using memory
* Identify promising leads
* Reduce repetitive work for employees
* Organize follow-ups
* Provide useful business dashboards

---

## 👨‍💻 Project Type

**AI / Full-Stack Web Application**

This project was developed as a team project and focuses on combining conversational AI, backend APIs, frontend dashboards, customer memory, and lead-management functionality into a single application.

---

## 📌 Future Improvements

Potential future improvements include:

* Database integration using PostgreSQL/MySQL
* User authentication and role-based access control
* Production deployment
* WhatsApp integration
* Email/SMS follow-up automation
* Advanced analytics and reporting
* Persistent cloud-based customer memory
* CRM integrations
* Voice-based AI receptionist
* Appointment booking

---

## 📄 License

This project is intended for educational and portfolio purposes.
