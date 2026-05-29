const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://www.topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Enter email
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  
  // Click Continue
  await page.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(2000);
  
  // Enter password
  await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
  await page.waitForTimeout(500);
  
  // Click login button
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim() || '',
      type: b.type || '',
      disabled: b.disabled
    }));
  });
  console.log('BUTTONS:', JSON.stringify(btns));
  
  // Find and click the login/submit button
  const loginBtn = page.locator('button[type="submit"]:has-text("Login"), button:has-text("Log In"), button:has-text("Sign In")');
  await loginBtn.first().click();
  await page.waitForTimeout(5000);
  
  console.log('FINAL URL:', page.url());
  const html = await page.content();
  
  if (html.includes('logout') || html.includes('surveys') || html.includes('Account')) {
    console.log('✅ LOGIN SUCCESSFUL!');
  } else {
    // Check for error
    const err = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Page text:', err);
  }
  
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });