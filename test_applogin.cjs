const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  // Use bot's exact login URL
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('1. URL:', page.url());
  
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim() || '',
      'data-test-id': b.getAttribute('data-test-id') || ''
    }));
  });
  console.log('2. BUTTONS:', JSON.stringify(buttons, null, 2));
  
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(e => ({
      type: e.type || '',
      placeholder: e.placeholder || ''
    }));
  });
  console.log('3. INPUTS:', JSON.stringify(inputs));
  
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });