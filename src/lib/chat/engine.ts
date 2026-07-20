import type { WorkerRequest, WorkerResponse } from './worker.ts';

export interface LoadProgress {
  pct: number;
  loaded: number;
  total: number;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

/**
 * Main-thread handle for the model worker. Turns its message protocol into
 * promises, and keeps the worker lazily constructed so a visitor who never
 * enables AI never pays for the module at all.
 */
export class ChatEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyResolvers: Array<() => void> = [];

  ready = false;
  onProgress: ((p: LoadProgress) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress':
          this.onProgress?.({ pct: msg.pct, loaded: msg.loaded, total: msg.total });
          break;
        case 'ready':
          this.ready = true;
          this.readyResolvers.splice(0).forEach((r) => r());
          break;
        case 'embedding':
          this.settle(msg.id, msg.vector);
          break;
        case 'done':
          this.settle(msg.id, msg.text);
          break;
        case 'error': {
          const err = new Error(msg.message);
          if (msg.id !== undefined) this.reject(msg.id, err);
          else {
            // A load failure has no request id; fail every in-flight call so
            // the UI never shows a spinner that can no longer resolve.
            for (const id of [...this.pending.keys()]) this.reject(id, err);
          }
          this.onError?.(msg.message);
          break;
        }
      }
    });
    return this.worker;
  }

  private settle(id: number, value: unknown) {
    this.pending.get(id)?.resolve(value);
    this.pending.delete(id);
  }

  private reject(id: number, err: Error) {
    this.pending.get(id)?.reject(err);
    this.pending.delete(id);
  }

  private send<T>(msg: Omit<WorkerRequest & { id: number }, 'id'> & { id?: number }): Promise<T> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  /** Begin downloading both models. Resolves when they are usable. */
  load(): Promise<void> {
    const worker = this.ensureWorker();
    if (this.ready) return Promise.resolve();
    const p = new Promise<void>((resolve) => this.readyResolvers.push(resolve));
    worker.postMessage({ type: 'load' } satisfies WorkerRequest);
    return p;
  }

  embed(text: string): Promise<Float32Array> {
    return this.send<Float32Array>({ type: 'embed', text } as any);
  }

  generate(prompt: string): Promise<string> {
    return this.send<string>({ type: 'generate', prompt } as any);
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}

/**
 * Whether the models are already in the browser cache, so the UI can skip the
 * "117 MB" warning on a repeat visit and auto-enable instead. Checks for a
 * cached weights file rather than a flag we set ourselves, since the browser
 * can evict the cache without telling us.
 */
export async function modelsCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((r) => r.url.includes('LaMini-Flan-T5-77M') && r.url.endsWith('.onnx'))) {
        return true;
      }
    }
  } catch {
    /* Storage partitioned or unavailable — treat as not cached. */
  }
  return false;
}
