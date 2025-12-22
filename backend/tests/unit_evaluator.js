
import { Evaluator } from '../src/services/evaluator.js';
import assert from 'assert';

console.log("🧩 Running Evaluator Unit Tests...\n");

function testEvaluator() {
    const policy = {
        rules: [
            { role: "admin", action: "delete", resource: "invoice", effect: "ALLOW" },
            { role: "viewer", action: "read", resource: "invoice", effect: "ALLOW" },
            { role: "intern", action: "read", resource: "invoice", effect: "ALLOW", conditions: { environment: "dev" } },
            { role: "bad_actor", action: "delete", resource: "invoice", effect: "DENY" } // Explicit Deny
        ]
    };

    try {
        // 1. Basic Allow
        const res1 = Evaluator.evaluateAccess(policy, { role: "admin", action: "delete", resource: "invoice" });
        assert.strictEqual(res1.allowed, true, "Admin should allow delete");

        // 2. Implicit Deny
        const res2 = Evaluator.evaluateAccess(policy, { role: "viewer", action: "delete", resource: "invoice" });
        assert.strictEqual(res2.allowed, false, "Viewer delete should be denied (Implicit)");

        // 3. Explicit Deny
        const res3 = Evaluator.evaluateAccess(policy, { role: "bad_actor", action: "delete", resource: "invoice" });
        assert.strictEqual(res3.allowed, false, "Bad actor delete should be denied (Explicit)");
        assert.strictEqual(res3.reason, "Explicitly denied by policy.", "Reason should look explicit");

        // 4. Context Match (Success)
        const res4 = Evaluator.evaluateAccess(policy, { role: "intern", action: "read", resource: "invoice", environment: "dev" });
        assert.strictEqual(res4.allowed, true, "Intern in dev should allow");

        // 5. Context Mismatch (Fail)
        const res5 = Evaluator.evaluateAccess(policy, { role: "intern", action: "read", resource: "invoice", environment: "prod" });
        assert.strictEqual(res5.allowed, false, "Intern in prod should deny");

        console.log("✅ Evaluator Unit Tests Passed");
    } catch (e) {
        console.error("❌ Evaluator Unit Test Failed:", e);
        process.exit(1);
    }
}

testEvaluator();
