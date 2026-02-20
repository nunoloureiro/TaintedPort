'use client';

import { useState, useEffect } from 'react';

const severityColors = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
};

function parseSeverity(text) {
  const lower = text.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  if (lower.includes('low')) return 'low';
  return null;
}

function parseVulnerabilities(raw) {
  const lines = raw.split('\n');
  const sections = [];
  let currentSection = null;
  let currentVuln = null;
  let summaryTable = [];
  let businessTable = [];
  let notesLines = [];
  let inNotes = false;
  let inSummaryTable = false;
  let inBusinessTable = false;
  let inBusinessSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect NOTES section
    if (line.startsWith('NOTES FOR TESTERS')) {
      inNotes = true;
      if (currentVuln) {
        sections.push(currentVuln);
        currentVuln = null;
      }
      continue;
    }
    if (inNotes) {
      if (line.startsWith('===')) continue;
      notesLines.push(line);
      continue;
    }

    // Detect summary table header
    if (line.startsWith('#  VULNERABILITY') && !inBusinessSection) {
      inSummaryTable = true;
      continue;
    }
    if (line.startsWith('-- ---') && inSummaryTable) continue;
    if (inSummaryTable && line.trim() === '') {
      inSummaryTable = false;
      continue;
    }

    // Detect business logic section
    if (line.startsWith('BUSINESS LOGIC VULNERABILITIES')) {
      inBusinessSection = true;
      continue;
    }
    if (line.startsWith('#  VULNERABILITY') && inBusinessSection) {
      inBusinessTable = true;
      continue;
    }
    if (line.startsWith('-- ---') && inBusinessTable) continue;
    if (inBusinessTable && line.trim() === '') {
      inBusinessTable = false;
      continue;
    }

    // Parse summary table rows
    if (inSummaryTable && line.trim()) {
      const match = line.match(/^(\d+)\s+(.+?)\s{2,}(.+?)\s{2,}(CWE-\d+)\s+(.*)/);
      if (match) {
        summaryTable.push({
          id: match[1],
          name: match[2].trim(),
          location: match[3].trim(),
          cwe: match[4].trim(),
          severity: match[5].trim(),
        });
      }
      continue;
    }

    // Parse business table rows
    if (inBusinessTable && line.trim()) {
      const match = line.match(/^(\d+)\s+(.+?)\s{2,}(.+?)\s{2,}(CWE-\d+)\s+(.*)/);
      if (match) {
        businessTable.push({
          id: match[1],
          name: match[2].trim(),
          location: match[3].trim(),
          cwe: match[4].trim(),
          severity: match[5].trim(),
        });
      }
      continue;
    }

    // Skip decorative lines
    if (line.startsWith('===') || line.startsWith('---')) continue;
    if (line.startsWith('  TaintedPort') || line.startsWith('  Use this')) continue;
    if (line.startsWith('DETAILED DESCRIPTIONS')) continue;

    // Parse detailed vulnerability entries (numbered)
    const vulnMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (vulnMatch) {
      if (currentVuln) {
        sections.push(currentVuln);
      }
      currentVuln = {
        id: vulnMatch[1],
        title: vulnMatch[2].trim(),
        details: [],
      };
      continue;
    }

    // Collect detail lines for current vulnerability
    if (currentVuln && line.startsWith('   ')) {
      currentVuln.details.push(line.trimStart());
    }
  }

  if (currentVuln) {
    sections.push(currentVuln);
  }

  return { summaryTable, businessTable, sections, notesLines };
}

function VulnDetail({ detail }) {
  // Parse key-value pairs from detail lines
  const kvPairs = [];
  let description = [];
  let example = [];
  let inDesc = false;
  let inExample = false;

  for (const line of detail.details) {
    if (line.startsWith('Endpoint:')) {
      kvPairs.push({ key: 'Endpoint', value: line.replace('Endpoint:', '').trim() });
    } else if (line.startsWith('Parameter:')) {
      kvPairs.push({ key: 'Parameter', value: line.replace('Parameter:', '').trim() });
    } else if (line.startsWith('Parameters:')) {
      kvPairs.push({ key: 'Parameters', value: line.replace('Parameters:', '').trim() });
    } else if (line.startsWith('Header:')) {
      kvPairs.push({ key: 'Header', value: line.replace('Header:', '').trim() });
    } else if (line.startsWith('File:')) {
      kvPairs.push({ key: 'File', value: line.replace('File:', '').trim() });
    } else if (line.startsWith('Frontend:')) {
      kvPairs.push({ key: 'Frontend', value: line.replace('Frontend:', '').trim() });
    } else if (line.startsWith('URL:')) {
      kvPairs.push({ key: 'URL', value: line.replace('URL:', '').trim() });
    } else if (line.startsWith('CWE:')) {
      kvPairs.push({ key: 'CWE', value: line.replace('CWE:', '').trim() });
    } else if (line.startsWith('OWASP API:')) {
      kvPairs.push({ key: 'OWASP API', value: line.replace('OWASP API:', '').trim() });
    } else if (line.startsWith('Severity:')) {
      kvPairs.push({ key: 'Severity', value: line.replace('Severity:', '').trim() });
    } else if (line.startsWith('Steps:')) {
      kvPairs.push({ key: 'Steps', value: line.replace('Steps:', '').trim() });
    } else if (line.startsWith('Example:')) {
      inExample = true;
      example.push(line.replace('Example:', '').trim());
    } else if (line.startsWith('Description:')) {
      inDesc = true;
      description.push(line.replace('Description:', '').trim());
    } else if (inExample) {
      example.push(line);
    } else if (inDesc) {
      description.push(line);
    }
  }

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 hover:border-zinc-600 transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent-purple/20 text-accent-purple font-bold text-sm flex items-center justify-center">
          {detail.id}
        </span>
        <h3 className="text-white font-semibold text-lg leading-tight">{detail.title}</h3>
      </div>

      {kvPairs.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {kvPairs.map((kv, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-zinc-500 font-medium min-w-[90px]">{kv.key}:</span>
              <span className="text-zinc-300 font-mono text-xs break-all">{kv.value}</span>
            </div>
          ))}
        </div>
      )}

      {description.length > 0 && (
        <p className="text-zinc-400 text-sm leading-relaxed mb-3">
          {description.join(' ')}
        </p>
      )}

      {example.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Example</span>
          <pre className="mt-1 bg-dark-lighter border border-dark-border rounded-lg px-4 py-2 text-xs text-green-400 font-mono overflow-x-auto">
            {example.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ vuln }) {
  const severity = parseSeverity(vuln.severity);
  return (
    <tr className="border-b border-dark-border/50 hover:bg-dark-lighter/30 transition-colors">
      <td className="px-4 py-3 text-accent-purple font-mono font-bold text-sm">{vuln.id}</td>
      <td className="px-4 py-3 text-white text-sm font-medium">{vuln.name}</td>
      <td className="px-4 py-3 text-zinc-400 text-xs font-mono">{vuln.location}</td>
      <td className="px-4 py-3">
        <a
          href={`https://cwe.mitre.org/data/definitions/${vuln.cwe.replace('CWE-', '')}.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
        >
          {vuln.cwe}
        </a>
      </td>
      <td className="px-4 py-3">
        {severity && (
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${severityColors[severity]}`}>
            {vuln.severity}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function VulnsPage() {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Try fetching from the same origin first (works in Docker), fallback to API host
    const urls = ['/KnownVulnerabilities.txt', '/api/KnownVulnerabilities.txt'];
    
    async function fetchFile() {
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (text && !text.startsWith('<!')) { // Make sure it's not HTML
              setRaw(text);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          // Try next URL
        }
      }
      
      // Fallback: try the API host directly
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        if (apiBase) {
          const res = await fetch(`${apiBase.replace('/api', '')}/KnownVulnerabilities.txt`);
          if (res.ok) {
            const text = await res.text();
            setRaw(text);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}
      
      setError('Could not load vulnerability data.');
      setLoading(false);
    }
    
    fetchFile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-zinc-400">Loading vulnerability data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const { summaryTable, businessTable, sections, notesLines } = parseVulnerabilities(raw);

  // Split sections into standard vulns (1-10) and business logic (11+)
  const standardVulns = sections.filter(s => parseInt(s.id) <= 10);
  const businessVulns = sections.filter(s => parseInt(s.id) >= 11);

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">
            Known <span className="gradient-text">Vulnerabilities</span>
          </h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Use this reference to verify the accuracy of your DAST scan results.
            TaintedPort contains {summaryTable.length + businessTable.length} intentional vulnerabilities.
          </p>
        </div>

        {/* Severity Legend */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {Object.entries(severityColors).map(([level, classes]) => (
            <span key={level} className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize ${classes}`}>
              {level}
            </span>
          ))}
        </div>

        {/* Standard Vulnerabilities Summary Table */}
        {summaryTable.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-red-400">&#9632;</span> Standard Vulnerabilities
            </h2>
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-border bg-dark-lighter/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Vulnerability</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">CWE</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryTable.map(v => <SummaryRow key={v.id} vuln={v} />)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Business Logic Summary Table */}
        {businessTable.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-orange-400">&#9632;</span> Business Logic &amp; API Vulnerabilities
            </h2>
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-border bg-dark-lighter/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Vulnerability</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">CWE</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessTable.map(v => <SummaryRow key={v.id} vuln={v} />)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Descriptions - Standard */}
        {standardVulns.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-red-400">&#9632;</span> Detailed Descriptions
            </h2>
            <div className="grid gap-4">
              {standardVulns.map(v => <VulnDetail key={v.id} detail={v} />)}
            </div>
          </div>
        )}

        {/* Detailed Descriptions - Business Logic */}
        {businessVulns.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-orange-400">&#9632;</span> Business Logic &amp; API Details
            </h2>
            <div className="grid gap-4">
              {businessVulns.map(v => <VulnDetail key={v.id} detail={v} />)}
            </div>
          </div>
        )}

        {/* Notes for Testers */}
        {notesLines.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-400">&#9632;</span> Notes for Testers
            </h2>
            <div className="bg-dark-card border border-cyan-500/20 rounded-xl p-6">
              <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                {notesLines.filter(l => l.trim()).join('\n')}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-zinc-600 text-xs mt-16">
          Source: KnownVulnerabilities.txt
        </div>
      </div>
    </div>
  );
}
