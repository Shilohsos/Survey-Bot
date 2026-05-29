import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
  const page = await context.newPage();

  // Login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);

  // Go to surveys page via JS click
  await page.evaluate(function() {
    var nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) nav.click();
  });
  await page.waitForTimeout(3000);

  // Get a card
  var cards = await page.evaluate(function() {
    var r = [];
    document.querySelectorAll('[data-test-id^="ps-survey-"]').forEach(function(c) {
      var tid = c.getAttribute('data-test-id') || '';
      if (['ps-survey-item-time','ps-survey-rating-wrapper','ps-list-item-reward',
           'ps-reward-without-bonus','ps-reward-amount','ps-reward-currency'].indexOf(tid) >= 0) return;
      r.push(tid);
    });
    return r;
  });

  if (cards.length === 0) { console.log('No cards'); await browser.close(); return; }

  var cardId = cards[0];
  console.log('Card:', cardId);

  // Try dispatchEvent with full PointerEvent sequence (most realistic)
  await page.evaluate(function(tid) {
    var card = document.querySelector('[data-test-id="' + tid + '"]');
    if (!card) return;
    
    var rect = card.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    
    // Dispatch realistic event sequence
    var opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      detail: 1,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    };
    
    card.dispatchEvent(new PointerEvent('pointerdown', opts));
    card.dispatchEvent(new PointerEvent('pointerup', opts));
    card.dispatchEvent(new MouseEvent('mousedown', opts));
    card.dispatchEvent(new MouseEvent('mouseup', opts));
    card.dispatchEvent(new MouseEvent('click', opts));
  }, cardId);

  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  var pages = context.pages();
  console.log('Pages:', pages.length);
  pages.forEach(function(p, i) { console.log('  ' + i + ': ' + p.url()); });

  // Check if body changed
  var bodyText = await page.evaluate(function() { return document.body.innerText.substring(0, 300); });
  console.log('Body:', bodyText);

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });