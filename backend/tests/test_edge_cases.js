
import { Engine } from '../src/services/engine.js';
import { storage } from '../src/services/storage.js';
import assert from 'assert';

console.log("🛠️  Running Edge Case Verification...\n");

async function runTests() {
    try {
        await storage.reset();
        await storage.init();
        storage.cache = {
             roles: ["admin", "viewer"],
             resources: [{ type: "invoice", actions: ["read", "delete"] }, { type: "report", actions: ["read"] }],
             context: []
        };

        // 1. Singular/Plural Normalization
        console.log("👉 Test 1: Singular/Plural (Invoices -> invoice)");
        // Regex fallback might fail this if not explicitly handling plurals, but we want to verify.
        // If using AI, it handles it. If using Regex, we check if 'invoices' maps to 'invoice'.
        await Engine.processMessage("Admins can read invoices"); 
        let rules = storage.session.policy.rules;
        // If normalization works, resource should be 'invoice', not 'invoices'
        assert.strictEqual(rules.length, 1);
        assert.strictEqual(rules[0].resource, "invoice"); 
        console.log("✅ Passed: Plural 'invoices' normalized to 'invoice'.");

        // 2. Negation / Revocation
        console.log("👉 Test 2: Revocation (Admins cannot read invoices)");
        await Engine.processMessage("Revoke admin read access on invoices");
        rules = storage.session.policy.rules;
        assert.strictEqual(rules.length, 0); 
        console.log("✅ Passed: Revocation successful.");

        // 3. Ambiguity / Partial Info
        console.log("👉 Test 3: Partial Info (Ambiguity)");
        await storage.reset(); await storage.init(); // Clear
        const response = await Engine.processMessage("Admins can");
        // Should NOT create a rule
        assert.strictEqual(storage.session.policy.rules.length, 0);
        // Should ask a question
        assert.ok(response.includes("?"), "Response should be a question");
        console.log(`✅ Passed: Ambiguity detected. Agent asked: "${response}"`);

        console.log("\n🎉 Edge Case Tests Passed!");
        process.exit(0);
    } catch (e) {
        console.error("\n❌ Test Failed:", e);
        process.exit(1);
    }
}

runTests();
