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

  // Listen for new pages/popups BEFORE doing anything
  const newPages = [];
  page.context().on('page', (newPage) => {
    console.log('NEW PAGE OPENED:', newPage.url());
    newPages.push(newPage);
  });

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
    if (nav) nav.click();
  });
  await page.waitForTimeout(3000);

  // Close all popups
  await page.evaluate(() => {
    // Close onboarding
    const ob = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    if (ob && ob.parentElement) ob.parentElement.removeChild(ob);
    // Close device popup
    const dp = document.querySelector('[data-test-id="ps-offers-platforms-popup"]');
    if (dp && dp.parentElement) dp.parentElement.removeChild(dp);
  });
  await page.waitForTimeout(1000);

  // Get cards
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

  if (cards.length === 0) { console.log('NO CARDS'); await browser.close(); return; }

  // Click the shortest card (last sorted) - first card might be 11min, let's find the shortest
  cards.sort((a, b) => {
    const ma = a.text.match(/(\d+)\s*min/);
    const mb = b.text.match(/(\d+)\s*min/);
    return (ma ? parseInt(ma[1]) : 999) - (mb ? parseInt(mb[1]) : 999);
  });
  
  const chosenCard = cards[0];
  console.log('Shortest card:', chosenCard.testId);
  console.log('Text:', chosenCard.text.substring(0, 100));

  // Now navigate screenshots
  await page.screenshot({ path: '/tmp/before_click.png', fullPage: false });
  
  // Click the card
  await page.evaluate((tid) => {
    const card = document.querySelector('[data-test-id="' + tid + '"]');
    if (card) card.click();
  }, chosenCard.testId);
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: '/tmp/after_card_click.png', fullPage: false });

  // Close onboarding again if present
  await page.evaluate(() => {
    const ob = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    if (ob && ob.parentElement) ob.parentElement.removeChild(ob);
  });

  // Check what's visible now
  let state = await page.evaluate(() => {
    const vis = [];
    const all = document.querySelectorAll('body *');
    all.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        const tid = el.getAttribute('data-test-id') || '';
        const cls = typeof el.className === 'string' ? el.className : '';
        if (tid || (cls && (cls.includes('popup') || cls.includes('modal') || cls.includes('integration') || cls.includes('script')))) {
          const text = (el.textContent || '').trim().substring(0, 100);
          if (text) {
            vis.push({ tag: el.tagName, testId: tid, class: cls.substring(0, 80), text: text.substring(0, 80) });
          }
        }
      }
    });
    return vis;
  });
  
  console.log('\nVisible elements after card click:');
  for (const s of state) {
    console.log(`  ${s.tag} | test-id="${s.testId}" | class="${s.class}" | text="${s.text}"`);
  }

  // Now click "Commence le sondage"
  console.log('\n--- Clicking "Commence le sondage" ---');
  
  const startBtnFound = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('commence')) {
        btn.click();
        return text;
      }
    }
    return 'NOT FOUND';
  });
  console.log('Clicked:', startBtnFound);
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/after_start_click.png', fullPage: false });

  // Check the state after clicking start
  state = await page.evaluate(() => {
    const vis = [];
    const all = document.querySelectorAll('body *');
    all.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        const tid = el.getAttribute('data-test-id') || '';
        const cls = typeof el.className === 'string' ? el.className : '';
        if (tid || (cls && (cls.includes('popup') || cls.includes('modal') || cls.includes('integration') || cls.includes('script')))) {
          const text = (el.textContent || '').trim().substring(0, 100);
          if (text) {
            vis.push({ tag: el.tagName, testId: tid, class: cls.substring(0, 80), text: text.substring(0, 80) });
          }
        }
      }
    });
    return vis;
  });
  
  console.log('\nVisible elements after start click:');
  for (const s of state) {
    console.log(`  ${s.tag} | test-id="${s.testId}" | class="${s.class}" | text="${s.text}"`);
  }

  console.log('\nURL:', page.url());
  console.log('New pages:', newPages.length);
  
  // Check if iframe appeared
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
      className: f.className
    }));
  });
  console.log('Iframes:', JSON.stringify(iframes, null, 2));

  // Check for window.open or popup
  const popups = page.context().pages();
  console.log('Total pages:', popups.length);
  for (const p of popups) {
    console.log('  Page URL:', p.url());
  }

  // Check for new popups after "start" click - wait longer  
  await page.waitForTimeout(5000);
  console.log('\nAfter 5 more seconds...');
  console.log('URL:', page.url());
  
  const popups2 = page.context().pages();
  console.log('Total pages:', popups2.length);
  for (const p of popups2) {
    console.log('  Page URL:', p.url());
  }

  // Check full popup content
  const popupContent = await page.evaluate(() => {
    const popups = document.querySelectorAll('[class*="popup"]');
    const results = [];
    popups.forEach(p => {
      const display = window.getComputedStyle(p).display;
      if (display !== 'none') {
        results.push({
          class: p.className,
          text: (p.textContent || '').substring(0, 300).trim()
        });
      }
    });
    return results;
  });
  console.log('\nVisible popup contents:');
  for (const pc of popupContent) {
    console.log('  Class:', pc.class.substring(0, 80));
    console.log('  Text:', pc.text.substring(0, 200));
    console.log('  ---');
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });