// Check what auth cookies/tokens the real login produces
import { chromium } from 'playwright';

const EMAIL = 'sirfuel365@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  console.log('[test] launching browser...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    console.log('[test] navigating to login...');
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Fill email
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);

    // Fill password
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    // Check all cookies
    const cookies = await page.context().cookies();
    console.log('\n=== All cookies after login ===');
    cookies.forEach(c => console.log(`  ${c.name} = ${c.value.substring(0, 50)}... (domain: ${c.domain})`));

    const authCookie = cookies.find(c => c.name === 'auth-token');
    if (authCookie) {
      console.log(`\nauth-token value (decoded): ${decodeURIComponent(authCookie.value).substring(0, 40)}...`);
    }

    // Check localStorage
    const localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('auth') || key.startsWith('token') || key.startsWith('user')) {
          items[key] = localStorage.getItem(key)?.substring(0, 80);
        }
      }
      return items;
    });
    console.log('\n=== localStorage auth items ===', JSON.stringify(localStorage, null, 2));

    // Check sessionStorage
    const sessionStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key.startsWith('auth') || key.startsWith('token') || key.startsWith('user')) {
          items[key] = sessionStorage.getItem(key)?.substring(0, 80);
        }
      }
      return items;
    });
    console.log('\n=== sessionStorage auth items ===', JSON.stringify(sessionStorage, null, 2));

    // Now navigate to the dashboard and see if we're logged in
    console.log('\n[test] navigating to dashboard...');
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || 'no body');
    console.log('[test] dashboard body:', bodyText);
    await page.screenshot({ path: '/tmp/ss_after_login.png', fullPage: false });
    console.log('[test] screenshot saved to /tmp/ss_after_login.png');

    await browser.close();
    console.log('[test] done');
    process.exit(0);
  } catch (err) {
    console.error('[test] ERROR:', err.message);
    try {
      await page.screenshot({ path: '/tmp/ss_login_error.png', fullPage: false });
    } catch {}
    process.exit(1);
  }
})();