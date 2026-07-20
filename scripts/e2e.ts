/**
 * End-to-end smoke test against a running `astro preview`.
 *
 * Verifies the two tiers separately, because they fail independently: Tier 1
 * (search, ~26 KB) must work for everyone, and Tier 2 (on-device generation,
 * ~140 MB) must work and then keep working with the network cut off.
 *
 *   npm run preview &   # http://localhost:4321
 *   npx tsx scripts/e2e.ts [--tier1-only]
 */
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.E2E_BASE ?? 'http://localhost:4321';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const SHOTS = 'scratch/e2e';
const tier1Only = process.argv.includes('--tier1-only');

const log = (msg: string) => console.log(`  ${msg}`);

async function shot(page: Page, name: string) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` as `${string}.png` });
}

/** Wait until the assistant has replaced its pending bubble with real text. */
async function waitForAnswer(page: Page, timeout: number): Promise<string> {
  await page.waitForFunction(
    () => {
      const bubbles = document.querySelectorAll('[data-role="assistant"]');
      const last = bubbles[bubbles.length - 1];
      return !!last && !last.querySelector('[aria-label="Thinking"]') && !!last.textContent?.trim();
    },
    { timeout, polling: 200 },
  );
  return page.$$eval('[data-role="assistant"]', (els) => els[els.length - 1]!.textContent ?? '');
}

async function ask(page: Page, question: string, timeout = 30_000): Promise<string> {
  await page.type('input[aria-label="Your question"]', question);
  await page.click('button[type="submit"]');
  return waitForAnswer(page, timeout);
}

async function openChat(page: Page) {
  await page.waitForSelector('button[aria-label="Ask about Aryan"]', { timeout: 15_000 });
  await page.click('button[aria-label="Ask about Aryan"]');
  await page.waitForSelector('input[aria-label="Your question"]', { timeout: 10_000 });
}

async function main() {
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  // A persistent context would let the Cache API survive, but a fresh profile
  // is the more honest test: it is what a first-time visitor actually gets.
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  let failed = false;
  const check = (ok: boolean, label: string, detail = '') => {
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed = true;
  };

  try {
    console.log('\nTier 1 — static site + search, no model download');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30_000 });

    const heading = await page.$eval('h1', (el) => el.textContent?.trim());
    check(heading === 'Aryan Kapoor', 'homepage renders', heading);

    // Anchors emitted by the page must match the deep links in the index, or
    // every chat citation is a dead link.
    const chunks = await fetch(`${BASE}/search/chunks.json`).then((r) => r.json());
    const anchors: string[] = await page.$$eval('[id]', (els) => els.map((e) => e.id));
    const dead = (chunks as any[])
      .map((c) => c.url as string)
      .filter((u) => u.startsWith('/#'))
      .map((u) => u.slice(2))
      .filter((a) => !anchors.includes(a));
    check(dead.length === 0, 'every citation anchor exists on the page', dead.join(', '));

    await shot(page, '01-home');

    await openChat(page);
    const t1 = await ask(page, 'what does he use for authorization?');
    check(/OPA|Open Policy Agent|RBAC/i.test(t1), 'Tier 1 answers from retrieval', t1.slice(0, 90));

    const sources = await page.$$eval('a[data-source]', (els) => els.map((e) => e.textContent));
    check(sources.length > 0, 'answer cites sources', sources.join(' | '));

    const ungrounded = await ask(page, 'what is his favourite pizza topping?');
    check(/don't have|do not have/i.test(ungrounded), 'refuses ungrounded questions', ungrounded.slice(0, 90));

    await shot(page, '02-tier1-chat');

    if (tier1Only) {
      check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
      return;
    }

    console.log('\nTier 2 — on-device model (~140 MB, this takes a while)');
    await page.click('button ::-p-text(Enable AI)');
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Enable AI'),
      { timeout: 900_000, polling: 1000 },
    );
    const loadFailed = await page.$eval('body', (b) => b.textContent?.includes("Couldn't load"));
    check(!loadFailed, 'models downloaded and initialised');
    await shot(page, '03-model-loaded');

    const t2 = await ask(page, 'what does he use for authorization?', 180_000);
    check(t2.length > 0, 'Tier 2 generates an answer', t2.slice(0, 120));
    check(
      /OPA|policy|RBAC|permission/i.test(t2),
      'generated answer is grounded in retrieved context',
      t2.slice(0, 120),
    );
    await shot(page, '04-tier2-answer');

    console.log('\nOffline — the whole point');
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    const offlineHeading = await page.$eval('h1', (el) => el.textContent?.trim()).catch(() => null);
    check(offlineHeading === 'Aryan Kapoor', 'site loads offline', String(offlineHeading));

    await openChat(page).catch(() => {});
    const t3 = await ask(page, 'tell me about Remote Connect', 180_000).catch((e) => `ERROR: ${e}`);
    check(/guacamole|remote|ssh|session/i.test(t3), 'chat answers with no network', t3.slice(0, 120));
    await shot(page, '05-offline');

    check(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    console.log(`\nScreenshots in ${SHOTS}/`);
    process.exit(failed ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
