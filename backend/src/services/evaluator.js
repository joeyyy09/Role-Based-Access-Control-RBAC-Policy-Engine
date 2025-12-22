
export const Evaluator = {
    /**
     * Evaluates access for a specific request against the policy.
     * Implements "Deny Overrides Allow" logic.
     * 
     * @param {Object} policy - The policy object.
     * @param {Object} query - { role, resource, action, environment }
     * @returns {Object} result - { allowed: boolean, reason: string }
     */
    evaluateAccess(policy, query) {
        const { role, resource, action, environment } = query;
        let matchedRules = policy.rules.filter(r => 
            r.role === role && 
            r.resource === resource && 
            (Array.isArray(r.action) ? r.action.includes(action) : r.action === action)
        );

        if (environment) {
             matchedRules = matchedRules.filter(r => {
                 if (!r.conditions || !r.conditions.environment) return true; // Implicitly all envs
                 // Use exact or array inclusion matching
                 const ruleEnvs = Array.isArray(r.conditions.environment) 
                    ? r.conditions.environment 
                    : [r.conditions.environment];
                 return ruleEnvs.includes(environment);
             });
        }

        if (matchedRules.length === 0) {
            return { allowed: false, reason: "No matching rules found (Implicit Deny)." };
        }

        // 1. Check for Explicit Deny (Overrides everything)
        const denyRule = matchedRules.find(r => r.effect === "DENY");
        if (denyRule) {
            return { allowed: false, reason: "Explicitly denied by policy." };
        }

        // 2. Check for Allow
        const allowRule = matchedRules.find(r => !r.effect || r.effect === "ALLOW"); // Default to ALLOW
        if (allowRule) {
            return { allowed: true, reason: "Authorized by ALLOW rule." };
        }

        return { allowed: false, reason: "No ALLOW rule found." };
    }
};
