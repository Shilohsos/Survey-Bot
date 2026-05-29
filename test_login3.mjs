import { chromium } from 'playwright';

const EMAIL = 'sirfuel365@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Intercept network requests to find the actual API endpoints
    const apiCalls = [];
    page.on('request', request => {
      if (request.url().includes('api')) {
        apiCalls.push({
          url: request.url().substring(0, 200),
          method: request.method(),
          postData: request.postData()?.substring(0, 200),
        });
      }
    });

    // Go to /signin directly
    await page.goto('https://app.topsurveys.app/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Fill email and continue
    await page.locator('[data-test-id="app-page-email-field-input"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    // Now on signin form
    await page.locator('input[type="password"]').fill(PASSWORD);

    // Check terms checkbox if present
    const termsCheck = page.locator('[data-test="auth-signup-policy"]');
    if (await termsCheck.count() > 0) {
      await termsCheck.click();
      await page.waitForTimeout(500);
    }

    // Click login button
    const loginBtn = page.locator('[data-test="auth-signin-submit"]');
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      await page.waitForTimeout(5000);
    }

    console.log('URL:', page.url());
    await page.screenshot({ path: '/tmp/ss_login_result.png', fullPage: false });

    // Check for verify-email resend button and click it
    const resendBtn = page.locator('[data-test="auth-verify-resend-button"]');
    if (await resendBtn.count() > 0) {
      console.log('Found resend button, clicking...');
      await resendBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/ss_after_resend.png', fullPage: false });
    }

    // Print all API calls
    console.log('\n=== API calls made ===');
    apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}\n    POST: ${c.postData || '-'}`));

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