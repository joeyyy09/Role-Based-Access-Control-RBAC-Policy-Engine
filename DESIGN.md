# System Design & Architecture

## Architecture Overview

The system implements a **Hybrid Intelligence** architecture where an LLM (Claude 3) provides intent understanding, while a deterministic Code Engine ensures safety and correctness.

```mermaid
flowchart TD
    User([User]) -->|Natural Language| AI[Claude 3 Haiku]
    AI -->|Raw JSON Intent| Extractor[Entity Extractor]

    subgraph "Engine Orchestration (engine.js)"
        Extractor -->|Extracted Entities| Sanitizer[Anti-Hallucination Layer]
        Sanitizer -->|Sanitized Draft| State[Session Draft State]
        
        State -->|Check Completeness| Decision{Is Rule Ready?}
        
        Decision -- No --> QuestionGen[Question Generator]
        Decision -- Yes --> BusinessVal[Business Logic Validator]
    end

    subgraph "Safety & Persistence"
        Sanitizer -.->|Schema Check| Registry[(Mock Registry)]
        BusinessVal -.->|Security Policies| Registry
        BusinessVal -->|Approved| DB[(Session/Policy DB)]
    end

    QuestionGen -->|Clarifying Question| User
    BusinessVal -- Violation -->|Error Message| User
    DB -->|Confirmation| User
```

### Components

#### 1. Controller Layer (`controllers/`)
*   **PolicyController:** Handles incoming HTTP requests, input validation (via Zod), and response formatting. Decouples HTTP logic from Business Logic.

#### 2. Service Layer (`services/`)
*   **Engine:** The central orchestrator. Manages conversation state and delegates tasks.
*   **Extractor:** Dedicated service for parsing Natural Language. Uses **Hybrid Intelligence** (AI + Regex).
*   **Evaluator:** Pure functional component that evaluates access requests (`evaluateAccess`) against the policy. Zero side effects.
*   **MockRegistry:** Simulates external IAM/CMDB systems.

#### 3. Repository Layer (`repositories/`)
*   **StorageRepository:** Manages file system I/O.
*   **Concurrency Control:** Uses `Async Mutex` to serialize writes to `session.json`, preventing race conditions.
*   **History Snapshots:** On every save service writes a timestamped copy to `artifacts/history/` to preserve audit trail.
*   **Caching:** Loads `schema_cache.json` on startup to minimize "network" calls.

#### 4. Anti-Hallucination Layer (in `engine.js` & `extractor.js`)
LLMs can invent invalid roles or actions (e.g., "SuperUser", "Eat"). We strictly sanitize AI output *twice*:
1.  **Extraction Phase (`extractor.js`)**: If the AI returns a valid-looking JSON but the role doesn't match the schema, it is marked as `UNKNOWN`.
2.  **Drafting Phase (`engine.js`)**: Before any intent is added to the Draft state, it is validated again. We do not attempt to "fuzzy match" wildly incorrect values automatically, preventing unintended privilege escalation (though we do offer "Did you mean?" suggestions for UX).

## Key Design Decisions & Trade-offs

### 1. Hybrid Intelligence (AI + Deterministic Code)
*   **Decision:** We do not rely solely on the LLM to write the policy.
*   **Reasoning:** LLMs can hallucinate (e.g., "SuperUsers", "Eat"). Deterministic code provides 100% safety guarantees.
*   **Trade-off:** Slightly more code to write (Validation logic) vs. "Magic" (Pure Prompt Engineering). We chose **Safety**.

### 2. Immediate vs Final Validation
*   **Immediate Validation**:
    *   **What**: Checks if inputs *exist* in the schema (e.g., Is "Intern" a role?).
    *   **When**: During the chat.
    *   **Why**: Fast feedback loop.
*   **Final Validation**:
    *   **What**: Checks *business rules* (e.g., Can Viewers delete?).
    *   **When**: When saving the policy.
    *   **Why**: Separation of "Syntax" vs "Semantics".

### 3. Client-Side Rendering vs Server-Side
*   **Decision**: React SPA (Single Page Application).
*   **Reasoning**: Better interactivity for the chat interface. A server-rendered page would reload on every message, breaking immersion.

### 4. Mock Registry Latency
*   **Decision**: Added `50ms` delay to Mock APIs.
*   **Reasoning**: To simulate real microservices. This forced us to make `storage.init()` async.

### 5. Concurrency Control
*   **Decision**: Use `Async Mutex` for file writes.
*   **Reasoning**: Node.js is single-threaded but `fs.promises` are asynchronous. Without a lock, two requests could read `session.json`, modify it, and write it back, causing the Last-Write-Wins problem. Mutex serializes critical sections.

### 6. Strict Input Validation
*   **Decision**: Use `zod` middleware.
*   **Decision**: Use `zod` middleware.
*   **Reasoning**: Fail fast. Reject malformed JSON at the edge before it reaches business logic.

### 7. Decision Framework (Deny-Overrides-Allow)
*   **Logic**:
    1.  **Explicit Deny**: If *any* matching rule says `DENY`, access is blocked.
    2.  **Explicit Allow**: Else, if a matching rule says `ALLOW`, access is granted.
    3.  **Implicit Deny**: If no rules match, access is blocked.
*   **Implementation**: Pure function in `Evaluator.evaluateAccess`.

## Future Improvements
1.  **Database**: Migrate `session.json` to SQLite or Redis for multi-user support.
2.  **Vector Search**: For larger schemas (thousands of roles), Regex/Array search is inefficient. A vector store would help find semantically similar roles.
3.  **Audit Logs**: Persist a history of *who* made changes to the policy.
