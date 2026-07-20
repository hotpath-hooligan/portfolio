/**
 * Anchor slugs. Shared by the page renderers and `scripts/build-index.ts` —
 * the indexer writes deep links like `/#remote-connect` and the page must emit
 * exactly that id, or every chat citation becomes a link to nowhere.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
