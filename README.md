# 🛡️ RBAC Policy Engine (Agentic AI)

A robust, AI-powered **Role-Based Access Control (RBAC)** Policy Engine designed to interpret natural language instructions, validate them against strict business rules, and generate secure JSON policies.

![Project Demo](image.png)

## 🚀 Key Features

*   **🗣️ Natural Language Interface:** Use plain English to create complex rules (e.g., *"Admins can delete invoices in prod"*).
*   **🤖 AI Agent (Claude 3):** Powered by Anthropic's Claude 3 Haiku for intelligent entity extraction, ambiguity resolution, and smart contextual mapping (e.g., "manage" -> "update").
*   **🛡️ Strict Validation:** A "Trust but Verify" architecture. The AI suggests rules, but the deterministic Validator enforces security (e.g., stopping Viewers from deleting data).
*   **🔄 Rule Merging:** Automatically merges new conditions into existing rules to keep the policy clean and concise.
*   **💾 Usage Persistence:** State is persisted to a local JSON filesystem, surviving server restarts.
*   **📝 Live Preview:** Real-time JSON visualization of the policy as it is being built.

---

## 🏗️ Architecture & Logic

The project is a monorepo divided into `backend` (Node.js/Express) and `frontend` (React/Vite).

### 🖥️ Backend (`/backend`)
The brain of the operation. It exposes a REST API to process chat messages and manage state.

**Key Components (`src/services`):**
1.  **`engine.js` (The Brain):**
    *   **Orchestrator:** Handles the conversation loop.
    *   **Hybrid NLP:** Uses Claude 3 (AI) for complex extraction but falls back to Regex for speed/reliability if the API key is missing.
    *   **Hallucination Guard:** Post-processes AI output to ensure strictly no invalid roles (e.g., "Interns") enter the system.
    *   **Smart Mapping:** Intelligently maps "manage" to "update" or "see" to "read".

2.  **`mockRegistry.js` (The Law):**
    *   Simulates external microservices (User Service, Resource Service).
    *   **Validator:** Validates policies against schema. Enforces business rules (e.g., *Viewer cannot write*).

3.  **`storage.js` (The Memory):**
    *   Persists `session.json` and `schema_cache.json` to the `storage/` disk folder.
    *   Ensures you can refresh the page and pick up where you left off.

### 🎨 Frontend (`/frontend`)
A modern, dark-mode UI built with React, Tailwind CSS, and Lucide Icons.

**Key Components (`src/components`):**
1.  **`ChatInterface.jsx`:** The agentic chat window. Handles history and auto-scrolling.
2.  **`PolicyPreview.jsx`:** Displays the `Live Policy` JSON. Includes the **Validate & Save** button which triggers the strict backend security check.
3.  **`App.jsx`:** Manages layout and strictly constrains the viewport to prevent scroll issues.

---

## ⚙️ Installation & Setup

### Prerequisites
*   **Node.js** (v18 or higher)
*   **Docker** (Optional, for containerized run)
*   **Anthropic API Key** (For AI features)

### Option 1: Quick Start (Manual)
Run the backend and frontend in two separate terminals.

**1. Backend**
```bash
cd backend
# Create .env file and add your ANTHROPIC_API_KEY=sk-...
npm install
npm start
```
*Server runs on `http://localhost:4000`*

**2. Frontend**
```bash
cd frontend
npm install
npm run dev
```
*App runs on `http://localhost:5173`*

### Option 2: Docker Compose
```bash
docker-compose up --build
```

---

## 📖 Usage Guide

### 1. Creating Rules
Just type what you want!
> **User:** "Operators can read reports"
>
> **Agent:** `✅ Rule added: [operator] can [read] [report].`

### 2. Handling Ambiguity
If you are vague, the Agent will ask for clarity.
> **User:** "Admins can"
>
> **Agent:** "What resource does the admin need access to?"

### 3. Validating Security
The Agent is helpful, but the Validator is strict.
> **User:** "Viewers can delete invoices"
>
> **Agent:** `✅ Rule added...` (Agent allows it as a draft)
>
> **Action:** Click **[Validate & Save]**
>
> **System:** `❌ Security Violation - 'viewer' cannot perform write operations.`

### 4. Resetting
Click the **Reset (Trash Icon)** in the top-right to clear the session and start fresh.

---

## 📂 Folder Structure

```
rbac-engine/
├── backend/                # Node.js Express Server
│   ├── src/
│   │   ├── services/       # Core Logic (Engine, Validator, Storage)
│   │   ├── routes.js       # API Endpoints
│   │   └── server.js       # Entry point
│   ├── storage/            # Persisted JSON files
│   └── Dockerfile
├── frontend/               # React + Vite Application
│   ├── src/
│   │   ├── components/     # UI Components (Chat, Preview)
│   │   └── App.jsx         # Layout Manager
│   └── Dockerfile
├── docker-compose.yml      # Orchestration
├── Makefile                # Quick commands
└── README.md               # Documentation
```

---

## 🧪 Testing
See [testing_guide.md](./testing_guide.md) for a comprehensive list of test cases, including edge cases and security verification steps.