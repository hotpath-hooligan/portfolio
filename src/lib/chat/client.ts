/** Streaming client for the Modal chat API. */

const API = import.meta.env.PUBLIC_CHAT_API ?? 'http://localhost:8000';

export interface Source {
  id: string;
  title: string;
  url: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskHandlers {
  onSources?: (sources: Source[]) => void;
  onToken?: (delta: string) => void;
}

export class ChatError extends Error {}

/**
 * Ask a question and stream the answer.
 *
 * Server-sent events over POST, so `EventSource` is not an option — it is
 * GET-only. The framing is small enough to parse inline: events are separated
 * by a blank line, and only `event:` and `data:` are ever sent.
 */
export async function ask(
  query: string,
  history: ChatTurn[],
  model: string,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, history, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new ChatError(`The assistant is unreachable (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      let name = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;

      const payload = JSON.parse(data);
      if (name === 'sources') handlers.onSources?.(payload.sources ?? []);
      else if (name === 'token') {
        answer += payload.text;
        handlers.onToken?.(payload.text);
      } else if (name === 'error') throw new ChatError(payload.message);
    }
  }

  return answer;
}
