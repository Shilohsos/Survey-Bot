import { chromium } from 'playwright';
import 'dotenv/config';
import { execSync } from 'child_process';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Login
  const loginResult = await page.evaluate(async ({ email, password }) => {
    const checkResp = await fetch('https://api.topsurveys.app/auth/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const checkData = await checkResp.json();
    const loginResp = await fetch('https://api.topsurveys.app/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    return await loginResp.json();
  }, { email: 'Ugbekilemelvin@gmail.com', password: 'Test2026!' });

  const token = loginResult.token;
  console.log('Token:', token);
  console.log('Token URL-encoded:', encodeURIComponent(token));

  // Set cookies
  await context.addCookies([
    { name: 'auth-token', value: token, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: loginResult.locale || 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);

  // Load page to activate session
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Now get ALL cookies as they exist after the page loads
  const cookies = await context.cookies();
  for (const c of cookies) {
    if (c.name === 'auth-token' || c.name === 'ps-app' || c.name === 'ps-uuid' || 
        c.name === 'ps-shash' || c.name === 'ps-di') {
      console.log(`\nCookie: ${c.name}=${c.value}`);
      console.log(`  domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} secure=${c.secure} sameSite=${c.sameSite}`);
    }
  }

  // Try curl with the EXACT cookie value
  console.log('\n--- Curl test ---');
  try {
    const result = execSync(
      `curl -s -o /tmp/curl_result.txt -w "%{http_code}" ` +
      `-H "Accept: application/json" ` +
      `-H "Referer: https://app.topsurveys.app/" ` +
      `-b "auth-token=${encodeURIComponent(token)}; localization=fr-fr" ` +
      `"https://api.topsurveys.app/api/user"`
    ).toString().trim();
    const body = execSync('cat /tmp/curl_result.txt').toString().trim();
    console.log('Status:', result);
    console.log('Body:', body.substring(0, 300));
  } catch(e: any) {
    console.log('Error:', e.message);
  }

  // Try with multiple cookies
  const authCookie = cookies.find(c => c.name === 'auth-token');
  if (authCookie) {
    const relevantCookies = cookies
      .filter(c => ['auth-token', 'localization'].includes(c.name))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
    
    console.log('\n--- Curl with exact cookie string ---');
    try {
      const result2 = execSync(
        `curl -s -o /tmp/curl_result2.txt -w "%{http_code}" ` +
        `-H "Accept: application/json" ` +
        `-H "Referer: https://app.topsurveys.app/" ` +
        `-b "${relevantCookies}" ` +
        `"https://api.topsurveys.app/api/user"`
      ).toString().trim();
      const body2 = execSync('cat /tmp/curl_result2.txt').toString().trim();
      console.log('Status:', result2);
      console.log('Body:', body2.substring(0, 300));
    } catch(e: any) {
      console.log('Error:', e.message);
    }
  }

  // Try with page.evaluate XMLHttpRequest (should work within browser)
  console.log('\n--- XHR from page context ---');
  const xhrResult = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://api.topsurveys.app/api/user');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.withCredentials = true;
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText.substring(0, 200) });
      xhr.onerror = () => resolve({ error: 'XHR error' });
      xhr.send();
    });
  });
  console.log('XHR result:', JSON.stringify(xhrResult));

  await browser.close();
}

main().catch(console.error);