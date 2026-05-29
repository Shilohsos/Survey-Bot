const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  await page.goto('https://topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('URL:', page.url());
  const html = await page.content();
  console.log('HTML first 1500 chars:', html.substring(0, 1500));
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(e => ({
      type: e.type || '',
      name: e.name || '',
      placeholder: e.placeholder || '',
      id: e.id || ''
    }));
  });
  console.log('INPUTS:', JSON.stringify(inputs));
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });