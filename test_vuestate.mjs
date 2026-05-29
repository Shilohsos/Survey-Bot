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

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'Ugbekilemelvin@gmail.com');
  await page.click('[data-test-id="app-page-continue-button"]');
  await page.waitForTimeout(3000);
  await page.fill('input[type="password"]', 'TopSurveyBot2026!');
  await page.click('[data-test="auth-signin-submit"]');
  await page.waitForTimeout(5000);

  // Navigate to surveys page
  await page.evaluate(function() {
    var nav = document.querySelector('[data-test-id="surveys-nav"]');
    if (nav) nav.click();
  });
  await page.waitForTimeout(3000);

  // Try to access Vue app's internal state
  var vueState = await page.evaluate(function() {
    var results = {};
    
    // Vue 3 stores on #app
    var appEl = document.querySelector('#app');
    if (!appEl) { results.error = 'no #app'; return results; }
    
    var vueApp = (appEl as any).__vue_app__;
    if (!vueApp) { 
      // Try other possible storage
      var appChildren = Array.from(appEl.children);
      for (var child of appChildren) {
        var vn = (child as any).__vueParentComponent || (child as any).__vue__;
        if (vn) results.childVue = 'found';
      }
      results.noVueApp = true;
      return results;
    }
    
    results.hasVueApp = true;
    
    // Vue 3: app.config.globalProperties or app._context
    var context = vueApp._context;
    if (context) results.hasContext = true;
    
    // Check for Pinia store or provide/inject
    var provides = context.provides;
    if (provides) {
      var keys = Object.keys(provides);
      results.provideKeys = keys.slice(0, 10);
      
      // Look for survey-related data in provides
      for (var key of keys) {
        var val = provides[key];
        if (val && typeof val === 'object') {
          var valKeys = Object.keys(val);
          if (valKeys.some(function(k) { return k.toLowerCase().indexOf('survey') >= 0 || k.toLowerCase().indexOf('question') >= 0; })) {
            results.foundSurveyData = true;
            results.surveyKey = key;
            try {
              results.surveyData = JSON.stringify(val).substring(0, 1000);
            } catch(e) {}
          }
        }
      }
    }
    
    // Try to get component tree
    var rootComponent = vueApp._instance;
    if (rootComponent) {
      results.hasRootInstance = true;
      var stateKeys = Object.keys(rootComponent.setupState || {});
      results.setupStateKeys = stateKeys.filter(function(k) { return k.length < 30; }).slice(0, 20);
      
      // Look for survey data in setup state
      for (var key of stateKeys) {
        var val = rootComponent.setupState[key];
        if (val && typeof val === 'object' && val.constructor === Array && val.length > 0) {
          var first = val[0];
          if (first && typeof first === 'object' && (first.survey_id || first.id || first.title)) {
            results.foundSurveyArray = true;
            results.surveyArrayKey = key;
            results.surveyArraySample = JSON.stringify(first).substring(0, 500);
            results.surveyArrayLength = val.length;
            break;
          }
        }
      }
    }
    
    return results;
  });

  console.log('Vue state analysis:');
  console.log(JSON.stringify(vueState, null, 2));

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });