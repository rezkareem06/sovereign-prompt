import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Shield,
  Terminal,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/chat';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single log block in the security terminal */
function TerminalLine({ label, content, highlight, stepNumber }) {
  const stepColors = {
    1: 'text-cyan-400',
    2: 'text-yellow-400',
    3: 'text-green-400',
    error: 'text-red-400',
  };

  const highlightTokens = (text) => {
    const parts = text.split(/(\[KSA_ID_\d+\]|\[KSA_PHONE_\d+\]|\[KSA_IBAN_\d+\]|\[EMAIL_\d+\]|\[PASSPORT_\d+\]|\[NAME_\d+\])/g);
    return parts.map((part, i) => {
      if (/\[KSA_ID_\d+\]/.test(part))
        return <span key={i} className="bg-yellow-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      if (/\[KSA_PHONE_\d+\]/.test(part))
        return <span key={i} className="bg-blue-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      if (/\[KSA_IBAN_\d+\]/.test(part))
        return <span key={i} className="bg-emerald-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      if (/\[EMAIL_\d+\]/.test(part))
        return <span key={i} className="bg-purple-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      if (/\[PASSPORT_\d+\]/.test(part))
        return <span key={i} className="bg-rose-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      if (/\[NAME_\d+\]/.test(part))
        return <span key={i} className="bg-orange-400 text-gray-900 font-bold px-1.5 py-0.5 rounded text-xs tracking-wide">{part}</span>;
      return <span key={i}>{part}</span>;
    }
    );
  };

  const labelColor = stepColors[stepNumber] || stepColors[1];

  return (
    <div className="mb-5">
      <div className={`flex items-center gap-2 text-xs mb-1.5 ${labelColor}`}>
        <ChevronRight size={11} />
        <span className="uppercase tracking-widest font-semibold">{label}</span>
      </div>
      <div
        className={`text-sm font-mono p-3 rounded-lg border leading-relaxed ${
          highlight
            ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-100'
            : stepNumber === 'error'
            ? 'border-red-500/30 bg-red-500/5 text-red-300'
            : 'border-white/5 bg-black/40 text-gray-300'
        }`}
      >
        {highlight ? highlightTokens(content) : content}
      </div>
    </div>
  );
}

/** A single chat bubble */
function ChatMessage({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
          <Shield size={13} className="text-white" />
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

/** Status badge shown next to the header */
function StatusBadge({ active }) {
  return (
    <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}
      />
      {active ? 'Active' : 'Idle'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "مرحباً! I'm Sovereign Prompt — your privacy-preserving LLM proxy.\n\nTry sending a message that contains a Saudi National ID, for example:\n\n\"Please process the file for employee ID 1000000388 and update their records.\"\n\nWatch the Security Terminal on the right to see how the ID is redacted before it ever leaves your network.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [requestCount, setRequestCount] = useState(0);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setLoading(true);
    setRequestCount((c) => c + 1);

    // Show step 1 immediately (raw prompt received)
    setLogs([{ label: '1. Raw Prompt Received by Proxy', content: prompt, highlight: false, stepNumber: 1 }]);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      const data = await res.json();

      setLogs([
        {
          label: '1. Raw Prompt Received by Proxy',
          content: prompt,
          highlight: false,
          stepNumber: 1,
        },
        {
          label: '2. Redacted Payload Sent to OpenAI ↑',
          content: data.sanitizedPayloadSentToLLM,
          highlight: true,
          stepNumber: 2,
        },
        {
          label: '3. Raw Response Received from OpenAI ↓',
          content: data.sanitizedResponseFromLLM,
          highlight: false,
          stepNumber: 3,
        },
      ]);

      setMessages((prev) => [...prev, { role: 'assistant', content: data.finalResponse }]);
    } catch (err) {
      const msg = err.message || 'Unknown error. Is the backend running on port 3001?';
      setError(msg);
      setLogs((prev) => [
        ...prev,
        { label: 'Pipeline Error', content: msg, highlight: false, stepNumber: 'error' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const redactedCount = logs.filter((l) => l.highlight).length > 0
    ? (logs.find((l) => l.highlight)?.content.match(/\[KSA_ID_\d+\]/g) || []).length
    : 0;

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* ================================================================
          LEFT PANEL — Chat UI
      ================================================================ */}
      <div className="flex flex-col w-1/2 bg-gray-50">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-gray-200 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
            <Shield size={17} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-tight">Sovereign Prompt</h1>
            <p className="text-xs text-gray-400 leading-tight">Privacy-preserving LLM proxy · KSA</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge active={loading} />
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 px-5 py-2 bg-white border-b border-gray-100 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <Lock size={11} />
            PII tokens redacted this session:
            <span className="text-emerald-600 font-semibold ml-0.5">
              {logs.reduce((acc, l) => {
                if (l.highlight) {
                  return acc + (l.content.match(/\[KSA_(?:ID|PHONE|IBAN)_\d+\]|\[EMAIL_\d+\]|\[PASSPORT_\d+\]|\[NAME_\d+\]/g) || []).length;
                }
                return acc;
              }, 0)}
            </span>
          </span>
          <span>Requests: <span className="text-gray-600 font-medium">{requestCount}</span></span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}

          {loading && (
            <div className="flex justify-start mb-4">
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                <Shield size={13} className="text-white" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-emerald-500" />
                <span className="text-xs text-gray-400">Processing securely…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-xs mb-0.5">Connection Error</p>
                <p className="text-xs text-red-500">{error}</p>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-5 py-4 bg-white border-t border-gray-200">
          <div
            className={`flex items-center gap-3 bg-gray-50 border rounded-xl px-4 py-3 transition-all duration-150 ${
              loading ? 'border-gray-200 opacity-60' : 'border-gray-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100'
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: "Process file for employee 1000000388"'
              className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center disabled:opacity-40 hover:bg-emerald-700 active:scale-95 transition-all"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center flex items-center justify-center gap-1">
            <Lock size={10} />
            National IDs are redacted before leaving your network — PDPL compliant
          </p>
        </form>
      </div>

      {/* ================================================================
          RIGHT PANEL — Security Terminal
      ================================================================ */}
      <div className="flex flex-col w-1/2 bg-gray-950 border-l border-gray-800">
        {/* Terminal title bar */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-800 bg-gray-900">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-2 ml-1">
            <Terminal size={13} className="text-green-400" />
            <span className="text-xs text-green-400 font-mono">sovereign-proxy — security-pipeline</span>
          </div>
          {logs.length > 0 && !loading && (
            <div className="ml-auto flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 size={12} />
              <span>Complete</span>
            </div>
          )}
          {loading && (
            <div className="ml-auto flex items-center gap-1 text-xs text-yellow-400">
              <Loader2 size={12} className="animate-spin" />
              <span>Processing</span>
            </div>
          )}
        </div>

        {/* Terminal body */}
        <div className="flex-1 overflow-y-auto p-5 font-mono terminal-scroll">
          {logs.length === 0 ? (
            <div className="text-xs leading-relaxed">
              <p className="text-green-600">$ Sovereign Prompt Security Pipeline</p>
              <p className="text-green-800 mt-1">$ Waiting for incoming request…</p>
              <p className="text-gray-600 mt-4">
                Submit a prompt containing a Saudi National ID to observe the three-stage
                pipeline:
              </p>
              <p className="text-gray-700 mt-3">  1. Raw prompt interception</p>
              <p className="text-gray-700">  2. Luhn-validated ID redaction (tokenisation)</p>
              <p className="text-gray-700">  3. Re-injection after LLM response</p>
              <p className="text-green-700 mt-5 animate-pulse">█</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-600 mb-4 pb-3 border-b border-gray-800 flex items-center justify-between">
                <span>$ Request #{requestCount} — {new Date().toLocaleTimeString()}</span>
                {redactedCount > 0 && (
                  <span className="text-yellow-500">
                    {redactedCount} ID{redactedCount > 1 ? 's' : ''} intercepted
                  </span>
                )}
              </div>

              {logs.map((log, i) => (
                <TerminalLine
                  key={i}
                  label={log.label}
                  content={log.content}
                  highlight={log.highlight}
                  stepNumber={log.stepNumber}
                />
              ))}

              {!loading && logs.length === 3 && (
                <div className="text-xs text-green-700 mt-2 pt-3 border-t border-gray-800">
                  $ Pipeline complete. Data re-injected client-side only. PII never traversed the network in plaintext.
                </div>
              )}
            </>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-900">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[KSA_ID_X]</span>
              <span className="text-gray-500">National ID</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[KSA_PHONE_X]</span>
              <span className="text-gray-500">Phone number</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[KSA_IBAN_X]</span>
              <span className="text-gray-500">IBAN</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-purple-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[EMAIL_X]</span>
              <span className="text-gray-500">Email address</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-rose-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[PASSPORT_X]</span>
              <span className="text-gray-500">Passport number</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-orange-400 text-gray-900 px-1.5 py-0.5 rounded font-bold font-mono shrink-0">[NAME_X]</span>
              <span className="text-gray-500">Full name</span>
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500" /> Received
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> Redacted &amp; sent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> LLM response
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
