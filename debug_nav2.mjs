import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ locale: 'fr-FR' });

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('SurveyBot2026!');
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Get ALL children of bottom nav
  const navItems = await page.evaluate(() => {
    const nav = document.querySelector('.p-app-mobile-nav__wrapper');
    if (!nav) return 'No nav found';
    
    const items = nav.querySelectorAll(':scope > div');
    return Array.from(items).map((item, i) => {
      // Get all text and aria labels recursively
      const allText = [];
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_ALL);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
          allText.push(node.textContent.trim());
        }
        if (node.nodeType === 1) {
          const el = node;
          const aria = el.getAttribute('aria-label');
          if (aria) allText.push('aria:' + aria);
          const href = el.getAttribute('href');
          if (href) allText.push('href:' + href);
          const testId = el.getAttribute('data-test-id');
          if (testId) allText.push('testid:' + testId);
        }
      }
      return {
        index: i,
        cls: item.className?.substring(0, 80),
        texts: [...new Set(allText)],
        html: item.innerHTML.substring(0, 300),
      };
    });
  });

  console.log('Nav items:');
  navItems.forEach((item, i) => {
    console.log(`\n--- Item ${i} ---`);
    console.log('  Cls:', item.cls);
    console.log('  Texts:', JSON.stringify(item.texts));
    console.log('  HTML snippet:', item.html.substring(0, 200));
  });

  await browser.close();
}

main().catch(e => console.error('Error:', e.message));