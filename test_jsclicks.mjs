import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });

  // Login via API
  var loginPage = await context.newPage();
  var loginResult = await loginPage.evaluate(function(args) {
    return fetch('https://api.topsurveys.app/auth/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: args.email }),
    }).then(function(r) { return r.json(); }).then(function(checkData) {
      if (!checkData.exists) throw new Error('Not found');
      return fetch('https://api.topsurveys.app/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: args.email, password: args.password }),
      }).then(function(r) { return r.json(); });
    });
  }, { email: 'Ugbekilemelvin@gmail.com', password: 'SurveyBot2026!' });

  if (!loginResult.token) { console.log('FAIL: Login'); await browser.close(); return; }

  await context.addCookies([
    { name: 'auth-token', value: loginResult.token, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);
  await loginPage.close();

  var page = await context.newPage();
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('1. Dashboard loaded: ' + page.url());

  // Dismiss overlays (same as autoAnswerOnboarding)
  await page.evaluate(function() {
    var dp = document.querySelector('[data-test-id="ps-offers-platforms-popup"]');
    if (dp && dp.parentElement) dp.parentElement.removeChild(dp);
    var ob = document.querySelector('[data-test-id="ps-onboarding-popup"]');
    if (ob && ob.parentElement) ob.parentElement.removeChild(ob);
    document.querySelectorAll('[class*="overlay"], [class*="backdrop"]').forEach(function(el) {
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  });
  await page.waitForTimeout(500);
  console.log('2. Overlays dismissed');

  // Click Sondages via JS
  var clicked = await page.evaluate(function() {
    var nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) { nav.click(); return true; }
    return false;
  });
  await page.waitForTimeout(3000);
  console.log('3. Sondages clicked: ' + clicked + ' - URL: ' + page.url());

  // Get first survey card
  var cards = await page.evaluate(function() {
    var r = [];
    var all = document.querySelectorAll('[data-test-id^="ps-survey-"]');
    all.forEach(function(c) {
      var tid = c.getAttribute('data-test-id') || '';
      if (tid === 'ps-survey-item-time' || tid === 'ps-survey-rating-wrapper' || 
          tid === 'ps-list-item-reward' || tid === 'ps-reward-without-bonus' || 
          tid === 'ps-reward-amount' || tid === 'ps-reward-currency') return;
      r.push(tid);
    });
    return r;
  });
  console.log('4. Found ' + cards.length + ' surveys');

  if (cards.length > 0) {
    console.log('   First card testId: ' + cards[0]);
    
    // Click via JS
    var cardClicked = await page.evaluate(function(tid) {
      var card = document.querySelector('[data-test-id="' + tid + '"]');
      if (card) { card.click(); return true; }
      return false;
    }, cards[0]);
    
    await page.waitForTimeout(5000);
    console.log('5. Card clicked: ' + cardClicked);
    console.log('   URL: ' + page.url());
    
    // Check all pages
    var allP = context.pages();
    console.log('   Pages: ' + allP.length);
    allP.forEach(function(p, i) { console.log('   Page ' + i + ': ' + p.url()); });
    
    // Check page content
    var text = await page.evaluate(function() { return document.body.innerText.substring(0, 300); });
    console.log('   Content: ' + text);
  }

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });