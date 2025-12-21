const delay = (ms) => new Promise(resolve => setTimeout(resolve, process.env.MOCK_LATENCY_MS ? parseInt(process.env.MOCK_LATENCY_MS) : ms));

/**
 * Mock Database of the External System
 * Acts as the ground truth for Schema Validation.
 */
const DB = {
    roles: ["admin", "operator", "viewer"],
    resources: [
        { type: "invoice", actions: ["read", "create", "delete", "approve"] },
        { type: "report", actions: ["read", "export"] },
        { type: "system_config", actions: ["read", "update"] }
    ],
    context: [
        { name: "environment", type: "string", values: ["prod", "staging"] },
        { name: "ip_region", type: "string" }
    ]
};

export const MockRegistry = {
    async discoverRoles() {
        await delay(50);
        return DB.roles;
    },

    async getResourceSchema() {
        await delay(50);
        return DB.resources;
    },

    async getContextSchema() {
        await delay(50);
        return DB.context;
    },

    // Policy Validator API
    async validatePolicy(policy) {
        await delay(150);
        const errors = [];

        policy.rules.forEach(rule => {
            // 1. Validate Role Existence
            if (!DB.roles.includes(rule.role)) {
                errors.push(`Rule ${rule.rule_id}: Role '${rule.role}' is unknown.`);
            }

            // 2. Validate Resource & Action Compatibility
            const resDef = DB.resources.find(r => r.type === rule.resource);
            if (!resDef) {
                errors.push(`Rule ${rule.rule_id}: Resource '${rule.resource}' does not exist.`);
            } else {
                const actionsToCheck = Array.isArray(rule.action) ? rule.action : [rule.action];
                actionsToCheck.forEach(act => {
                    if (!resDef.actions.includes(act)) {
                        errors.push(`Rule ${rule.rule_id}: Action '${act}' is not allowed on '${rule.resource}'.`);
                    }
                });
            }

            // 3. Business Logic (Example: Viewer cannot write)
            const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
            if (this.checkSecurity(rule.role, actions)) {
                errors.push(`Rule ${rule.rule_id}: ${this.checkSecurity(rule.role, actions)}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            timestamp: new Date().toISOString()
        };
    },

    checkSecurity(role, actions) {
        const actionList = Array.isArray(actions) ? actions : [actions];
        if (role === "viewer" && actionList.some(a => ["create", "delete", "update", "approve"].includes(a))) {
            return "Security Violation - 'viewer' cannot perform write operations.";
        }
        return null;
    }
};
