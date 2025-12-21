import React, { useEffect, useState } from 'react';
import ChatInterface from './components/ChatInterface';
import PolicyPreview from './components/PolicyPreview';

const API = "http://localhost:4000/api";

export default function App() {
    const [history, setHistory] = useState([]);
    const [policy, setPolicy] = useState({ rules: [] });
    const [schema, setSchema] = useState({});

    useEffect(() => {
        fetch(`${API}/state?t=${Date.now()}`).then(r => r.json()).then(d => {
            setHistory(d.history);
            setPolicy(d.policy);
            setSchema(d.schema);
        });
    }, []);

    const sendMsg = async (txt) => {
        const res = await fetch(`${API}/chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: txt })
        });
        const d = await res.json();
        setHistory(d.history);
        setPolicy(d.policy);
    };

    const validate = async () => {
        const res = await fetch(`${API}/validate`, { method: 'POST' });
        return await res.json();
    };

    const reset = async () => {
        if(!confirm("Clear session?")) return;
        await fetch(`${API}/reset`, { method: 'POST' });
        setHistory([]);
        setPolicy({ rules: [] });
    };

    return (
        <div className="h-screen overflow-hidden bg-slate-950 p-6 flex gap-6 font-sans">
            <div className="w-1/3">
                <PolicyPreview policy={policy} schema={schema} onValidate={validate} onReset={reset} />
            </div>
            <div className="flex-1">
                <ChatInterface history={history} onSend={sendMsg} />
            </div>
        </div>
    );
}
