import { v4 as uuidv4 } from 'uuid';
import { storage } from '../repositories/storageRepository.js';
import { MockRegistry } from './mockRegistry.js';
import dotenv from 'dotenv';
import { Extractor } from './extractor.js';
import { Evaluator } from './evaluator.js';

dotenv.config();

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

        // 2. Extract Entities (AI or Regex) delegated to Extractor service
        const extracted = await Extractor.extract(userText, schema, session.draft);
        
        // 3. Update Draft State: STRICT SANITIZATION
        const allowedKeys = ['role', 'action', 'resource', 'conditions', 'type', 'intent', 'effect'];
        const sanitized = {};
        for (const key of allowedKeys) {
            if (extracted[key] !== undefined) sanitized[key] = extracted[key];
        }
        
        // Anti-Hallucination: Explicit nulls reset the draft context
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
                                conditions: currentDraft.conditions || {},
                                effect: currentDraft.effect || "ALLOW"
                            };

                            // 2. DRY RUN VALIDATION (Security Check)
                            const tempId = uuidv4().slice(0, 8);
                            candidateRule.rule_id = tempId;
                            if (!candidateRule.effect) candidateRule.effect = "ALLOW";

                            const tempPolicy = { rules: [...session.policy.rules, candidateRule] };
                            
                            const report = await MockRegistry.validatePolicy(tempPolicy);
                            const ruleError = report.errors.find(e => e.includes(tempId));

                            if (ruleError) {
                                finalResponse.push(`I can't allow that. ${ruleError.split(': ')[1]}`);
                                session.draft = {}; 
                            } else {
                                // COMMIT IT
                                const matchIndex = session.policy.rules.findIndex(r => 
                                    r.role === candidateRule.role && 
                                    r.resource === candidateRule.resource && 
                                    JSON.stringify(r.action) === JSON.stringify(candidateRule.action)
                                );

                                if (matchIndex >= 0) {
                                    // Update Existing Rule
                                    const existing = session.policy.rules[matchIndex];
                                    
                                    // Update Effect (Create -> Deny or vice versa)
                                    existing.effect = candidateRule.effect;

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
                                    const effectStr = existing.effect === "DENY" ? "cannot" : "can";
                                    finalResponse.push(`✅ Rule updated: [${existing.role}] ${effectStr} [${existing.action}] [${existing.resource}] ${envStr}.`);
                                } else {
                                    // Create New Rule
                                    session.policy.rules.push(candidateRule);
                                    const envStr = candidateRule.conditions.environment ? `in [${candidateRule.conditions.environment}]` : "";
                                    const effectStr = candidateRule.effect === "DENY" ? "cannot" : "can";
                                    finalResponse.push(`✅ Rule added: [${candidateRule.role}] ${effectStr} [${candidateRule.action}] [${candidateRule.resource}] ${envStr}.`);
                                }
                            }
                        }
                    }
                    response = finalResponse.join('\n');
                    session.draft = {}; // Clear draft
                } else {
                    // Question Generation
                    response = await Extractor.generateQuestionAI(missing, session.draft);
                }
            }
        }

        session.conversation.push({ role: 'system', content: response, timestamp: Date.now() });
        await storage.saveSession();
        return response;
    },

    validateDraft(draft, schema) {
        if (draft.role === 'UNKNOWN') return { message: "Role is unknown or invalid.", field: 'role' };
        if (draft.action === 'UNKNOWN') return { message: "Action is not valid.", field: 'action' };
        if (draft.resource === 'UNKNOWN') return { message: "Resource does not exist.", field: 'resource' };

        // Handle Array Resource (Multi-Resource)
        const resources = Array.isArray(draft.resource) ? draft.resource : [draft.resource];
        
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
                }
            }
        }
        return null;
    },

    findMissingSlots(draft) {
        return ['role', 'resource', 'action'].filter(k => !draft[k]);
    },

    // Delegate evaluation to Evaluator service
    evaluateAccess(policy, query) {
        return Evaluator.evaluateAccess(policy, query);
    }
};
