const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://www.topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Enter email
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  // Click Continue
  await page.locator('[data-test-id="check-email-continue-button"]').click();
  await page.waitForTimeout(2000);
  
  // Check what buttons exist on password step
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll('button')]
      .filter(b => b.textContent?.trim())
      .map(b => ({
        text: b.textContent.trim(),
        type: b.type,
        'data-test': b.getAttribute('data-test') || '',
        'data-test-id': b.getAttribute('data-test-id') || ''
      }));
  });
  console.log('VISIBLE BUTTONS:', JSON.stringify(btns, null, 2));
  
  // Enter password
  await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
  await page.waitForTimeout(500);

  // Try different login button selectors
  for (const sel of ['[data-test="auth-signin-submit"]', '[data-test-id="auth-signin-submit"]', 'button[type="submit"]:has-text("Log In")', 'button[type="submit"]:has-text("Login")']) {
    const count = await page.locator(sel).count();
    console.log(`Selector "${sel}": ${count} elements`);
    if (count > 0) {
      console.log('  Text:', await page.locator(sel).first().textContent());
    }
  }

  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });