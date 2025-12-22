import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Search } from 'lucide-react';

export default function EvaluationPanel({ onEvaluate }) {
    const [query, setQuery] = useState({ role: 'admin', action: 'read', resource: 'invoice', environment: 'prod' });
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const checkAccess = async () => {
        setIsLoading(true);
        setResult(null); // Clear previous result
        
        // Artificial delay for better UX (min 500ms)
        const start = Date.now();
        const res = await onEvaluate(query);
        const elapsed = Date.now() - start;
        
        if (elapsed < 500) await new Promise(r => setTimeout(r, 500 - elapsed));
        
        setResult(res);
        setIsLoading(false);
    };

    return (
        <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-700 flex flex-col mt-6">
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center gap-2">
                <Search className="text-blue-400" />
                <h2 className="text-white font-semibold">Access Evaluator</h2>
            </div>
            
            <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase text-gray-500 mb-1">Role</label>
                        <input 
                            value={query.role} 
                            onChange={e => setQuery({...query, role: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-500 mb-1">Resource</label>
                        <input 
                            value={query.resource} 
                            onChange={e => setQuery({...query, resource: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-500 mb-1">Action</label>
                        <input 
                            value={query.action} 
                            onChange={e => setQuery({...query, action: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-500 mb-1">Context (Env)</label>
                        <select 
                            value={query.environment} 
                            onChange={e => setQuery({...query, environment: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                        >
                            <option value="prod">Prod</option>
                            <option value="staging">Staging</option>
                        </select>
                    </div>
                </div>

                <button 
                    onClick={checkAccess} 
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white py-2 rounded font-medium transition flex justify-center items-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                            Checking...
                        </>
                    ) : "Check Access"}
                </button>

                {result && !isLoading && (
                    <div className={`p-4 rounded border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                        result.allowed 
                        ? 'bg-green-900/20 border-green-800 text-green-400' 
                        : 'bg-red-900/20 border-red-800 text-red-400'
                    }`}>
                        {result.allowed ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                        <div>
                            <div className="font-bold text-lg">{result.allowed ? "ALLOWED" : "DENIED"}</div>
                            <div className="text-sm opacity-80">{result.reason}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
