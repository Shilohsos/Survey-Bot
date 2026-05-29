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

  // Login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  // Stay on dashboard - check for survey cards HERE (not on /surveys)
  var cards = await page.evaluate(function() {
    var r = [];
    document.querySelectorAll('[data-test-id^="ps-survey-"]').forEach(function(c) {
      var tid = c.getAttribute('data-test-id') || '';
      if (['ps-survey-item-time','ps-survey-rating-wrapper','ps-list-item-reward',
           'ps-reward-without-bonus','ps-reward-amount','ps-reward-currency'].indexOf(tid) >= 0) return;
      r.push({ tid: tid, visible: c.offsetParent !== null, tag: c.tagName, class: (c.className || '').substring(0, 50) });
    });
    return r;
  });
  console.log('Dashboard cards:', cards.length);
  if (cards.length > 0) console.log('First:', JSON.stringify(cards[0]));

  // Try clicking a card on the DASHBOARD (not on /surveys)
  if (cards.length > 0) {
    var locator = page.locator('[data-test-id="' + cards[0].tid + '"]').first();
    try {
      await locator.click({ timeout: 5000 });
      console.log('Click succeeded on dashboard!');
      await page.waitForTimeout(5000);
      console.log('URL:', page.url());
      
      var newPages = context.pages();
      console.log('Pages:', newPages.length);
      newPages.forEach(function(p, i) { console.log('  P' + i + ': ' + p.url()); });
      
      var bodyText = await page.evaluate(function() { return document.body.innerText.substring(0, 300); });
      console.log('Body:', bodyText);
    } catch(e) {
      console.log('Click failed on dashboard:', e.message.substring(0, 80));
    }
  }

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });