import 'dotenv/config';
import { chromium } from 'playwright';

/**
 * Try to intercept the API call that happens when clicking a survey card.
 * We'll catch the survey link and navigate directly.
 */
async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
  const page = await context.newPage();

  // Store auth token
  let authToken = '';

  // Intercept all API calls to find survey-related endpoints
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.indexOf('api/survey') >= 0 || url.indexOf('api/start') >= 0 || url.indexOf('start_survey') >= 0 || url.indexOf('survey/start') >= 0) {
      try {
        const body = await resp.text();
        console.log('SURVEY API:', resp.status(), url.substring(0, 100), body.substring(0, 300));
      } catch {}
    }
  });

  // Login through browser (reliable)
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);

  // Save auth token from cookies
  const cookies = await context.cookies();
  const authCookie = cookies.find(c => c.name === 'auth-token');
  if (authCookie) {
    authToken = decodeURIComponent(authCookie.value);
    console.log('Auth token obtained:', authToken.substring(0, 20) + '...');
  }

  // Navigate to surveys page
  await page.goto('https://app.topsurveys.app/surveys', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get survey card and try clicking it - monitor all API
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

  if (cards.length === 0) {
    console.log('No cards found on /surveys - need to click nav first');
    // Click Sondages via JS
    await page.evaluate(function() {
      var nav = document.querySelector('[data-test-id="surveys-nav"]');
      if (nav) nav.click();
    });
    await page.waitForTimeout(3000);
    
    cards = await page.evaluate(function() {
      var r = [];
      document.querySelectorAll('[data-test-id^="ps-survey-"]').forEach(function(c) {
        var tid = c.getAttribute('data-test-id') || '';
        if (['ps-survey-item-time','ps-survey-rating-wrapper','ps-list-item-reward',
             'ps-reward-without-bonus','ps-reward-amount','ps-reward-currency'].indexOf(tid) >= 0) return;
        r.push(tid);
      });
      return r;
    });
  }

  console.log('Cards:', cards.length);
  if (cards.length === 0) { console.log('Still no cards'); await browser.close(); return; }

  // Try clicking via Playwright's native click (not force:true, not JS click)
  console.log('Clicking card:', cards[0]);
  
  try {
    // First try - normal Playwright click with scrolling
    const locator = page.locator('[data-test-id="' + cards[0] + '"]').first();
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await locator.click({ timeout: 5000 });
    console.log('Normal click succeeded');
  } catch(e) {
    console.log('Normal click failed:', e.message.substring(0, 80));
    // Fallback to force
    try {
      await page.locator('[data-test-id="' + cards[0] + '"]').first().click({ force: true, timeout: 5000 });
      console.log('Force click succeeded');
    } catch(e2) {
      console.log('Force click also failed');
    }
  }

  await page.waitForTimeout(5000);
  console.log('URL after:', page.url());
  var pages = context.pages();
  console.log('Pages:', pages.length);
  pages.forEach(function(p, i) { console.log('  P' + i + ': ' + p.url()); });
  
  // Check body content
  var bodyText = await page.evaluate(function() { return document.body.innerText.substring(0, 300); });
  console.log('Body:', bodyText);

  // Also try making API calls directly with the auth token
  if (authToken) {
    console.log('\nTrying direct API calls...');
    
    // Try getting survey list
    var surveyId = cards[0].replace('ps-survey-', '');
    console.log('Survey UUID:', surveyId);
    
    // Try different API endpoints
    var endpoints = [
      '/api/survey/' + surveyId,
      '/api/surveys/' + surveyId,
      '/api/survey/start/' + surveyId,
      '/api/start-survey/' + surveyId,
    ];
    
    for (var ep of endpoints) {
      try {
        var resp = await page.evaluate(async function(token, endpoint) {
          var r = await fetch('https://api.topsurveys.app' + endpoint, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          return r.status + ': ' + (await r.text()).substring(0, 200);
        }, authToken, ep);
        console.log('  GET', ep, '->', resp);
      } catch(e) {
        console.log('  GET', ep, '-> ERROR:', e.message);
      }
    }
  }

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });