// Test scraper — run this to debug why 0 surveys found
import { chromium } from 'playwright';

const AUTH_TOKEN = '9700127|isrjyQbzRXwZ...'; // latest token from boot

(async () => {
  console.log('[test] launching browser...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.evaluate(() => { (window).__name = () => {}; }).catch(() => {});

    // Set the auth cookie
    await page.context().addCookies([
      { name: 'auth-token', value: AUTH_TOKEN, domain: '.topsurveys.app', path: '/' },
    ]);

    console.log('[test] navigating to dashboard...');
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[test] page loaded, URL:', page.url());
    await page.waitForTimeout(3000);

    // Take a screenshot to see what's there
    await page.screenshot({ path: '/tmp/ss_dash.png', fullPage: false });
    console.log('[test] screenshot saved to /tmp/ss_dash.png');

    // Check page title/content
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'no body');
    console.log('[test] title:', title);
    console.log('[test] body text:', bodyText);

    // Try clicking surveys nav
    const sondagesClicked = await page.evaluate(() => {
      const nav = document.querySelector('[data-test-id="surveys-nav"]');
      if (nav) { nav.click(); return true; }
      return false;
    });
    console.log('[test] sondages clicked:', sondagesClicked);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/tmp/ss_surveys.png', fullPage: false });
    console.log('[test] screenshot saved to /tmp/ss_surveys.png');

    // Try to find survey cards
    const surveys = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[data-test-id^="ps-survey-"]');
      console.log('[test in-page] found', cards.length, 'cards');
      cards.forEach(card => {
        results.push({
          testId: card.getAttribute('data-test-id'),
          text: card.innerText?.substring(0, 200),
        });
      });
      return results;
    });

    console.log('[test] survey cards found:', surveys.length);
    surveys.forEach(s => console.log('  -', s.testId, ':', s.text?.replace(/\n/g, ' | ')));

    // Also dump all data-test-id attributes
    const allTestIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test-id]')).map(el => el.getAttribute('data-test-id')).slice(0, 50);
    });
    console.log('[test] all data-test-id attrs (first 50):', allTestIds);

  } catch (err) {
    console.error('[test] ERROR:', err.message);
    try {
      await page.screenshot({ path: '/tmp/ss_error.png', fullPage: false });
      console.log('[test] error screenshot saved');
    } catch {}
  } finally {
    await browser.close().catch(() => {});
    console.log('[test] done');
    process.exit(0);
  }
})();