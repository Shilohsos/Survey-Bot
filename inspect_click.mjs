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

  // Get auth token
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name === 'auth-token');
  const authToken = authCookie ? decodeURIComponent(authCookie.value) : '';
  console.log('Auth token:', authToken.substring(0, 30) + '...');

  // Go to dashboard
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click surveys nav
  await page.evaluate(() => {
    const nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) { nav.click(); }
  });
  await page.waitForTimeout(3000);

  // Get all survey cards (shortest first)
  const cards = await page.evaluate(() => {
    const allCards = Array.from(document.querySelectorAll('[data-test-id^="ps-survey-"]'));
    const parentCards = allCards.filter(el => {
      const tid = el.getAttribute('data-test-id') || '';
      return !['ps-survey-item-time','ps-survey-rating-wrapper','ps-list-item-reward',
               'ps-reward-without-bonus','ps-reward-amount','ps-reward-currency'].includes(tid);
    });
    return parentCards.map(c => ({
      testId: c.getAttribute('data-test-id') || '',
      text: c.textContent ? c.textContent.trim() : ''
    }));
  });

  if (cards.length === 0) {
    console.log('NO SURVEY CARDS');
    await browser.close();
    return;
  }

  console.log('Found', cards.length, 'survey cards');
  
  // Try clicking the first card  
  const firstCard = cards[0];
  console.log('\nClicking card:', firstCard.testId);
  console.log('Text:', firstCard.text.substring(0, 100));

  // Method 1: page.evaluate click
  const clicked = await page.evaluate((tid) => {
    const card = document.querySelector('[data-test-id="' + tid + '"]');
    if (card) {
      card.click();
      return true;
    }
    return false;
  }, firstCard.testId);
  
  console.log('Click returned:', clicked);

  // Wait for navigation or popup
  await page.waitForTimeout(5000);
  
  const urlAfter = page.url();
  console.log('URL after click:', urlAfter);
  const pageCount = page.context().pages().length;
  console.log('Pages:', pageCount);
  
  // Check for new pages
  if (pageCount > 1) {
    const newPage = page.context().pages()[pageCount - 1];
    const newUrl = newPage.url();
    console.log('New page URL:', newUrl);
    await new Promise(r => setTimeout(r, 2000));
    console.log('New page title:', await newPage.title());
    console.log('New page body (first 500 chars):', ((await newPage.evaluate(() => document.body ? document.body.innerText : '') || '').substring(0, 500)).trim());
  }
  
  // Check if a popup/iframe appeared
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => f.src);
  });
  console.log('IFrames:', iframes);

  // Check if a modal appeared
  const modals = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"]'))
      .map(el => el.className + ' visible:' + (el.style.display !== 'none'));
  });
  console.log('Modals/Popups:', modals);

  // Wait longer and check again
  await page.waitForTimeout(3000);
  const urlAfter2 = page.url();
  console.log('URL after 8s total:', urlAfter2);
  
  // Try the API to get a survey link directly 
  try {
    // Fetch survey link via the API
    const surveyId = firstCard.testId.replace('ps-survey-', '');
    console.log('\nSurvey ID (from testId):', surveyId);
    
    const linkRes = await page.evaluate(async (sid) => {
      try {
        const r = await fetch('https://api.topsurveys.app/api/surveys/' + sid + '/link', {
          headers: { 'Authorization': 'Bearer ' + (document.cookie.match(/auth-token=([^;]+)/) || ['', ''])[1] }
        });
        return { status: r.status, body: await r.text().then(t => t.substring(0, 200)) };
      } catch(e) {
        return { error: String(e) };
      }
    }, surveyId);
    console.log('Survey link API result:', JSON.stringify(linkRes));
  } catch(e) {
    console.log('Survey link API error:', String(e));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });