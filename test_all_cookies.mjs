import { chromium } from 'playwright';

// Simulate what scrapeSurveys now does
const COOKIES = [
  { name: 'auth-token', value: '9700812|nP5H4dF6dMDY', domain: '.topsurveys.app', path: '/' },
  { name: 'ps-app', value: 'test', domain: 'app.topsurveys.app', path: '/' },
  { name: 'ps-uuid', value: 'test-uuid', domain: 'app.topsurveys.app', path: '/' },
  { name: 'ps-shash', value: 'test-shash', domain: 'app.topsurveys.app', path: '/' },
  { name: 'localization', value: 'fr-fr', domain: '.topsurveys.app', path: '/' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  
  // Add ALL cookies
  for (const c of COOKIES) {
    await page.context().addCookies([c]);
  }

  await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'no body');
  console.log('Body:', bodyText);

  // Click Sondages
  const sondagesClicked = await page.evaluate(() => {
    const nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) { nav.click(); return true; }
    return false;
  });
  console.log('Sondages clicked:', sondagesClicked);
  await page.waitForTimeout(3000);

  // Check for survey cards
  const cards = await page.evaluate(() => {
    const results = [];
    const allElements = document.querySelectorAll('[data-test-id^="ps-survey-"]');
    allElements.forEach(el => {
      const tid = el.getAttribute('data-test-id') || '';
      if (tid === 'ps-survey-item-time' || tid === 'ps-survey-rating-wrapper' || 
          tid === 'ps-list-item-reward' || tid === 'ps-reward-without-bonus' || 
          tid === 'ps-reward-amount' || tid === 'ps-reward-currency') return;
      results.push({ testId: tid, text: (el.innerText || '').substring(0, 100) });
    });
    return results;
  });
  console.log('Cards found:', cards.length);
  cards.forEach(c => console.log('  -', c.testId, ':', c.text));

  // Also dump all test-ids
  const allIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-test-id]')).map(el => el.getAttribute('data-test-id')).slice(0, 50);
  });
  console.log('All test-ids:', allIds);

  await browser.close();
  process.exit(0);
})();