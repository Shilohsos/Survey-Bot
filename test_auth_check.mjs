import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage({ locale: 'fr-FR' });

    // Full login flow
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.locator('[data-test-id="app-page-email-field-input"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    await page.locator('input[type="password"]').fill(PASSWORD);

    // Check terms if signup form
    const terms = page.locator('[data-test="auth-signup-policy"]');
    if (await terms.count() > 0) await terms.click();

    await page.locator('[data-test="auth-signup-submit"], [data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    console.log('URL after login:', page.url());
    
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    console.log('Body:', bodyText);

    // Check cookies
    const cookies = await page.context().cookies();
    console.log('\n=== Cookies ===');
    cookies.forEach(c => console.log(`  ${c.name} = ${c.value.substring(0, 40)}... (${c.domain})`));

    const authCookie = cookies.find(c => c.name === 'auth-token');
    if (authCookie) {
      const decoded = decodeURIComponent(authCookie.value);
      console.log('\nauth-token (decoded):', decoded.substring(0, 40) + '...');
      
      // Try going to dashboard WITHOUT the auth cookie (by launching a new context)
      console.log('\n--- Testing new context with JUST cookie ---');
      const ctx2 = await browser.newContext();
      await ctx2.addCookies([
        { name: 'auth-token', value: decoded, domain: '.topsurveys.app', path: '/' },
        { name: 'localization', value: 'fr-fr', domain: '.topsurveys.app', path: '/' },
      ]);
      const p2 = await ctx2.newPage();
      await p2.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p2.waitForTimeout(3000);
      const body2 = await p2.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
      console.log('New context body:', body2);
      
      // Now try with URL-encoded value
      console.log('\n--- Testing with URL-ENCODED cookie value ---');
      const ctx3 = await browser.newContext();
      await ctx3.addCookies([
        { name: 'auth-token', value: authCookie.value, domain: '.topsurveys.app', path: '/' },
        { name: 'localization', value: 'fr-fr', domain: '.topsurveys.app', path: '/' },
      ]);
      const p3 = await ctx3.newPage();
      await p3.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p3.waitForTimeout(3000);
      const body3 = await p3.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
      console.log('Encoded cookie body:', body3);
    }

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