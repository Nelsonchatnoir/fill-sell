import puppeteer from "puppeteer";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";

const TEXT = {
  fr: {
    lang: "fr",
    tagline: 'Photo. <span class="hl">IA.</span> Vendu partout.',
    sub: "L'assistant IA des revendeurs — scanne un article, l'IA le price et le rédige, tu publies partout.",
    posts: "Publie sur",
    scan: "⚡ Fiche prête",
    pricek: "Prix conseillé",
  },
  en: {
    lang: "en",
    tagline: 'Snap. <span class="hl">AI.</span> Sold everywhere.',
    sub: "The reseller's AI assistant — scan an item, AI prices & writes it, you post everywhere.",
    posts: "Posts to",
    scan: "⚡ Listing ready",
    pricek: "Suggested price",
  },
};

const tpl = readFileSync("C:/Users/nicol/fill-and-sell/marketing/fs-feature-graphic.html", "utf8");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });

for (const [lng, t] of Object.entries(TEXT)) {
  const html = tpl
    .replace("__LANG__", t.lang)
    .replace("__TAGLINE__", t.tagline)
    .replace("__SUB__", t.sub)
    .replace("__POSTS__", t.posts)
    .replace("__SCAN__", t.scan)
    .replace("__PRICEK__", t.pricek);
  const tmp = `C:/Users/nicol/fill-and-sell/marketing/_render-${lng}.html`;
  writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 2 });
  await page.goto("file://" + tmp, { waitUntil: "networkidle0", timeout: 20000 });
  await new Promise(r => setTimeout(r, 1200)); // font settle
  const el = await page.$(".banner");
  const buf = await el.screenshot({ type: "png" }); // 2048x1000
  // downscale to exact 1024x500, flatten to opaque (no alpha), 24-bit
  await sharp(buf)
    .resize(1024, 500)
    .flatten({ background: "#EDEAE0" })
    .png()
    .toFile(`C:/Users/nicol/fill-and-sell/assets/store-play/feature-graphic-${lng}.png`);
  await page.close();
  console.log("wrote feature-graphic-" + lng + ".png");
}
await browser.close();
