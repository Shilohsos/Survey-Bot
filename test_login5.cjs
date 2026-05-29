const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://www.topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Step 1: Email
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="check-email-continue-button"]').click();
  await page.waitForTimeout(2000);
  
  // Step 2: Password
  await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
  await page.locator('[data-test-id="sign-in-submit-button"]').click();
  await page.waitForTimeout(5000);
  
  console.log('FINAL URL:', page.url());
  const html = await page.content();
  
  if (html.includes('logout') || html.includes('surveys') || html.includes('Account')) {
    console.log('✅ LOGIN SUCCESSFUL!');
  } else {
    const txt = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Page text:', txt);
  }
  
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });