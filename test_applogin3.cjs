const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);
  
  console.log('FINAL URL:', page.url());
  const html = await page.content();
  if (html.includes('logout') || html.includes('surveys') || page.url().includes('app')) {
    console.log('✅ LOGIN SUCCESSFUL!');
  } else {
    const txt = await page.evaluate(() => document.body.innerText.substring(0, 400));
    console.log('Page text:', txt);
  }
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });