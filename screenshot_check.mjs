import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5174';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

// --- load app ---
await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
const currentUrl = page.url();
console.log('URL after load:', currentUrl);

// Check if it's a login page
const isLogin = await page.$('input[type="email"], input[type="password"]') !== null;
console.log('Is login page:', isLogin);

if (isLogin) {
  await page.screenshot({ path: 'screenshot_login.png', fullPage: false });
  console.log('Saved screenshot_login.png');
  // Try to get topbar classes
  const topbarClass = await page.$eval('.topbar', el => el.className).catch(() => 'NOT FOUND');
  console.log('Topbar class:', topbarClass);
  await browser.close();
  process.exit(0);
}

// Take Dashboard screenshot (default tab)
await page.screenshot({ path: 'screenshot_tab0_tableau.png', fullPage: false });
console.log('Saved screenshot_tab0_tableau.png');

// --- Read DOM elements ---
const topbarClass = await page.$eval('.topbar', el => el.className).catch(() => 'NOT FOUND');
console.log('Topbar class:', topbarClass);

const topbarBg = await page.$eval('.topbar', el => window.getComputedStyle(el).background).catch(() => 'N/A');
console.log('Topbar computed bg:', topbarBg.slice(0, 80));

const bnavExists = await page.$('.bnav') !== null;
console.log('bnav exists:', bnavExists);

const bnavItems = await page.$$eval('.bnav-item', items => items.map(i => i.textContent.trim()));
console.log('bnav items:', bnavItems);

const heroClass = await page.$eval('.profit-hero', el => el.className).catch(() => 'NOT FOUND');
console.log('profit-hero class:', heroClass);

const heroBg = await page.$eval('.profit-hero', el => window.getComputedStyle(el).background).catch(() => 'N/A');
console.log('profit-hero computed bg:', heroBg.slice(0, 80));

const fabClass = await page.$eval('.fab-vocal', el => el.className).catch(() => 'NOT FOUND');
console.log('fab-vocal class:', fabClass);

const fabBg = await page.$eval('.fab-vocal', el => window.getComputedStyle(el).background).catch(() => 'N/A');
console.log('fab-vocal computed bg:', fabBg.slice(0, 80));

// --- Navigate to each tab ---
const tabs = [
  { idx: 1, name: 'stock_ia' },
  { idx: 2, name: 'deal_score' },
  { idx: 3, name: 'ventes' },
  { idx: 4, name: 'stats' },
];

for (const tab of tabs) {
  const tabBtn = await page.$(`.bnav-item:nth-child(${tab.idx + 1})`);
  if (tabBtn) {
    await tabBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `screenshot_tab${tab.idx}_${tab.name}.png`, fullPage: false });
    console.log(`Saved screenshot_tab${tab.idx}_${tab.name}.png`);
  } else {
    console.log(`Tab ${tab.idx} button NOT FOUND`);
  }
}

await browser.close();
console.log('Done.');
