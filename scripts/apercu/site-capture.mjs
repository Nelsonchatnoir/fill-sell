// ═══════════════════════════════════════════════════════════════════════════
// CAPTURES DE L'APP POUR LE SITE VITRINE (chantier SEO — refait le 09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil, jamais livré. Monte les VRAIS composants de src/ (harnais site-*.html)
// avec le compte de DÉMONSTRATION « Camille » (site-donnees-demo.js), joue les
// vrais gestes (jamais un bouton de confirmation), contrôle chaque écran, écrit
// les PNG et leur fiche (captures.json) dans site/medias/captures/.
//
//     node scripts/apercu/site-capture.mjs
//     APERCU_PORT=5231 APERCU_DEJA_LANCE=1 node scripts/apercu/site-capture.mjs   (Vite déjà servi)
//     node scripts/apercu/site-capture.mjs accueil lens   (seulement ces captures)
//     EXTENSION_COMMIT=9d442ae node scripts/apercu/site-capture.mjs extension extension-seul
//
// L'HEURE : l'horloge du navigateur est fixée à HORLOGE_DEMO (un vendredi de
// fin octobre) : « ce mois » est un mois presque entier, et deux passages,
// n'importe quel jour, donnent les mêmes images.
//
// Ce qu'il PROUVE, pour chaque image :
//   · aucune erreur de page ;
//   · le texte attendu est là (en français) ; aucun mot interdit (Opla,
//     Cloud, prénom ou pseudo réel, texte de mise au point, « undefined »,
//     « NaN »…) ; aucun logo Opla ;
//   · Depop présent (texte ou logo) DANS l'image, là où il est prévu ;
//   · aucun chiffre de quota ni de plafond ; aucun palier (Pro, Premium,
//     Business) dans l'image ; jamais « 4 plateformes » ; jamais eBay sur la
//     ligne de republication automatique ;
//   · aucun défilement horizontal ; toutes les images visibles sont chargées ;
//   · aucune requête n'est partie vers la base, fillsell.app ou une
//     plateforme (tout ce qui n'est pas local ou Google Fonts est coupé, et
//     compté) ; aucune écriture tentée (faux client Supabase) ;
//   · popup : la version de l'extension lue dans git (EXTENSION_COMMIT),
//     jamais dans chrome-extension/ (qui n'est pas touché) ;
//   · les textes alternatifs citent les chiffres LUS sur l'écran.
// Et il AVERTIT (sans échouer) quand l'app ne nomme pas toutes les plateformes
// de PLATEFORMES_REPUBLICATION_AUTO sur la ligne « Republication automatique ».
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Les chiffres du compte se calculent à l'heure de Paris, comme dans la page.
process.env.TZ = 'Europe/Paris';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEMO = await import(pathToFileURL(path.join(RACINE, 'scripts', 'apercu', 'site-donnees-demo.js')).href);
const { donneesDemo, chiffresDemo, HORLOGE_DEMO, PLATEFORMES_REPUBLICATION_AUTO, listeNoms, NOMS_PF } = DEMO;

const SORTIE = path.join(RACINE, 'site', 'medias', 'captures');
const PORT = Number(process.env.APERCU_PORT || 5231);
const DEJA = !!process.env.APERCU_DEJA_LANCE;
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu`;
// 0.6.105 (8f88cdd) : la première version de l'extension qui connaît Depop
// (zip build/CWS-0.6.105-A-TELEVERSER, à téléverser). La 0.6.106 (9d442ae)
// la contient aussi. ⚠️ Une capture du popup ne se publie qu'une fois cette
// version SERVIE par le Chrome Web Store.
const COMMIT_EXTENSION = process.env.EXTENSION_COMMIT || '8f88cdd';
const SEULES = process.argv.slice(2);
fs.mkdirSync(SORTIE, { recursive: true });

// ── Le compte de démonstration, calculé ici comme dans la page ─────────────
const T0 = Date.parse(HORLOGE_DEMO);
const D = donneesDemo(T0);
const C = chiffresDemo(D, T0);
const nbFr = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/\s/g, ' ');
const nbEn = (n) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n);
// Un montant tel que l'app l'écrit (« 1 268,00 € »), espaces de toutes sortes acceptés.
const reMontant = (n) => new RegExp(`${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s?')},00\\s€`);
const NOMS_AUTO_FR = listeNoms(PLATEFORMES_REPUBLICATION_AUTO, 'fr');

// ── Le serveur ──────────────────────────────────────────────────────────────
let serveur = null;
const stop = () => { if (!serveur) return; try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } serveur = null; };
process.on('exit', stop);
if (!DEJA) {
  serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
}
{
  const fin = Date.now() + 300000;
  let ok = false;
  while (Date.now() < fin) { try { if ((await fetch(`${BASE}/site-app.html`)).ok) { ok = true; break; } } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
  if (!ok) { console.error('Vite ne répond pas'); process.exit(1); }
}

// ── Les fichiers de l'extension, lus dans git (aucune écriture) ─────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const cacheGit = new Map();
function fichierExtension(rel) {
  if (!cacheGit.has(rel)) {
    try { cacheGit.set(rel, execFileSync('git', ['show', `${COMMIT_EXTENSION}:chrome-extension/${rel}`], { cwd: RACINE, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); }
    catch { cacheGit.set(rel, null); }
  }
  return cacheGit.get(rel);
}
const VERSION_EXTENSION = JSON.parse(fichierExtension('manifest.json')?.toString('utf8') ?? '{"version":"?"}').version;

// ── Contrôles ───────────────────────────────────────────────────────────────
const echecs = [];
const avertissements = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 300)}`}`); if (!cond) echecs.push(quoi); return !!cond; };
const avertir = (quoi) => { console.log(`  ⚠ ${quoi}`); avertissements.push(quoi); };
const INTERDITS = /\b(Opla|Cloud|Nico|nelson\w*|nicsvob\w*|undefined|NaN|null|TODO|DEBUG|Lorem)\b|\[object|aper[çc]u|APERCU|faux-supabase|écriture refusée/i;
// Aucun chiffre de quota ni de plafond, nulle part.
const QUOTAS = /annonces? restantes?|sans maximum|le palier \w+ permet|maximum du palier|quota|plafond|par jour, le maximum|il en reste \d|\d+\s*sur\s*\d+\s*ce mois|Ce mois\s*\d+\s*sur\s*\d+|lot de 20|20 articles au plus|Plus d['’]annonce ce mois/i;
// Aucun palier (la republication automatique existe à tous les paliers).
const PALIERS = /\b(Pro|PRO|Premium|PREMIUM|Business|BUSINESS)\b/;
const QUATRE_PF = /\b4 plateformes\b|quatre plateformes|\b4 marketplaces\b/i;
const filtreErreurs = (liste) => liste.filter((x) => !/favicon|Download the React DevTools|fonts\.g/.test(x));

async function attendrePret(page, frame = page) {
  await frame.waitForFunction(() => window.__pret === true, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1200);
  // Toutes les images visibles doivent être décodées.
  await page.waitForFunction(() => [...document.images].filter((i) => i.offsetParent).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** Le texte de la page ET de ses cadres. */
async function texteDe(page) {
  const morceaux = [];
  for (const f of page.frames()) morceaux.push(await f.locator('body').innerText().catch(() => ''));
  return morceaux.join('\n');
}
/**
 * Le texte DANS l'image : feuilles dans la zone capturée (fenêtre, découpe ou
 * élément) ET au premier plan — un texte recouvert (par la barre d'onglets,
 * une feuille, son voile) ne compte pas : document.elementFromPoint, en trois
 * points de la ligne. Cadres compris. Les noms des logos (alt, aria-label)
 * sont rendus entre crochets : « [Depop] ».
 */
async function texteImage(page, zone = null) {
  const morceaux = [];
  const cadre = await page.evaluate(() => { const r = document.querySelector('iframe')?.getBoundingClientRect(); return r ? { x: r.left, y: r.top } : { x: 0, y: 0 }; });
  for (const f of page.frames()) {
    const dec = f === page.mainFrame() ? { x: 0, y: 0 } : cadre;
    morceaux.push(await f.evaluate(([z, d]) => {
      const W = window.innerWidth; const H = window.innerHeight;
      // Sans découpe : la fenêtre du HAUT (un cadre plus haut qu'elle sort de l'image).
      const haut = z ? z.y - d.y : 0; const bas = z ? z.y + z.height - d.y : Math.min(H, window.top.innerHeight - d.y);
      const devant = (e) => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || r.bottom <= haut + 2 || r.top >= bas - 2) return false;
        const y = Math.min(Math.max((r.top + r.bottom) / 2, haut + 1, 1), bas - 1, H - 1);
        return [r.left + 2, (r.left + r.right) / 2, r.right - 2].some((x0) => {
          const x = Math.min(Math.max(x0, 1), W - 1);
          const h = document.elementFromPoint(x, y);
          return !!h && (h === e || e.contains(h) || h.contains(e));
        });
      };
      const out = [];
      for (const e of document.querySelectorAll('body *')) {
        if (!e.getClientRects().length) continue;
        if (e.matches('img[alt], svg') && !e.parentElement?.closest('svg')) {
          // Le nom d'un logo : alt, aria-label, ou le <title> du SVG (Vinted, eBay).
          const nom = e.getAttribute('alt') ?? e.getAttribute('aria-label') ?? (e.matches('svg') ? e.querySelector(':scope > title')?.textContent : null);
          if (nom != null && devant(e)) out.push(`[${nom}]`);
          continue;
        }
        if (e.closest('svg')) continue;
        if (e.children.length === 0 && e.textContent.trim() && devant(e)) out.push(e.textContent.trim());
      }
      return out.join('\n');
    }, [zone, dec]).catch((x) => `⟦texte illisible : ${x}⟧`));
  }
  return morceaux.join('\n');
}
async function imagesCassees(page) {
  const out = [];
  for (const f of page.frames()) {
    out.push(...await f.evaluate(() => [...document.images].filter((i) => i.offsetParent && i.getBoundingClientRect().width > 0 && (!i.complete || i.naturalWidth === 0)).map((i) => i.src.slice(0, 120))).catch(() => []));
  }
  return out;
}
async function logosOpla(page) {
  let n = 0;
  for (const f of page.frames()) n += await f.evaluate(() => [...document.querySelectorAll('img[alt], [aria-label], img[src]')].filter((e) => /opla/i.test(`${e.getAttribute('alt') ?? ''} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('src') ?? ''}`) && e.getClientRects().length).length).catch(() => 0);
  return n;
}

// Cliquer un bouton par son texte (le VRAI geste) — jamais un bouton de confirmation.
async function cliquer(page, re, re2 = null) {
  const ok = await page.evaluate(([s1, f1, s2, f2]) => {
    const r1 = new RegExp(s1, f1); const r2 = s2 ? new RegExp(s2, f2) : null;
    const b = [...document.querySelectorAll('button,[role=button]')].find((e) => r1.test(e.textContent.trim()) && (!r2 || r2.test(e.textContent)) && e.offsetParent);
    if (!b) return false;
    b.click();
    return true;
  }, [re.source, re.flags, re2?.source ?? null, re2?.flags ?? '']);
  await page.waitForTimeout(1200);
  return ok;
}
// Amener l'élément dont le texte correspond en haut de SA zone qui défile.
async function defiler(page, re, marge = 12) {
  const ok = await page.evaluate(([src, drapeaux, m]) => {
    const r = new RegExp(src, drapeaux);
    const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && r.test(e.textContent.trim()) && e.getClientRects().length);
    if (!el) return false;
    let n = el.parentElement;
    while (n && !(n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
    const cont = n ?? document.scrollingElement;
    // L'en-tête de l'app (.topbar, translucide) recouvre le haut de la zone qui
    // défile : l'élément doit apparaître SOUS lui.
    const tb = document.querySelector('.topbar');
    const haut = Math.max(n ? n.getBoundingClientRect().top : 0, tb ? tb.getBoundingClientRect().bottom : 0);
    cont.scrollTop += el.getBoundingClientRect().top - haut - m;
    return true;
  }, [re.source, re.flags, marge]);
  await page.waitForTimeout(700);
  return ok;
}
// La ligne « Republication automatique » visible : son sous-titre (« Active sur … »).
const ligneAuto = (txt) => (txt.match(/Republication automatique\s*\n\s*(Active sur [^\n]+|Chaque jour[^\n]*)/) ?? [])[1] ?? null;
const nomsDeLaLigne = (ligne) => (ligne ?? '').replace(/^Active sur /, '').replace(/…$/, '').split(/,\s*|\s+et\s+/).map((s) => s.trim()).filter(Boolean);
const versAnglais = (ligne) => (ligne ?? '').replace(/^Active sur /, 'on for ').replace(/ et /g, ' and ');

// ── LES TEXTES DE LA FICHE ──────────────────────────────────────────────────
// La mention visible près de chaque capture chiffrée (fiche de vérité § 16.2) — jamais dans l'image.
const MENTION_FR = 'Compte de démonstration, chiffres fictifs. Ce n’est ni le résultat d’un client ni une promesse de gains.';
const MENTION_EN = 'Demo account, illustrative figures. Not a customer’s results and no promise of earnings.';
const SOURCE_DONNEES = `Compte de démonstration « Camille » (scripts/apercu/site-donnees-demo.js, générateur à graine fixe, horloge fixée au ${HORLOGE_DEMO}) : aucune donnée réelle, aucun pseudo, aucune adresse, aucun numéro d’annonce réel, aucun chiffre de Nico.`;

// ── LES CAPTURES ────────────────────────────────────────────────────────────
// ecran : numéro de l'écran visé (1 → 10). depop : Depop doit être DANS l'image.
// alt(x) reçoit { texte, image, ligne } (texte de la page, texte de l'image,
// ligne de republication automatique) : les chiffres cités sont ceux de l'écran.
const TEL = { largeur: 390, hauteur: 844, dsf: 3 };
const MANQUE = '⟦?⟧'; // un chiffre que l'écran ne montre pas : le contrôle des textes alternatifs le refuse
const lire = (txt, re, defaut = MANQUE) => (txt.match(re) ?? [])[1]?.replace(/\s/g, ' ').trim() ?? defaut;
const margeMoy = (txt) => lire(txt, /MARGE MOY\.\s*\n\s*([\d.,]+\s?%)/i);
// En français : virgule et espace (l'app écrit « 68.5% »).
const pctFr = (x) => x.replace('.', ',').replace(/\s?%$/, ' %');
const CAPTURES = [
  {
    cle: 'accueil', ecran: '1 · Tableau d’accueil', fichier: 'accueil-tableau-de-bord.png', url: 'site-app.html?ecran=accueil',
    attendu: [/Bonjour Camille/, /Profit net/i, reMontant(C.benefice), new RegExp(`${C.nbVentes} ventes depuis le début`), reMontant(C.mois.benefice), new RegExp(`${C.mois.n} ventes`), reMontant(C.ca), /EN STOCK/i, new RegExp(`\\b${C.nbStock}\\b`), reMontant(C.investiStock)],
    alt: ({ texte }) => ({
      fr: `Écran d'accueil de l'app FillSell sur téléphone : « Bonjour Camille », un profit net de ${nbFr(C.benefice)} € depuis le début (${C.nbVentes} ventes) avec sa courbe qui monte, puis quatre tuiles : ${nbFr(C.mois.benefice)} € de profit ce mois-ci sur ${C.mois.n} ventes, une marge moyenne de ${pctFr(margeMoy(texte))}, ${nbFr(C.ca)} € de revenu brut et ${C.nbStock} articles en stock (${nbFr(C.investiStock)} € immobilisés).`,
      en: `FillSell app home screen on a phone: "Bonjour Camille", €${nbEn(C.benefice)} net profit all-time (${C.nbVentes} sales) with a rising trend line, then four tiles: €${nbEn(C.mois.benefice)} profit this month from ${C.mois.n} sales, a ${margeMoy(texte)} average margin, €${nbEn(C.ca)} gross revenue and ${C.nbStock} items in stock (€${nbEn(C.investiStock)} tied up).`,
    }),
    composants: ['src/tabs/DashboardTab.jsx', 'coquille recopiée d’App.jsx (site-coquille.jsx : BrandMark, barre d’onglets ; ni compteur d’annonces ni pastille de palier)'],
    donnees: `${C.nbVentes} ventes sur six mois dont ${C.mois.n} ce mois-ci (${Object.entries(C.mois.parPlateforme).map(([p, x]) => `${p} ${x.n}`).join(', ')}), ${C.nbStock} articles en stock. Le tableau d’accueil n’affiche aucune plateforme (Depop compris).`,
    logos: [],
  },
  {
    cle: 'lens-photo', ecran: '2 · Lens : la photo, avant l’analyse', fichier: 'lens-scan-photo.png', url: 'site-app.html?ecran=lens-photo',
    attendu: [/Scanne\./, /On gère le reste\./, /1 photo ajoutée/, /Estimer et créer l’annonce|Estimer et créer l'annonce/],
    alt: () => ({
      fr: "L'écran Lens de FillSell avant l'analyse : « Scanne. On gère le reste. — Une photo suffit. Fiche, prix et description générés pour chacune de tes plateformes. », le gros bouton appareil photo, « 1 photo ajoutée » (la vignette d'un t-shirt Picture gris), un champ de note avec micro et le bouton « Estimer et créer l'annonce ».",
      en: 'The FillSell Lens screen before analysis: "Scanne. On gère le reste." (scan, we handle the rest — one photo is enough; listing, price and description generated for each of your marketplaces), the large camera button, "1 photo added" (a grey Picture T-shirt thumbnail), a note field with a microphone and the "estimate and create the listing" button.',
    }),
    composants: ['src/tabs/LensTab.jsx (LensTab, LensScanHome)', 'coquille recopiée d’App.jsx'],
    donnees: 'Une photo de démonstration (public/landing/tshirt-ours.webp), aucune analyse lancée.',
    logos: [],
  },
  {
    cle: 'lens', ecran: '2 · Lens : analyse photo', fichier: 'lens-analyse-photo.png', url: 'site-app.html?ecran=lens',
    attendu: [/Résultat du scan/i, /T-shirt Picture gris/, /Très bon état/, /Lu sur l.objet/i, /Taille/, /prix de vente conseillé/, /basé sur 5 annonces/],
    alt: () => ({
      fr: "Résultat d'un scan Lens dans l'app FillSell : l'article reconnu (« T-shirt Picture gris imprimé ours « Climate Change » », marque Picture), la description rédigée, les pastilles Très bon état, Gris chiné, Coton, Mode, ce qui a été lu sur l'objet (motif, coupe, taille S sur l'étiquette du col, composition, saison), puis le prix de vente conseillé de 14 €, une marge jugée excellente (+10 €) et la base du prix : 5 annonces comparables, de 12 € à 16 €.",
      en: 'A Lens scan result in the FillSell app: the recognised item ("T-shirt Picture gris imprimé ours « Climate Change »", brand Picture), the written description, the tags very good condition, grey marl, cotton, fashion, what was read on the item (print, cut, size S on the neck label, composition, season), then a suggested selling price of €14, a margin rated excellent (+€10) and what the price is based on: 5 comparable listings, €12 to €16.',
    }),
    composants: ['src/tabs/LensTab.jsx (LensTab, LensAnalysisResult)', 'src/components/LensIdentite.jsx', 'src/components/AnalyseMarche.jsx', 'coquille recopiée d’App.jsx'],
    donnees: 'Résultat Lens de démonstration (forme de lens-analysis) pour public/landing/tshirt-ours.webp ; 5 annonces comparables inventées (aucune URL). L’encart « Ton annonce est prête » (qui dit « 4 plateformes », en dur dans src/tabs/LensTab.jsx:1084) reste sous la barre d’onglets.',
    logos: [],
  },
  {
    cle: 'ou-publier', ecran: '3 · Fiche article et choix des plateformes', fichier: 'publication-choix-plateformes.png', url: 'site-publication.html?ecran=ou-publier', depop: true,
    attendu: [/Où publier \?/, /T-shirt Picture gris/, /Vinted/, /Leboncoin/, /eBay/, /Beebs/, /Depop/, /Part de nos serveurs, sans l'extension/, /Continuer · 5 plateformes/, /Rien ne part encore/],
    alt: () => ({
      fr: "Étape 1 sur 3 de la publication dans FillSell, « Où publier ? » : la fiche du t-shirt Picture gris (Très bon état, 14 €) et cinq plateformes cochées — Vinted, Leboncoin, Beebs et Depop « Connectée », eBay « Part de nos serveurs, sans l'extension » (compte relié par l'API) — puis le choix des photos (Retouche IA ou Telles quelles) et le bouton « Continuer · 5 plateformes ». Mention : « Rien ne part encore. Tu vérifies à l'écran suivant. »",
      en: 'Step 1 of 3 of publishing in FillSell, "Où publier ?" (where to publish): the grey Picture T-shirt card (very good condition, €14) and five ticked marketplaces — Vinted, Leboncoin, Beebs and Depop "Connectée" (connected), eBay "Part de nos serveurs, sans l\'extension" (sent from FillSell\'s servers through the linked account) — then the photo choice (AI touch-up or as they are) and the "Continuer · 5 plateformes" button. Note: nothing goes out yet, you check on the next screen.',
    }),
    composants: ['src/publication/StepperNouveau.jsx', 'src/publication/EcranOuPublier.jsx', 'moteur en dur au contrat de ListingPreviewScreen (plateformes affichées = PLATFORMS_DEFAULT + Depop « à venir » ouverte)'],
    donnees: 'Article de démonstration « T-shirt Picture gris « Climate Change » » (14 €), annonce déjà rédigée par Lens ; cinq plateformes connectées, eBay relié. Depop n’est jamais précochée par l’app : la case cochée est le geste de Camille.',
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'eBay', 'Depop'],
  },
  {
    cle: 'verifier', ecran: '3 · Fiche article : ce qui va partir', fichier: 'publication-verification-annonces.png', url: 'site-publication.html?ecran=verifier', depop: true,
    gestes: async (page) => defiler(page, /^ÉTAT$/i, 8),
    attendu: [/Ce qui va partir/, /VINTED|Vinted/, /LEBONCOIN|Leboncoin/, /EBAY|eBay/, /BEEBS|Beebs/, /DEPOP|Depop/, /Prêt/],
    alt: () => ({
      fr: "Étape 2 sur 3 de la publication, « Ce qui va partir » : l'état de l'article (Très bon état) appliqué à toutes les plateformes, puis une carte par plateforme, chacune avec son rayon, son état, son prix de 14 € et la mention « Prêt » — Vinted (Hommes › … › T-shirts), Leboncoin (Mode › Vêtements), Beebs (Mode › … › T-shirts), eBay (Vêtements, accessoires › … › T-shirts) et Depop (Homme › … › T-shirts, sans titre : chez Depop, la description fait l'annonce).",
      en: 'Step 2 of 3 of publishing, "Ce qui va partir" (what will go out): the item condition (very good) applied to every marketplace, then one card per marketplace, each with its category, condition, €14 price and a "Prêt" (ready) label — Vinted (Men › … › T-shirts), Leboncoin (Fashion › Clothing), Beebs (Fashion › … › T-shirts), eBay (Clothing, accessories › … › T-shirts) and Depop (Men › … › T-shirts, no title: on Depop the description is the listing).',
    }),
    composants: ['src/publication/StepperNouveau.jsx', 'src/publication/EcranVerifier.jsx', 'src/components/ListingPreviewScreen.jsx (cartes par plateforme)'],
    donnees: 'Même article ; rayons par plateforme plausibles (Depop : menswear/tops/tshirts, chemin lu dans src/utils/arbres/depopFeuilles.js).',
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'eBay', 'Depop'],
  },
  {
    cle: 'lot', ecran: '4 · Publication en lot', fichier: 'publication-en-lot.png', url: 'site-publication.html?ecran=lot-plateformes', depop: true,
    attendu: [/Publier 5 articles/, /Où les publier \?/i, /Déjà en ligne pour tous/, /Depop/, /annonces à créer/, /Préparer \d+ annonces/],
    alt: ({ texte }) => ({
      fr: `Publication en lot dans FillSell, étape 1 sur 3 : cinq articles choisis dans le stock (sweat Öhlins, casquette Volcom, t-shirt Picture, short Polo Ralph Lauren, bottines Cyrillus), « Chacun part là où il n'est pas encore ». Vinted est grisée (« Déjà en ligne pour tous »), Leboncoin, eBay et Depop sont cochées avec, pour chacune, le nombre d'articles à publier et ceux qui y sont déjà, Beebs reste décochée ; « ${lire(texte, /(\d+) annonces à créer/)} annonces à créer », « Avec ton ordinateur allumé : ${lire(texte, /allumé\s*:\s*(≈[^,]+),/)}, une annonce après l'autre ».`,
      en: `Batch publishing in FillSell, step 1 of 3: five items picked from stock (Öhlins hoodie, Volcom cap, Picture T-shirt, Polo Ralph Lauren shorts, Cyrillus boots), each going "where it isn't yet". Vinted is greyed out ("already live for all"), Leboncoin, eBay and Depop are ticked, each showing how many items will be listed and how many are already there, Beebs stays unticked; "${lire(texte, /(\d+) annonces à créer/)} listings to create", "with your computer on: ${lire(texte, /allumé\s*:\s*(≈[^,]+),/)}, one listing after another".`,
    }),
    composants: ['src/publication/lot/LotPublication.jsx (CoqueLot, EcranPlateformes)', 'src/publication/lot/regles.js (resumeParPlateforme, partagerQuota, dureeEstimeeMin, libelleDuree)'],
    donnees: 'Cinq articles de démonstration avec leurs annonces en ligne (jobs publiés) ; durée calculée par la règle de l’app ; aucun quota affiché.',
    logos: ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'],
  },
  {
    cle: 'lot-pret', ecran: '4 · Publication en lot : prêt à envoyer', fichier: 'publication-en-lot-pret.png', url: 'site-publication.html?ecran=lot-pret', depop: true,
    gestes: async (page) => defiler(page, /^eBay : ni poids ni format ici/, 8),
    attendu: [/prêts/, /à compléter/, /Colissimo/, /Format du colis sur Leboncoin/, /Envoyer \d+ annonces/, /Leboncoin · eBay · Depop/, /Prêt/],
    alt: ({ texte }) => ({
      fr: `Publication en lot, étape 2 sur 3 : les transporteurs Leboncoin retenus (Colissimo coché), le format du colis sur Leboncoin (« Estimé par Leboncoin », Petit, Moyen, Volumineux), la note « eBay : ni poids ni format ici — les frais d'envoi viennent de ta politique d'expédition eBay », puis la liste des cinq articles préparés, chacun avec sa photo, les plateformes où il va partir (par exemple sweat Öhlins : Leboncoin · eBay · Depop) et l'état « Prêt ». En bas, le bouton « Envoyer ${lire(texte, /Envoyer (\d+) annonces/)} annonces » : « L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre. »`,
      en: `Batch publishing, step 2 of 3: the Leboncoin carriers kept (Colissimo ticked), the Leboncoin parcel size (estimated by Leboncoin, small, medium, bulky), the note that eBay shipping costs come from the eBay shipping policy, then the list of the five prepared items, each with its photo, the marketplaces it will go to (e.g. Öhlins hoodie: Leboncoin · eBay · Depop) and a "Prêt" (ready) status. At the bottom, the "send ${lire(texte, /Envoyer (\d+) annonces/)} listings" button: the FillSell extension then posts them from your computer, one after another.`,
    }),
    composants: ['src/publication/lot/LotPublication.jsx (CoqueLot, EcranAvant)', 'src/publication/lot/LivraisonDuLot.jsx'],
    donnees: 'Mêmes cinq articles, poids posés sur les fiches (120 g à 600 g), transporteurs Leboncoin retenus (section Livraison au-dessus, hors de l’image).',
    logos: ['noms en texte : Leboncoin, eBay, Depop'],
  },
  {
    cle: 'stock', ecran: '5 · Stock unifié', fichier: 'stock-vue-ensemble.png', url: 'site-stock.html', depop: true,
    attendu: [/Mon stock/, /Synchronisé il y a 2 h/, /\d+ annonces/, /Publier/, /Republier/, /À régler/, /Republication automatique/],
    alt: ({ texte, ligne }) => {
      const nb = lire(texte, /Synchronisé il y a 2 h\s*\n\s*(\d+) annonces/);
      // Dans l'ordre de l'écran (plateformesDeReleve : Vinted, Leboncoin, Beebs, eBay, puis Depop).
      const pastilles = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'].map((p) => `${NOMS_PF[p]} ${D.tables.vinted_sync_runs.find((r) => r.platform === p)?.items_vus}`);
      const tuile = (t) => lire(texte, new RegExp(`\\n(\\d+)\\s*\\n${t}`));
      return {
        fr: `L'onglet Stock de FillSell : « Synchronisé il y a 2 h, ${nb} annonces » avec le nombre d'annonces par plateforme (${pastilles.join(', ')}), trois tuiles — Publier (${tuile('Publier')} articles pas encore sur toutes les plateformes), Republier (${tuile('Republier')} annonces à faire remonter), À régler (${tuile('À régler')}) — et la ligne « Republication automatique — ${ligne} », interrupteur allumé.`,
        en: `The FillSell Stock tab: "synced 2 h ago, ${nb} listings" with the count per marketplace (${pastilles.join(', ')}), three tiles — Publish (${tuile('Publier')} items not yet on every marketplace), Repost (${tuile('Republier')} listings to bump), To sort out (${tuile('À régler')}) — and the line "automatic reposting — ${versAnglais(ligne)}", switched on.`,
      };
    },
    composants: ['src/tabs/StockTab.jsx', 'src/stock/BlocSynchro.jsx', 'src/stock/Haut.jsx (Gestes, LigneRepublicationAuto)', 'coquille recopiée d’App.jsx'],
    donnees: `Compte de démonstration servi par faux-supabase.js : fiches, annonces (jobs) sur les cinq plateformes, relevés finis il y a 2 h, republication automatique active (état servi : ${NOMS_AUTO_FR}).`,
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'eBay', 'Depop'],
  },
  {
    cle: 'stock-cartes', ecran: '5 · Stock unifié : un article, plusieurs plateformes', fichier: 'stock-cartes-multi-plateformes.png', url: 'site-stock.html', depop: true,
    gestes: async (page) => defiler(page, new RegExp(`^${C.nbStock} articles$`), 4),
    attendu: [new RegExp(`${C.nbStock} articles`), /T-shirt Picture gris/, /Sweat à capuche Öhlins/, /T-shirt Patagonia noir logo/, /Short de bain Polo Ralph Lauren/, /Publier partout/],
    alt: () => ({
      fr: "Les cartes du stock FillSell, deux par ligne, avec la photo de chaque article, son prix, son ancienneté en ligne et les logos des plateformes où il est en ligne : le t-shirt Picture gris « Pas en ligne », le sweat Öhlins sur Vinted seulement, le t-shirt Patagonia en ligne sur cinq plateformes (Depop, Beebs, eBay et deux autres) et le short Polo Ralph Lauren sur trois (Depop, Leboncoin, Vinted), chacun avec son bouton « Publier partout », ses vues et ses favoris.",
      en: 'FillSell stock cards, two per row, each with the item photo, price, time online and the logos of the marketplaces where it is live: the grey Picture T-shirt "not online", the Öhlins hoodie on Vinted only, the Patagonia T-shirt live on five marketplaces (Depop, Beebs, eBay and two more) and the Polo Ralph Lauren shorts on three (Depop, Leboncoin, Vinted), each with its "publish everywhere" button, views and favourites.',
    }),
    composants: ['src/tabs/StockTab.jsx', 'src/stock/Carte.jsx (CarteArticle, PileLogos, PastilleEtat, BoutonAction)', 'src/stock/Liste.jsx'],
    donnees: 'Mêmes données ; photos libres public/landing/*.webp et public/pata2.jpg ; vues et favoris inventés.',
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'eBay', 'Depop'],
  },
  {
    cle: 'synchro', ecran: '6 · Synchronisation en cours', fichier: 'synchronisation-en-cours.png', url: 'site-stock.html?synchro=en-cours', depop: true,
    attendu: [/Synchronisation/, /3 plateformes sur 5/, /Synchronisation de Depop en cours/, /Environ 1 min/, /Ton ordinateur travaille pendant ce temps/, /Rapprochement/],
    alt: ({ texte }) => {
      const n = (p) => lire(texte, new RegExp(`${p}\\s*\\n\\s*✓?\\s*(\\d+) annonces`));
      const dep = lire(texte, /Depop\s*\n\s*(\d+ sur \d+)/);
      return {
        fr: `Synchronisation en cours dans le Stock de FillSell : « 3 plateformes sur 5 », le logo de chaque plateforme autour de FillSell, la barre d'avancement « Synchronisation de Depop en cours — environ 1 min — Ton ordinateur travaille pendant ce temps », puis la liste : Vinted ${n('Vinted')} annonces, Leboncoin ${n('Leboncoin')} annonces, eBay ${n('eBay')} annonces (faites), Depop ${dep} (en cours), Beebs en attente, Rapprochement en attente.`,
        en: `Sync in progress in the FillSell Stock: "3 of 5 marketplaces", each marketplace logo around FillSell, the progress bar "syncing Depop — about 1 min — your computer is working meanwhile", then the list: Vinted ${n('Vinted')} listings, Leboncoin ${n('Leboncoin')} listings, eBay ${n('eBay')} listings (done), Depop ${dep.replace(' sur ', ' of ')} (running), Beebs waiting, matching waiting.`,
      };
    },
    composants: ['src/stock/BlocSynchro.jsx', 'src/annonces/ConstellationReleve.jsx', 'src/tabs/StockTab.jsx'],
    donnees: 'Relevés en cours posés dans les données (Vinted, Leboncoin et eBay finis, Depop en cours, Beebs en file) ; avancement servi comme la RPC synchro_avancement.',
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'eBay', 'Depop'],
  },
  {
    cle: 'retrait', ecran: '7 · Vente détectée : les copies retirées', fichier: 'vente-retrait-copies.png', url: 'site-stock.html?vente=recente', depop: true,
    gestes: async (page) => {
      const ok = await page.evaluate(() => { const b = document.querySelector('button[aria-haspopup="dialog"]'); b?.click(); return !!b; });
      await page.waitForTimeout(1500);
      return ok;
    },
    attendu: [/Ta file/, /EN COURS|En cours/, /Sweat à capuche Red Bull Racing/, /Retrait de Depop/, /Retrait de l'annonce sur Depop/, /Retrait de Leboncoin/, /Publication sur Depop/],
    alt: () => ({
      fr: "La file de l'ordinateur dans FillSell, juste après une vente sur Vinted : en cours, le retrait de l'annonce Depop du sweat Red Bull Racing vendu (38 €), avec sa barre d'avancement ; à venir, le retrait de sa copie Leboncoin, puis la publication du sweat Öhlins sur Depop et sur Leboncoin, chacune « en attente de son tour ».",
      en: "The computer's queue in FillSell right after a sale on Vinted: in progress, removing the Depop listing of the sold Red Bull Racing hoodie (€38), with its progress bar; next, removing its Leboncoin copy, then publishing the Öhlins hoodie on Depop and Leboncoin, each waiting its turn.",
    }),
    composants: ['src/components/FileDesJobs.jsx', 'src/components/BarreProgression.jsx', 'src/tabs/StockTab.jsx (bandeau de la file)'],
    donnees: 'Variante « vente récente » : vente Vinted il y a 14 min ; ses copies Depop et Leboncoin, déposées par FillSell (donc prouvées), sont retirées l’une après l’autre ; deux dépôts du sweat Öhlins en file.',
    logos: ['Depop', 'Leboncoin'],
  },
  {
    cle: 'deja-vendu', ecran: '7 · Vente détectée : « Déjà vendu ? »', fichier: 'vente-deja-vendu-question.png', url: 'site-stock.html',
    gestes: async (page) => (await cliquer(page, /À régler/, /ventes à confirmer/)) && cliquer(page, /Déjà vendu/),
    attendu: [/Déjà vendu \?/, /s'est vendu sur Vinted/, /Ton annonce eBay du même nom, c'est le même article \?/, /Oui, la retirer/, /Non, c'est un autre exemplaire/],
    alt: () => ({
      fr: "La question « Déjà vendu ? » dans FillSell, sur le Stock : « « Sweat à capuche Red Bull Racing gris, taille M » s'est vendu sur Vinted. Ton annonce eBay du même nom, c'est le même article ? », la carte de l'article vendu (photo, 38 €, « Créée dans l'app », « Vendu »), la phrase « Si tu réponds oui, cette annonce sera retirée : eBay », et deux boutons : « Oui, la retirer » et « Non, c'est un autre exemplaire ».",
      en: 'The "Déjà vendu ?" (already sold?) question in FillSell, over the Stock: the grey Red Bull Racing hoodie sold on Vinted — is your eBay listing with the same name the same item? The sold item card (photo, €38, created in the app, "sold"), the line "if you answer yes, this listing will be removed: eBay", and two buttons: "yes, remove it" and "no, it’s another copy".',
    }),
    composants: ['src/stock/EcranARegler.jsx', 'src/annonces/EcranDoublons.jsx', 'src/utils/doublons.js (texteQuestionCopie, annonceARetirer)'],
    donnees: 'Une question inventaire_doublons de démonstration, motif copie_non_prouvee (annonce eBay liée par le seul titre), aucune URL. Les copies Depop et Leboncoin, prouvées, sont déjà retirées.',
    logos: [],
  },
  {
    cle: 'remonter', ecran: '8 · Republication : remonter ses annonces', fichier: 'republication-remonter.png', url: 'site-stock.html', depop: true, sansEbay: true,
    gestes: async (page) => cliquer(page, /Republier/, /fais remonter/),
    attendu: [/Remonter mes annonces/, /annonces perdent en visibilité/, /Remonter \d+ annonces/, /Ton ordinateur les republie une à une/, /Republication automatique/],
    alt: ({ texte, ligne }) => ({
      fr: `L'écran « Remonter mes annonces » de FillSell : « ${lire(texte, /(\d+) annonces perdent en visibilité/)} annonces perdent en visibilité », toutes cochées, avec la photo, les logos des plateformes (dont Depop) et l'ancienneté de chacune (en ligne depuis 35, 31, 27, 22 jours…), la ligne « Republication automatique — ${ligne} », interrupteur allumé, et le bouton « Remonter ${lire(texte, /Remonter (\d+) annonces/)} annonces » : « Ton ordinateur les republie une à une ».`,
      en: `The "Remonter mes annonces" (bump my listings) screen in FillSell: "${lire(texte, /(\d+) annonces perdent en visibilité/)} listings are losing visibility", all ticked, each with its photo, marketplace logos (Depop among them) and age (live for 35, 31, 27, 22 days…), the line "automatic reposting — ${versAnglais(ligne)}", switched on, and the "bump ${lire(texte, /Remonter (\d+) annonces/)} listings" button: your computer reposts them one by one.`,
    }),
    composants: ['src/stock/EcranSelection.jsx', 'src/stock/EcranPlein.jsx', 'src/stock/Haut.jsx (LigneRepublicationAuto)', 'src/tabs/StockTab.jsx'],
    donnees: `Annonces de démonstration en ligne depuis 7 à 35 jours ; état de republication automatique servi comme republish_planifiee_etat_multi (${NOMS_AUTO_FR}).`,
    logos: ['Vinted', 'Leboncoin', 'Beebs', 'Depop'],
  },
  {
    cle: 'creneaux', ecran: '8 · Republication : créneaux et jours', fichier: 'republication-creneaux.png', url: 'site-republication.html?plateforme=vinted', sansEbay: true,
    // Découpe : la section « Créneau » et « Jours actifs » seulement — le reste
    // de l'écran affiche les chiffres du palier (compteur du mois, plafond).
    decoupe: async (page) => page.evaluate(() => {
      const t = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Créneau de republication');
      const jours = [...document.querySelectorAll('button')].filter((b) => /^[LMJVSD]$/.test(b.textContent.trim()));
      if (!t || jours.length < 7) return null;
      const haut = t.getBoundingClientRect().top - 20;
      const bas = Math.max(...jours.map((b) => b.getBoundingClientRect().bottom)) + 20;
      return { x: 0, y: Math.round(haut + window.scrollY), width: 390, height: Math.round(bas - haut) };
    }),
    attendu: [/Créneau de republication/, /Heure locale · Chrome ouvert/, /Soir · 19h–22h/, /Jours actifs/, /Tous les jours/],
    alt: () => ({
      fr: "Réglage de la republication automatique dans FillSell : le créneau (Matin 8h–10h, Midi 12h–14h, Soir 19h–22h sélectionné, ou Personnalisé), « Heure locale · Chrome ouvert », la note « Les republications se répartissent sur le créneau, au rythme réel de ton compte. Jamais en rafale. », et les jours actifs (tous les jours, du lundi au dimanche).",
      en: 'Automatic reposting settings in FillSell: the time slot (morning 8–10, noon 12–14, evening 19–22 selected, or custom), "local time · Chrome open", the note that reposts are spread over the slot at the account\'s real pace, never in bursts, and the active days (every day, Monday to Sunday).',
    }),
    composants: ['src/components/RepublicationPlanifiee.jsx (RepublicationPlanifieeReglages)'],
    donnees: 'État de démonstration (republicationAutoDemo) : soir 19 h – 22 h, tous les jours (écran ouvert sur la plateforme Vinted ; le même réglage existe par plateforme). Image DÉCOUPÉE (voir rapport).',
    logos: [],
  },
  {
    cle: 'ventes', ecran: '9 · Ventes et marges', fichier: 'ventes-et-marges.png', url: 'site-app.html?ecran=ventes', depop: true,
    attendu: [/Ce mois/i, /Marge moy/i, reMontant(C.mois.benefice), new RegExp(`\\b${C.mois.n}\\b`), /Survêtement Adida/, /Vendu 45,00\s€/, /\+33,00\s€/],
    alt: ({ texte }) => ({
      fr: `L'onglet Ventes de FillSell : en haut, le bénéfice du mois (+${nbFr(C.mois.benefice)} €), le nombre de ventes (${C.mois.n}) et la marge moyenne (${pctFr(margeMoy(texte))}) ; dessous, les dernières ventes avec, pour chacune, le titre, la marque, le prix de vente, le logo de la plateforme où elle s'est faite (Depop, Beebs, Leboncoin, Vinted…), la date et la marge — par exemple un survêtement Adidas vendu 45 € sur Depop, +33 €.`,
      en: `The FillSell Sales tab: at the top, this month's profit (+€${nbEn(C.mois.benefice)}), number of sales (${C.mois.n}) and average margin (${margeMoy(texte)}); below, the latest sales, each with title, brand, sale price, the logo of the marketplace where it sold (Depop, Beebs, Leboncoin, Vinted…), date and margin — e.g. an Adidas tracksuit sold for €45 on Depop, +€33.`,
    }),
    composants: ['src/tabs/VentesTab.jsx', 'coquille recopiée d’App.jsx'],
    donnees: `${C.nbVentes} ventes de démonstration (prix d’achat connus), dont ${C.mois.n} ce mois-ci ; une avec photo.`,
    logos: ['Depop', 'Beebs', 'Leboncoin', 'Vinted'],
  },
  {
    cle: 'stats', ecran: '9 · Statistiques : ventes par plateforme', fichier: 'statistiques-ventes-par-plateforme.png', url: 'site-app.html?ecran=stats', depop: true,
    gestes: async (page) => (await cliquer(page, /^1M$/)) && defiler(page, /Délai moy\. vente par catégorie/, 12),
    attendu: [/Délai moy\. vente par catégorie/, /Ventes par plateforme/, /Vinted/, /Leboncoin/, /eBay/, /Beebs/, /Depop/, /Meilleure marge/],
    alt: ({ image }) => {
      const pf = (nom) => { const m = image.match(new RegExp(`${nom}\\s*\\n\\s*([\\d\\s]+),00\\s€\\s*\\n\\s*(\\d+) ventes`)); return m ? { ca: m[1].replace(/\s/g, ''), n: m[2] } : { ca: '?', n: '?' }; };
      const ordre = ['Vinted', 'eBay', 'Depop', 'Leboncoin', 'Beebs'].map((p) => [p, pf(p)]).sort((a, b) => Number(b[1].ca) - Number(a[1].ca));
      const meilleure = lire(image, /Meilleure marge : (\w+)/);
      const mode = lire(image, /Mode\s*\n\s*(\d+)j/);
      return {
        fr: `L'onglet Stats de FillSell sur le dernier mois : le délai moyen de vente par catégorie (${mode} jours pour la mode), puis les ventes par plateforme — ${ordre.map(([p, x]) => `${p} ${nbFr(Number(x.ca))} € (${x.n} ventes)`).join(', ')} — et la plateforme à la meilleure marge : ${meilleure}.`,
        en: `The FillSell Stats tab over the last month: average days to sell by category (${mode} days for fashion), then sales by marketplace — ${ordre.map(([p, x]) => `${p} €${nbEn(Number(x.ca))} (${x.n} sales)`).join(', ')} — and the marketplace with the best margin: ${meilleure}.`,
      };
    },
    composants: ['src/tabs/StatsTab.jsx (AvgDaysChart, PlatformStatsSection ; période « 1M » choisie par le vrai bouton)'],
    donnees: 'Ventes du dernier mois du compte de démonstration ; Depop seulement depuis son ouverture ; analyse IA non lancée (aucun appel).',
    logos: ['Vinted', 'eBay', 'Depop', 'Leboncoin', 'Beebs'],
  },
  {
    cle: 'stats-vendeurs', ecran: '9 · Statistiques : vendus en 1 à 3 jours', fichier: 'statistiques-meilleurs-vendeurs.png', url: 'site-app.html?ecran=stats',
    gestes: async (page) => (await cliquer(page, /^1M$/)) && defiler(page, /Meilleurs vendeurs/, 12),
    attendu: [/Meilleurs vendeurs/, /Doudoune The North Face Nuptse/, /2j en stock/, /Veste Carhartt Detroit/, /1j en stock/, /Appareil photo argentique Olympus/, /3j en stock/],
    alt: () => ({
      fr: "Les « Meilleurs vendeurs » du mois dans l'onglet Stats de FillSell : une doudoune The North Face Nuptse achetée 55 €, revendue 135 € après 2 jours en stock (+80 €) ; une veste Carhartt Detroit vintage achetée 22 €, revendue 85 € après 1 jour (+63 €) ; un appareil photo argentique Olympus OM-1 acheté 22 €, revendu 79 € après 3 jours (+57 €). Dessous, les « Articles lents » : ceux qui attendent depuis le plus longtemps.",
      en: 'The month\'s "top sellers" in the FillSell Stats tab: a The North Face Nuptse puffer bought for €55 and resold for €135 after 2 days in stock (+€80); a vintage Carhartt Detroit jacket bought for €22, resold for €85 after 1 day (+€63); an Olympus OM-1 film camera bought for €22, resold for €79 after 3 days (+€57). Below, "slow movers": the items waiting the longest.',
    }),
    composants: ['src/tabs/StatsTab.jsx (meilleurs vendeurs : jours en stock = date de vente − ajout de la fiche ; articles lents)'],
    donnees: 'Les trois plus belles marges du compte de démonstration, écrites à la main (pièces recherchées, 1 à 3 jours en stock).',
    logos: [],
  },
  {
    cle: 'extension', ecran: '10 · L’extension Chrome', fichier: 'extension-popup-ordinateur.png', url: 'site-extension.html', vue: { largeur: 1280, hauteur: 800, dsf: 2 }, cadre: true, depop: true,
    attendu: [/FillSell/, /Active/, /Plateformes/i, /Connectée/, /Depop/, /Compte eBay relié à FillSell/, /Prête à publier/i, /Sweat à capuche Öhlins noir, taille L/, /Déjà en ligne/, /En file/, /garde ton ordinateur éveillé/],
    alt: () => ({
      fr: `Le panneau de l'extension Chrome FillSell (version ${VERSION_EXTENSION}), ouvert en haut à droite d'un écran d'ordinateur : pastille « Active », dernier passage il y a 1 min, « FillSell garde ton ordinateur éveillé pendant la publication », les cinq plateformes « Connectée » (Vinted, Leboncoin, eBay — « Compte eBay relié à FillSell » —, Beebs et Depop), puis le sweat Öhlins « Prête à publier » : déjà en ligne sur Vinted, en file pour Leboncoin et Depop. Le bas du panneau sort de l'écran.`,
      en: `The FillSell Chrome extension panel (version ${VERSION_EXTENSION}), open at the top right of a computer screen: "Active" badge, last run 1 min ago, "FillSell keeps your computer awake while publishing", the five marketplaces "connected" (Vinted, Leboncoin, eBay — account linked to FillSell —, Beebs and Depop), then the Öhlins hoodie "ready to publish": already live on Vinted, queued for Leboncoin and Depop. The bottom of the panel runs off the screen.`,
    }),
    composants: [`chrome-extension/popup.html, popup.js, config.js, manifest.json, assets/ au commit ${COMMIT_EXTENSION} (${VERSION_EXTENSION}), lus par git show`, 'scripts/apercu/site-extension-chrome.js (objet chrome simulé : seule la permission www.depop.com est accordée)'],
    donnees: 'File et état de démonstration servis par l’objet chrome simulé (get-pending-jobs remplacé, contexte.depop.ouverte = vrai) ; fond neutre, aucun faux navigateur dessiné.',
    logos: ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'],
  },
  {
    cle: 'extension-seul', ecran: '10 · L’extension Chrome (panneau seul, dépôt en cours)', fichier: 'extension-popup.png', url: 'site-extension.html?etat=en-cours', vue: { largeur: 1280, hauteur: 800, dsf: 3 }, cadre: true, element: '#popup', depop: true,
    attendu: [/Plateformes/i, /Connectée/, /En cours/i, /Depop · publication/, /Casquette Volcom beige brodée/, /Prête à publier/i, /Diffuser sur/i, /\d+ en file/],
    alt: ({ texte }) => ({
      fr: `Le panneau de l'extension Chrome FillSell (version ${VERSION_EXTENSION}) en entier, pendant un dépôt : « Active », dernier passage il y a 1 min, ordinateur gardé éveillé pendant la publication, les cinq plateformes connectées dont Depop, « En cours : Depop · publication » de la casquette Volcom avec sa barre, puis le sweat Öhlins prêt à publier (déjà en ligne sur Vinted, en file pour Leboncoin et Depop) et « ${lire(texte, /(\d+ en file)/)} ».`,
      en: `The full FillSell Chrome extension panel (version ${VERSION_EXTENSION}) during a deposit: "Active", last run 1 min ago, computer kept awake while publishing, the five marketplaces connected including Depop, "in progress: Depop · publishing" for the Volcom cap with its bar, then the Öhlins hoodie ready to publish (already live on Vinted, queued for Leboncoin and Depop) and "${lire(texte, /(\d+) en file/)} in queue".`,
    }),
    composants: ['même rendu que extension-popup-ordinateur.png'],
    donnees: 'Mêmes données ; le dépôt Depop de la casquette est en cours (?etat=en-cours).',
    logos: ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'],
  },
];

// ── LE PASSAGE ──────────────────────────────────────────────────────────────
console.log(`Compte « Camille » à ${HORLOGE_DEMO} : ${C.nbVentes} ventes, ${C.mois.n} ce mois (${C.mois.benefice} € de profit, ${C.mois.ca} € de CA), ${C.nbStock} en stock — extension ${VERSION_EXTENSION} (${COMMIT_EXTENSION}).`);
const fiches = [];
const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  for (const c of CAPTURES) {
    if (SEULES.length && !SEULES.includes(c.cle)) continue;
    const v = c.vue ?? TEL;
    console.log(`\n${c.fichier}  (${c.ecran})`);
    const contexte = await navigateur.newContext({ viewport: { width: v.largeur, height: v.hauteur }, deviceScaleFactor: v.dsf, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
    // L'heure de démonstration : le temps s'écoule normalement à partir d'elle.
    await contexte.clock.install({ time: new Date(HORLOGE_DEMO) });
    const page = await contexte.newPage();
    const erreurs = []; const sortantes = [];
    page.on('pageerror', (x) => erreurs.push(`pageerror ${String(x)}`));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    // Réseau : local et Google Fonts seulement ; le reste est coupé ET compté.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) => { sortantes.push(r.request().url()); r.abort(); });
    // Le rechargement à chaud de Vite est coupé (WebSocket simulée, muette) : un
    // autre terminal qui écrit dans le dossier (build/site-apercu…) ne recharge
    // plus la page au milieu d'une capture.
    await page.routeWebSocket(/./, () => {});
    // L'extension, depuis git (sans écrire un octet sur le disque).
    await page.route(`http://127.0.0.1:${PORT}/extension-publiee/**`, (r) => {
      const rel = decodeURIComponent(new URL(r.request().url()).pathname.replace('/extension-publiee/', ''));
      let corps = fichierExtension(rel);
      if (!corps) return r.fulfill({ status: 404, body: 'absent' });
      if (rel === 'popup.html') corps = Buffer.from(corps.toString('utf8').replace('<head>', '<head>\n  <script src="/scripts/apercu/site-extension-chrome.js"></script>'), 'utf8');
      return r.fulfill({ status: 200, body: corps, headers: { 'content-type': TYPES[path.extname(rel)] ?? 'application/octet-stream' } });
    });
    await page.goto(`${BASE}/${c.url}`, { waitUntil: 'load', timeout: 180000 });
    await attendrePret(page);
    if (c.gestes) verifier(await c.gestes(page) !== false, 'gestes joués (vrais boutons, aucune confirmation)');
    await attendrePret(page);

    const texte = await texteDe(page);
    for (const a of c.attendu) verifier(a.test(texte), `texte attendu ${a}`);
    const interdit = texte.match(INTERDITS);
    verifier(!interdit, 'aucun mot interdit (Opla, Cloud, prénom réel, mise au point…)', interdit?.[0]);
    verifier(await logosOpla(page) === 0, 'aucun logo Opla');
    let zone = null;
    if (c.decoupe) {
      zone = await c.decoupe(page);
      verifier(!!zone, 'zone de découpe trouvée');
    } else if (c.element) {
      zone = await page.locator(c.element).boundingBox();
    }
    // Le texte DANS l'image (zone capturée, au-dessus de la barre d'onglets).
    const image = await texteImage(page, zone);
    // Débogage : APERCU_TEXTES=<dossier> écrit le texte de l'image et de la page.
    if (process.env.APERCU_TEXTES) { fs.mkdirSync(process.env.APERCU_TEXTES, { recursive: true }); fs.writeFileSync(path.join(process.env.APERCU_TEXTES, `${c.cle}.txt`), ['=== IMAGE', image, '=== PAGE', texte, '=== ERREURS', ...erreurs].join('\n')); }
    // Quotas et plafonds : jugés sur ce que l'IMAGE montre (une phrase plus bas
    // dans la page, hors de l'image, ne s'y voit pas — elle est signalée).
    const quota = image.match(QUOTAS);
    verifier(!quota, 'aucun chiffre de quota ni de plafond dans l’image', quota?.[0]);
    const quotaHors = !quota && texte.match(QUOTAS);
    if (quotaHors) console.log(`  · hors de l'image, plus bas dans la page : « ${quotaHors[0]} »`);
    verifier(image.trim().length > 40, 'texte de l’image lu', image.slice(0, 80));
    const palier = image.match(PALIERS);
    verifier(!palier, 'aucun palier (Pro, Premium, Business) dans l’image', palier?.[0]);
    const quatre = image.match(QUATRE_PF);
    verifier(!quatre, 'jamais « 4 plateformes » dans l’image', quatre?.[0]);
    // Les écrans de republication : eBay n'y paraît jamais (ni nom, ni logo).
    if (c.sansEbay) verifier(!/eBay|ebay/.test(image), 'aucun eBay (nom ou logo) sur un écran de republication', (image.match(/.*e[Bb]ay.*/) ?? [])[0]);
    if (c.depop) verifier(/\bDepop\b|\[Depop\]/i.test(image), 'Depop présent dans l’image (texte ou logo)');
    const ligne = ligneAuto(image);
    if (ligne) {
      verifier(!/eBay/.test(ligne), 'jamais eBay sur la ligne « Republication automatique »', ligne);
      const montres = nomsDeLaLigne(ligne);
      const manquent = PLATEFORMES_REPUBLICATION_AUTO.map((p) => NOMS_PF[p]).filter((n) => !montres.some((m) => m && n.startsWith(m)));
      if (manquent.length) avertir(`${c.fichier} : la ligne « Republication automatique » de l'app dit « ${ligne} » — ${manquent.join(', ')} absent(s) alors que l'état servi les active (src/hooks/useRepublicationPlanifiee.js : PLATEFORMES_PLANIFIEES)`);
    }
    verifier(filtreErreurs(erreurs).length === 0, 'aucune erreur de page', filtreErreurs(erreurs).join(' | '));
    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    verifier(largeur <= v.largeur, `aucun défilement horizontal (${largeur} px)`);
    const cassees = await imagesCassees(page);
    verifier(cassees.length === 0, 'toutes les images visibles sont chargées', cassees.join(' '));
    const fuite = sortantes.filter((u) => /supabase\.co|fillsell\.app|vinted|leboncoin|ebay|beebs|opla|depop/i.test(u));
    verifier(fuite.length === 0, 'aucune requête vers la base, fillsell.app ou une plateforme', fuite.join(' '));
    const ecritures = await page.evaluate(() => (window.__ecrituresRefusees ?? []).length);
    verifier(ecritures === 0, `aucune écriture tentée (${ecritures})`);
    if (c.cadre) {
      const jc = await page.frameLocator('#popup').locator('body').evaluate(() => window.__journalChrome ?? []).catch(() => null);
      verifier(Array.isArray(jc), 'objet chrome simulé chargé dans le popup');
      const gestes = (jc ?? []).filter((x) => /permissions\.request|tabs\.create|fetch refusé/.test(x[0]));
      verifier(gestes.length === 0, 'le popup n’a rien demandé ni ouvert', JSON.stringify(gestes));
      const version = await page.frameLocator('#popup').locator('#diag').innerText().catch(() => '');
      verifier(version.trim() === `v${VERSION_EXTENSION}`, `version affichée v${VERSION_EXTENSION} (lu : ${version.trim()})`);
    }

    const sortie = path.join(SORTIE, c.fichier);
    if (c.element) await page.locator(c.element).screenshot({ path: sortie });
    else if (c.decoupe) { if (zone) await page.screenshot({ path: sortie, clip: zone }); }
    else await page.screenshot({ path: sortie });
    const meta = await sharp(sortie).metadata();
    console.log(`    → ${path.relative(RACINE, sortie)} (${meta.width}×${meta.height})`);
    const alt = c.alt({ texte, image, ligne });
    const trou = `${alt.fr} ${alt.en}`.match(/⟦\?⟧|undefined|NaN|\bnull\b/);
    verifier(!trou, 'textes alternatifs complets (chiffres lus sur l’écran)', trou ? `${alt.fr} | ${alt.en}` : '');
    fiches.push({
      fichier: c.fichier, ecran: c.ecran, alt_fr: alt.fr, alt_en: alt.en,
      description_fr: MENTION_FR, description_en: MENTION_EN,
      composants: c.composants, donnees: c.donnees,
      depop_visible: !!c.depop,
      ...(ligne ? { republication_auto_ligne: ligne } : {}),
      pixels: `${meta.width}×${meta.height}`,
      rendu: c.element ? `élément ${c.element}, fenêtre ${v.largeur}×${v.hauteur}, échelle ${v.dsf}` : c.decoupe ? `découpe de la fenêtre ${v.largeur}×${v.hauteur}, échelle ${v.dsf}` : `fenêtre ${v.largeur}×${v.hauteur}, échelle ${v.dsf}`,
      harnais: `scripts/apercu/${c.url}`,
      logos_plateformes_visibles: c.logos,
    });
    await contexte.close();
  }
} catch (e) {
  console.error(e);
  echecs.push(String(e?.message ?? e));
} finally {
  await navigateur.close();
  stop();
}

// ── La barre d'outils : la capture existante, copiée telle quelle ──────────
if (!SEULES.length || SEULES.includes('barre')) {
  const source = path.join(RACINE, 'public', 'extension-guide', 'extension-install-step-6-toolbar-icon.png');
  const cible = path.join(SORTIE, 'extension-barre-outils.png');
  fs.copyFileSync(source, cible);
  const meta = await sharp(cible).metadata();
  console.log(`\nextension-barre-outils.png  (copie de public/extension-guide/extension-install-step-6-toolbar-icon.png, ${meta.width}×${meta.height})`);
  fiches.push({
    fichier: 'extension-barre-outils.png', ecran: '10 · L’extension Chrome : l’icône dans la barre d’outils',
    alt_fr: "La barre d'outils de Google Chrome avec l'icône FillSell épinglée à droite de la barre d'adresse, entre l'étoile des favoris et l'icône des extensions.",
    alt_en: 'The Google Chrome toolbar with the FillSell icon pinned to the right of the address bar, between the bookmark star and the extensions icon.',
    description_fr: 'Capture de la barre d’outils de Chrome (aucune donnée).', description_en: 'Chrome toolbar screenshot (no data).',
    composants: ['capture existante (public/extension-guide/extension-install-step-6-toolbar-icon.png, utilisée par la page /extension)'],
    donnees: 'Aucune donnée : barre d’outils vide (aucune adresse, icône de profil générique).', depop_visible: false,
    pixels: `${meta.width}×${meta.height}`, rendu: 'copie à l’identique (pas de mise à l’échelle)', harnais: null, logos_plateformes_visibles: [],
  });
}

// ── La fiche des images ─────────────────────────────────────────────────────
if (!SEULES.length) {
  const doc = {
    produit_le: new Date().toISOString(),
    produit_par: 'scripts/apercu/site-capture.mjs',
    horloge_des_captures: HORLOGE_DEMO,
    donnees: SOURCE_DONNEES,
    chiffres_du_compte: {
      ventes_6_mois: C.nbVentes, ca_6_mois: C.ca, profit_6_mois: C.benefice,
      ventes_du_mois: C.mois.n, ca_du_mois: C.mois.ca, profit_du_mois: C.mois.benefice,
      ventes_du_mois_par_plateforme: Object.fromEntries(Object.entries(C.mois.parPlateforme).map(([p, x]) => [p, x.n])),
      articles_en_stock: C.nbStock,
    },
    mention_obligatoire_fr: MENTION_FR,
    mention_obligatoire_en: MENTION_EN,
    photos: 'Photos produit libres : public/landing/*.webp et public/pata2.jpg (aucune donnée personnelle).',
    plateformes: 'Vinted, Leboncoin, eBay, Beebs, Depop. Jamais Opla (contrôlé : texte et logo).',
    republication_automatique: { plateformes_servies: PLATEFORMES_REPUBLICATION_AUTO, retirer_depop: 'enlever « depop » de PLATEFORMES_REPUBLICATION_AUTO (scripts/apercu/site-donnees-demo.js), puis relancer les captures' },
    extension: { version: VERSION_EXTENSION, commit: COMMIT_EXTENSION, condition: 'à publier seulement quand cette version (ou une plus récente qui garde Depop) est servie par le Chrome Web Store' },
    avertissement_logos: 'Décision de Nico (09/10) : dans les captures, les logos des plateformes restent tels que l’app les dessine ; sur les pages du site, noms en texte + mention de non-affiliation.',
    avertissements,
    images: fiches,
  };
  fs.writeFileSync(path.join(SORTIE, 'captures.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`\ncaptures.json : ${fiches.length} images`);
}
if (avertissements.length) console.log(`\n⚠ ${avertissements.length} avertissement(s) :\n  ${avertissements.join('\n  ')}`);
console.log(`\n${echecs.length ? `✗ ${echecs.length} contrôle(s) en échec` : '✓ tout est vert'} — ${path.relative(RACINE, SORTIE)}`);
process.exit(echecs.length ? 1 : 0);
