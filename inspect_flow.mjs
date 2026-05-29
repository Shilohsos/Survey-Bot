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

  // Dismiss onboarding if present
  await page.evaluate(() => {
    const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    if (popup && popup.parentElement) popup.parentElement.removeChild(popup);
    
    const devicePopup = document.querySelector('[data-test-id="ps-offers-platforms-popup"]');
    if (devicePopup && devicePopup.parentElement) devicePopup.parentElement.removeChild(devicePopup);
  });
  await page.waitForTimeout(1000);

  // Get shortest card
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
    console.log('NO CARDS');
    await browser.close();
    return;
  }

  const chosenCard = cards[0];
  console.log('Card:', chosenCard.testId);
  const durationMatch = chosenCard.text.match(/(\\d+)\\s*min/i);
  const duration = durationMatch ? durationMatch[1] + ' min' : '? min';
  console.log('Duration:', duration);

  // Click the card
  await page.evaluate((tid) => {
    const card = document.querySelector('[data-test-id="' + tid + '"]');
    if (card) card.click();
  }, chosenCard.testId);
  
  await page.waitForTimeout(2000);

  // Dismiss onboarding again (may have reappeared)
  await page.evaluate(() => {
    const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    if (popup && popup.parentElement) popup.parentElement.removeChild(popup);
  });

  // Click "Commence le sondage" button
  const startClicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('commence') || text.includes('start')) {
        btn.click();
        return text.substring(0, 50);
      }
    }
    return 'NOT FOUND';
  });
  console.log('Start button clicked:', startClicked);

  // Wait for survey to load (might open new page, iframe, or same page)
  await page.waitForTimeout(8000);

  console.log('\nURL after start:', page.url());
  
  const pageCount = page.context().pages().length;
  console.log('Pages:', pageCount);
  
  if (pageCount > 1) {
    const newPage = page.context().pages()[pageCount - 1];
    console.log('New page URL:', newPage.url());
    try {
      await newPage.waitForLoadState('load', { timeout: 10000 });
      const body = await newPage.evaluate(() => document.body ? document.body.innerText : '');
      console.log('New page content:', (body || '').substring(0, 500).trim());
    } catch(e) {
      console.log('New page load error:', String(e));
    }
  }

  // Check for iframes with actual content
  const iframesAfter = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
      className: f.className,
      width: f.width,
      height: f.height
    }));
  });
  console.log('\nIframes after:', JSON.stringify(iframesAfter, null, 2));

  // Check if popup has changed
  const popupState = await page.evaluate(() => {
    const popup = document.querySelector('[class*="integration-script"]');
    if (!popup) return 'NO POPUP';
    const display = window.getComputedStyle(popup).display;
    return 'Popup display: ' + display + ' innerText: ' + (popup.textContent || '').substring(0, 200).trim();
  });
  console.log('Popup state:', popupState);

  // Wait even longer
  await page.waitForTimeout(5000);
  console.log('URL after 13s total:', page.url());
  
  // Check page content
  const bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('Full page body (first 500 chars):', bodyText.substring(0, 500).trim());

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });