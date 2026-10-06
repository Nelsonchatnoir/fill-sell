// Captures + mesures de l'encart « Bientôt : FillSell Cloud » (06/10/2026).
// Outil de relecture, jamais livré — même patron que capture-cloud.mjs.
//
//   node scripts/apercu/capture-encart-cloud.mjs
//
// La VRAIE feuille des offres, compte ordinaire, faux client Supabase (aucune
// requête vers la base ; playwright coupe en plus *.supabase.co et
// fillsell.app). Chrome installé, profil VIERGE et temporaire.
// Les assertions ont été écrites avant de regarder les captures :
//   · l'encart est rendu SOUS les cartes, pour le compte sans option ; masqué
//     pour le compte qui a l'option ;
//   · à 360 × 640, le premier bouton d'abonnement est EXACTEMENT à la même
//     place avec et sans l'encart (rien n'est poussé, aucun défilement de plus
//     pour l'atteindre) ; idem pour tous les boutons d'abonnement ;
//   · rien ne déborde à l'horizontale ; aucun élément cliquable dans l'encart ;
//   · ses textes passent 4,5:1 sur leur fond réel ;
//   · clair et sombre : la feuille n'a pas de thème sombre, l'encart la suit
//     (mêmes couleurs dans les deux) — vérifié, pas supposé.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5211;
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-encart-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' });
      // npx garde vite en petit-enfant : on ferme aussi qui écoute le port.
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      for (const l of net.split(/\r?\n/)) if (new RegExp(`:${PORT}\\s.*LISTENING`).test(l)) spawnSync('taskkill', ['/pid', l.trim().split(/\s+/).pop(), '/f', '/t'], { stdio: 'ignore' });
    } else serveur.kill();
  } catch { /* déjà arrêté */ }
};
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/encart-cloud.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0;
const ok = (c, m, d) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 400)}` : ''}`); } };

// Mesures DANS la page : positions des boutons d'abonnement, l'encart, le
// débordement, et le contraste de chaque texte de l'encart sur son fond réel.
const MESURES = () => {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const ratio = (el) => { const a = lum(parse(getComputedStyle(el).color)); const b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const boutons = [...document.querySelectorAll('button')].filter((b) => /^(Passer|Go) (Premium|Pro|Business)/.test(b.textContent.trim()));
  const encart = document.querySelector('[data-encart-cloud-bientot]');
  const feuille = encart?.closest('[style*="overflow-y"]') || document.querySelector('div[style*="max-height"]');
  const textes = encart ? [...encart.querySelectorAll('span, p')].filter((e) => e.childElementCount === 0 && e.textContent.trim()) : [];
  return {
    boutons: boutons.map((b) => ({ t: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), bas: Math.round(b.getBoundingClientRect().bottom) })),
    encart: encart ? { top: Math.round(encart.getBoundingClientRect().top), hauteur: Math.round(encart.getBoundingClientRect().height), cliquables: encart.querySelectorAll('button,a,input,select,textarea,[role=button],[tabindex]').length, deborde: encart.scrollWidth > encart.clientWidth + 1 } : null,
    hauteurFeuille: feuille ? feuille.scrollHeight : null,
    debordePage: document.documentElement.scrollWidth > window.innerWidth + 1,
    contrastes: textes.map((e) => ({ t: e.textContent.trim().slice(0, 30), r: Math.round(ratio(e) * 100) / 100 })),
    couleurs: encart ? { fond: getComputedStyle(encart).backgroundColor, texte: getComputedStyle(encart.querySelector('p')).color } : null,
    feuilleFond: feuille ? getComputedStyle(feuille).backgroundColor : null,
  };
};

const nav = await chromium.launch({ channel: 'chrome', headless: true });
const resultats = {};
try {
  const ecrans = [
    { nom: 'petit', vp: { width: 360, height: 640 } },
    { nom: 'grand', vp: { width: 1280, height: 800 } },
  ];
  for (const e of ecrans) {
    for (const schema of ['light', 'dark']) {
      for (const lang of e.nom === 'petit' && schema === 'light' ? ['fr', 'en'] : ['fr']) {
        const ctx = await nav.newContext({ viewport: e.vp, deviceScaleFactor: 2, colorScheme: schema, locale: lang === 'en' ? 'en-GB' : 'fr-FR' });
        await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
        const page = await ctx.newPage();
        const cle = `${e.nom}-${schema === 'light' ? 'clair' : 'sombre'}${lang === 'en' ? '-en' : ''}`;
        // 1. Le compte qui a l'option : la feuille d'avant (référence).
        await page.goto(`${base}?profil=cloud&palier=free&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForSelector('button:has-text("Premium")', { timeout: 120000 });
        await page.waitForTimeout(800);
        const sans = await page.evaluate(MESURES);
        // 2. Le compte sans option : l'encart.
        await page.goto(`${base}?profil=libre&palier=free&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForSelector('[data-encart-cloud-bientot]', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
        const avec = await page.evaluate(MESURES);
        resultats[cle] = { sans, avec };
        ok(sans.encart === null, `${cle} : compte qui a l’option → pas d’encart`);
        ok(avec.encart !== null, `${cle} : compte sans option → encart montré`);
        ok(JSON.stringify(avec.boutons) === JSON.stringify(sans.boutons) && avec.boutons.length >= 1,
          `${cle} : boutons d’abonnement à la MÊME place avec et sans l’encart (${avec.boutons.map((b) => `${b.t} @${b.top}px`).join(', ')})`,
          `${JSON.stringify(sans.boutons)} ≠ ${JSON.stringify(avec.boutons)}`);
        if (avec.encart) {
          ok(avec.boutons.every((b) => b.bas <= avec.encart.top), `${cle} : l’encart est SOUS tous les boutons d’abonnement`);
          ok(avec.encart.cliquables === 0, `${cle} : rien de cliquable dans l’encart`);
          ok(!avec.encart.deborde && !avec.debordePage, `${cle} : aucun débordement horizontal`);
          ok(avec.contrastes.length >= 3 && avec.contrastes.every((c) => c.r >= 4.5), `${cle} : contrastes ≥ 4,5:1 (${avec.contrastes.map((c) => `${c.t.slice(0, 14)} ${c.r}`).join(' · ')})`);
        }
        // Capture du haut (boutons) puis de l'encart, la feuille défilée jusqu'à lui.
        await page.screenshot({ path: path.join(SORTIE, `encart-cloud-${cle}-haut.png`) });
        await page.evaluate(() => document.querySelector('[data-encart-cloud-bientot]')?.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SORTIE, `encart-cloud-${cle}.png`) });
        await ctx.close();
      }
    }
  }
  const c = resultats['petit-clair'].avec.couleurs; const s = resultats['petit-sombre'].avec.couleurs;
  ok(JSON.stringify(c) === JSON.stringify(s) && resultats['petit-clair'].avec.feuilleFond === resultats['petit-sombre'].avec.feuilleFond,
    'sombre : la feuille n’a pas de thème sombre, l’encart la suit (mêmes couleurs que le clair)', `${JSON.stringify(c)} / ${JSON.stringify(s)}`);
  const p = resultats['petit-clair'];
  console.log(`\n  360×640 : 1er bouton d’abonnement top = ${p.sans.boutons[0]?.top}px sans encart, ${p.avec.boutons[0]?.top}px avec ; encart top = ${p.avec.encart?.top}px, hauteur ${p.avec.encart?.hauteur}px ; hauteur de la feuille ${p.sans.hauteurFeuille} → ${p.avec.hauteurFeuille}px`);
  fs.writeFileSync(path.join(SORTIE, 'encart-cloud-mesures.json'), JSON.stringify(resultats, null, 2));
} finally {
  await nav.close();
  stop();
}
console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
