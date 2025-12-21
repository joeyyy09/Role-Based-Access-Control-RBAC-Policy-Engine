# QA Guide & Edge Case Coverage

This document outlines the testing strategy for ensuring the RBAC Policy Engine handles complex, ambiguous, and negated user inputs correctly.

## 1. Singular & Plural Normalization
**Requirement:** The system must normalize plural nouns to their singular schema equivalents.
*   **Test Case:** "Admins can delete invoices"
*   **Expected Behavior:** System identifies resource as `invoice` (singular), matching the schema.
*   **Verification:** `tests/test_edge_cases.js` Test #1.

## 2. Negation & Revocation
**Requirement:** The system must distinguish between *denying* access (Revoke) and the *action* of deleting a resource.
*   **Test Case A (Revoke):** "Revoke admin read access on invoices" or "Admins cannot read invoices"
    *   **Expected:** Rule is removed or action is stripped from the rule.
*   **Test Case B (Action):** "Admins can delete invoices"
    *   **Expected:** Grant rule created with `action: delete`.

## 3. Ambiguity & Partial Information
**Requirement:** The system must not guess. If information is missing, it must ask clarification questions.
*   **Test Case:** "Admins can"
*   **Expected:** No rule created. Agent responds with a question like "What resource does the admin need access to?"
*   **Verification:** `tests/test_edge_cases.js` Test #3.

## 4. Context Switching [Planned]
**Requirement:** If a user changes their mind mid-sentence or in a follow-up without completing the previous draft, the old draft should be updated or discarded to avoid mixing contexts.
*   **Test Case:** User starts with "Admins can...", then says "Actually, Operators can read reports".
*   **Status:** Handled by Draft Purge logic in `engine.js`.

## Running the Tests
```bash
node backend/tests/test_edge_cases.js
```
