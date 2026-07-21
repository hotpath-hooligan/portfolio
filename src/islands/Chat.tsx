import { useCallback, useEffect, useRef, useState } from 'react';
import { ask, ChatError, type ChatTurn, type Source } from '../lib/chat/client.ts';
import { DEFAULT_MODEL, MODELS, modelByKey } from '../lib/chat/models.ts';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  streaming?: boolean;
}

const SUGGESTIONS = [
  'How did Aryan scale remote diagnostics to millions of runs?',
  'How did Aryan build browser-based remote access behind NAT?',
  'How did Aryan replace shared database reads with Kafka and Redis?',
  'How has Aryan used LLMs for network troubleshooting?',
];

const COLLAPSE_KEY = 'chat-rail-collapsed';
const MODEL_KEY = 'chat-model';

export default function Chat() {
  const [collapsed, setCollapsed] = useState(false);
  const open = !collapsed;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [picking, setPicking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Prompt-visible history, kept separately from the rendered messages. */
  const historyRef = useRef<ChatTurn[]>([]);

  // Read after mount rather than in the initial state: the server has no
  // localStorage, and a different first render would be a hydration mismatch.
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    const remembered = localStorage.getItem(MODEL_KEY);
    if (remembered && modelByKey(remembered)) setModel(remembered);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    document.documentElement.dataset.chatRail = collapsed ? 'collapsed' : 'open';
  }, [collapsed]);

  const setCollapsedPersisted = useCallback((next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  }, []);

  const pickModel = useCallback((key: string) => {
    setModel(key);
    localStorage.setItem(MODEL_KEY, key);
    setPicking(false);
  }, []);

  /**
   * Start over. The model is fixed for the life of a conversation — the history
   * a small model was given is the history it keeps answering from — so a new
   * chat is also the only moment the picker reopens.
   */
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    historyRef.current = [];
    setMessages([]);
    setInput('');
    setPicking(false);
  }, []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput('');
      setBusy(true);
      setMessages((m) => [
        ...m,
        { role: 'user', text: q },
        { role: 'assistant', text: '', streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const text = await ask(
          q,
          historyRef.current,
          model,
          {
            onSources: (sources) =>
              setMessages((m) => {
                const last = m.at(-1);
                if (!last?.streaming) return m;
                return [...m.slice(0, -1), { ...last, sources }];
              }),
            onToken: (delta) =>
              setMessages((m) => {
                const last = m.at(-1);
                if (!last?.streaming) return m;
                return [...m.slice(0, -1), { ...last, text: last.text + delta }];
              }),
          },
          controller.signal,
        );

        historyRef.current = [
          ...historyRef.current,
          { role: 'user', content: q },
          { role: 'assistant', content: text },
        ];
        setMessages((m) => {
          const last = m.at(-1);
          if (!last?.streaming) return m;
          return [...m.slice(0, -1), { ...last, text, streaming: false }];
        });
      } catch (e) {
        // An aborted request keeps whatever it streamed; anything else replaces
        // the empty bubble with the reason it is empty.
        const aborted = e instanceof DOMException && e.name === 'AbortError';
        setMessages((m) => {
          const last = m.at(-1);
          if (!last?.streaming) return m;
          const text = aborted
            ? last.text
            : e instanceof ChatError
              ? e.message
              : 'Something went wrong reaching the assistant.';
          return [...m.slice(0, -1), { ...last, text, streaming: false }];
        });
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, model],
  );

  const active = modelByKey(model);
  const started = messages.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setCollapsedPersisted(false)}
        aria-expanded={open}
        aria-controls="chat-rail"
        className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-800 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] transition-opacity lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:right-0 lg:-translate-y-1/2 lg:flex-col lg:gap-3 lg:rounded-l-xl lg:border lg:border-r-0 lg:px-2.5 lg:py-6 lg:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
          collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span aria-hidden>◆</span>
        <span className="lg:[writing-mode:vertical-rl]">Ask about Aryan</span>
      </button>

      <aside
        id="chat-rail"
        aria-label="Ask about Aryan"
        aria-hidden={collapsed}
        className={`fixed inset-x-0 bottom-0 z-50 h-[68dvh] transition-transform duration-200 ease-out will-change-transform lg:inset-y-0 lg:right-0 lg:left-auto lg:h-dvh lg:w-[26rem] ${
          collapsed
            ? 'translate-y-full lg:translate-x-full lg:translate-y-0'
            : 'translate-y-0 lg:translate-x-0'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl lg:rounded-none lg:border-y-0 lg:border-r-0 dark:border-slate-800 dark:bg-slate-900">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 lg:px-5 lg:py-4 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${busy ? 'bg-amber-400' : 'bg-emerald-500'}`}
              />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 lg:text-base dark:text-white">
                  Ask about Aryan
                </h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {active?.label ?? 'Assistant'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {started ? (
                <button
                  type="button"
                  onClick={newChat}
                  aria-label="New chat"
                  title="New chat"
                  data-new-chat
                  className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <span aria-hidden>+</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPicking((p) => !p)}
                  aria-expanded={picking}
                  className="rounded-md px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  Model
                </button>
              )}
              <button
                type="button"
                onClick={() => setCollapsedPersisted(true)}
                aria-label="Collapse chat"
                className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <span aria-hidden className="lg:hidden">
                  ↓
                </span>
                <span aria-hidden className="hidden lg:inline">
                  →
                </span>
              </button>
            </div>
          </header>

          {picking && !started && <ModelPicker active={model} onPick={pickModel} />}

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 lg:px-5">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ask anything about Aryan's experience, projects, or skills. Answers are grounded
                  in the content of this site.
                </p>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => void send(s)}
                      className="cursor-pointer rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-slate-200 p-3 lg:p-4 dark:border-slate-800"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Your question"
              data-chat-input
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
              >
                Ask
              </button>
            )}
          </form>
        </div>
      </aside>
    </>
  );
}

function ModelPicker({ active, onPick }: { active: string; onPick: (key: string) => void }) {
  return (
    <div
      data-role="picker"
      className="space-y-1.5 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
    >
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Pick a model. It stays fixed for this chat — start a new one to switch.
      </p>
      {MODELS.map((m) => (
        <button
          type="button"
          key={m.key}
          data-model={m.key}
          onClick={() => onPick(m.key)}
          className={`w-full rounded-lg border px-3 py-2 text-left transition ${
            m.key === active
              ? 'border-slate-900 dark:border-white'
              : 'border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-900 dark:text-white">{m.label}</span>
            {m.recommended && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                Recommended
              </span>
            )}
          </span>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{m.blurb}</p>
        </button>
      ))}
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
      <div
        data-role="assistant"
        data-streaming={String(!!message.streaming)}
        className="max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800 dark:bg-slate-800 dark:text-slate-100"
      >
        {message.text || (message.streaming ? <Thinking /> : null)}
      </div>
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {message.sources.map((s) => (
            <a
              key={s.id}
              data-source={s.id}
              href={s.url}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition hover:border-slate-400 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400"
            >
              {s.title}
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
