/** The model catalog, mirrored from backend/models.py. */

export interface ModelEntry {
  key: string;
  label: string;
  params: string;
  blurb: string;
  /** Shown as "Recommended" in the picker. The cheapest one to serve. */
  recommended?: boolean;
}

export const MODELS: ModelEntry[] = [
  {
    key: 'lfm2-230m',
    label: 'LFM2.5 230M',
    params: '230 million',
    blurb: 'Smallest and quickest. Terse, sticks close to what it is given.',
    recommended: true,
  },
  {
    key: 'lfm2-350m',
    label: 'LFM2.5 350M',
    params: '350 million',
    blurb: 'More fluent than the 230M for barely more latency.',
  },
  {
    key: 'qwen-0.8b',
    label: 'Qwen3.5 0.8B',
    params: '800 million',
    blurb: 'The most capable of the three. Best at following the context.',
  },
];

export const DEFAULT_MODEL = 'lfm2-230m';

export function modelByKey(key: string): ModelEntry | undefined {
  return MODELS.find((m) => m.key === key);
}
