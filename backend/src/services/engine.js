import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage.js';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const anthropic = process.env.ANTHROPIC_API_KEY 
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) 
    : null;

export const Engine = {
    async processMessage(userText) {
        const session = storage.session;
        const schema = storage.cache;

        // 1. Log User Message
        session.conversation.push({ role: 'user', content: userText, timestamp: Date.now() });

        // 2. Extract Entities (AI or Regex)
        let extracted = {};
        if (anthropic) {
            try {
                extracted = await this.extractWithAI(userText, schema, session.draft);
            } catch (e) {
                console.error("AI Error, falling back to regex:", e);
                extracted = this.extractWithRegex(userText, schema);
            }
        } else {
            extracted = this.extractWithRegex(userText, schema);
        }
        
        // 3. Update Draft State
        session.draft = { ...session.draft, ...extracted };

        let response = "";

        // 4. Validate Draft (Immediate Pushback)
        const error = this.validateDraft(session.draft, schema);
        if (error) {
            response = `I can't allow that. ${error}`;
            // Reset the invalid action
            delete session.draft.action;
        } else {
            // 5. Ambiguity Check
            const missing = this.findMissingSlots(session.draft);

            if (missing.length === 0) {
                // Rule Complete
                const rule = {
                    rule_id: uuidv4().slice(0, 8),
                    role: session.draft.role,
                    action: session.draft.action,
                    resource: session.draft.resource,
                    conditions: session.draft.conditions || {},
                    effect: "ALLOW"
                };
                
                session.policy.rules.push(rule);
                session.draft = {}; // Clear draft
                response = `✅ Rule added: [${rule.role}] can [${rule.action}] [${rule.resource}].`;
            } else {
                // Generate Clarifying Question (AI or Templates)
                if (anthropic) {
                    try {
                        response = await this.generateQuestionAI(missing, session.draft);
                    } catch (e) {
                        response = this.generateQuestionTemplate(missing, session.draft);
                    }
                } else {
                    response = this.generateQuestionTemplate(missing, session.draft);
                }
            }
        }

        session.conversation.push({ role: 'system', content: response, timestamp: Date.now() });
        storage.saveSession();
        return response;
    },

    async extractWithAI(text, schema, currentDraft) {
        const prompt = `
            You are an RBAC Policy Engine. Extract entities from the user's request.
            
            Schema:
            - Roles: ${JSON.stringify(schema.roles)}
            - Resources: ${JSON.stringify(schema.resources.map(r => r.type))}
            - Actions: ${JSON.stringify(schema.resources.flatMap(r => r.actions))}
            
            Current Draft State: ${JSON.stringify(currentDraft)}
            
            User Input: "${text}"
            
            Return ONLY a JSON object with keys: "role", "action", "resource", "conditions".
            Do not admit values that are not in the schema.
            If a value is mentioned but not in schema, ignore it.
            
            CRITICAL RULES:
            - If the user does not explicitly state an action (like "read", "delete", "modify"), return null for "action". DO NOT INFER ALL ACTIONS.
            - If the user does not explicitly state a resource, return null for "resource".
            - Infer context like "prod" or "staging" into "conditions.environment".

            Example Input: "Admins can"
            Example Output: {"role": "admin", "action": null, "resource": null}

            Example Input: "Admins can read"
            Example Output: {"role": "admin", "action": "read", "resource": null}
        `;

        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
        });

        try {
            const jsonStr = msg.content[0].text.match(/\{[\s\S]*\}/)[0];
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse AI response:", msg.content[0].text);
            return {};
        }
    },

    extractWithRegex(text, schema) {
        const lower = text.toLowerCase();
        const found = {};

        // Find Roles
        schema.roles.forEach(r => { if (lower.includes(r)) found.role = r; });
        
        // Find Resources
        schema.resources.forEach(r => { if (lower.includes(r.type)) found.resource = r.type; });

        // Find Actions
        const actions = new Set(schema.resources.flatMap(r => r.actions));
        actions.forEach(a => {
            if (new RegExp(`\\b${a}\\b`).test(lower)) found.action = a;
        });

        // Find Context (Simple heuristic)
        if (lower.includes("prod")) found.conditions = { environment: "prod" };
        if (lower.includes("staging")) found.conditions = { environment: "staging" };

        return found;
    },

    validateDraft(draft, schema) {
        // Prevent invalid combinations
        if (draft.resource && draft.action) {
            const res = schema.resources.find(r => r.type === draft.resource);
            if (res && !res.actions.includes(draft.action)) {
                return `Action '${draft.action}' is not supported on '${draft.resource}'.`;
            }
        }
        return null;
    },

    findMissingSlots(draft) {
        return ['role', 'resource', 'action'].filter(k => !draft[k]);
    },

    async generateQuestionAI(missing, draft) {
        const prompt = `
            The user is building an RBAC rule but is missing information.
            Missing fields: ${missing.join(', ')}
            Current Draft: ${JSON.stringify(draft)}
            
            Ask a natural, helpful clarifying question to get the missing information.
            Keep it short.
        `;

        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 100,
            messages: [{ role: "user", content: prompt }]
        });

        return msg.content[0].text;
    },

    generateQuestionTemplate(missing, draft) {
        if (missing.includes('role')) return "Who is this rule for? (e.g., admin, operator)";
        if (missing.includes('resource')) return `What resource does the ${draft.role} need access to?`;
        if (missing.includes('action')) return `What can the ${draft.role} do with ${draft.resource}?`;
        return "Please clarify.";
    }
};
