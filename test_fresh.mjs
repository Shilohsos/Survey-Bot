import { chromium } from 'playwright';

const TOKEN = '9700395|zXblfvvdl5Ei';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Set the auth cookie (same as scrapeSurveys does)
    await page.context().addCookies([
      { name: 'auth-token', value: TOKEN, domain: '.topsurveys.app', path: '/' },
    ]);

    console.log('[test] navigating...');
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('[test] URL:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'no body');
    console.log('[test] body:', bodyText);
    
    await page.screenshot({ path: '/tmp/ss_test_fresh.png', fullPage: false });
    console.log('[test] screenshot saved');

    // Check test-ids
    const testIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test-id]')).map(el => el.getAttribute('data-test-id')).slice(0, 30);
    });
    console.log('[test] data-test-ids:', testIds);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    try {
      await page.screenshot({ path: '/tmp/ss_err.png', fullPage: false });
    } catch {}
    process.exit(1);
  }
})();