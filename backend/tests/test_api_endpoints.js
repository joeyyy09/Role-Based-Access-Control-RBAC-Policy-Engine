


const API = "http://localhost:4000/api";

const assert = (condition, msg) => {
    if (!condition) {
        console.error(`❌ FAILED: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ PASSED: ${msg}`);
    }
};

const run = async () => {
    console.log("🚀 Starting API Verification...");

    // 1. Reset
    await fetch(`${API}/reset`, { method: 'POST' });
    console.log("🔄 System Reset");

    // 2. Test Implicit Deny
    let res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'viewer', action: 'delete', resource: 'invoice' } })
    });
    let data = await res.json();
    assert(data.allowed === false, "Implicit Deny should return allowed: false");
    console.log("   Reason: " + data.reason);

    // 3. Create Rule: Admins can read invoices
    await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "Admins can read invoices" })
    });
    console.log("➕ Rule Added: Admins can read invoices");

    // 4. Test Allow
    res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'admin', action: 'read', resource: 'invoice' } })
    });
    data = await res.json();
    assert(data.allowed === true, "Admin should be allowed to read invoices");

    // 5. Test Mismatch (Resource)
    res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'admin', action: 'read', resource: 'report' } })
    });
    data = await res.json();
    assert(data.allowed === false, "Admin should NOT be allowed to read reports (Implicit Deny)");

    // 6. Explicit Deny: Admins cannot delete invoices
    await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "Admins cannot delete invoices" })
    });
    console.log("➕ Rule Added: Admins cannot delete invoices");

    res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'admin', action: 'delete', resource: 'invoice' } })
    });
    data = await res.json();
    assert(data.allowed === false, "Admin should be DENIED delete access");
    assert(data.reason.includes("Explicitly denied"), "Reason should mention explicit denial");

    // 7. Context: Operators can read reports in prod
    await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "Operators can read reports in prod" })
    });
    console.log("➕ Rule Added: Operators can read reports in prod");

    // 7a. Context Match
    res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'operator', action: 'read', resource: 'report', environment: 'prod' } })
    });
    data = await res.json();
    assert(data.allowed === true, "Operator in PROD should be allowed");

    // 7b. Context Mismatch
    res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { role: 'operator', action: 'read', resource: 'report', environment: 'staging' } })
    });
    data = await res.json();
    assert(data.allowed === false, "Operator in STAGING should be denied");

    console.log("🎉 ALL API TESTS PASSED!");
};

run().catch(console.error);
