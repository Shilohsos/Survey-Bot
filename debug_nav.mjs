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

  // Dump ALL elements to find navigation
  const allElements = await page.evaluate(() => {
    const all = document.querySelectorAll('a, button, [role="tab"], [role="button"], nav a, nav button, li a, li button');
    return Array.from(all).slice(0, 100).map(el => ({
      tag: el.tagName,
      id: el.id,
      text: (el.innerText || el.textContent || '').trim().substring(0, 50),
      cls: typeof el.className === 'string' ? el.className.substring(0, 80) : '',
      href: el.getAttribute('href') || '',
      'data-test': el.getAttribute('data-test') || '',
      'data-test-id': el.getAttribute('data-test-id') || '',
      'aria-label': el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      tabIndex: el.getAttribute('tabindex'),
    }));
  });

  console.log('ALL interactive elements:');
  allElements.forEach((e, i) => {
    if (e.text || e['aria-label'] || e['data-test']) {
      console.log(`${i}: [${e.tag}] text="${e.text}" aria="${e['aria-label']}" test="${e['data-test']}" id="${e['data-test-id']}"`);
    }
  });

  // Also get bottom navigation specifically
  const bottomNav = await page.evaluate(() => {
    // Look for bottom navigation bar
    const nav = document.querySelector('[class*="bottom"], [class*="tab"], [class*="nav"], footer, [role="tablist"]');
    if (nav) {
      return {
        tag: nav.tagName,
        cls: nav.className.substring(0, 100),
        html: nav.innerHTML.substring(0, 1000),
        items: Array.from(nav.querySelectorAll('a, button, [role="tab"]')).map(el => ({
          text: (el.innerText || el.textContent || '').trim().substring(0, 30),
          href: el.getAttribute('href'),
          'data-test': el.getAttribute('data-test'),
          'aria-label': el.getAttribute('aria-label'),
          cls: typeof el.className === 'string' ? el.className.substring(0, 60) : '',
          svg: el.querySelector('svg') ? true : false,
        })),
      };
    }
    return null;
  });

  console.log('\nBottom nav:', JSON.stringify(bottomNav, null, 2));

  await browser.close();
}

main().catch(e => console.error('Error:', e.message));