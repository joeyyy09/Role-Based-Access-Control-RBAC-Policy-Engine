import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import PolicyPreview from './components/PolicyPreview';
import EvaluationPanel from './components/EvaluationPanel';

const API = "http://localhost:4000/api";

export default function App() {
    const [history, setHistory] = useState([]);
    const [policy, setPolicy] = useState({ rules: [] });
    const [schema, setSchema] = useState({});

    useEffect(() => {
        fetch(`${API}/state?t=${Date.now()}`).then(r => r.json()).then(d => {
            setHistory(d.conversation);
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
        setHistory(d.state.conversation);
        setPolicy(d.state.policy);
    };

    const validate = async () => {
        const res = await fetch(`${API}/validate`, { method: 'GET' });
        return await res.json();
    };

    const evaluate = async (query) => {
        const res = await fetch(`${API}/evaluate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query })
        });
        return await res.json();
    };

    const [resetKey, setResetKey] = useState(0);

    const reset = async () => {
        if(!confirm("Clear session?")) return;
        await fetch(`${API}/reset`, { method: 'POST' });
        setHistory([]);
        setPolicy({ rules: [] });
        setResetKey(prev => prev + 1);
    };

    return (
        <div className="h-screen overflow-hidden bg-slate-950 p-6 flex gap-6 font-sans">
            <div className="w-1/3 flex flex-col gap-6">
                <div className="flex-1 overflow-hidden">
                    <PolicyPreview policy={policy} schema={schema} onValidate={validate} onReset={reset} />
                </div>
                <EvaluationPanel key={resetKey} onEvaluate={evaluate} schema={schema} />
            </div>
            <div className="flex-1">
                <ChatInterface history={history} onSend={sendMsg} />
            </div>
        </div>
    );
}
