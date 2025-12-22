
import { storage } from '../repositories/storageRepository.js';
import { Engine } from '../services/engine.js';
import { MockRegistry } from '../services/mockRegistry.js';

export const PolicyController = {
    async checkConnection(req, res) {
        res.json({ status: 'ok', version: '1.0' });
    },

    async getState(req, res) {
        res.json(storage.session);
    },

    async resetState(req, res) {
        await storage.reset();
        res.json({ message: 'System reset complete.' });
    },

    async processChat(req, res) {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message required" });
        
        try {
            const response = await Engine.processMessage(message);
            res.json({ response, state: storage.session });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Internal Error" });
        }
    },

    async validatePolicy(req, res) {
        const report = await MockRegistry.validatePolicy(storage.session.policy);
        await storage.saveSession(); // Persist validation report
        res.json(report);
    },

    async evaluateAccess(req, res) {
        const { policy, query } = req.body; // Allow passing policy explicitly or use current session?
        // Requirement implies evaluating against *current* policy usually, or arbitrary.
        // If policy is provided in body, use it. Else use session policy.
        
        const policyToTest = policy || storage.session.policy;
        
        if (!query || !query.role || !query.resource || !query.action) {
             return res.status(400).json({ 
                 allowed: false, 
                 reason: "Invalid Query. Access Request must include role, resource, and action." 
             });
        }

        const result = Engine.evaluateAccess(policyToTest, query);
        res.json(result);
    }
};
