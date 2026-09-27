'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { coverageAPI } from '@/lib/api';
import { summarize, exportCsv, exportPdf } from './report';

// Must match the default in lib/api.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_NAME = 'X-Coverage-Session';
const COOKIE_NAME = 'coverage_session';
const COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;
const COVERAGE_ID_PARAM = 'coverage-id';
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'DELETE'];

const methodColors = {
  GET: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  POST: 'bg-green-500/20 text-green-300 border-green-500/30',
  PUT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  DELETE: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function readSessionCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function saveSessionCookie(sessionId) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/a/coverage; SameSite=Lax`;
}

function permalinkFor(sessionId) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(COVERAGE_ID_PARAM, sessionId);
  return url.toString();
}

// crypto.randomUUID only exists in secure contexts (HTTPS or localhost)
function generateUUID() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// SQLite CURRENT_TIMESTAMP values are UTC with no zone designator
function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return isNaN(d) ? ts : d.toLocaleString();
}

function sortViews(views) {
  return [...views].sort((a, b) =>
    a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
  );
}

function SummaryCard({ label, views, showSucceeded = false }) {
  const { visited, succeeded, pct } = summarize(views);
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{label}</p>
      <p className="text-2xl font-semibold text-white">
        {visited}
        <span className="text-zinc-500 text-base font-normal"> / {views.length}</span>
      </p>
      <div className="mt-3 h-2 bg-dark-lighter rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-purple to-accent-cyan"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-zinc-400 mt-2">{pct}% covered</p>
      {showSucceeded && (
        <p className="text-xs text-zinc-500 mt-1">{succeeded} succeeded at least once</p>
      )}
    </div>
  );
}

function successClass(v) {
  if (v.success_count > 0) return 'text-green-400';
  return v.visited ? 'text-yellow-400 font-semibold' : 'text-zinc-600';
}

function ViewsTable({ title, views, showOutcome = false }) {
  const { visited, neverSucceeded } = summarize(views);
  const columns = [
    'Status', 'Method', 'View', 'Hits',
    ...(showOutcome ? ['Succeeded', 'Failed'] : []),
    'First visited', 'Last visited',
  ];
  return (
    <div className="mb-10">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        {title}
        <span className="text-zinc-500 text-sm font-normal">
          ({visited}/{views.length} visited{showOutcome && `, ${neverSucceeded} never succeeded`})
        </span>
      </h2>
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-border bg-dark-lighter/50">
                {columns.map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {views.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-dark-border/50 last:border-0 hover:bg-dark-lighter/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${v.visited ? 'bg-green-500' : 'bg-red-500'}`}
                      title={v.visited ? 'Visited' : 'Not visited'}
                    />
                    <span className="sr-only">{v.visited ? 'Visited' : 'Not visited'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border font-mono ${methodColors[v.method] || ''}`}>
                      {v.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white text-sm font-mono">{v.path}</td>
                  <td className={`px-4 py-3 text-sm ${v.visited ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    {v.hit_count}
                  </td>
                  {showOutcome && (
                    <>
                      <td
                        className={`px-4 py-3 text-sm ${successClass(v)}`}
                        title={v.visited && v.success_count === 0 ? 'Requested but never succeeded' : undefined}
                      >
                        {v.success_count}
                      </td>
                      <td className={`px-4 py-3 text-sm ${v.failure_count > 0 ? 'text-red-400' : 'text-zinc-600'}`}>
                        {v.failure_count}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                    {formatTimestamp(v.first_visited_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                    {formatTimestamp(v.last_visited_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Step({ number, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-purple/20 text-accent-purple text-xs font-bold flex items-center justify-center">
        {number}
      </span>
      <div className="flex-1 min-w-0 text-sm text-zinc-300 leading-relaxed">{children}</div>
    </li>
  );
}

function HostList({ hosts }) {
  if (!hosts) return 'both the app and the API';
  if (hosts.length === 1) {
    return (
      <>
        <code className="text-cyan-400">{hosts[0]}</code> (app and API)
      </>
    );
  }
  return (
    <>
      both <code className="text-cyan-400">{hosts[0]}</code> (app) and{' '}
      <code className="text-cyan-400">{hosts[1]}</code> (API)
    </>
  );
}

function HowToUse({ headerLine, hasSession, hosts, canCopy, copied, onCopy }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-white mb-4">How to use</h2>
      <ol className="space-y-4">
        <Step number={1}>
          Generate a UUID above, or use your own. It identifies your crawl session.
        </Step>
        <Step number={2}>
          Configure your crawler to send this header on <strong className="text-white">every request</strong>:
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 min-w-0 bg-dark-lighter border border-dark-border rounded-lg px-4 py-2 text-xs text-green-400 font-mono break-all">
              {headerLine}
            </code>
            {canCopy && (
              <Button type="button" variant="secondary" size="sm" disabled={!hasSession} onClick={onCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            )}
          </div>
          <p className="mt-2 text-zinc-400">
            Scope it to <HostList hosts={hosts} />, and make sure it is added to background API
            calls (XHR/fetch), not only to page loads. In Playwright, use{' '}
            <code className="text-cyan-400">extraHTTPHeaders</code>; in ZAP, a Replacer rule of type
            Request Header.
          </p>
        </Step>
        <Step number={3}>Run the crawl.</Step>
        <Step number={4}>Come back here and check coverage with the same UUID.</Step>
      </ol>
      <p className="text-xs text-zinc-500 mt-5 pt-4 border-t border-dark-border/50">
        A view is a method plus a path template: <code>/wines/12</code> and <code>/wines/57</code> both
        count toward <code>GET /wines/:id</code>. An API hit counts as failed when the response
        status is 400 or above (for example a 401 for a missing login); frontend views count as
        succeeded whenever the page loads. Requests without the header are not recorded. Results
        are cleared whenever the application database is reset.
      </p>
    </div>
  );
}

export default function CoveragePage() {
  const [sessionId, setSessionId] = useState('');
  const [inputError, setInputError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [canCopy, setCanCopy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [hosts, setHosts] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadResults = useCallback(async (id, { remember }) => {
    setInputError('');
    setError('');
    setLoading(true);
    try {
      const res = await coverageAPI.getResults(id);
      setResults({ sessionId: res.data.session_id, views: res.data.views });
      if (remember) {
        saveSessionCookie(res.data.session_id);
      }
      window.history.replaceState(null, '', permalinkFor(res.data.session_id));
    } catch (err) {
      setResults(null);
      setError(err.response?.data?.message || 'Could not load coverage results.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get(COVERAGE_ID_PARAM);
    if (shared !== null) {
      setSessionId(shared);
      if (UUID_PATTERN.test(shared)) {
        // A shared link opens someone else's session, so it isn't remembered as this browser's own
        loadResults(shared, { remember: false });
      } else {
        setInputError('This link does not contain a valid session UUID.');
      }
    } else {
      const saved = readSessionCookie();
      if (UUID_PATTERN.test(saved)) {
        setSessionId(saved);
      }
    }
    setCanCopy(Boolean(navigator.clipboard));

    const appOrigin = window.location.origin;
    const apiOrigin = new URL(API_URL, appOrigin).origin;
    setHosts(apiOrigin === appOrigin ? [appOrigin] : [appOrigin, apiOrigin]);
  }, [loadResults]);

  function handleGenerate() {
    const id = generateUUID();
    setSessionId(id);
    saveSessionCookie(id);
    setInputError('');
    setError('');
    setResults(null);
    setCopied(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  function handleShare() {
    const link = permalinkFor(sessionId.trim().toLowerCase());
    if (canCopy) {
      copyText(link, 'link');
    } else {
      window.prompt('Copy this link to share the results:', link);
    }
  }

  async function copyText(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  async function handleExportPdf(report) {
    setExportingPdf(true);
    try {
      await exportPdf(report);
    } catch {
      setError('Could not create the PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const id = sessionId.trim();
    if (!UUID_PATTERN.test(id)) {
      setInputError('Enter a valid UUID, e.g. 3f1c9a2e-8b4d-4c6a-9e7f-1a2b3c4d5e6f.');
      setResults(null);
      return;
    }

    await loadResults(id, { remember: true });
  }

  const frontendViews = results ? sortViews(results.views.filter((v) => v.surface === 'frontend')) : [];
  const apiViews = results ? sortViews(results.views.filter((v) => v.surface === 'api')) : [];
  const nothingVisited = results && !results.views.some((v) => v.visited);
  const report = results && { sessionId: results.sessionId, frontendViews, apiViews };
  const trimmedSession = sessionId.trim();
  const hasSession = UUID_PATTERN.test(trimmedSession);
  const headerLine = `${HEADER_NAME}: ${hasSession ? trimmedSession.toLowerCase() : '<your-uuid>'}`;

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Crawler <span className="gradient-text">Coverage</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Which views of the application a crawl session reached. Enter the session UUID your
            crawler used, or generate a new one to start a session.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-dark-card border border-dark-border rounded-xl p-6 mb-8"
        >
          <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
            <div className="flex-1">
              <Input
                label="Session UUID"
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setInputError('');
                }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                error={inputError}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:pt-7">
              <Button type="submit" loading={loading}>
                Check coverage
              </Button>
              <Button type="button" variant="secondary" onClick={handleGenerate}>
                Generate UUID
              </Button>
              {canCopy && sessionId && (
                <Button type="button" variant="ghost" onClick={() => copyText(trimmedSession, 'uuid')}>
                  {copied === 'uuid' ? 'Copied!' : 'Copy'}
                </Button>
              )}
              <Button type="button" variant="ghost" disabled={!hasSession} onClick={handleShare}>
                {copied === 'link' ? 'Link copied!' : 'Share'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            The UUID is remembered in this browser for 2 hours. Share copies a link that opens this
            session&apos;s results directly.
          </p>
        </form>

        <HowToUse
          headerLine={headerLine}
          hasSession={hasSession}
          hosts={hosts}
          canCopy={canCopy}
          copied={copied === 'header'}
          onCopy={() => copyText(headerLine, 'header')}
        />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-8">
            {error}
          </div>
        )}

        {results && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-zinc-400 text-sm">
                Results for <code className="text-cyan-400">{results.sessionId}</code>
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => exportCsv(report)}>
                  Export CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={exportingPdf}
                  onClick={() => handleExportPdf(report)}
                >
                  Export PDF
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-10">
              <SummaryCard label="All views" views={results.views} showSucceeded />
              <SummaryCard label="Frontend views" views={frontendViews} />
              <SummaryCard label="API endpoints" views={apiViews} showSucceeded />
            </div>

            {nothingVisited && (
              <p className="text-zinc-500 text-sm mb-6">No visits recorded for this UUID yet.</p>
            )}

            <ViewsTable title="Frontend views" views={frontendViews} />
            <ViewsTable title="API endpoints" views={apiViews} showOutcome />
          </>
        )}
      </div>
    </div>
  );
}
