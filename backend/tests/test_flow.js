
import { Engine } from '../src/services/engine.js';
import { storage } from '../src/services/storage.js';
import assert from 'assert';

console.log("🛠️  Running RBAC System Checks...\n");

async function runTests() {
    try {
        // 1. Reset State
        await storage.reset();
        await storage.init();
        storage.cache = {
             roles: ["admin", "viewer", "operator"],
             resources: [{ type: "invoice", actions: ["read", "delete"] }],
             context: []
        };
        console.log("✅ Initialization / Reset");

        // 2. Test: GRANT (Valid)
        // Note: We mock Anthropic or rely on Regex if key missing. 
        // For deterministic testing of *Logic*, Regex is safer, or we test the *Engine* handling.
        // Let's rely on the Engine's Regex fallback or mock extracted if possible.
        // Actually, integration test is best.
        
        console.log("👉 Test 1: Grant Rule (Admin -> Invoice)");
        await Engine.processMessage("Admins can delete invoices in prod");
        let rules = storage.session.policy.rules;
        assert.strictEqual(rules.length, 1, "Should have 1 rule");
        assert.strictEqual(rules[0].role, "admin");
        assert.strictEqual(rules[0].action, "delete");
        assert.strictEqual(rules[0].conditions.environment, "prod");
        console.log("✅ Passed: Rule Created correctly.");

        // 3. Test: NEGATION (Revoke)
        console.log("👉 Test 2: Revocation (Admins can't delete)");
        await Engine.processMessage("Admins cannot delete invoices");
        rules = storage.session.policy.rules;
        assert.strictEqual(rules.length, 0, "Rule should be removed");
        console.log("✅ Passed: Rule Revoked correctly.");

        // 4. Test: VALIDATION (Invalid Action)
        console.log("👉 Test 3: Validation (Eat Invoices)");
        // Regex might capture 'eat' if we were loose, but our schema check matches valid actions.
        // If Regex sees 'invoice' but no valid action, it waits. 
        // If AI sees 'eat', it returns 'UNKNOWN' -> null.
        // So state should remain empty or draft partial.
        await Engine.processMessage("Admins can eat invoices");
        rules = storage.session.policy.rules;
        assert.strictEqual(rules.length, 0, "No rule should be added for invalid action");
        console.log("✅ Passed: Invalid action rejected.");

        console.log("\n🎉 All Verification Tests Passed!");
        process.exit(0);
    } catch (e) {
        console.error("\n❌ Test Failed:", e);
        process.exit(1);
    }
}

runTests();
