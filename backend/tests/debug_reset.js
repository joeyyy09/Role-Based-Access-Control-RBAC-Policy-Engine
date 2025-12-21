
import { storage } from '../src/services/storage.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '../../storage/session.json');

console.log("🛠️  Running Reset Debugger...\n");

async function runDebug() {
    try {
        await storage.init();
        
        // 1. Populate Dummy State
        storage.session.conversation.push({ role: "user", content: "test" });
        storage.saveSession();

        console.log("👉 State Populated. Conversation length:", storage.session.conversation.length);
        if (storage.session.conversation.length === 0) throw new Error("Setup failed");
        if (!fs.existsSync(SESSION_FILE)) throw new Error("File not saved");

        // 2. Call Reset
        console.log("👉 Calling Reset...");
        await storage.reset();

        // 3. Verify
        console.log("👉 Verifying...");
        if (storage.session.conversation.length !== 0) {
            throw new Error(`Memory not cleared! Length: ${storage.session.conversation.length}`);
        }
        if (fs.existsSync(SESSION_FILE)) {
             throw new Error("File not deleted!");
        }

        console.log("✅ Passed: Reset works correctly in backend isolation.");

    } catch (e) {
        console.error("\n❌ Error:", e);
        process.exit(1);
    }
}

runDebug();
