# System Design

## Core Decisions
1. **Modular Services:** Backend is split into `engine` (Logic), `registry` (Mock API), and `storage` (State) for separation of concerns.
2. **Slot-Filling NLP:** Used a deterministic entity extraction approach instead of LLMs to ensure reproducibility and meet the "System Design" focus over AI integration complexity.
3. **Two-Phase Validation:**
    - *Ingestion:* Immediate pushback on invalid terms.
    - *Finalization:* Full policy scan for logical contradictions.

## Trade-offs
- **File System vs DB:** Used JSON files for storage to keep the solution "local" and easily reviewable without needing a Postgres container.
- **Latency Simulation:** Added 50ms delays to mock functions to realistically simulate network calls to external microservices.
