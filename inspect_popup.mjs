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
  const onboardingCheck = await page.evaluate(() => {
    const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    return popup ? true : false;
  });
  console.log('Onboarding popup present:', onboardingCheck);
  
  if (onboardingCheck) {
    // Try to close it
    await page.evaluate(() => {
      const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
      if (popup && popup.parentElement) popup.parentElement.removeChild(popup);
    });
    await page.waitForTimeout(1000);
  }

  // Get the shortest card
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

  const chosenCard = cards[0];
  console.log('\nChosen card:', chosenCard.testId);

  // Click it
  await page.evaluate((tid) => {
    const card = document.querySelector('[data-test-id="' + tid + '"]');
    if (card) card.click();
  }, chosenCard.testId);
  
  await page.waitForTimeout(3000);

  // Inspect the DOM after click
  const popupInfo = await page.evaluate(() => {
    const results = [];
    
    // Check for any popup/modal
    const allPopups = document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="overlay"]');
    allPopups.forEach(p => {
      const testId = p.getAttribute('data-test-id') || '';
      const cls = p.className;
      const display = window.getComputedStyle(p).display;
      const visibility = window.getComputedStyle(p).visibility;
      const text = p.textContent ? p.textContent.substring(0, 300).trim() : '';
      
      if (display !== 'none' && visibility !== 'hidden') {
        results.push({ testId, class: cls, display, visibility, text });
      }
    });
    return results;
  });

  console.log('\nVisible popup info:');
  for (const pi of popupInfo) {
    console.log('---');
    console.log('Class:', pi.class);
    console.log('TestId:', pi.testId);
    console.log('Text:', pi.text);
    
    // Find buttons
    if (pi.testId === 'ps-onboarding-popup' || pi.class.includes('onboarding')) {
      console.log('  -> ONBOARDING POPUP (need to dismiss)');
    }
    if (pi.class.includes('integration') || pi.class.includes('script')) {
      console.log('  -> INTEGRATION/SCRIPT POPUP');
      
      // Try to find the button
      const btnInfo = await page.evaluate(() => {
        const popup = document.querySelector('[class*="integration-script"]');
        if (!popup) return 'no popup found';
        
        const btns = popup.querySelectorAll('button, a, [role="button"], [class*="btn"], [class*="button"]');
        return Array.from(btns).map(b => ({
          text: b.textContent ? b.textContent.trim() : '',
          href: b.getAttribute('href') || '',
          class: b.className,
          tag: b.tagName
        }));
      });
      console.log('  Buttons:', JSON.stringify(btnInfo, null, 2));
    }
  }

  // Check for iframes
  const iframeInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
      className: f.className
    }));
  });
  console.log('\nIframes:', JSON.stringify(iframeInfo, null, 2));

  // Try to find any element with data-test-id containing "start" or "begin" or "open"
  const startBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-test-id*="start"], [data-test-id*="Start"], [data-test-id*="open"], [data-test-id*="Open"], [data-test-id*="begin"], [data-test-id*="Begin"]'))
      .map(el => el.getAttribute('data-test-id') + ' text:' + (el.textContent ? el.textContent.trim() : ''));
  });
  console.log('\nStart buttons:', startBtns);

  // Check survey detail page URL
  console.log('Current URL:', page.url());

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });