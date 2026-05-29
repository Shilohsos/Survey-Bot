import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ locale: 'fr-FR' });

  // Login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('SurveyBot2026!');
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Get full HTML structure
  const html = await page.evaluate(() => {
    // Get all interactive elements
    const all = Array.from(document.querySelectorAll('*'));
    const navElements = all.filter(el => {
      const text = el.innerText?.trim().toLowerCase() || '';
      const role = el.getAttribute('role') || '';
      const cls = el.className || '';
      const tag = el.tagName;
      const id = el.id || '';
      // Look for navigation-like elements
      return (
        (role === 'tab' || role === 'button' || role === 'navigation') ||
        cls.toLowerCase().includes('nav') ||
        cls.toLowerCase().includes('tab') ||
        cls.toLowerCase().includes('menu') ||
        text === 'gagne' || text === 'sondages' || text === 'jeux' || text === 'compte' ||
        text === 'earn' || text === 'surveys' || text === 'games' || text === 'account'
      );
    });
    
    return navElements.slice(0, 30).map(el => ({
      tag: el.tagName,
      id: el.id,
      text: el.innerText?.trim().substring(0, 30),
      cls: el.className?.substring(0, 60),
      role: el.getAttribute('role'),
      href: el.getAttribute('href'),
      'data-test': el.getAttribute('data-test'),
      'data-test-id': el.getAttribute('data-test-id'),
      childCount: el.children.length,
      rect: el.getBoundingClientRect().height + 'x' + el.getBoundingClientRect().width,
    }));
  });

  console.log('All nav-like elements:');
  html.forEach((e, i) => console.log(`${i}: ${JSON.stringify(e)}`));

  // Also dump the full body as text for structure analysis
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
  console.log('\nAll visible text lines:');
  lines.forEach((l, i) => console.log(`${i}: "${l}"`));

  await browser.close();
}

main().catch(e => console.error('Error:', e.message));