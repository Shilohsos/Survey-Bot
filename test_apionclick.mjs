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

  var apiCalls = [];

  page.on('response', function(resp) {
    var url = resp.url() || '';
    if (url.indexOf('/api/') >= 0) {
      var callId = apiCalls.length;
      apiCalls.push(null);
      resp.text().then(function(body) {
        apiCalls[callId] = { url: url.substring(0, 120), status: resp.status(), body: body.substring(0, 1000) };
      }).catch(function() {});
    }
  });

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);

  // Clear and start fresh monitoring
  apiCalls = [];

  // Click Sondages tab to trigger survey data loading
  await page.evaluate(function() {
    var nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) nav.click();
  });
  await page.waitForTimeout(5000);

  console.log('API calls from Sondages click:');
  apiCalls.forEach(function(call, i) {
    if (call) {
      console.log('\n[' + i + '] ' + call.status + ' ' + call.url);
      console.log('  Body:', call.body.substring(0, 500));
    }
  });

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });