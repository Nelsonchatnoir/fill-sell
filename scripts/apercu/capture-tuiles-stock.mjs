// Captures + contrôles des trois tuiles du haut du Stock (07/10/2026, lot TEXTES).
// Outil de relecture, jamais livré — même patron que capture-palier-louis.mjs.
//
//   APERCU_ETIQUETTE=avant node scripts/apercu/capture-tuiles-stock.mjs   (mesure seule)
//   node scripts/apercu/capture-tuiles-stock.mjs                          (après : contrôles)
//
// Serveur Vite avec le FAUX client Supabase (vite-stock-refonte.config.mjs) :
// aucune requête ne part vers la base, et playwright coupe en plus tout appel
// *.supabase.co et fillsell.app.
//
// Largeurs : 320 (iPhone SE 1re génération), 375 (iPhone SE 2e/3e génération),
// 390, 430 et 1280 (ordinateur). Deux modes : clair, et sombre — l'app n'a pas
// de thème sombre sur le Stock ; sur Android (thème DayNight, targetSdk 36) la
// WebView assombrit la page par algorithme : on l'imite avec le même moteur
// (Blink, forceDarkModeEnabled). Sur iOS, WKWebView n'assombrit rien : le
// sombre y est le clair.
//
// Ce qu'il PROUVE, sur l'APRÈS :
//   · les titres « Publier », « Republier », « À régler » et leurs sous-textes ;
//   · sous-texte plus petit que le titre, en italique, même style sur les 3 ;
//   · aucun texte coupé ni sorti de sa tuile, aucun débordement horizontal ;
//   · les trois tuiles ont la même hauteur ;
//   · « Publier plusieurs articles d'un coup » n'est plus là ; la
//     republication automatique et « Ajouter un article » sont toujours là.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ETIQUETTE = process.env.APERCU_ETIQUETTE || 'apres';
const APRES = ETIQUETTE === 'apres';
const SORTIE = path.join(RACINE, 'screenshots-review', 'tuiles-stock');
const PORT = 5216;
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/tuiles-stock.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => { if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 400)}` : ''}`); } };

const LARGEURS = [320, 375, 390, 430, 1280];
const ATTENDU = [
  { titre: 'Publier', sous: 'pas encore sur toutes les plateformes' },
  { titre: 'Republier', sous: 'fais remonter tes annonces' },
  { titre: 'À régler', sous: 'ventes à confirmer, infos manquantes, brouillons' },
];

// Les mesures des tuiles, d'un coup.
const mesurer = (page) => page.evaluate(() => {
  const tuiles = [...document.querySelectorAll('[data-zone="gestes"] > div > button')];
  const style = (el) => { const c = getComputedStyle(el); return { taille: parseFloat(c.fontSize), italique: c.fontStyle, graisse: c.fontWeight, interligne: c.lineHeight, couleur: c.color }; };
  return {
    largeurPage: document.documentElement.scrollWidth, largeurFenetre: window.innerWidth,
    lot: !!document.querySelector('[data-zone="lot"]'),
    repub: document.querySelector('[data-zone="repub"]')?.innerText ?? null,
    ajouter: document.querySelector('[data-zone="ajouter"]')?.innerText ?? null,
    tuiles: tuiles.map((t) => {
      const r = t.getBoundingClientRect();
      const enfants = [...t.children];
      const titre = enfants[1]; const sous = enfants[2];
      const cs = getComputedStyle(t);
      const basContenu = r.bottom - parseFloat(cs.paddingBottom);
      const rt = titre.getBoundingClientRect(); const rs = sous.getBoundingClientRect();
      const coupe = enfants.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => `${e.textContent} (${e.scrollWidth}>${e.clientWidth})`).join(' | ');
      // Le texte RÉEL (ses lignes), pas la boîte : un mot plus large que la
      // boîte en sort sans l'agrandir.
      const encre = (e) => { const g = document.createRange(); g.selectNodeContents(e); const rr = [...g.getClientRects()]; return { droite: Math.max(...rr.map((x) => x.right)), bas: Math.max(...rr.map((x) => x.bottom)) }; };
      const horsTuile = enfants.map(encre).some((x) => x.droite > r.right + 0.5 || x.bas > r.bottom + 0.5);
      return {
        aria: t.getAttribute('aria-label'), hauteur: r.height, largeur: r.width,
        titre: titre.textContent, sous: sous.textContent,
        styleTitre: style(titre), styleSous: style(sous),
        lignesSous: Math.round(rs.height / parseFloat(getComputedStyle(sous).lineHeight)),
        basTitre: rt.bottom, basSous: rs.bottom, basContenu, droiteSous: rs.right, droiteContenu: r.right - parseFloat(cs.paddingRight),
        coupe, horsTuile,
      };
    }),
  };
});

const lancer = (sombre) => chromium.launch({ channel: 'chrome', args: sombre ? ['--blink-settings=forceDarkModeEnabled=true'] : [] });
const resume = [];
for (const sombre of [false, true]) {
  const navigateur = await lancer(sombre);
  try {
    for (const largeur of LARGEURS) {
      for (const retraits of [false, true]) {
        if (retraits && (sombre || largeur !== 375)) continue; // la variante « retrait » : une fois, au plus étroit courant
        const mode = `${sombre ? 'sombre' : 'clair'}-${largeur}${retraits ? '-retraits' : ''}`;
        const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 700 }, deviceScaleFactor: 2, colorScheme: sombre ? 'dark' : 'light', locale: 'fr-FR' });
        await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e)));
        await page.goto(`${base}${retraits ? '?retraits=1' : ''}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
        await page.waitForTimeout(500);
        const haut = page.locator('[data-zone="haut"]');
        await haut.screenshot({ path: path.join(SORTIE, `${ETIQUETTE}-${mode}.png`) });
        const m = await mesurer(page);
        resume.push({ mode, hauteurs: m.tuiles.map((t) => t.hauteur), lignesSous: m.tuiles.map((t) => t.lignesSous), largeurTuile: Math.round(m.tuiles[0]?.largeur ?? 0) });

        verifier(erreurs.length === 0, `${mode} : aucune erreur de page`, erreurs.join(' | '));
        verifier(m.largeurPage <= m.largeurFenetre + 0.5, `${mode} : aucun débordement horizontal`, `${m.largeurPage} > ${m.largeurFenetre}`);
        verifier(m.tuiles.length === 3, `${mode} : trois tuiles`, m.tuiles.length);
        const h = m.tuiles.map((t) => t.hauteur);
        verifier(Math.max(...h) - Math.min(...h) < 0.5, `${mode} : les trois tuiles ont la même hauteur`, h.join(' / '));
        for (const t of m.tuiles) {
          verifier(!t.horsTuile, `${mode} : « ${t.titre} » — aucun texte hors de sa tuile`, JSON.stringify(t));
          // 320 px (iPhone SE 1re génération) : 59 px de texte par tuile ;
          // AVANT déjà, « Remonter » et « 15 » + icône y entraient dans la marge
          // intérieure. Contrôle strict (dans la marge de 16 px) dès 375 px.
          if (largeur < 375) continue;
          verifier(!t.coupe, `${mode} : « ${t.titre} » — aucun texte coupé`, t.coupe);
          verifier(t.basSous <= t.basContenu + 0.5, `${mode} : « ${t.titre} » — le sous-texte tient dans la tuile`, `bas ${t.basSous} > ${t.basContenu}`);
          verifier(t.droiteSous <= t.droiteContenu + 0.5, `${mode} : « ${t.titre} » — le sous-texte ne déborde pas à droite`, `${t.droiteSous} > ${t.droiteContenu}`);
        }
        if (APRES) {
          ATTENDU.forEach((a, i) => {
            const t = m.tuiles[i];
            verifier(t?.titre === a.titre, `${mode} : titre de la tuile ${i + 1} = « ${a.titre} »`, t?.titre);
            const sousAttendu = retraits && i === 2 ? 'annonces à retirer' : a.sous;
            verifier(t?.sous === sousAttendu, `${mode} : sous-texte de la tuile ${i + 1} = « ${sousAttendu} »`, t?.sous);
          });
          const s = m.tuiles.map((t) => t.styleSous);
          verifier(m.tuiles.every((t) => t.styleSous.taille < t.styleTitre.taille), `${mode} : sous-texte plus petit que le titre`, JSON.stringify(m.tuiles.map((t) => [t.styleTitre.taille, t.styleSous.taille])));
          verifier(s.every((x) => x.italique === 'italic'), `${mode} : sous-texte en italique`, JSON.stringify(s));
          verifier(s.every((x) => x.taille === s[0].taille && x.italique === s[0].italique && x.graisse === s[0].graisse && x.interligne === s[0].interligne), `${mode} : même style de sous-texte sur les 3 tuiles`, JSON.stringify(s));
          verifier(/^Republier : /.test(m.tuiles[1]?.aria ?? ''), `${mode} : la tuile 2 se lit « Republier » au lecteur d’écran`, m.tuiles[1]?.aria);
          verifier(!m.lot, `${mode} : « Publier plusieurs articles d’un coup » n’est plus sur l’écran`);
        }
        verifier(/Republication automatique/.test(m.repub ?? ''), `${mode} : « Republication automatique » toujours là`, m.repub);
        verifier(/Ajouter un article/.test(m.ajouter ?? ''), `${mode} : « Ajouter un article » toujours là`, m.ajouter);
        await ctx.close();
      }
    }
  } finally {
    await navigateur.close();
  }
}
stop();
console.table(resume);
console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `aperçu tuiles du Stock (${ETIQUETTE}) : ${ok} vérifications passées — captures dans screenshots-review/tuiles-stock/`);
process.exit(ko ? 1 : 0);
