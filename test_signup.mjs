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

    // Step 1: Go to login page
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Step 2: Fill email and continue
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.waitForTimeout(500);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    // Step 3: Now on signup form - fill password
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.waitForTimeout(500);

    // Step 4: Check the terms checkbox
    // Find the checkbox/span inside the policy div
    const termsCheckbox = page.locator('[data-test="auth-signup-policy"] label, [data-test="auth-signup-policy"] span[data-test-id$="bg"]');
    const termsCheckCount = await termsCheckbox.count();
    console.log('terms checkbox elements found:', termsCheckCount);

    // Try clicking the whole policy div
    await page.locator('[data-test="auth-signup-policy"]').click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/tmp/ss_step4_terms_checked.png', fullPage: false });

    // Step 5: Click Continue (signup submit)
    await page.locator('[data-test-id="auth-signup-submit"]').click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: '/tmp/ss_step5_after_submit.png', fullPage: false });

    // Check what happened
    const currentUrl = page.url();
    console.log('URL after submit:', currentUrl);
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || 'no body');
    console.log('Body:', bodyText);

    // Check cookies
    const cookies = await page.context().cookies();
    console.log('\n=== All cookies ===');
    cookies.forEach(c => console.log(`  ${c.name} = ${c.value.substring(0, 40)}... (domain: ${c.domain})`));

    const authCookie = cookies.find(c => c.name === 'auth-token');
    if (authCookie) {
      console.log('\nauth-token found!');
      console.log('decoded value:', decodeURIComponent(authCookie.value).substring(0, 40));
    } else {
      console.log('\nNo auth-token cookie found');
    }

    // Try navigating to dashboard
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const dashText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || 'no body');
    console.log('\nDashboard body:', dashText);
    await page.screenshot({ path: '/tmp/ss_step6_dashboard.png', fullPage: false });

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