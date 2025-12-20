# RBAC Policy Engine

A complete Role-Based Access Control generation system with Agentic AI, dynamic schema discovery, and strict validation.

## Quick Start
1. **Prerequisite:** Docker & Make.
2. **Run:** `make run`
3. **Access:** Open `http://localhost:3000`.

## Features
- **Agentic Flow:** Resolves ambiguity (e.g., "Admins can delete" -> "Delete what?").
- **Safety:** Validation prevents invalid actions (e.g., Viewers cannot write).
- **Persistence:** JSON-based state ensures restart recovery.
- **Artifacts:** Generates `final_policy.json` in `/artifacts`.

## Architecture
- **Backend:** Node.js/Express (Modular Services).
- **Frontend:** React/Vite/Tailwind.
- **Storage:** Local JSON file system (Simulates Database).
