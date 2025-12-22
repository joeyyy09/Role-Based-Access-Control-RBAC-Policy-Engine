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

## Access Evaluator Verification

The system includes a dedicated **Access Evaluator** (UI Panel + `/evaluate` API) to verify strict permissions.

### 1. Verification Workflow
1.  **Grant Access**: `Admins can read invoices`
2.  **Verify Allow**:
    *   **Panel Input**: Role=`admin`, Action=`read`, Resource=`invoice`
    *   **Result**: 🟢 `ALLOWED` (Authorized by ALLOW rule)
3.  **Verify Implicit Deny**:
    *   **Panel Input**: Role=`viewer`, Action=`read`, Resource=`invoice`
    *   **Result**: 🔴 `DENIED` (No matching rules found)

### 2. Explicit Deny Check
1.  **Add Deny Rule**: `Admins cannot delete invoices`
2.  **Verify Deny**:
    *   **Panel Input**: Role=`admin`, Action=`delete`, Resource=`invoice`
    *   **Result**: 🔴 `DENIED` (Explicitly denied by policy)

### 3. Contextual Verification
1.  **Add Context Rule**: `Operators can read reports in prod`
2.  **Verify Match**:
    *   **Panel Input**: Role=`operator`, Action=`read`, Resource=`report`, Env=`prod`
    *   **Result**: 🟢 `ALLOWED`
3.  **Verify Mismatch**:
    *   **Panel Input**: Role=`operator`, Action=`read`, Resource=`report`, Env=`staging`
    *   **Result**: 🔴 `DENIED` (No matching rules found)

## Advanced Edge Cases

| Case | Scenario | Expected Behavior |
| :--- | :--- | :--- |
| **Overlapping Rules** | 1. `Admins can read` <br> 2. `Admins cannot read` | **DENY** (Deny always overrides Allow). |
| **Case Sensitivity** | `AdMinS cAn ReAd InVoiCeS` | **Normal Operation**. System normalizes text input. |
| **Typo Tolerance** | `Admins can read invoces` | **Suggestion**: "Resource 'invoces' does not exist. Did you mean 'invoice'?" |
| **Invalid Action** | `Admins can create reports` | **Schema Check**: Report resource only supports [read, export]. Returns Error. |
| **Empty Request** | evaluate `{}` | **Error**: Role, Action, Resource are required. |
