import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage({ locale: 'fr-FR' });

    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.locator('[data-test-id="app-page-email-field-input"]').fill('Ugbekilemelvin@gmail.com');
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    console.log('URL:', page.url());

    const formType = await page.evaluate(() => {
      const signin = document.querySelector('[data-test="auth-signin-form"]');
      const signup = document.querySelector('[data-test="auth-signup-form"]');
      return { signin: !!signin, signup: !!signup, url: location.href };
    });
    console.log('Form:', JSON.stringify(formType));

    if (formType.signin) {
      // Fill password and submit
      await page.locator('input[type="password"]').fill('SurveyBot2026!');
      await page.locator('[data-test="auth-signin-submit"]').click();
      await page.waitForTimeout(5000);
      
      console.log('After submit URL:', page.url());
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      console.log('Result:', bodyText);
      
      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'auth-token');
      if (authCookie) {
        console.log('✅ Auth token found:', decodeURIComponent(authCookie.value).substring(0, 40) + '...');
      } else {
        console.log('❌ No auth-token cookie');
      }
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