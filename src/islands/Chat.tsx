import { useCallback, useEffect, useRef, useState } from 'react';
import { loadIndex, search, type SearchIndex } from '../lib/search/client.ts';
import type { RankedResult } from '../lib/search/types.ts';
import { ChatEngine, modelsCached, type LoadProgress } from '../lib/chat/engine.ts';
import { buildPrompt, ungroundedReply } from '../lib/chat/prompt.ts';
import { rejectAnswer, cleanAnswer, toSnippet } from '../lib/chat/postprocess.ts';

/**
 * 117 MB of ONNX weights from the HF CDN plus ~24 MB of onnxruntime-web WASM
 * served from this origin. Quoting only the weights would understate the real
 * cost to someone on mobile data, which defeats the point of asking first.
 */
const MODEL_SIZE_LABEL = '~140 MB';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: RankedResult[];
  /** True when prose came from the model rather than from ranked snippets. */
  generated?: boolean;
  pending?: boolean;
}

const SUGGESTIONS = [
  'What does he use for authorization?',
  'Tell me about Remote Connect',
  'What databases has he worked with?',
  'Is he certified in anything?',
];

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<ChatEngine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tier 1: the 26 KB index, fetched as soon as the panel opens.
  useEffect(() => {
    if (!open || index) return;
    loadIndex().then(setIndex).catch((e) => setError(String(e.message ?? e)));
  }, [open, index]);

  // If the weights are already cached from a previous visit, there is nothing
  // to warn about — turn AI on without asking.
  useEffect(() => {
    if (!open) return;
    modelsCached().then((cached) => {
      if (cached) void enableAi();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const enableAi = useCallback(async () => {
    if (engineRef.current) return;
    const engine = new ChatEngine();
    engineRef.current = engine;
    engine.onProgress = setProgress;
    engine.onError = (m) => {
      setError(m);
      setProgress(null);
    };
    try {
      await engine.load();
      setAiEnabled(true);
      setProgress(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      engineRef.current = null;
    }
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput('');
      setBusy(true);
      setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '', pending: true }]);

      try {
        const idx = index ?? (await loadIndex());
        if (!index) setIndex(idx);

        const engine = engineRef.current;
        // Vector retrieval only exists once the embedder is loaded; before that
        // this is a pure BM25 search, which is still a working product.
        const queryVector = engine?.ready ? await engine.embed(q) : null;
        const { results, grounded } = search(idx, q, queryVector);

        let text: string;
        let generated = false;
        if (!grounded) {
          // Refuse at the retrieval layer rather than asking a 77M model to be
          // honest about context it was never given.
          text = ungroundedReply(results);
        } else {
          // The extractive answer is always computed and is always correct —
          // it is quoted source text. Generation is an optional improvement on
          // top, accepted only if it passes the quality gate.
          const snippet = toSnippet(results[0]!.chunk.text);
          text = snippet;
          if (engine?.ready) {
            const raw = await engine.generate(buildPrompt(q, results));
            const rejected = rejectAnswer(raw);
            // Logged, not silent: the gate discarding a good answer and the
            // model never running look identical from the outside, and that
            // ambiguity already hid one bug.
            console.debug(`[chat] generated=${JSON.stringify(raw)} gate=${rejected ?? 'accepted'}`);
            if (!rejected) {
              text = cleanAnswer(raw);
              generated = true;
            }
          } else {
            console.debug('[chat] engine not ready — extractive answer');
          }
        }

        setMessages((m) => [
          ...m.slice(0, -1),
          { role: 'assistant', text, sources: grounded ? results.slice(0, 3) : [], generated },
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m.slice(0, -1),
          { role: 'assistant', text: `Something went wrong: ${e instanceof Error ? e.message : e}` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, index],
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask about Aryan"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        <span aria-hidden>◆</span> Ask about Aryan
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6">
      <div className="flex h-[80vh] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-[560px] sm:w-[420px] sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Ask about Aryan</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {aiEnabled ? 'Running offline on your device' : 'Search mode · no download'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ask anything about Aryan's experience, projects, or skills. Everything runs in your
                browser — no server sees your questions.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
        </div>

        {!aiEnabled && <EnableAiBar progress={progress} error={error} onEnable={enableAi} />}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Your question"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {busy ? '…' : 'Ask'}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-slate-900">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* data-role is a stable hook for scripts/e2e.ts — the class names are
          styling and will churn, but the test must not churn with them. */}
      <div
        data-role="assistant"
        data-generated={String(!!message.generated)}
        className="max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
      >
        {message.pending ? <Thinking /> : message.text}
      </div>
      {/* Sources are the real product: a 77M model's phrasing is only
          trustworthy when you can see what it was given. */}
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {message.sources.map((s) => (
            <a
              key={s.chunk.id}
              data-source={s.chunk.id}
              href={s.chunk.url}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition hover:border-slate-400 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400"
            >
              {s.chunk.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Thinking() {
  return (
    <span className="inline-flex gap-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function EnableAiBar({
  progress,
  error,
  onEnable,
}: {
  progress: LoadProgress | null;
  error: string | null;
  onEnable: () => void;
}) {
  if (error) {
    return (
      <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Couldn't load the model ({error}). Search still works.
        <button onClick={onEnable} className="ml-2 underline">
          Retry
        </button>
      </div>
    );
  }

  if (progress) {
    return (
      <div className="border-t border-slate-200 px-4 py-2 dark:border-slate-700">
        <div className="mb-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Downloading model — first visit only</span>
          <span>{progress.pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-slate-900 transition-[width] dark:bg-white"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 dark:border-slate-700">
      <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
        Answers are ranked excerpts. Enable the on-device model for written replies.
      </p>
      <button
        onClick={onEnable}
        className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-500 dark:border-slate-600 dark:text-slate-200"
      >
        Enable AI · {MODEL_SIZE_LABEL}
      </button>
    </div>
  );
}
