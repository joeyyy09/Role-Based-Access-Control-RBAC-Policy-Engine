# System Design

## Architecture Overview
The system follows a typical **Controller-Service-Repository** pattern, enhanced with an **Agentic Layer** for natural language processing.

### Components
1.  **Processing Engine (`engine.js`)**:
    *   **Hybrid NLP**: Uses **Claude 3 Haiku** for intent detection and complex entity extraction, falling back to **Regex** for speed or API failures.
    *   **Anti-Hallucination Layer**: Post-LLM validation that cross-references the Schema to explicitly reject invalid Roles (e.g., "Interns") or Actions (e.g., "Eat").
    *   **Slot Filling**: State machine that accumulates `Draft` state until all required fields (Role, Action, Resource) are present.

2.  **Mock Registry (`mockRegistry.js`)**:
    *   Simulates external microservices (Role Service, Resource Service).
    *   Provides the "Ground Truth" schema used to validate every AI prediction.
    *   Implements **Latency Simulation** (50ms) to mimic real-world network calls.

3.  **Storage Layer (`storage.js`)**:
    *   Manages persistence using local JSON files (`session.json`).
    *   **Auto-Generation**: Automatically produces `final_policy.json` and `validation_report.json` on every state change, satisfying deliverable requirements.

## Key Design Decisions & Trade-offs

### 1. Hybrid Intelligence (AI + Deterministic Code)
*   **Decision:** We do not rely solely on the LLM to write the policy.
*   **Reasoning:** LLMs can hallucinate (e.g., "SuperUsers", "Eat").
*   **Implementation:** The LLM's job is *Extraction* and *Intent Classification* (Grant vs Revoke). The Code's job is *Validation* and *Policy Construction*. This "Trust but Verify" approach ensures correctness.

### 2. Immediate vs Final Validation
*   **Immediate:** Invalid inputs (e.g., "Interns can...") are rejected instantly during the chat.
*   **Final:** The full policy is validated against business rules (e.g., conflicting environmental constraints) before saving.

### 3. File System Persistence
*   **Decision:** Used local JSON files instead of Dockerized Database.
*   **Trade-off:** Lower setup complexity for the user (just `npm start`) vs Concurrency support (not needed for a single-user assignment).
