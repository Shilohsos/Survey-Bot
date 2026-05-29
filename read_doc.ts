import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Try the embed frame directly (no redirects)
  console.log('Loading widget frame...');
  await page.goto('https://t.me/learnwithsmartcoach/166?embed=1&mode=tme', { 
    waitUntil: 'domcontentloaded', timeout: 15000 
  }).catch(() => {});

  await page.waitForTimeout(5000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log('\n=== Widget Content ===');
  console.log(text?.substring(0, 5000));

  // Check for download links or file references
  const links = await page.locator('a[href]').all();
  for (const link of links) {
    const href = await link.getAttribute('href');
    if (href && (href.includes('cdn') || href.includes('download') || href.includes('.pdf') || href.includes('doc'))) {
      console.log('\nDownload link:', href);
      console.log('Text:', await link.textContent());
    }
  }

  // Look for any file/document download URLs in the page
  const downloadBtns = page.locator('a:has-text("Download"), a:has-text("Télécharger"), a[download]');
  const downloadCount = await downloadBtns.count();
  console.log(`\nDownload buttons: ${downloadCount}`);
  for (let i = 0; i < downloadCount; i++) {
    const href = await downloadBtns.nth(i).getAttribute('href');
    console.log(`  ${i}: ${href}`);
  }

  await browser.close();
}

main().catch(console.error);