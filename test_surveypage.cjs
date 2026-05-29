const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://www.topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="check-email-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('TopSurveyBot2026!');
  await page.locator('[data-test-id="sign-in-submit-button"]').click();
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  
  // Check surveys nav
  const surveyNav = await page.locator('[data-test-id="surveys-nav"]').count();
  console.log('surveys-nav count:', surveyNav);
  
  // Navigate to surveys manually
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Find all survey cards
  const cards = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-test-id]');
    const results = [];
    for (const el of els) {
      const tid = el.getAttribute('data-test-id');
      if (tid && (tid.includes('survey') || tid.includes('card') || tid.includes('item') || tid.includes('tile'))) {
        results.push({
          testId: tid,
          tag: el.tagName,
          text: (el.textContent || '').substring(0, 60),
          rect: el.getBoundingClientRect()
        });
      }
    }
    return results;
  });
  console.log('SURVEY CARDS:', JSON.stringify(cards, null, 2));
  
  // Also dump clickable elements
  const clickables = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button, [role="button"], [onclick]')].map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').substring(0, 40),
      href: el.getAttribute('href') || '',
      'data-test-id': el.getAttribute('data-test-id') || '',
      class: el.className?.substring(0, 60) || ''
    })).slice(0, 30);
  });
  console.log('CLICKABLES:', JSON.stringify(clickables, null, 2));
  
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });