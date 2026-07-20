/// <reference lib="webworker" />
/**
 * Model worker.
 *
 * Everything Transformers.js does — WASM init, tokenization, encoder/decoder
 * passes — happens here. On a mid-range phone a decoder pass is tens of
 * milliseconds and there are dozens per answer; on the main thread that is a
 * frozen page, so the worker boundary is load-bearing, not hygiene.
 *
 * Weights land in the browser Cache API (Transformers.js does this by default),
 * so the 117 MB download happens exactly once per device.
 */
import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
  type Text2TextGenerationPipeline,
} from '@huggingface/transformers';
import { cleanAnswer } from './postprocess.ts';

// No local model server — everything comes from the HF CDN, then cache.
env.allowLocalModels = false;
env.useBrowserCache = true;

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
/**
 * LaMini is flan-t5-small fine-tuned on instructions. Byte-identical ONNX size
 * to the base checkpoint but far better at honouring "use only this context",
 * which is the entire job here. Swap this pair to change models — nothing else
 * in the app names a model.
 */
export const GEN_MODEL = 'Xenova/LaMini-Flan-T5-77M';

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'embed'; id: number; text: string }
  | { type: 'generate'; id: number; prompt: string };

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number; pct: number }
  | { type: 'ready' }
  | { type: 'error'; id?: number; message: string }
  | { type: 'embedding'; id: number; vector: Float32Array }
  | { type: 'token'; id: number; text: string }
  | { type: 'done'; id: number; text: string };

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);

let embedder: FeatureExtractionPipeline | null = null;
let generator: Text2TextGenerationPipeline | null = null;
let loading: Promise<void> | null = null;

/**
 * Aggregate byte-level progress across both models into one number.
 * Transformers.js reports per-file, and a bar that restarts at 0% four times
 * reads as a stall rather than progress.
 */
function makeProgressTracker() {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: any) => {
    if (p.status !== 'progress' || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({
      type: 'progress',
      file: p.file,
      loaded,
      total,
      pct: total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
    });
  };
}

async function load(): Promise<void> {
  loading ??= (async () => {
    const progress_callback = makeProgressTracker();
    // Sequential, not parallel: two concurrent WASM model loads on a phone
    // contend for memory and make the progress bar meaningless.
    embedder = await pipeline('feature-extraction', EMBED_MODEL, {
      dtype: 'q8',
      progress_callback,
    });
    generator = await pipeline('text2text-generation', GEN_MODEL, {
      dtype: 'q8',
      progress_callback,
    });
    post({ type: 'ready' });
  })();
  return loading;
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'load':
        await load();
        break;

      case 'embed': {
        await load();
        const out = await embedder!(msg.text, { pooling: 'mean', normalize: true });
        const vector = Float32Array.from(out.data as Float32Array);
        post({ type: 'embedding', id: msg.id, vector }, [vector.buffer]);
        break;
      }

      case 'generate': {
        await load();
        const out: any = await generator!(msg.prompt, {
          max_new_tokens: 160,
          // Greedy. Sampling on a 77M model trades the one thing it does well
          // — copying faithfully from context — for fluency it cannot sustain.
          do_sample: false,
          repetition_penalty: 1.15,
        });
        const text = (Array.isArray(out) ? out[0]?.generated_text : out?.generated_text) ?? '';
        // Strip the echoed "Answer:" label here so the quality gate on the main
        // thread judges the answer, not the model's prompt mimicry.
        post({ type: 'done', id: msg.id, text: cleanAnswer(String(text)) });
        break;
      }
    }
  } catch (err) {
    // Reset so a failed load (offline, cache eviction) can be retried.
    loading = null;
    post({
      type: 'error',
      id: 'id' in msg ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
