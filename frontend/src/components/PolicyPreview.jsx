import React, { useState } from 'react';
import { FileJson, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';

export default function PolicyPreview({ policy, schema, onValidate, onReset }) {
    const [status, setStatus] = useState(null);

    const handleValidate = async () => {
        const res = await onValidate();
        setStatus(res);
    };

    return (
        <div className="h-full bg-slate-900 rounded-lg shadow-xl border border-slate-700 flex flex-col">
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <FileJson className="text-yellow-400" />
                    <h2 className="text-white font-semibold">Live Policy</h2>
                </div>
                <button onClick={onReset} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1">
                    <Trash2 size={14} /> Reset
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-black">
                <pre className="text-xs font-mono text-green-400">
                    {JSON.stringify(policy, null, 2)}
                </pre>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-800 space-y-3">
                {status && (
                    <div className={`p-3 rounded text-xs flex gap-2 ${status.valid ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                        {status.valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        <div>
                            <div className="font-bold">{status.valid ? "VALID" : "INVALID"}</div>
                            {!status.valid && status.errors.map((e, i) => <div key={i}>{e}</div>)}
                            {status.valid && <div>Artifacts generated in /artifacts</div>}
                        </div>
                    </div>
                )}
                <button onClick={handleValidate} className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded font-medium transition">
                    Validate & Save
                </button>
            </div>
        </div>
    );
}
