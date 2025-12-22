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

                {policy.rules.length === 0 ? (
                    <div className="text-gray-500 text-center mt-10 text-sm">No rules defined yet.</div>
                ) : (
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs uppercase bg-slate-800 text-gray-400">
                            <tr>
                                <th className="px-3 py-2">Effect</th>
                                <th className="px-3 py-2">Role</th>
                                <th className="px-3 py-2">Action</th>
                                <th className="px-3 py-2">Resource</th>
                                <th className="px-3 py-2">Conditions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {policy.rules.map((rule, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/50">
                                    <td className="px-3 py-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            rule.effect === 'DENY' 
                                            ? 'bg-red-900/50 text-red-400 border border-red-800' 
                                            : 'bg-green-900/50 text-green-400 border border-green-800'
                                        }`}>
                                            {rule.effect || 'ALLOW'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-medium text-white">{rule.role}</td>
                                    <td className="px-3 py-2">
                                        {Array.isArray(rule.action) ? rule.action.join(', ') : rule.action}
                                    </td>
                                    <td className="px-3 py-2">{rule.resource}</td>
                                    <td className="px-3 py-2 text-gray-500 text-xs">
                                        {rule.conditions && Object.keys(rule.conditions).length > 0 
                                            ? JSON.stringify(rule.conditions) 
                                                .replace(/[{}"]/g, '') 
                                                .replace(/:/g, ': ')
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

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
