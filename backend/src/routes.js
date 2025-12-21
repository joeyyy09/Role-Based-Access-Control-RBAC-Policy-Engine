import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Engine } from './services/engine.js';
import { storage } from './services/storage.js';
import { MockRegistry } from './services/mockRegistry.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, '../../artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

router.post('/chat', async (req, res) => {
    try {
        await Engine.processMessage(req.body.message);
        res.json({
            history: storage.session.conversation,
            policy: storage.session.policy
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/state', (req, res) => {
    res.json({
        history: storage.session.conversation,
        policy: storage.session.policy,
        schema: storage.cache
    });
});

router.post('/validate', async (req, res) => {
    const policy = storage.session.policy;
    const result = await MockRegistry.validatePolicy(policy);

    // Artifacts
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'final_policy.json'), JSON.stringify(policy, null, 2));
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'validation_report.json'), JSON.stringify(result, null, 2));

    res.json(result);
});

router.post('/reset', async (req, res) => {
    await storage.reset();
    res.json({ status: "ok" });
});

export default router;
