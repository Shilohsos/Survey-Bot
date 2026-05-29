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
  console.log('Logged in');

  // Stay on the DASHBOARD (don't click Sondages tab)
  // The dashboard shows "Sondages en vedette" with clickable survey cards
  
  // Get survey data from the page
  var pageText = await page.evaluate(function() { return document.body.innerText; });
  console.log('Page text (first 500):', pageText.substring(0, 500));
  
  // Find survey cards on the dashboard
  var dashboardCards = await page.evaluate(function() {
    var r = [];
    // Look for any survey-related elements
    document.querySelectorAll('[data-test-id^="ps-survey-"]').forEach(function(c) {
      var tid = c.getAttribute('data-test-id') || '';
      if (['ps-survey-item-time','ps-survey-rating-wrapper','ps-list-item-reward',
           'ps-reward-without-bonus','ps-reward-amount','ps-reward-currency'].indexOf(tid) >= 0) return;
      r.push({ tid: tid, visible: c.offsetParent !== null });
    });
    
    // Also look for survey tiles on the dashboard (they might have different IDs)
    document.querySelectorAll('[class*="survey"], [class*="tile"]').forEach(function(c) {
      if (c.getAttribute('data-test-id') && c.getAttribute('data-test-id').indexOf('survey') >= 0) {
        // Already captured above
      }
    });
    return r;
  });
  console.log('Dashboard cards:', dashboardCards.length);
  if (dashboardCards.length > 0) console.log('First:', JSON.stringify(dashboardCards[0]));

  // Check for the featured/onboarding survey section
  var hasSondagesEnVedette = pageText.indexOf('Sondages en vedette') >= 0;
  var hasFeaturedSurveys = pageText.indexOf('Featured Surveys') >= 0;
  var hasOnboardingCard = pageText.indexOf('Commence') >= 0 || pageText.indexOf('connaissance') >= 0;
  
  console.log('\nHas "Sondages en vedette":', hasSondagesEnVedette);
  console.log('Has onboarding card:', hasOnboardingCard);
  
  // Check the integration container
  var integrationHTML = await page.evaluate(function() {
    var container = document.querySelector('[data-test-id="ps-integration-container"]');
    if (!container) return 'NOT FOUND';
    return (container as HTMLElement).innerText.substring(0, 500);
  }).catch(function() { return 'ERROR'; });
  console.log('Integration container:', integrationHTML.substring(0, 300));

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });