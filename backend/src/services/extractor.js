
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const anthropic = process.env.ANTHROPIC_API_KEY 
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) 
    : null;

const NEGATIVES = ["cannot", "can't", "deny", "not allow", "fail", "block"];

export const Extractor = {
    async extract(text, schema, currentDraft) {
        if (anthropic) {
            try {
                return await this.extractWithAI(text, schema, currentDraft);
            } catch (e) {
                console.error("AI Error, falling back to regex:", e);
                return this.extractWithRegex(text, schema);
            }
        } else {
            return this.extractWithRegex(text, schema);
        }
    },

    async extractWithAI(text, schema, currentDraft) {
        const prompt = `
            You are an RBAC Policy Engine. Extract entities or answer questions.
            
            Schema:
            - Roles: ${JSON.stringify(schema.roles)}
            - Resources: ${JSON.stringify(schema.resources.map(r => r.type))}
            - Actions: ${JSON.stringify(schema.resources.flatMap(r => r.actions))}
            
            Current Draft State: ${JSON.stringify(currentDraft)}
            
            User Input: "${text}"
            
            Task:
            1. Classify "type": "RULE" (creating/editing) or "QUESTION" (asking status).
            2. If RULE, detect "intent": "GRANT" or "REVOKE".
            3. Detect "effect": "ALLOW" (can/allowed) or "DENY" (cannot/denied/not allowed).
               - Default to "ALLOW" if creating a rule.
               - "Admins cannot delete" -> effect: "DENY".
            4. Extract entities (role, action, resource, conditions).
            
            CRITICAL RULES:
            1. EXPLICIT NULLS (RESET CONTEXT):
               - You MUST return keys for 'role', 'action', 'resource'.
               - If an entity is NOT explicitly mentioned, set it to \`null\`.
               - do NOT omit keys. do NOT imply values "contextually". 
            2. SUBJECT PRIORITY:
               - If input has a Subject (e.g. "User", "SuperUser") that is NOT in Schema, return "role": "UNKNOWN".
            3. CONDITIONS MAPPING:
               - "in prod" -> {"environment": "prod"}.
               - OUTPUT SCHEMA: Only use keys 'role', 'action', 'resource', 'conditions'.
            4. UNKNOWN ENTITIES & NO AUTOCORRECTION:
               - Role not in schema -> "UNKNOWN".
               - Action not in schema -> "UNKNOWN".
               - DO NOT CORRECT TYPOS. DO NOT GUESS CLOSEST MATCH.
            5. "DELETE" Handling:
               - "Delete invoices" -> intent: "GRANT", action: "delete".
               - "Remove access" -> intent: "REVOKE".
            6. SCHEMA EXACT MATCH:
               - Normalize plurals: "invoices" -> "invoice".
            
            7. LOGICAL COMPOSITION:
               - "Invoices and Reports" -> resource: ["invoice", "report"].
               - "Read and Delete" -> action: ["read", "delete"].

            Return ONLY JSON.
        `;

        const modelId = process.env.LLM_MODEL_ID || "claude-3-haiku-20240307";

        const msg = await anthropic.messages.create({
            model: modelId,
            max_tokens: 1024,
            temperature: 0,
            messages: [{ role: "user", content: prompt }]
        });

        try {
            const jsonStr = msg.content[0].text.match(/\{[\s\S]*\}/)[0];
            const result = JSON.parse(jsonStr);

            // POST-AI VALIDATION (Strict Schema Check)
            
            // Safety Net: If AI omits keys (despite prompt), we must not allow stale draft values to persist 
            if (result.role && result.resource && result.action === undefined) {
                result.action = null; 
            }
            // Ensure comprehensive resets (Anti-Sticky)
            if (result.role && result.action && result.resource === undefined) result.resource = null;
            if (result.action && result.resource && result.role === undefined) result.role = null;

            // Fix: Propagate UNKNOWN to overwrite sticky draft
            if (result.role) {
                if (!schema.roles.includes(result.role) && result.role !== 'UNKNOWN') result.role = 'UNKNOWN'; 
            }
            if (result.resource) {
                if (Array.isArray(result.resource)) {
                    const hasInvalid = result.resource.some(r => !schema.resources.some(sr => sr.type === r));
                    if (hasInvalid) result.resource = 'UNKNOWN';
                } else {
                    if (!schema.resources.some(r => r.type === result.resource) && result.resource !== 'UNKNOWN') result.resource = 'UNKNOWN';
                }
            }
            
            // Actions check
            if (result.action) {
                 const allActions = schema.resources.flatMap(r => r.actions);
                 if (Array.isArray(result.action)) {
                     const hasInvalid = result.action.some(a => !allActions.includes(a));
                     if (hasInvalid) result.action = 'UNKNOWN';
                 } else {
                     if (!allActions.includes(result.action) && result.action !== 'UNKNOWN') result.action = 'UNKNOWN';
                 }
            }
            
            return result;
        } catch (e) {
            console.error("Failed to parse AI response:", msg.content[0].text);
            return {};
        }
    },

    extractWithRegex(text, schema) {
        const lower = text.toLowerCase();
        const found = {};
        
        // Dynamic Role Match mechanism
        const rolesFound = [];
        schema.roles.forEach(r => { if (lower.includes(r)) rolesFound.push(r); });
        if (rolesFound.length > 0) found.role = rolesFound.length === 1 ? rolesFound[0] : rolesFound;

        // Multi-Resource Match
        const resourcesFound = [];
        schema.resources.forEach(r => { if (lower.includes(r.type)) resourcesFound.push(r.type); });
        if (resourcesFound.length > 0) found.resource = resourcesFound.length === 1 ? resourcesFound[0] : resourcesFound;
        
        // Naive multi-action regex support
        const actionsFound = [];
        const actions = new Set(schema.resources.flatMap(r => r.actions));
        actions.forEach(a => {
            if (new RegExp(`\\b${a}\\b`).test(lower)) actionsFound.push(a);
        });
        if (actionsFound.length > 0) found.action = actionsFound.length === 1 ? actionsFound[0] : actionsFound;

        // Dynamic Context/Environment Mapping
        if (schema.context) {
             const envCtx = schema.context.find(c => c.name === 'environment');
             if (envCtx && envCtx.values) {
                 envCtx.values.forEach(val => {
                     if (lower.includes(val)) {
                         found.conditions = { environment: val };
                     }
                 });
             }
        }

        // HEURISTIC: Context Clearing for Stale Actions
        if (found.role && found.resource && !found.action) {
            found.action = null;
        }

        // NEGATIVE INTENT DETECTION
        if (NEGATIVES.some(n => lower.includes(n))) {
            found.effect = "DENY";
        } else {
            found.effect = "ALLOW"; 
        }

        return found;
    },
    
    // Extracted Question Generation logic as it is closely related to AI usage
    async generateQuestionAI(missing, draft) {
        if (!anthropic) return this.generateQuestionTemplate(missing, draft);

        const prompt = `
            The user is building an RBAC rule but is missing information.
            Missing fields: ${missing.join(', ')}
            Current Draft: ${JSON.stringify(draft)}
            
            Ask a natural, helpful clarifying question to get the missing information.
            Keep it short.
        `;

        try {
            const msg = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 100,
                messages: [{ role: "user", content: prompt }]
            });
            return msg.content[0].text;
        } catch (e) {
            return this.generateQuestionTemplate(missing, draft);
        }
    },

    generateQuestionTemplate(missing, draft) {
        if (missing.includes('role')) return "Who is this rule for? (e.g., admin, operator)";
        if (missing.includes('resource')) return `What resource does the ${draft.role} need access to?`;
        if (missing.includes('action')) return `What can the ${draft.role} do with ${draft.resource}?`;
        return "Please clarify.";
    }
};
