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
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Screenshot BEFORE click
    await page.screenshot({ path: '/tmp/debug_before_click.png', fullPage: false });

    // Click the surveys nav - try multiple approaches
    console.log('=== Trying to click surveys-nav ===');

    // Approach 1: click the desktop nav (first match)
    const clicked1 = await page.evaluate(() => {
      const nav = document.querySelector('[data-test-id="surveys-nav"]');
      if (nav) {
        (nav as HTMLElement).click();
        return 'querySelector click';
      }
      return 'not found';
    });
    console.log('Approach 1:', clicked1);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/debug_after_click1.png', fullPage: false });

    // Dump all data-test-id to see current state
    const ids = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test-id]')).map(el => ({
        testId: el.getAttribute('data-test-id'),
        tag: el.tagName,
        text: ((el as HTMLElement).innerText || '').substring(0, 80),
      }));
    });
    console.log('\n=== data-test-id attributes ===');
    ids.forEach(e => console.log(`  ${e.testId} (${e.tag}): "${e.text}"`));

    // Dump ALL visible text on the page, organized by area
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('\n=== FULL PAGE TEXT ===');
    console.log(bodyText);

    // Check what the active/selected nav is
    const activeNav = await page.evaluate(() => {
      const all = document.querySelectorAll('[data-test-id$="-nav"]');
      for (const el of all) {
        const cls = el.className || '';
        if (cls.includes('active') || cls.includes('selected') || cls.includes('router-link-active')) {
          return el.getAttribute('data-test-id') + ' class=' + cls.substring(0, 100);
        }
      }
      return 'none found';
    });
    console.log('\nActive nav element:', activeNav);

    // Check URL to determine current route
    console.log('Current URL:', page.url());

    // Check for integration container (where surveys should be)
    const integContainer = await page.evaluate(() => {
      const el = document.querySelector('[data-test-id="ps-integration-container"]');
      if (!el) return null;
      return {
        text: (el as HTMLElement).innerText?.substring(0, 500),
        rect: `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`,
        display: window.getComputedStyle(el).display,
        visibility: window.getComputedStyle(el).visibility,
      };
    });
    console.log('\nIntegration container:', integContainer);

    // Check for ANY survey-related class names
    const surveyClasses = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const results = new Set<string>();
      all.forEach(el => {
        const cls = el.className || '';
        if (typeof cls === 'string' && cls.includes('survey')) {
          results.add(cls.substring(0, 120));
        }
      });
      return Array.from(results);
    });
    console.log('\nClasses containing "survey":', surveyClasses);

    await page.screenshot({ path: '/tmp/debug_dom3.png', fullPage: true });

  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
  }

  await browser.close().catch(() => {});
  bridge.kill();
  process.exit(0);
}

main();