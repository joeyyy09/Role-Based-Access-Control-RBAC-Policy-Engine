import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MockRegistry } from './mockRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '../../../storage');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const CACHE_FILE = path.join(STORAGE_DIR, 'schema_cache.json');
const SESSION_FILE = path.join(STORAGE_DIR, 'session.json');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit.log');
const SCHEMA_VERSION = "1.1"; // Bump this to invalidate old caches

class StorageService {
    constructor() {
        this.cache = null;
        this.session = {
            conversation: [],
            policy: { version: "1.0", rules: [] },
            draft: {} 
        };
        // Init is async, so we can't await it in constructor. 
        // Callers should preferably await storage.init() or we ensure it's ready.
        // For simplicity in this Express app, we'll let it initialize in background 
        // but robust apps should wait.
        this.readyPromise = this.init();
    }

    async init() {
        // Validation: Check Cache freshness
        let cacheValid = false;
        if (fs.existsSync(CACHE_FILE)) {
            try {
                const data = await fs.promises.readFile(CACHE_FILE, 'utf8');
                this.cache = JSON.parse(data);
                if (this.cache.version === SCHEMA_VERSION) {
                    console.log("[Storage] Loading schema from disk cache.");
                    cacheValid = true;
                } else {
                    console.log("[Storage] Cache schema version mismatch. Refreshing...");
                }
            } catch (e) {
                console.error("[Storage] Read cache failed:", e.message);
            }
        }

        if (!cacheValid) {
            console.log("[Storage] Cache miss/stale. Discovering metadata...");
            const roles = await MockRegistry.discoverRoles();
            const resources = await MockRegistry.getResourceSchema();
            const context = await MockRegistry.getContextSchema();
            
            this.cache = { version: SCHEMA_VERSION, roles, resources, context };
            await fs.promises.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        }

        if (fs.existsSync(SESSION_FILE)) {
            try {
                const data = await fs.promises.readFile(SESSION_FILE, 'utf8');
                this.session = JSON.parse(data);
            } catch (e) {
                console.error("Session corrupted, resetting.");
            }
        }
    }

    async saveSession() {
        try {
            await this.readyPromise; // Ensure init is done
            
            // Atomic Pattern: Write to temp file then rename? 
            // For now, standard async write is sufficient for this assignment scale.
            await fs.promises.writeFile(SESSION_FILE, JSON.stringify(this.session, null, 2));

            // Generate Artifacts
            const policyPath = path.join(STORAGE_DIR, 'final_policy.json');
            await fs.promises.writeFile(policyPath, JSON.stringify(this.session.policy, null, 2));

            // Validation (Background)
            // We await it here to ensure consistency for tests/audits
            const report = await MockRegistry.validatePolicy(this.session.policy);
            const reportPath = path.join(STORAGE_DIR, 'validation_report.json');
            await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));

            // Audit Log
            await this.appendAuditLog("POLICY_UPDATE", { timestamp: new Date().toISOString() });

        } catch (err) {
            console.error('Error saving session:', err);
        }
    }

    async appendAuditLog(action, metadata) {
        const entry = `[${new Date().toISOString()}] ACTION=${action} META=${JSON.stringify(metadata)}\n`;
        try {
            await fs.promises.appendFile(AUDIT_FILE, entry);
        } catch (e) {
            console.error("Failed to write audit log:", e);
        }
    }

    async reset() {
        this.session = { conversation: [], policy: { version: "1.0", rules: [] }, draft: {} };
        await fs.promises.writeFile(SESSION_FILE, JSON.stringify(this.session, null, 2));

        const policyPath = path.join(STORAGE_DIR, 'final_policy.json');
        const reportPath = path.join(STORAGE_DIR, 'validation_report.json');
        
        try {
            if (fs.existsSync(policyPath)) await fs.promises.unlink(policyPath);
            if (fs.existsSync(reportPath)) await fs.promises.unlink(reportPath);
        } catch (e) { /* ignore */ }
        
        await this.appendAuditLog("SYSTEM_RESET", { user: "admin" });
    }
}

export const storage = new StorageService();
