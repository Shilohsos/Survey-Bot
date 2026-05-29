import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });

  // Login
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
  
  // Monitor network AFTER the card click
  var apiCalls = [];
  page.on('request', function(req) {
    var url = req.url() || '';
    if (url.indexOf('/api/') >= 0 || url.indexOf('survey') >= 0 || url.indexOf('cint') >= 0 || url.indexOf('dynata') >= 0) {
      apiCalls.push({ req: req.method() + ' ' + url.substring(0, 120), time: Date.now() });
    }
  });

  await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss overlays
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

  // Click Sondages via JS
  await page.evaluate(function() {
    var nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) nav.click();
  });
  await page.waitForTimeout(3000);

  // Get cards
  var cards = await page.evaluate(function() {
    var r = [];
    document.querySelectorAll('[data-test-id^="ps-survey-"]').forEach(function(c) {
      var tid = c.getAttribute('data-test-id') || '';
      if (tid === 'ps-survey-item-time' || tid === 'ps-survey-rating-wrapper' || 
          tid === 'ps-list-item-reward' || tid === 'ps-reward-without-bonus' || 
          tid === 'ps-reward-amount' || tid === 'ps-reward-currency' || tid === 'ps-survey-rating') return;
      r.push(tid);
    });
    return r;
  });

  if (cards.length === 0) { console.log('No cards'); await browser.close(); return; }

  console.log('Clicking card: ' + cards[0]);
  
  // Clear API calls before click
  apiCalls = [];
  
  // Click card
  var card = page.locator('[data-test-id="' + cards[0] + '"]').first();
  var cardHtml = await card.evaluate(function(el) { return el.outerHTML.substring(0, 500); });
  console.log('Card HTML: ' + cardHtml);
  
  // Check what's inside the card that handles clicks
  var cardEvents = await card.evaluate(function(el) {
    var clickable = el.querySelectorAll('a, button, [role="button"], [onclick], [class*="click"], [data-action]');
    var r = [];
    clickable.forEach(function(c) {
      r.push({
        tag: c.tagName,
        text: (c.textContent || '').trim().substring(0, 30),
        onclick: c.getAttribute('onclick') || '',
        href: c.getAttribute('href') || '',
        class: (c.className || '').substring(0, 40),
        tabindex: c.getAttribute('tabindex') || '',
      });
    });
    return r;
  });
  console.log('Clickable children: ' + JSON.stringify(cardEvents));
  
  // Try clicking the card itself via JS
  await page.evaluate(function(tid) {
    var card = document.querySelector('[data-test-id="' + tid + '"]');
    if (card) card.click();
  }, cards[0]);
  
  await page.waitForTimeout(5000);
  
  console.log('\nAPI calls after click:');
  apiCalls.forEach(function(c, i) { console.log('  ' + (i+1) + '. ' + c.req); });
  console.log('\nURL after: ' + page.url());
  console.log('Pages: ' + context.pages().length);
  context.pages().forEach(function(p, i) { console.log('  P' + i + ': ' + p.url()); });

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });