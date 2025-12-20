import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MockRegistry } from './mockRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '../../../storage');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const CACHE_FILE = path.join(STORAGE_DIR, 'schema_cache.json');
const SESSION_FILE = path.join(STORAGE_DIR, 'session.json');

class StorageService {
    constructor() {
        this.cache = null;
        this.session = {
            conversation: [],
            policy: { version: "1.0", rules: [] },
            draft: {} 
        };
        this.init();
    }

    async init() {
        // Resume without re-discovering if cache is valid
        if (fs.existsSync(CACHE_FILE)) {
            console.log("[Storage] Loading schema from disk cache.");
            this.cache = JSON.parse(fs.readFileSync(CACHE_FILE));
        } else {
            console.log("[Storage] Cache miss. Discovering metadata...");
            const roles = await MockRegistry.discoverRoles();
            const resources = await MockRegistry.getResourceSchema();
            const context = await MockRegistry.getContextSchema();
            
            this.cache = { roles, resources, context };
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        }

        if (fs.existsSync(SESSION_FILE)) {
            try {
                this.session = JSON.parse(await fs.readFile(SESSION_FILE, 'utf8'));
            } catch (e) {
                console.error("Session corrupted, resetting.");
            }
        }
    }

    saveSession() {
        try {
            // Main Session Persistence
            fs.writeFileSync(SESSION_FILE, JSON.stringify(this.session, null, 2));

            // REQUIRED DELIVERABLES:
            // 1. final_policy.json
            const policyPath = path.join(STORAGE_DIR, 'final_policy.json');
            fs.writeFileSync(policyPath, JSON.stringify(this.session.policy, null, 2));

            // 2. validation_report.json
            // Validate asynchronously but we are in a sync method? 
            // MockRegistry methods are async (mostly to simulate delay). 
            // We should make saveSession async properly or use the synchronous result if possible.
            // MockRegistry is async. So let's convert saveSession to async and fix callers.
            // Callers: Engine.processMessage calls storage.saveSession() but doesn't await it.
            // That's fine, it can happen in background.
            MockRegistry.validatePolicy(this.session.policy).then(report => {
                 const reportPath = path.join(STORAGE_DIR, 'validation_report.json');
                 fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            }).catch(console.error);

        } catch (err) {
            console.error('Error saving session:', err);
        }
    }

    async reset() {
        this.session = { conversation: [], policy: { version: "1.0", rules: [] }, draft: {} };
        if (fs.existsSync(SESSION_FILE)) await fs.unlink(SESSION_FILE);
    }
}

export const storage = new StorageService();
