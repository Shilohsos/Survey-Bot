import { chromium } from 'playwright';
import 'dotenv/config';

const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const BRIDGE_PORT = 10801;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Go to dashboard
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click surveys nav
  await page.evaluate(() => {
    const nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) { nav.click(); }
  });
  await page.waitForTimeout(3000);

  // Inspect survey card structure
  const cardInfo = await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-test-id^="ps-survey-"]');
    const results = [];
    cards.forEach(card => {
      const tid = card.getAttribute('data-test-id') || '';
      if (tid === 'ps-survey-item-time' || tid === 'ps-survey-rating-wrapper' || 
          tid === 'ps-list-item-reward' || tid === 'ps-reward-without-bonus' || 
          tid === 'ps-reward-amount' || tid === 'ps-reward-currency') return;

      const tag = card.tagName;
      const attrs = {};
      for (const attr of card.getAttributeNames()) {
        attrs[attr] = card.getAttribute(attr) || '';
      }
      const text = card.innerText?.substring(0, 200);
      const className = card.className;
      
      // Get parent link/clickable wrapper
      let parentTestId = '';
      if (card.parentElement) {
        parentTestId = card.parentElement.getAttribute('data-test-id') || '';
      }
      
      results.push({ tag, testId: tid, className, text, attrs, parentTestId });
    });
    return results;
  });

  if (cardInfo.length === 0) {
    console.log('NO CARDS FOUND');
    const body = await page.evaluate(() => document.body?.innerText?.substring(0, 1000));
    console.log('Body text:', body);
    const allTestIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test-id]')).map(el => el.getAttribute('data-test-id'));
    });
    console.log('All test-ids:', allTestIds);
  } else {
    console.log('Card count:', cardInfo.length);
    console.log(JSON.stringify(cardInfo, null, 2));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
