
import { Engine } from './src/services/engine.js';
import { MockRegistry } from './src/services/mockRegistry.js';
import { storage } from './src/services/storage.js';

// Mock Storage and Schema
storage.cache = {
    roles: ["admin", "operator", "viewer"],
    resources: [
        { type: "invoice", actions: ["read", "create", "delete", "approve"] },
        { type: "report", actions: ["read", "export"] }
    ]
};

async function testValidation() {
    console.log("--- Testing Validation Logic ---");

    const cases = [
        {
            name: "Invalid Role",
            draft: { role: "SuperUser" },
            expected: "'SuperUser' is not a valid role."
        },
        {
            name: "Invalid Resource",
            draft: { role: "admin", resource: "nuclear_codes" },
            expected: "'nuclear_codes' is not a valid resource."
        },
        {
            name: "Invalid Action for Resource",
            draft: { role: "admin", resource: "report", action: "delete" },
            expected: "Action 'delete' is not supported on 'report'."
        },
        {
            name: "Security Violation (Viewer Writing)",
            draft: { role: "viewer", action: "delete", resource: "invoice" },
            expected: "Security Violation - 'viewer' cannot perform write operations."
        },
        {
            name: "Valid Case",
            draft: { role: "admin", action: "delete", resource: "invoice" },
            expected: null
        }
    ];

    for (const c of cases) {
        const result = Engine.validateDraft(c.draft, storage.cache);
        const passed = (result === null && c.expected === null) || (result && result.message === c.expected);
        console.log(`[${passed ? 'PASS' : 'FAIL'}] ${c.name}`);
        if (!passed) {
            console.log(`   Expected: ${c.expected}`);
            console.log(`   Got:      ${result ? result.message : 'null'}`);
        }
    }
}

testValidation();
