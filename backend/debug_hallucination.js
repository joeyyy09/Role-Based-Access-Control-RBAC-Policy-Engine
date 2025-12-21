
import { Engine } from './src/services/engine.js';
import { storage } from './src/services/storage.js';

// Mock Storage
storage.cache = {
    roles: ["admin", "operator", "viewer"],
    resources: [
        { type: "invoice", actions: ["read", "create", "delete", "approve"] },
        { type: "report", actions: ["read", "export"] }
    ]
};

async function testHallucination() {
    console.log("--- Testing AI Extraction for Hallucination ---");
    
    // Case 1: "admins can" -> Should NOT have action: "read"
    const input = "admins can";
    const draft = {}; // Empty draft
    console.log(`Input: "${input}"`);
    
    // We need to access extractWithAI. It's an instance method or exported? 
    // It's in Engine object.
    
    try {
        const result = await Engine.extractWithAI(input, storage.cache, draft);
        console.log("Result:", JSON.stringify(result, null, 2));
        
        if (result.action === 'read') {
            console.log("❌ FAIL: AI hallucinated 'read' action.");
        } else if (!result.action) {
            console.log("✅ PASS: No action extracted.");
        } else {
            console.log(`❓ UNEXPECTED: Extracted action '${result.action}'`);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testHallucination();
