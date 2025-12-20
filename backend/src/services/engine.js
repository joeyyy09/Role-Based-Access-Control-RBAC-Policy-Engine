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
                // Rule Complete Logic with MERGING
                const newRule = {
                    role: session.draft.role,
                    action: session.draft.action,
                    resource: session.draft.resource,
                    conditions: session.draft.conditions || {}
                };

                // Check for existing rule to MERGE
                const existingIndex = session.policy.rules.findIndex(r => 
                    r.role === newRule.role && 
                    r.resource === newRule.resource && 
                    JSON.stringify(r.action) === JSON.stringify(newRule.action) // Simple array compare
                );

                if (existingIndex >= 0) {
                    // Update Existing Rule
                    const existing = session.policy.rules[existingIndex];
                    
                    // Merge Environments
                    if (newRule.conditions.environment) {
                        const currentEnvs = Array.isArray(existing.conditions.environment) 
                            ? existing.conditions.environment 
                            : (existing.conditions.environment ? [existing.conditions.environment] : []);
                        
                        const newEnvs = Array.isArray(newRule.conditions.environment)
                            ? newRule.conditions.environment
                            : [newRule.conditions.environment];

                        // Union of environments
                        const mergedEnvs = [...new Set([...currentEnvs, ...newEnvs])];
                        existing.conditions.environment = mergedEnvs.length === 1 ? mergedEnvs[0] : mergedEnvs;
                    }
                    response = `✅ Rule updated: [${existing.role}] can [${existing.action}] [${existing.resource}] in [${existing.conditions.environment}].`;
                } else {
                    // Create New Rule
                    const rule = {
                        rule_id: uuidv4().slice(0, 8),
                        ...newRule,
                        effect: "ALLOW"
                    };
                    session.policy.rules.push(rule);
                    response = `✅ Rule added: [${rule.role}] can [${rule.action}] [${rule.resource}].`;
                }
                
                session.draft = {}; // Clear draft
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
            
            CRITICAL RULES:
            1. STRICT SCHEMA ENFORCEMENT for ROLES and RESOURCES: 
               - If a role or resource is NOT in the schema, return NULL. 
            2. SMART ACTION MAPPING: 
               - You MAY map synonyms for ACTIONS if the meaning is clear.
               - E.g. "manage" -> "update" (or "create,delete" depending on resource capability).
               - E.g. "see" -> "read".
               - E.g. "change" -> "update".
            3. MULTI-ACTIONS: 
               - If multiple actions are requested, return an ARRAY.
            4. AMBIGUITY:
               - If information is missing, return null.

            Example Input: "Admins can manage system config"
            Example Output: {"role": "admin", "action": "update", "resource": "system_config"}
            
            Example Input: "Interns can read"
            Example Output: {"role": null, "action": "read", "resource": null}
        `;

        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
        });

        try {
            const jsonStr = msg.content[0].text.match(/\{[\s\S]*\}/)[0];
            const result = JSON.parse(jsonStr);

            // POST-AI VALIDATION (Double Check)
            if (result.role && !schema.roles.includes(result.role)) result.role = null;
            if (result.resource && !schema.resources.some(r => r.type === result.resource)) result.resource = null;
            
            return result;
        } catch (e) {
            console.error("Failed to parse AI response:", msg.content[0].text);
            return {};
        }
    },

    extractWithRegex(text, schema) {
        // ... (regex implementation remains same, omitted for brevity but preserved in file)
        const lower = text.toLowerCase();
        const found = {};
        schema.roles.forEach(r => { if (lower.includes(r)) found.role = r; });
        schema.resources.forEach(r => { if (lower.includes(r.type)) found.resource = r.type; });
        
        // Naive multi-action regex support
        const actionsFound = [];
        const actions = new Set(schema.resources.flatMap(r => r.actions));
        actions.forEach(a => {
            if (new RegExp(`\\b${a}\\b`).test(lower)) actionsFound.push(a);
        });
        if (actionsFound.length > 0) found.action = actionsFound.length === 1 ? actionsFound[0] : actionsFound;

        if (lower.includes("prod")) found.conditions = { environment: "prod" };
        if (lower.includes("staging")) found.conditions = { environment: "staging" };
        return found;
    },

    validateDraft(draft, schema) {
        // Prevent invalid combinations
        if (draft.resource && draft.action) {
            const res = schema.resources.find(r => r.type === draft.resource);
            if (res) {
                 const actions = Array.isArray(draft.action) ? draft.action : [draft.action];
                 const invalid = actions.find(a => !res.actions.includes(a));
                 if (invalid) {
                     return `Action '${invalid}' is not supported on '${draft.resource}'.`;
                 }
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
