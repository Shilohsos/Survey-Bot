import 'dotenv/config';
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const BRIDGE_PORT = 10801;

async function startBridge() {
  const proc = spawn('ssh', [ '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ExitOnForwardFailure=yes', '-D', `${BRIDGE_PORT}`, '-N', '-q', 'root@ayomide-server.xyz' ], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2000));
  return proc;
}

async function main() {
  const bridge = await startBridge();
  const browser = await chromium.launch({ headless: true, proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` }, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Click surveys nav
    await page.evaluate(() => { const n = document.querySelector('[data-test-id="surveys-nav"]'); if (n) (n as HTMLElement).click(); });
    await page.waitForTimeout(4000);

    // Dump HTML of first 3 survey cards
    const cardHtml = await page.evaluate(() => {
      const cards = document.querySelectorAll('.survey-tile, .list-item.new-survey-tile');
      const results: string[] = [];
      cards.forEach((card, idx) => {
        if (idx >= 3) return;
        results.push(`=== CARD ${idx} ===`);
        results.push(`Tag: ${card.tagName}`);
        results.push(`Classes: ${card.className}`);
        results.push(`data-test-id: ${card.getAttribute('data-test-id') || 'none'}`);
        results.push(`HTML:\n${card.innerHTML.substring(0, 2000)}`);
        results.push(`\n---`);
      });
      results.push(`\nTotal .survey-tile found: ${cards.length}`);
      return results.join('\n');
    });
    console.log(cardHtml);

    // Also try data-test-id approach
    const testIdApproach = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-test-id]');
      const results: string[] = [];
      cards.forEach(card => {
        const id = card.getAttribute('data-test-id') || '';
        const text = (card as HTMLElement).innerText?.substring(0, 100) || '';
        const cls = (card.className || '').substring(0, 80);
        if (text.includes('€') || text.includes('min') || cls.includes('survey')) {
          results.push(`test-id="${id}" class="${cls}" text="${text}"`);
        }
      });
      return results.join('\n');
    });
    console.log('\n=== Data-test-id elements with survey content ===');
    console.log(testIdApproach);

    await page.screenshot({ path: '/tmp/debug_card_structure.png', fullPage: true });
  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
  }
  await browser.close().catch(() => {});
  bridge.kill();
  process.exit(0);
}

main();