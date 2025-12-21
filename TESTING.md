# RBAC Policy Engine - Testing Guide

This guide details how to verify the Core Concepts and Edge Cases of the RBAC Policy Engine.

## core Concepts Verification

| Concept | Description | Test Case | Expected Result |
| :--- | :--- | :--- | :--- |
| **Role** | Named user role (admin, viewer) | `Admins can read invoices` | Rule created for `role: admin`. |
| **Permission** | Action allowed (read, write) | `Viewers can read reports` | Rule created with `action: read`. |
| **Resource** | Entity accessed | `Admins can delete invoices` | Rule created for `resource: invoice`. |
| **Policy Rule** | Grant/Deny logic | (See above) | Rules are persisted in policy. |
| **Context** | Conditions (env) | `Admins can read invoices in prod` | Rule has `conditions: { environment: "prod" }`. |
| **Logic** | AND/OR/NOT | See Logical Composition below. | Complex rules are handled correctly. |

## Logical Composition Tests

The engine supports logical composition for Actions and Resources.

### 1. Multi-Action (AND)
*   **Input**: `Admins can read and delete invoices`
*   **Result**: Single rule created with `action: ["read", "delete"]`.
*   **Verification**: Ask "What can admins do?" -> Lists both actions.

### 2. Multi-Resource (AND)
*   **Input**: `Admins can read invoices and reports`
*   **Result**: **Two separate rules** created.
    1. `[admin] can [read] [invoice]`
    2. `[admin] can [read] [report]`
*   **Verification**: Ask "What can admins do?" -> Lists permissions for both resources.

### 3. Revocation (NOT)
*   **Input**: `Admins cannot delete invoices`
*   **Result**: Removes `delete` permission from existing rule.
*   **Partial Revoke**: If rule was `[read, delete]`, it updates to `[read]`.

## Edge Cases

### 1. Ambiguity & Questions
*   **Input**: `What can admins do?`
*   **Result**: Lists permissions. **Does NOT create a rule.**
*   **Input**: `can?`
*   **Result**: AI asks for clarification (Role).

### 2. Hallucination Prevention
*   **Input**: `Admins can` (Missing Action/Resource)
*   **Result**: AI extract returns `null`. Backend asks clarifying question ("What resource...?").
*   **Input**: `Admins can fly` (Invalid Action)
*   **Result**: Validation Error: "Action 'fly' is not supported...".

### 3. Context Stickiness (Reset)
*   **Scenario**:
    1. `Admins can read invoices` (Valid)
    2. `Admins can not delete reports` (Invalid -> Error)
    3. `Admins can not delete invoices` (Correction)
*   **Result**: Step 3 successful. The invalid "report" context from Step 2 is cleared immediately.

### 4. Logic Conflict
*   **Input**: `Admins can eat invoices`
*   **Result**: "Action 'eat' is not supported on 'invoice'".

## Reset Functionality
*   **Action**: Click "Reset" button.
*   **Result**:
    *   Chat history cleared.
    *   Policy cleared (Empty).
    *   Backend `session.json` deleted/reset.
    *   Browser cache bypassed (fresh state).
