import 'dotenv/config';
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const BRIDGE_PORT = 10801;

async function startBridge() {
  const proc = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ExitOnForwardFailure=yes',
    '-D', `${BRIDGE_PORT}`,
    '-N', '-q',
    'root@ayomide-server.xyz',
  ], { stdio: 'pipe' });

  await new Promise(r => setTimeout(r, 2000));
  return proc;
}

async function main() {
  console.log('Starting bridge...');
  const bridge = await startBridge();

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Login first
    console.log('Logging in...');
    await page.goto('https://app.topsurveys.app/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      const passInput = page.locator('input[type="password"]');
      await passInput.fill(PASSWORD);
      const submitBtn = page.locator('button[type="submit"]');
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
      } else {
        // Maybe it's a different login flow
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(5000);
    }

    // Go to surveys page
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Try clicking surveys tab
    const navItems = await page.evaluate(() => {
      const all = document.querySelectorAll('[data-test-id]');
      const results: string[] = [];
      all.forEach(el => {
        results.push(el.getAttribute('data-test-id') || '');
      });
      return results;
    });
    console.log('All data-test-id values on page:');
    navItems.filter(Boolean).forEach(id => console.log('  -', id));

    // Try clicking Surveys nav
    const sondagesClicked = await page.evaluate(() => {
      const navs = document.querySelectorAll('[data-test-id^="surveys"], a, button, li, div');
      for (const el of navs) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('sondage') || text.includes('survey')) {
          (el as HTMLElement).click();
          return text.trim();
        }
      }
      return '';
    });
    console.log('Clicked:', sondagesClicked ? `"${sondagesClicked}"` : 'NOTHING');
    await page.waitForTimeout(5000);

    // Dump the actual survey card structure
    const htmlDump = await page.evaluate(() => {
      // Find all elements that might be survey cards
      const allCards = document.querySelectorAll('[class*="survey"], [class*="card"], [class*="item"], [class*="list"], [data-test-id]');
      const results: any[] = [];
      allCards.forEach(el => {
        const testId = el.getAttribute('data-test-id') || 'none';
        const cls = el.className || '';
        const tag = el.tagName;
        const text = (el as HTMLElement).innerText?.substring(0, 200) || '';
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 50 && text.trim()) {
          results.push({ tag, testId, cls: cls.substring(0, 120), text: text.substring(0, 120), rect: `${rect.width}x${rect.height} at ${rect.left},${rect.top}` });
        }
      });
      return results;
    });

    console.log('\nVisible elements >100x50 with text:');
    htmlDump.forEach((e, i) => {
      console.log(`\n[${i}] <${e.tag}> test-id="${e.testId}"`);
      console.log(`    class="${e.cls}"`);
      console.log(`    size=${e.rect}`);
      console.log(`    text="${e.text}"`);
    });

    // Also dump ALL text on page for reference
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
    console.log('\n=== BODY TEXT (first 3000 chars) ===');
    console.log(bodyText);

    await page.screenshot({ path: '/tmp/debug_final.png', fullPage: true });

  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
  }

  await browser.close().catch(() => {});
  bridge.kill();
  process.exit(0);
}

main();