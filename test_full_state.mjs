import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  // Step 1: Login
  const ctx1 = await browser.newContext({ locale: 'fr-FR' });
  const loginPage = await ctx1.newPage();
  await loginPage.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForTimeout(2000);
  await loginPage.locator('[data-test-id="app-page-email-field-input"]').fill(EMAIL);
  await loginPage.locator('[data-test-id="app-page-continue-button"]').click();
  await loginPage.waitForTimeout(3000);
  await loginPage.locator('input[type="password"]').fill(PASSWORD);
  await loginPage.locator('[data-test="auth-signup-submit"], [data-test="auth-signin-submit"]').click();
  await loginPage.waitForTimeout(5000);

  // Go to dashboard in same context
  await loginPage.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForTimeout(3000);
  console.log('=== Same context (logged in) ===');
  console.log('URL:', loginPage.url());
  const body1 = await loginPage.evaluate(() => document.body?.innerText?.substring(0, 300) || 'empty');
  console.log('Body:', body1);

  // Check sessionStorage
  const ss = await loginPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      items[key] = sessionStorage.getItem(key)?.substring(0, 150);
    }
    return items;
  });
  console.log('\n=== sessionStorage ===');
  Object.entries(ss).forEach(([k, v]) => console.log(`  ${k} = ${v}`));

  // Check localStorage
  const ls = await loginPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key)?.substring(0, 150);
    }
    return items;
  });
  console.log('\n=== localStorage ===');
  Object.entries(ls).forEach(([k, v]) => console.log(`  ${k} = ${v}`));

  // Now clone all state to a new context
  const allCookies = await ctx1.cookies();
  const allLS = await loginPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  });
  const allSS = await loginPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      items[key] = sessionStorage.getItem(key);
    }
    return items;
  });
  console.log('\n=== ALL state collected ===');
  console.log('Cookies:', allCookies.length);
  console.log('localStorage keys:', Object.keys(allLS).length);
  console.log('sessionStorage keys:', Object.keys(allSS).length);

  // Step 2: New context with ALL state
  const ctx2 = await browser.newContext({ locale: 'fr-FR' });
  const p2 = await ctx2.newPage();
  
  // Set cookies first
  for (const c of allCookies) {
    await ctx2.addCookies([c]);
  }
  
  // Go to dashboard
  console.log('\n=== New context with ALL cookies + localStorage injection ===');
  await p2.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForTimeout(1000);

  // Inject localStorage before the SPA fully loads
  await p2.evaluate((lsData) => {
    var keys = Object.keys(lsData);
    for (var idx = 0; idx < keys.length; idx++) {
      try { localStorage.setItem(keys[idx], lsData[keys[idx]]); } catch(e) {}
    }
  }, allLS);
  await p2.evaluate(function(ssData) {
    var keys = Object.keys(ssData);
    for (var idx = 0; idx < keys.length; idx++) {
      try { sessionStorage.setItem(keys[idx], ssData[keys[idx]]); } catch(e) {}
    }
  }, allSS);

  // Reload to let SPA pick up the state
  await p2.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForTimeout(4000);

  console.log('URL:', p2.url());
  const body2 = await p2.evaluate(() => document.body?.innerText?.substring(0, 500) || 'empty');
  console.log('Body:', body2);
  const isAuth = body2.includes('Gagne') || body2.includes('Solde') || body2.includes('Sondages');
  console.log('Authenticated:', isAuth);

  await browser.close();
  process.exit(0);
})();