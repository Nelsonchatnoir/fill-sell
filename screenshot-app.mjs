import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let playwright;
const locations = [
  'C:/Users/nicol/AppData/Local/npm-cache/_npx/b234c773f454f454/node_modules/playwright',
  'C:/Users/nicol/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright',
];
for (const loc of locations) {
  try { playwright = require(loc); console.log('Loaded playwright from:', loc); break; }
  catch (e) { console.log('Not found at:', loc); }
}
if (!playwright) { console.error('Could not load playwright'); process.exit(1); }

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots-review');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const VIEWPORT = { width: 390, height: 844 };
const BASE_URL = 'http://localhost:5174';

const SUPABASE_URL = 'https://tojihnuawsoohlolangc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvamlobnVhd3Nvb2hsb2xhbmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTk0NTEsImV4cCI6MjA5MDc5NTQ1MX0.9bptBnYjGlUSxQTvb0ddnoAm0Cho2c2BVxjSdcSQAaU';
const REFRESH_TOKEN = '5jkfaqylvvh3';

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  // Step 1: Go to the app to establish the origin, then exchange refresh token for session
  console.log('Loading app to establish origin...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(1000);

  // Step 2: Exchange refresh token for access token via Supabase REST API
  console.log('Exchanging refresh token for session...');
  const sessionResult = await page.evaluate(async ({ supabaseUrl, anonKey, refreshToken }) => {
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, refreshToken: REFRESH_TOKEN });

  console.log('Session exchange result:', JSON.stringify(sessionResult, null, 2));

  if (!sessionResult.ok || !sessionResult.data?.access_token) {
    console.error('Failed to get session. Cannot proceed with authenticated screenshots.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00-no-auth.png'), fullPage: true });
    await browser.close();
    return;
  }

  const session = sessionResult.data;
  console.log('Got access token! User:', session.user?.email);

  // Step 3: Inject session into localStorage in Supabase's expected format
  await page.evaluate(({ supabaseUrl, session }) => {
    // Supabase stores session under key: sb-<project-ref>-auth-token
    const projectRef = supabaseUrl.match(/\/\/([^.]+)\./)?.[1] ?? 'tojihnuawsoohlolangc';
    const key = `sb-${projectRef}-auth-token`;
    const sessionData = {
      access_token: session.access_token,
      token_type: session.token_type || 'bearer',
      expires_in: session.expires_in || 3600,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
      refresh_token: session.refresh_token,
      user: session.user
    };
    localStorage.setItem(key, JSON.stringify(sessionData));
    console.log('Session injected under key:', key);
  }, { supabaseUrl: SUPABASE_URL, session });

  // Step 4: Navigate to /app
  console.log('Navigating to /app...');
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(3000);

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);
  const visibleText = await page.evaluate(() => document.body.innerText?.substring(0, 300));
  console.log('Visible text:', visibleText);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00-after-auth.png'), fullPage: true });
  console.log('Screenshot 00-after-auth.png saved');

  // Check if we're in the app
  const html = await page.content();
  const inApp = html.includes('Tableau') || html.includes('Stock IA') || html.includes('Ventes') || html.includes('Stats');
  console.log('In app:', inApp);

  if (!inApp) {
    console.log('Not in app - still on login/landing page. Cannot proceed.');
    await browser.close();
    return;
  }

  // Step 5: Get nav structure
  const navInfo = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'));
    const navBtns = allBtns.filter(b => {
      const text = b.innerText?.trim();
      return ['Tableau', 'Stock IA', 'Deal', 'Ventes', 'Stats'].some(t => text?.includes(t));
    });
    return {
      tabButtons: navBtns.map(b => ({ text: b.innerText?.trim(), class: b.className, id: b.id })),
      allNavs: Array.from(document.querySelectorAll('nav, [role="tablist"]')).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.innerText?.substring(0, 200),
        childCount: el.children.length
      }))
    };
  });
  console.log('Nav info:', JSON.stringify(navInfo, null, 2));

  // Step 6: Screenshot tab 0 (current state = Tableau)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'tab0-tableau.png'), fullPage: true });
  console.log('Screenshot tab0-tableau.png saved');

  // Step 7: Click each remaining tab
  const tabLabels = ['Stock IA', 'Deal', 'Ventes', 'Stats'];
  const tabNames = ['stock-ia', 'deal', 'ventes', 'stats'];

  for (let i = 0; i < tabLabels.length; i++) {
    const label = tabLabels[i];
    const name = tabNames[i];
    const tabIndex = i + 1;

    let clicked = false;

    // Strategy 1: button with exact/partial text match
    try {
      const btn = page.locator(`button`).filter({ hasText: label }).first();
      if (await btn.count() > 0) {
        await btn.click();
        clicked = true;
        console.log(`Clicked tab ${tabIndex} via text "${label}"`);
      }
    } catch (e) {}

    // Strategy 2: any element with that text
    if (!clicked) {
      try {
        await page.click(`text="${label}"`);
        clicked = true;
        console.log(`Clicked tab ${tabIndex} via text selector "${label}"`);
      } catch (e) {}
    }

    // Strategy 3: try partial text in any clickable element
    if (!clicked) {
      try {
        const el = page.locator(`[role="tab"]:has-text("${label}")`).first();
        if (await el.count() > 0) {
          await el.click();
          clicked = true;
          console.log(`Clicked tab ${tabIndex} via role=tab`);
        }
      } catch (e) {}
    }

    if (!clicked) {
      console.log(`WARNING: Could not click tab ${tabIndex} (${label})`);
    }

    await wait(2000);
    const filename = `tab${tabIndex}-${name}.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: true });
    console.log(`Screenshot ${filename} saved`);

    const tabText = await page.evaluate(() => document.body.innerText?.substring(0, 200));
    console.log(`Tab ${tabIndex} visible text:`, tabText.substring(0, 100));
  }

  // Step 8: Inspect styling of key elements
  console.log('\n--- Visual inspection ---');
  const styleInfo = await page.evaluate(() => {
    const results = {};

    // Go back to tab 0 first (Tableau)
    const tableauBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('Tableau'));
    if (tableauBtn) tableauBtn.click();

    // Topbar
    const topbar = document.querySelector('header') || document.querySelector('[class*="topbar"]') || document.querySelector('[class*="header"]') || document.querySelector('[class*="top-bar"]');
    if (topbar) {
      const s = window.getComputedStyle(topbar);
      results.topbar = { bg: s.background, bgColor: s.backgroundColor, backdropFilter: s.backdropFilter };
    }

    // Brand text
    const brand = Array.from(document.querySelectorAll('*')).find(el =>
      el.innerText?.trim() === 'Fill & Sell' && el.tagName !== 'BODY' && el.tagName !== 'HTML'
    );
    if (brand) {
      const s = window.getComputedStyle(brand);
      results.brandText = { color: s.color, background: s.background, webkitTextFillColor: s.webkitTextFillColor, tag: brand.tagName, class: brand.className };
    }

    return results;
  });
  console.log('Style info:', JSON.stringify(styleInfo, null, 2));

  await browser.close();
  console.log('\nDone. Screenshots in:', SCREENSHOTS_DIR);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
