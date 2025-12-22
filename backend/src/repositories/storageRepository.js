
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MockRegistry } from '../services/mockRegistry.js';
import { Mutex } from 'async-mutex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '../../../storage');
const ARTIFACTS_DIR = path.join(__dirname, '../../../artifacts');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const CACHE_FILE = path.join(STORAGE_DIR, 'schema_cache.json');
const SESSION_FILE = path.join(STORAGE_DIR, 'session.json');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit.log');
const SCHEMA_VERSION = "1.2";

class StorageRepository {
    constructor() {
        this.cache = null;
        this.session = {
            conversation: [],
            policy: { version: "1.0", rules: [] },
            draft: {} 
        };
        this.mutex = new Mutex();
        this.readyPromise = this.init();
    }

    async init() {
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
        await this.mutex.runExclusive(async () => {
            try {
                await this.readyPromise; 
                
                await fs.promises.writeFile(SESSION_FILE, JSON.stringify(this.session, null, 2));

                const policyName = 'final_policy.json';
                const reportName = 'validation_report.json';
                
                await fs.promises.writeFile(path.join(STORAGE_DIR, policyName), JSON.stringify(this.session.policy, null, 2));
                await fs.promises.writeFile(path.join(ARTIFACTS_DIR, policyName), JSON.stringify(this.session.policy, null, 2));

                const report = await MockRegistry.validatePolicy(this.session.policy);
                await fs.promises.writeFile(path.join(STORAGE_DIR, reportName), JSON.stringify(report, null, 2));
                await fs.promises.writeFile(path.join(ARTIFACTS_DIR, reportName), JSON.stringify(report, null, 2));

                await this.appendAuditLog("POLICY_UPDATE", { timestamp: new Date().toISOString() });

            } catch (err) {
                console.error('Error saving session:', err);
            }
        });
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

        const policyName = 'final_policy.json';
        const reportName = 'validation_report.json';
        
        const filesToDelete = [
            path.join(STORAGE_DIR, policyName),
            path.join(STORAGE_DIR, reportName),
            path.join(ARTIFACTS_DIR, policyName),
            path.join(ARTIFACTS_DIR, reportName)
        ];

        try {
            await Promise.all(filesToDelete.map(async (file) => {
                if (fs.existsSync(file)) await fs.promises.unlink(file);
            }));
        } catch (e) { /* ignore */ }
        
        await this.appendAuditLog("SYSTEM_RESET", { user: "admin" });
    }
}

export const storage = new StorageRepository();
