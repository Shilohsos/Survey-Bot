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
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Screenshot before anything
    await page.screenshot({ path: '/tmp/ss_step1_initial.png', fullPage: false });

    // Fill email
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.screenshot({ path: '/tmp/ss_step2_email_filled.png', fullPage: false });

    // Click continue
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/tmp/ss_step3_after_continue.png', fullPage: false });

    // Check what's on the page now
    const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 3000));
    console.log('=== HTML after continue (first 3000 chars) ===');
    console.log(html);

    // Check for password input
    const passInputCount = await page.locator('input[type="password"]').count();
    console.log('\npassword inputs found:', passInputCount);

    // Check all buttons
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText?.substring(0, 50),
        'data-test': b.getAttribute('data-test'),
        'data-test-id': b.getAttribute('data-test-id'),
        type: b.getAttribute('type'),
      }));
    });
    console.log('\n=== All buttons ===');
    buttons.forEach(b => console.log('  ', JSON.stringify(b)));

    // Check all test-id elements
    const testIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test], [data-test-id]')).map(el => ({
        tag: el.tagName,
        'data-test': el.getAttribute('data-test'),
        'data-test-id': el.getAttribute('data-test-id'),
        text: el.innerText?.substring(0, 60),
      }));
    });
    console.log('\n=== Elements with data-test attributes ===');
    testIds.forEach(t => console.log('  ', JSON.stringify(t)));

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