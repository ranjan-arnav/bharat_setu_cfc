'use client';

import { useMemo, useState } from 'react';

type QaCase = {
  id: string;
  title: string;
  message: string;
  lawHints: string[];
  expectedHelplines: string[];
};

type QaResult = {
  id: string;
  pass: boolean;
  failures: string[];
  preview: string;
  durationMs: number;
};

const CASES: QaCase[] = [
  {
    id: 'fir-refusal',
    title: 'FIR Refusal',
    message: 'Police is refusing to file my FIR after phone theft. What should I do?',
    lawHints: ['bnss', '173', 'zero fir'],
    expectedHelplines: ['15100', '1516', '112'],
  },
  {
    id: 'domestic-violence',
    title: 'Domestic Violence',
    message: 'My husband keeps beating me and threatening me. I need legal help urgently.',
    lawHints: ['domestic violence act', 'protection of women'],
    expectedHelplines: ['15100', '181', '112', '1098'],
  },
  {
    id: 'cyber-fraud',
    title: 'Cyber Fraud',
    message: 'I was tricked in a UPI scam and lost money after sharing OTP.',
    lawHints: ['information technology act', 'cybercrime', '1930'],
    expectedHelplines: ['15100', '1930', '112'],
  },
  {
    id: 'cheque-bounce',
    title: 'Cheque Bounce',
    message: 'My cheque bounced due to insufficient funds. What legal action can I take?',
    lawHints: ['negotiable instruments act', '138'],
    expectedHelplines: ['15100', '1516', '112'],
  },
  {
    id: 'tenant-eviction',
    title: 'Tenant Eviction',
    message: 'My landlord is trying to evict me without proper notice.',
    lawHints: ['transfer of property act', 'rent'],
    expectedHelplines: ['15100', '1516', '112'],
  },
  {
    id: 'rera-delay',
    title: 'RERA Delay',
    message: 'Builder is delaying possession of my flat for 2 years. Can I file complaint?',
    lawHints: ['rera', 'real estate'],
    expectedHelplines: ['15100', '1915', '1516', '112'],
  },
  {
    id: 'rti-no-response',
    title: 'RTI No Response',
    message: 'I filed RTI but got no response from department. Next legal step?',
    lawHints: ['right to information act', '30 days'],
    expectedHelplines: ['15100', '1516', '112'],
  },
  {
    id: 'consumer-refund',
    title: 'Consumer Refund',
    message: 'Ecommerce company delivered defective product and denied refund.',
    lawHints: ['consumer protection act'],
    expectedHelplines: ['15100', '1915', '1516', '112'],
  },
];

function normalize(value: string): string {
  return (value || '').toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function hasCoreBlocks(reply: string): boolean {
  const value = normalize(reply);
  const hasLaw = /exact\s*law|सटीक\s*कानून|कानून\s*संदर्भ/.test(value);
  const hasSteps = /step-by-step|चरणबद्ध|कदम-दर-कदम|कदम\s*दर\s*कदम/.test(value);
  const hasDeadline = /deadline|limitation|urgency|समय-सीमा|समय\s*सीमा/.test(value);
  return hasLaw && hasSteps && hasDeadline;
}

function hasHelplines(reply: string, expected: string[]): boolean {
  const value = normalize(reply);
  const allKnown = ['15100', '1516', '181', '1930', '112', '1098', '1915', '108'];
  const expectedSet = new Set(expected);
  const hasExpected = expected.every((needle) => value.includes(needle));
  const hasUnexpected = allKnown
    .filter((number) => !expectedSet.has(number))
    .some((number) => value.includes(number));
  return hasExpected && !hasUnexpected;
}

function hasMapLink(reply: string): boolean {
  return normalize(reply).includes('bing.com/maps');
}

function hasLocalPoliceContact(reply: string): boolean {
  return /local police contact\s*:\s*(\+?\d[\d\s-]{2,})\s*\(/i.test(reply);
}

function hasInAppComplaintAction(reply: string): boolean {
  return /~~vidhi_file_complaint~~|file complaint in app/i.test(reply);
}

export default function LegalQaPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<QaResult[]>([]);
  const [error, setError] = useState<string>('');

  const summary = useMemo(() => {
    const passed = results.filter((item) => item.pass).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
    };
  }, [results]);

  const runOneCase = async (testCase: QaCase): Promise<QaResult> => {
    const started = performance.now();

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: testCase.message,
        userText: testCase.message,
        agentKey: 'vidhi_sahayak',
        clientDetectedAgent: 'vidhi_sahayak',
        language: 'en',
        conversationHistory: [],
        classifyOnly: false,
      }),
    });

    if (!response.ok) {
      return {
        id: testCase.id,
        pass: false,
        failures: [`http_${response.status}`],
        preview: '',
        durationMs: Math.round(performance.now() - started),
      };
    }

    const data = await response.json();
    const reply = String(data.reply || '');
    const replyNorm = normalize(reply);

    const checks = {
      routedToVidhi:
        data.resolvedAgentKey === 'vidhi_sahayak' ||
        String(data.agent?.name || '').toLowerCase().includes('vidhi'),
      coreBlocks: hasCoreBlocks(reply),
      helplines: hasHelplines(reply, testCase.expectedHelplines),
      mapLink: hasMapLink(reply),
      localPolice: hasLocalPoliceContact(reply),
      inAppComplaint: hasInAppComplaintAction(reply),
      lawHint: includesAny(replyNorm, testCase.lawHints),
    };

    const failures = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    return {
      id: testCase.id,
      pass: failures.length === 0,
      failures,
      preview: reply.slice(0, 220).replace(/\s+/g, ' ').trim(),
      durationMs: Math.round(performance.now() - started),
    };
  };

  const runAll = async () => {
    setIsRunning(true);
    setError('');
    setResults([]);

    const nextResults: QaResult[] = [];

    try {
      for (const testCase of CASES) {
        const result = await runOneCase(testCase);
        nextResults.push(result);
        setResults([...nextResults]);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unknown error while running tests');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <main className="min-h-screen overflow-y-auto bg-slate-50 dark:bg-[#0a1628] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Vidhi QA Checklist</h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Run legal regression checks directly on site. This validates structured response blocks, domain-only helplines, local police contact, Bing map link, and in-app complaint action.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={runAll}
              disabled={isRunning}
              className="rounded-xl bg-orange-600 px-4 py-2.5 text-white font-semibold disabled:opacity-60"
            >
              {isRunning ? 'Running...' : 'Run All Legal Checks'}
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Cases: {CASES.length} | Passed: {summary.passed} | Failed: {summary.failed}
            </span>
          </div>
          {!!error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">What should pass</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
            <li>Reply stays on Vidhi routing.</li>
            <li>Contains Exact Law, Step-by-step, and Deadline sections.</li>
            <li>Contains only the domain-relevant legal helplines for that case.</li>
            <li>Contains local police contact number and Bing Maps link.</li>
            <li>Contains in-app complaint action marker/card trigger.</li>
            <li>Contains a domain-appropriate law cue.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Results</h2>
          {summary.total === 0 ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">No test run yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((result) => {
                const testCase = CASES.find((item) => item.id === result.id);
                return (
                  <article
                    key={result.id}
                    className={`rounded-xl border p-4 ${
                      result.pass
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{testCase?.title || result.id}</h3>
                      <span className={`text-xs font-bold ${result.pass ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {result.pass ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{result.durationMs} ms</p>
                    {!result.pass && (
                      <p className="mt-2 text-sm text-red-700 dark:text-red-300">Missing: {result.failures.join(', ')}</p>
                    )}
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{result.preview || 'No preview available.'}</p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
