const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  // Bot's login URL
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('1. URL:', page.url());
  
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  
  console.log('2. URL:', page.url());
  
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(e => ({
      type: e.type || '',
      placeholder: e.placeholder || '',
      id: e.id || ''
    }));
  });
  console.log('3. INPUTS:', JSON.stringify(inputs));
  
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim()?.substring(0,30) || '',
      'data-test-id': b.getAttribute('data-test-id') || '',
      'data-test': b.getAttribute('data-test') || ''
    }));
  });
  console.log('4. LOGIN BUTTONS:', JSON.stringify(buttons, null, 2));
  
  if (inputs.some(i => i.type === 'password')) {
    await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
    const loginBtn = page.locator('[data-test-id="app-page-sign-in-button"]');
    console.log('5. Login btn count:', await loginBtn.count());
    await loginBtn.first().click();
    await page.waitForTimeout(5000);
    console.log('6. FINAL URL:', page.url());
    const html = await page.content();
    if (html.includes('logout') || html.includes('surveys')) {
      console.log('✅ LOGIN SUCCESSFUL!');
    } else {
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 400));
      console.log('Page text:', txt);
    }
  }
  
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });