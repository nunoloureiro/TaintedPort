'use client';

import { useState, useEffect, useCallback } from 'react';

function formatDate(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function ParamBadge({ k, v }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-purple/20 text-accent-purple text-xs font-mono">
      <span className="text-zinc-500">{k}=</span>{v}
    </span>
  );
}

export default function PiLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLog = useCallback(async () => {
    const urls = ['/api/pi-log-data'];
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    if (apiBase) {
      urls.push(`${apiBase}/pi-log-data`);
    }

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setEntries(data.entries);
            setLoading(false);
            return;
          }
        }
      } catch {
        // try next
      }
    }
    setError('Could not fetch log data.');
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLog, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLog]);

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Prompt Injection <span className="gradient-text">Callback Log</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Requests received at <code className="text-cyan-400">/pi-callback</code> from
            AI agents that processed injected instructions in wine review comments.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={fetchLog}
            className="px-4 py-2 bg-accent-purple/20 text-accent-purple border border-accent-purple/40 rounded-lg text-sm hover:bg-accent-purple/30 transition-colors"
          >
            Refresh
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (10s)
          </label>
          <span className="text-zinc-500 text-sm ml-auto">
            {entries.length} callback{entries.length !== 1 ? 's' : ''} recorded
          </span>
        </div>

        {loading && (
          <div className="text-center py-16">
            <p className="text-zinc-400 animate-pulse">Loading log data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-16 bg-dark-card border border-dark-border rounded-xl">
            <div className="text-4xl mb-3 opacity-50">📡</div>
            <p className="text-zinc-400">No callbacks received yet.</p>
            <p className="text-zinc-600 text-sm mt-1">
              When an AI agent processes the prompt injection payload and calls back, entries will appear here.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <div
                key={i}
                className="bg-dark-card border border-dark-border rounded-xl p-5 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-green-400 text-lg">●</span>
                    <span className="text-white font-mono text-sm">{entry.ip}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-400 text-sm">{formatDate(entry.timestamp)}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                      {entry.method}
                    </span>
                  </div>
                </div>

                {entry.params && Object.keys(entry.params).length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1.5">
                      Query Parameters
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(entry.params).map(([k, v]) => (
                        <ParamBadge key={k} k={k} v={String(v)} />
                      ))}
                    </div>
                  </div>
                )}

                {entry.body && (
                  <div className="mb-3">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1.5">
                      Request Body
                    </span>
                    <pre className="bg-dark-lighter border border-dark-border rounded-lg px-4 py-2 text-xs text-green-400 font-mono overflow-x-auto">
                      {typeof entry.body === 'object' ? JSON.stringify(entry.body, null, 2) : entry.body}
                    </pre>
                  </div>
                )}

                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1">
                    User-Agent
                  </span>
                  <p className="text-zinc-400 text-xs font-mono break-all">{entry.user_agent}</p>
                </div>

                {entry.referer && (
                  <div className="mt-2">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1">
                      Referer
                    </span>
                    <p className="text-zinc-400 text-xs font-mono break-all">{entry.referer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
