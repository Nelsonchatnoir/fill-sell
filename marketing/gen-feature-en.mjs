import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });

const filePath = path.resolve(__dirname, 'feature-graphic-en.html');
await page.goto('file://' + filePath, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

const el = await page.$('div[style*="width:1024px"]');
await el.screenshot({
  path: 'C:/Users/nicol/Desktop/Android Play Store Assets/feature-graphic-1024x500-en.png'
});

await browser.close();
console.log('Done: feature-graphic-1024x500-en.png');
