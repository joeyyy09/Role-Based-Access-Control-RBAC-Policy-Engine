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

#### 1. Processing Engine (`engine.js`)
The Engine is the central orchestrator that manages the conversation lifecycle. It implements a **Slot-Filling State Machine** to handle ambiguity and ensure incomplete requests are clarified before execution.
*   **State Accumulation**: Maintains a `draft` object in the user session. If a user provides only a Role (e.g., "Admins..."), the engine holds this state and prompts for the missing Action or Resource.
*   **Context Merging**: Intelligently merges new inputs with the existing draft. For example, providing a new Resource while retaining the previous Role, but resetting incompatible Actions.
*   **Dynamic Regex Scanner**: Uses the *Live Schema* to generate regex patterns on the fly. This avoids hardcoding keywords like "prod" or "staging", making the system adaptable to schema changes without code updates.
*   **Ambiguity Resolution**: Distinguishes between **Rules** (commands to change policy) and **Questions** (queries about the current state) based on the AI's intent classification.

#### 2. Anti-Hallucination Layer (Sanitization)
LLMs can invent invalid roles or actions (e.g., "SuperUser", "Eat"). We strictly sanitize AI output *before* it touches the draft state:
*   **Immediate Schema Validation**: Every extracted entity (Role, Resource, Action) is cross-referenced against the `MockRegistry` immediately.
*   **Strict Filtering**: Unknown entities are replaced with `UNKNOWN` or `null`. We do not attempt to "fuzzy match" or guess, preventing unintended privilege escalation.
*   **Stale Context Clearing**: Explicitly resets the `action` slot if a user switches context (e.g., changing from "reading invoices" to "deleting reports") to prevent accidental carry-over of dangerous permissions.

#### 3. Business Logic Validator (Pre-Commit)
Even if an entity is valid, the combination might violate business rules. This "Dry Run" happens before any data is saved:
*   **Security Constraints**: e.g., "Viewers cannot have Write permissions."
*   **Resource Constraints**: e.g., "Invoices cannot be Executed."
*   **Feedback**: If validation fails, the user receives a specific error message explaining *why* (e.g., "Security Violation: Viewers cannot create"), rather than a generic error.

#### 4. Storage & Persistence
*   **Strategy**: Local Filesystem (`session.json`) with **Async I/O**.
*   **Why**:
    *   **Non-Blocking**: Uses `fs.promises` to prevent the Node.js event loop from stalling under load.
    *   **Audit Trail**: Appends all write operations to `audit.log`.
    *   **Cache Invalidation**: Detects Schema Version mismatches on startup and refreshes `schema_cache.json` automatically.

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
*   **Reasoning**: To simulate real microservices. This forced us to make `storage.init()` async and handle loading states properly.

## Future Improvements
1.  **Database**: Migrate `session.json` to SQLite or Redis for multi-user support.
2.  **Vector Search**: For larger schemas (thousands of roles), Regex/Array search is inefficient. A vector store would help find semantically similar roles.
3.  **Audit Logs**: Persist a history of *who* made changes to the policy.
