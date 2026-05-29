import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
  const page = await context.newPage();

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);

  // CHECK ALL elements with data-test-id containing "survey" on dashboard
  var allSurveyElements = await page.evaluate(function() {
    var r = [];
    document.querySelectorAll('[data-test-id*="survey"]').forEach(function(el) {
      r.push({
        testId: el.getAttribute('data-test-id'),
        visible: el.offsetParent !== null,
        text: (el.textContent || '').trim().substring(0, 80),
        tag: el.tagName,
        class: (el.className || '').substring(0, 40),
      });
    });
    return r;
  });
  console.log('Survey elements on dashboard:', allSurveyElements.length);
  allSurveyElements.forEach(function(el, i) {
    console.log('  ' + i + ': ' + JSON.stringify(el));
  });

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });