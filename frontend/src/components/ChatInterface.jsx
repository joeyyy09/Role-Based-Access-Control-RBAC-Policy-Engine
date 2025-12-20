import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';

export default function ChatInterface({ history, onSend }) {
    const [input, setInput] = useState("");
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if(!input.trim()) return;
        onSend(input);
        setInput("");
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 rounded-lg shadow-xl overflow-hidden border border-slate-700">
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center gap-2">
                <Bot className="text-blue-400" />
                <h2 className="text-white font-semibold">Policy Agent</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                            msg.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : 'bg-slate-700 text-slate-200 rounded-bl-none'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 bg-slate-800 border-t border-slate-700 flex gap-2">
                <input 
                    className="flex-1 bg-slate-900 text-white border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 'Admins can delete invoices in prod'"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded transition">
                    <Send size={20} />
                </button>
            </form>
        </div>
    );
}
