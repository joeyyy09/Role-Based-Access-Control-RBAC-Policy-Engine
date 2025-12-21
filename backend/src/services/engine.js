import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage.js';
import { MockRegistry } from './mockRegistry.js';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const anthropic = process.env.ANTHROPIC_API_KEY 
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) 
    : null;

export const Engine = {
    /**
     * Core orchestration logic for the RBAC Chatbot.
     * Handles the flow: Input -> Extraction -> Draft Update -> Validation -> Response.
     * 
     * @param {string} userText - The raw message from the user.
     * @returns {Promise<string>} - The natural language response from the system.
     */
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
        
        // 3. Update Draft State: STRICT SANITIZATION
        // Only allow known keys to enter the draft state to prevent AI hallucinations from polluting the context.
        const allowedKeys = ['role', 'action', 'resource', 'conditions', 'type', 'intent'];
        const sanitized = {};
        for (const key of allowedKeys) {
            if (extracted[key] !== undefined) sanitized[key] = extracted[key];
        }
        
        // Anti-Hallucination: If key is null in extraction (explicit reset), we respect it.
        // If key is missing in extraction, we keep previous draft value (merge).
        // BUT for the merge, we must be careful.
        // actually `...session.draft, ...sanitized` handles the merge.
        // If sanitized[key] is null, it overwrites draft (reset). Functional correctness maintained.

        session.draft = { ...session.draft, ...sanitized };
        
        let response = "";

        // 4. Ambiguity Check (Rule vs Question)
        const draft = session.draft;
        
        // SPECIAL HANDLING: If type is QUESTION, answer immediately.
        if (draft.type === "QUESTION") {
            // "What can Admins do?"
            if (draft.role && draft.role !== 'UNKNOWN') {
                const rules = session.policy.rules.filter(r => r.role === draft.role);
                if (rules.length === 0) {
                    response = `[${draft.role}] currently has no permissions.`;
                } else {
                    const summary = rules.map(r => 
                        `- ${r.action} ${r.resource} ${r.conditions.environment ? `(in ${r.conditions.environment})` : ''}`
                    ).join('\n');
                    response = `Current permissions for [${draft.role}]:\n${summary}`;
                }
            } else {
                response = "Please specify which role you are asking about (e.g., 'What can Admins do?')";
            }
            session.draft = {}; // Clear draft after answering
        } else {
            // 5. Validate Draft (Immediate Pushback)
            const errorObj = this.validateDraft(session.draft, schema);
            if (errorObj) {
                response = `I can't allow that. ${errorObj.message}`;
                
                // Reset the invalid parts to prevent sticking
                if (errorObj.field && session.draft[errorObj.field]) {
                    delete session.draft[errorObj.field];
                }
                
                // Fallback cleanup (just in case)
                if (session.draft.action === 'UNKNOWN') delete session.draft.action;
                if (session.draft.role === 'UNKNOWN') delete session.draft.role;
                if (session.draft.resource === 'UNKNOWN') delete session.draft.resource;
            } 
            else { 
                // IT IS A RULE (GRANT/REVOKE)
                const missing = this.findMissingSlots(session.draft);

                if (missing.length === 0) {
                    const intent = draft.intent || "GRANT";
                    const resources = Array.isArray(draft.resource) ? draft.resource : [draft.resource];
                    const finalResponse = [];
                    for (const resType of resources) {
                        const currentDraft = { ...draft, resource: resType };
                        
                        if (intent === "REVOKE") {
                            // HANDLE REVOKE (Granular)
                            let ruleUpdated = false;
                            let ruleRemoved = false;

                            session.policy.rules = session.policy.rules.reduce((acc, r) => {
                                // Check match
                                if (r.role === currentDraft.role && r.resource === currentDraft.resource) {
                                    const ruleActions = Array.isArray(r.action) ? r.action : [r.action];
                                    const revokeActions = Array.isArray(currentDraft.action) ? currentDraft.action : [currentDraft.action];
                                    
                                    // Calculate Remaining Actions
                                    const remainingActions = ruleActions.filter(ra => !revokeActions.includes(ra));

                                    if (remainingActions.length < ruleActions.length) {
                                        // Something was revoked
                                        if (remainingActions.length === 0) {
                                            ruleRemoved = true;
                                            // Don't push to acc -> Delete Rule
                                        } else {
                                            ruleUpdated = true;
                                            // Push updated rule
                                            r.action = remainingActions.length === 1 ? remainingActions[0] : remainingActions;
                                            acc.push(r);
                                        }
                                    } else {
                                        // No actions matched to revoke, keep rule
                                        acc.push(r);
                                    }
                                } else {
                                    // Not the target rule, keep it
                                    acc.push(r);
                                }
                                return acc;
                            }, []);

                            if (ruleUpdated) {
                                finalResponse.push(`✅ Updated access: [${currentDraft.role}] lost [${currentDraft.action}] on [${currentDraft.resource}].`);
                            } else if (ruleRemoved) {
                                finalResponse.push(`✅ Revoked access: [${currentDraft.role}] can no longer [${currentDraft.action}] [${currentDraft.resource}].`);
                            } else {
                                finalResponse.push(`ℹ️ No matching permission found to revoke for [${currentDraft.role}] on [${currentDraft.resource}].`);
                            }

                        } else {
                            // HANDLE GRANT (Upsert/Merge Logic)
                            // 1. Construct Candidate Rule
                            let candidateRule = {
                                role: currentDraft.role,
                                action: currentDraft.action,
                                resource: currentDraft.resource,
                                conditions: currentDraft.conditions || {}
                            };

                            // Fix: Ensure Environment is cleaner
                            // (already fixed in prompt)
                            
                            // 2. DRY RUN VALIDATION (Security Check)
                            const tempId = uuidv4().slice(0, 8);
                            candidateRule.rule_id = tempId;
                            candidateRule.effect = "ALLOW";

                            const tempPolicy = { rules: [...session.policy.rules, candidateRule] };
                            
                            const report = await MockRegistry.validatePolicy(tempPolicy);
                            const ruleError = report.errors.find(e => e.includes(tempId));

                            if (ruleError) {
                                finalResponse.push(`I can't allow that. ${ruleError.split(': ')[1]}`);
                                session.draft = {}; 
                            } else {
                                // COMMIT IT
                                const existingIndex = session.policy.rules.findIndex(r => 
                                    r.role === candidateRule.role && 
                                    r.resource === candidateRule.resource && 
                                    JSON.stringify(r.action) === JSON.stringify(candidateRule.action)
                                );

                                if (existingIndex >= 0) {
                                    // Update Existing Rule
                                    const existing = session.policy.rules[existingIndex];
                                    
                                    // Merge Environments
                                    if (candidateRule.conditions.environment) {
                                        const parseEnvs = (env) => {
                                            if (!env) return [];
                                            return Array.isArray(env) ? env : [env];
                                        };

                                        const currentEnvs = parseEnvs(existing.conditions.environment);
                                        const newEnvs = parseEnvs(candidateRule.conditions.environment);
                                        
                                        const mergedEnvs = [...new Set([...currentEnvs, ...newEnvs])];
                                        existing.conditions.environment = mergedEnvs.length === 1 ? mergedEnvs[0] : mergedEnvs;
                                    }
                                    const envStr = existing.conditions.environment ? `in [${existing.conditions.environment}]` : "";
                                    finalResponse.push(`✅ Rule updated: [${existing.role}] can [${existing.action}] [${existing.resource}] ${envStr}.`);
                                } else {
                                    // Create New Rule
                                    session.policy.rules.push(candidateRule);
                                    const envStr = candidateRule.conditions.environment ? `in [${candidateRule.conditions.environment}]` : "";
                                    finalResponse.push(`✅ Rule added: [${candidateRule.role}] can [${candidateRule.action}] [${candidateRule.resource}] ${envStr}.`);
                                }
                            }
                        }
                    }
                    response = finalResponse.join('\n');
                    session.draft = {}; // Clear draft
                } else {
                    // Question Generation
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
        }

        session.conversation.push({ role: 'system', content: response, timestamp: Date.now() });
        await storage.saveSession();
        return response;
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
            3. Extract entities (role, action, resource, conditions).
            
            CRITICAL RULES:
            1. EXPLICIT NULLS (RESET CONTEXT):
               - You MUST return keys for 'role', 'action', 'resource'.
               - If an entity is NOT explicitly mentioned, set it to \`null\`.
               - do NOT omit keys. do NOT imply values "contextually". 
               - Input: "Admins" -> {"role": "admin", "action": null, "resource": null}.
               - Input: "read" -> {"role": null, "action": "read", "resource": null}.
            2. SUBJECT PRIORITY:
               - If input has a Subject (e.g. "User", "SuperUser") that is NOT in Schema, return "role": "UNKNOWN".
               - "User can read" -> {"role": "UNKNOWN", "action": "read", "resource": null}.
            3. CONDITIONS MAPPING:
               - "in prod" -> {"environment": "prod"}.
               - OUTPUT SCHEMA: Only use keys 'role', 'action', 'resource', 'conditions'.
               - Inside 'conditions', ONLY use 'environment'. DO NOT create 'location'.
            4. UNKNOWN ENTITIES & NO AUTOCORRECTION:
               - Role not in schema -> "UNKNOWN".
               - Action not in schema -> "UNKNOWN".
               - DO NOT CORRECT TYPOS. DO NOT GUESS CLOSEST MATCH.
               - Input: "Admins can eat invoices" -> {"role": "admin", "action": "UNKNOWN", "resource": "invoice"}.
               - Input: "Admins can fly" -> {"role": "admin", "action": "UNKNOWN", "resource": null}.
            5. "DELETE" Handling:
               - "Delete invoices" -> intent: "GRANT", action: "delete".
               - "Remove access" -> intent: "REVOKE".
            6. SCHEMA EXACT MATCH:
               - Normalize plurals: "invoices" -> "invoice".
            
            7. LOGICAL COMPOSITION:
               - "Invoices and Reports" -> resource: ["invoice", "report"].
               - "Read and Delete" -> action: ["read", "delete"].

            Example 1 (Context Clearing):
            Draft: { role: "admin", resource: "invoice" }
            Input: "Viewers"
            Output: {"type": "RULE", "role": "viewer", "action": null, "resource": null}

            Example 2 (Multi-Resource):
            Input: "Admins can read invoices and reports"
            Output: {"type": "RULE", "role": "admin", "action": "read", "resource": ["invoice", "report"]}

            Example 3 (Ambiguous):
            Input: "can?"
            Output: {"type": "QUESTION", "role": null, "action": null, "resource": null}

            Example 4 (Question):
            Input: "What can admins do?"
            Output: {"type": "QUESTION", "role": "admin", "action": null, "resource": null}
            
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
            // if the user provided massive new context (Role + Resource).
            if (result.role && result.resource && result.action === undefined) {
                result.action = null; 
            }
            // Ensure comprehensive resets (Anti-Sticky)
            if (result.role && result.action && result.resource === undefined) result.resource = null;
            if (result.action && result.resource && result.role === undefined) result.role = null;

            // Fix: Propagate UNKNOWN to overwrite sticky draft
            if (result.role) {
                if (!schema.roles.includes(result.role) && result.role !== 'UNKNOWN') result.role = 'UNKNOWN'; // Invalid = UNKNOWN
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
        // If a user specifies BOTH Role and Resource in a new message, they likely intend a new rule.
        // If they forget the action (or assume "read"), we should NOT keep a stale action from a previous unrelated rule (e.g. "delete").
        // "Admins can eat invoices" -> Role=Admin, Resource=Invoice, Action=Undefined (Eat not found).
        // If we don't clear, it keeps 'delete/read' from history.
        // Fix: Explicitly set action to null to force a clarification question.
        if (found.role && found.resource && !found.action) {
            found.action = null;
        }

        return found;
    },

    validateDraft(draft, schema) {
        if (draft.role === 'UNKNOWN') return { message: "Role is unknown or invalid.", field: 'role' };
        if (draft.action === 'UNKNOWN') return { message: "Action is not valid.", field: 'action' };
        if (draft.resource === 'UNKNOWN') return { message: "Resource does not exist.", field: 'resource' };

        // Handle Array Resource (Multi-Resource)
        const resources = Array.isArray(draft.resource) ? draft.resource : [draft.resource];
        
        // Check if ANY resource is invalid (though UNKNOWN check above handles string 'UNKNOWN', array might contain it?)
        // The Prompt returns specific strings or 'UNKNOWN'. If array has 'UNKNOWN', we flag it.
        if (resources.includes('UNKNOWN')) return { message: "One of the resources does not exist.", field: 'resource' };

        // Prevent invalid combinations for EACH resource
        if (draft.resource && draft.action) {
            for (const resType of resources) {
                if (!resType) continue; // skip null
                const res = schema.resources.find(r => r.type === resType);
                if (res) {
                     const actions = Array.isArray(draft.action) ? draft.action : [draft.action];
                     const invalid = actions.find(a => !res.actions.includes(a));
                     if (invalid) {
                         return { 
                             message: `Action '${invalid}' is not supported on '${resType}'.`,
                             field: 'action' 
                         };
                     }
                } else {
                    // Start of validation? If resource not in schema but not UNKNOWN? 
                    // extractWithAI logic forces UNKNOWN if not in schema. So we are good.
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
