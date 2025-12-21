
import { Engine } from '../src/services/engine.js';
import { storage } from '../src/services/storage.js';
import assert from 'assert';

console.log("🛠️  Running Revocation Debugger...\n");

async function runDebug() {
    try {
        await storage.reset();
        await storage.init();
        storage.cache = {
             roles: ["admin", "viewer"],
             resources: [{ type: "invoice", actions: ["read", "delete"] }],
             context: []
        };

        // 1. Setup: Grant Logic
        console.log("👉 Step 1: Granting 'Admins can read invoices'");
        // Simulating exactly what the Engine does
        await Engine.processMessage("Admins can read invoices");
        
        const rulesAfterGrant = storage.session.policy.rules;
        console.log("DEBUG: Current Rules:", JSON.stringify(rulesAfterGrant, null, 2));

        if (rulesAfterGrant.length === 0) {
            console.error("❌ Setup Failed: No rule created.");
            process.exit(1);
        }

        // 2. Action: Revoke
        console.log("\n👉 Step 2: Revoking 'Revoke admin read access on invoices'");
        const response = await Engine.processMessage("Revoke admin read access on invoices");
        console.log("DEBUG: Response:", response);

        const rulesAfterRevoke = storage.session.policy.rules;
        console.log("DEBUG: Remaining Rules:", JSON.stringify(rulesAfterRevoke, null, 2));

        if (rulesAfterRevoke.length === 0) {
            console.log("✅ Passed: Rule successfully revoked.");
        } else {
            console.error("❌ Failed: Rule still exists or partial revoke failed.");
            process.exit(1);
        }
        
    } catch (e) {
        console.error("\n❌ Error:", e);
        process.exit(1);
    }
}

runDebug();
