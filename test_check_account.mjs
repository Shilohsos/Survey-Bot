import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage({ locale: 'fr-FR' });

    // Go to email step
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Enter email
    await page.locator('[data-test-id="app-page-email-field-input"]').fill('Ugbekilemelvin@gmail.com');
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    console.log('URL:', page.url());

    // Check what form we're on
    const formTest = await page.evaluate(() => {
      const signin = document.querySelector('[data-test="auth-signin-form"]');
      const signup = document.querySelector('[data-test="auth-signup-form"]');
      const verify = document.querySelector('[data-test="auth-verify-email-component"]');
      return {
        signin: !!signin,
        signup: !!signup,
        verify: !!verify,
        header: document.querySelector('.subpage__header')?.textContent,
      };
    });
    console.log('Form type:', JSON.stringify(formTest));

    // Check for any error or info messages
    const messages = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const lines = bodyText.split('\n').filter(l => l.includes('incorrect') || l.includes('confirm') || l.includes('vérifier') || l.includes('email'));
      return lines.slice(0, 10);
    });
    console.log('Messages:', messages);

    await page.screenshot({ path: '/tmp/ss_ugbekile.png', fullPage: false });
    console.log('Screenshot saved');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    try {
      await page.screenshot({ path: '/tmp/ss_error.png', fullPage: false });
    } catch {}
    process.exit(1);
  }
})();