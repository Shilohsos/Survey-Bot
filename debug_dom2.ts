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
  const bridge = await startBridge();
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Use the SAME login flow as the main bot
    console.log('Logging in via /app-login...');
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Fill email
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);

    // Fill password
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    // Check if login succeeded
    const currentUrl = page.url();
    console.log('URL after login:', currentUrl);

    // Save all state like the bot does
    const cookies = await page.context().cookies();
    console.log(`Cookies saved: ${cookies.length}`);
    cookies.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0,20)}...`));

    const ls = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) items[key] = localStorage.getItem(key) || '';
      }
      return items;
    });
    console.log(`localStorage keys: ${Object.keys(ls).length}`);

    const ss = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) items[key] = sessionStorage.getItem(key) || '';
      }
      return items;
    });
    console.log(`sessionStorage keys: ${Object.keys(ss).length}`);

    // Navigate to dashboard
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    console.log('\nURL now:', page.url());

    // Dismiss onboarding
    const onboardBtn = page.locator('button:has-text("Commence"), button:has-text("Poursuivre")');
    if (await onboardBtn.count() > 0) {
      console.log('Dismissing onboarding...');
      await onboardBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Find and click Surveys tab
    const navClick = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-test-id]');
      for (const el of items) {
        const text = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (text.includes('sondage') || text.includes('survey')) {
          (el as HTMLElement).click();
          return el.getAttribute('data-test-id') || text.substring(0, 50);
        }
      }
      return null;
    });
    console.log('Clicked nav:', navClick);
    await page.waitForTimeout(3000);

    // DUMP ALL data-test-id attributes on the page
    const allTestIds = await page.evaluate(() => {
      const all = document.querySelectorAll('[data-test-id]');
      return Array.from(all).map(el => ({
        testId: el.getAttribute('data-test-id'),
        tag: el.tagName,
        text: ((el as HTMLElement).innerText || '').substring(0, 100),
        rect: `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`,
      }));
    });
    console.log('\n=== ALL data-test-id attributes ===');
    allTestIds.forEach((e, i) => console.log(`[${i}] <${e.tag}> data-test-id="${e.testId}" text="${e.text}" size=${e.rect}`));

    // Also dump all divs that might be survey cards
    const cardCandidates = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      return Array.from(divs)
        .filter(d => {
          const r = d.getBoundingClientRect();
          return r.width > 200 && r.height > 80 && (d as HTMLElement).innerText?.trim().length > 10;
        })
        .slice(0, 50)
        .map(d => ({
          testId: d.getAttribute('data-test-id') || 'none',
          cls: (d.className || '').substring(0, 100),
          text: ((d as HTMLElement).innerText || '').substring(0, 150),
          rect: `${d.getBoundingClientRect().width}x${d.getBoundingClientRect().height}`,
        }));
    });
    console.log('\n=== Large visible divs (potential survey cards) ===');
    cardCandidates.forEach((e, i) => console.log(`[${i}] test-id="${e.testId}" class="${e.cls}" text="${e.text}" size=${e.rect}`));

    // Try the actual scraper selector
    const psSurveys = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-test-id^="ps-survey-"]');
      return Array.from(cards).map(c => ({
        testId: c.getAttribute('data-test-id'),
        text: ((c as HTMLElement).innerText || '').substring(0, 150),
      }));
    });
    console.log(`\n=== [data-test-id^="ps-survey-"] found: ${psSurveys.length} ===`);
    psSurveys.forEach((e, i) => console.log(`[${i}] "${e.testId}" -> "${e.text}"`));

    await page.screenshot({ path: '/tmp/debug_dom2.png', fullPage: true });

  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
  }

  await browser.close().catch(() => {});
  bridge.kill();
  process.exit(0);
}

main();