// PREUVE, AVANT L'OTA, QU'UN COMPTE ORDINAIRE VOIT L'APP SERVIE À L'IDENTIQUE
// (05/10/2026, écran B du test Cloud : Nico seul témoin).
//
//     node scripts/cloud/preuve-identite-compte-ordinaire.mjs --version 2.9.53
//     node scripts/cloud/preuve-identite-compte-ordinaire.mjs --servi <ref> [--candidat <ref>]
//
// --version : le numéro LU sur le canal Capgo (`npx @capgo/cli channel list`) ;
// le script retrouve le commit qui a posé ce numéro dans package.json (l'OTA).
// --candidat : ce qui part (HEAD par défaut : `npm run build` refuse un arbre sale).
//
// Ce qu'il prouve, sans réseau ni base, rien de lourd (deux serveurs Vite
// l'un après l'autre, aucun navigateur) :
//   1. PÉRIMÈTRE : entre le servi et le candidat, rien ne change hors de
//      l'option Cloud — fichiers neufs de src/cloud/ et config/cloudOffer.js,
//      et les points d'accroche connus, dont la version « main » sur laquelle
//      la fusion Cloud a été faite est EXACTEMENT celle qui est servie. Un
//      autre changement (lot d'un autre terminal pas encore servi) = ÉCHEC,
//      fichier par fichier : il partirait avec l'OTA ;
//   2. RENDU : chaque écran touché, rendu (react-dom/server) pour des comptes
//      ordinaires (Free, Premium, Pro, Business, sans compte ; fr et en ;
//      téléphone et ordinateur), est IDENTIQUE octet pour octet au servi ;
//   3. CALCULS : les fonctions de utils/palier.js qui existaient rendent les
//      mêmes valeurs sur une grille de profils ;
//   4. COMPORTEMENT : aucune requête Cloud pour un compte ordinaire — chaque
//      appel réseau de src/cloud/ est derrière une porte (drapeau ou témoin),
//      l'achat construit à chaque rendu ne touche à rien tant qu'on ne l'appelle
//      pas, et la part Cloud d'App.jsx est celle relue le 05/10 (empreinte).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r\n/g, '\n');
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ← ${String(detail).slice(0, 1500)}` : ''}`); }
  return cond;
};

// ── 0. Les deux versions ────────────────────────────────────────────────────
function commitDeVersion(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`version illisible : ${v}`);
  const cands = git('log', '--format=%H', '-S', `"version": "${v}"`, '--', 'package.json').trim().split('\n').filter(Boolean);
  // le plus ancien commit où package.json PORTE ce numéro = celui de l'OTA
  const porteurs = cands.filter((c) => {
    try { return JSON.parse(git('show', `${c}:package.json`)).version === v; } catch { return false; }
  });
  if (!porteurs.length) throw new Error(`aucun commit ne pose la version ${v} dans package.json`);
  return porteurs[porteurs.length - 1];
}
const servi = arg('--servi') ? git('rev-parse', arg('--servi')).trim()
  : arg('--version') ? commitDeVersion(arg('--version')) : null;
if (!servi) { console.log('Usage : --version <x.y.z lu sur le canal Capgo> | --servi <ref> [--candidat <ref>]'); process.exit(2); }
const candidat = git('rev-parse', arg('--candidat') ?? 'HEAD').trim();
const court = (c) => c.slice(0, 7);
// La fusion Cloud : le dernier merge « merge : feat/cloud » de l'histoire du candidat.
const fusion = arg('--fusion') ? git('rev-parse', arg('--fusion')).trim()
  : git('log', '--merges', '--first-parent', '--format=%H %s', candidat).split('\n').find((l) => /^merge(\([a-z]+\))? : feat\/cloud/.test(l.slice(41)))?.slice(0, 40);
if (!fusion) { console.log('Aucune fusion « merge : feat/cloud » dans l’histoire du candidat.'); process.exit(2); }
const baseMain = git('rev-parse', `${fusion}^1`).trim();
console.log(`Servi    : ${court(servi)} ${git('log', '-1', '--format=%s', servi).trim().slice(0, 90)}`);
console.log(`Candidat : ${court(candidat)} ${git('log', '-1', '--format=%s', candidat).trim().slice(0, 90)}`);
console.log(`Fusion   : ${court(fusion)} (côté main : ${court(baseMain)})`);

// ── 1. Le périmètre ──────────────────────────────────────────────────────────
const DOSSIERS = ['src', 'supabase/functions/_shared', 'index.html', 'public'];
// (les modules serveur _shared/cloud-* sont neufs et jamais importés par l'app : contrôlé au § 4)
const NEUF_CLOUD = (p) => /^src\/cloud\//.test(p) || p === 'src/config/cloudOffer.js' || /^supabase\/functions\/_shared\/cloud-[a-z-]+\.(js|ts)$/.test(p);
// Les points d'accroche : fichiers existants qui portent une porte Cloud. Leur
// rendu est comparé (§ 2) ou leur part Cloud relue (§ 4, App.jsx).
const ACCROCHES = new Set([
  'src/App.jsx', 'src/components/ConversionModal.jsx', 'src/components/ExtensionPitchScreen.jsx',
  'src/components/InstallExtensionCta.jsx', 'src/entree/EtapeExtension.jsx', 'src/pages/ExtensionPage.jsx',
  'src/reglages/ReglagesPage.jsx', 'src/reglages/SousPageAbonnement.jsx', 'src/utils/palier.js', 'src/pages/Legal.jsx',
]);
console.log('\n1. Le périmètre (rien d’autre ne part avec l’OTA)');
const changes = git('diff', '--name-status', '--no-renames', servi, candidat, '--', ...DOSSIERS).trim().split('\n').filter(Boolean)
  .map((l) => { const [st, p] = l.split('\t'); return { st, p }; });
// (05/10) Les modules de supabase/functions/_shared que l'app importe (palier.js,
// et ce qu'ils importent eux-mêmes), relus dans le candidat. Un fichier _shared
// qu'aucun module de src/ n'atteint est du SERVEUR seul (mail « paiement
// échoué », fonctions edge) : il ne part pas avec l'OTA, il part au déploiement.
function sharedAtteintsParLApp(commit) {
  const fichiers = git('ls-tree', '-r', '--name-only', commit, 'src').split('\n').filter((f) => /\.(m?js|jsx|tsx?)$/.test(f));
  const atteints = new Set();
  const aLire = [...fichiers];
  const lus = new Set();
  const RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  while (aLire.length) {
    const f = aLire.pop();
    if (lus.has(f)) continue;
    lus.add(f);
    let texte = '';
    try { texte = git('show', `${commit}:${f}`); } catch { continue; }
    for (const m of texte.matchAll(RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec || !spec.startsWith('.')) continue;
      const cible = join(dirname(f), spec).replace(/\\/g, '/');
      if (cible.startsWith('supabase/functions/_shared/')) { atteints.add(cible); aLire.push(cible); }
    }
  }
  return atteints;
}
const sharedApp = sharedAtteintsParLApp(candidat);
const serveurSeul = [];
const hors = [];
for (const { st, p } of changes) {
  if (p.startsWith('supabase/functions/_shared/') && !sharedApp.has(p) && !NEUF_CLOUD(p)) { serveurSeul.push(`${p} (${st})`); continue; }
  if (NEUF_CLOUD(p)) { if (st !== 'A' && p !== 'src/config/cloudOffer.js') hors.push(`${p} (${st} : un fichier Cloud existait déjà au servi ?)`); continue; }
  if (ACCROCHES.has(p)) {
    // la version servie de ce fichier = celle de main sur laquelle la fusion a été faite
    const a = git('rev-parse', `${servi}:${p}`).trim();
    let b = null; try { b = git('rev-parse', `${baseMain}:${p}`).trim(); } catch { b = null; }
    if (a !== b) hors.push(`${p} (accroche, mais la version servie ≠ celle de main à la fusion : un autre lot non servi y est passé)`);
    continue;
  }
  hors.push(`${p} (${st})`);
}
verifier(hors.length === 0, `aucun changement hors Cloud entre le servi et le candidat (${changes.length} fichiers différents)`, hors.join('\n        '));
const neufs = changes.filter((c) => NEUF_CLOUD(c.p)).length;
verifier(sharedApp.has('supabase/functions/_shared/palier.js'), `les modules _shared de l’app sont bien relus (${[...sharedApp].map((p) => p.replace('supabase/functions/_shared/', '')).join(', ')})`);
console.log(`  · ${neufs} fichiers Cloud, ${changes.filter((c) => ACCROCHES.has(c.p)).length} points d’accroche, ${hors.length} hors périmètre`);
if (serveurSeul.length) console.log(`  · ${serveurSeul.length} fichiers _shared du SERVEUR seul (aucun module de l’app ne les atteint ; ils partent au déploiement des fonctions, jamais avec l’OTA) :\n      ${serveurSeul.join('\n      ')}`);

// ── 2. Les arbres, extraits du dépôt (jamais le dossier de travail) ─────────
const BASE = join(ROOT, 'build', 'preuve-identite');   // build/ est ignoré par git : l'arbre reste propre
function extraire(commit, nom) {
  const dir = join(BASE, nom);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tar = join(BASE, `${nom}.tar`);
  const presents = DOSSIERS.filter((d) => { try { git('rev-parse', `${commit}:${d}`); return true; } catch { return false; } });
  execFileSync('git', ['archive', '--format=tar', '-o', tar, commit, ...presents], { cwd: ROOT });
  execFileSync('tar', ['-xf', `../${nom}.tar`], { cwd: dir });   // chemin relatif : le tar de Git Bash lit « C: » comme un hôte
  fs.rmSync(tar, { force: true });
  return dir;
}

// Environnement commun aux deux rendus : mêmes valeurs, mêmes absences.
const stockage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
globalThis.document ??= { body: {} };
globalThis.localStorage = stockage();
globalThis.sessionStorage = stockage();
const ecran = (largeur) => {
  if (largeur == null) { delete globalThis.window; return; }
  globalThis.window = {
    innerWidth: largeur, innerHeight: 800, location: { href: 'https://fillsell.app/app', pathname: '/app', search: '', hash: '', origin: 'https://fillsell.app' },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: largeur < 768, addEventListener() {}, removeEventListener() {} }),
    localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, navigator: globalThis.navigator, open() {},
  };
};

const U = '7e3c9a52-1d4b-4c8e-9f60-2b5a7c1e0d93';       // un compte ordinaire (jamais témoin)
const COMPTES = [
  { nom: 'free', isPremium: false, isPro: false, isBusiness: false },
  { nom: 'premium', isPremium: true, isPro: false, isBusiness: false },
  { nom: 'pro', isPremium: true, isPro: true, isBusiness: false },
  { nom: 'business', isPremium: true, isPro: true, isBusiness: true },
];
const TRIGGERS = ['generic', 'cloud', 'republish_cap', 'republish_lot', 'republish_auto', 'quota_geste', 'voice', 'lens', 'stock'];
const rien = () => {};

async function rendre(dir) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: dir, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
    ssr: { noExternal: [] },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const sorties = new Map();
  const charges = new Map();
  try {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { MemoryRouter } = await import('react-router-dom');
    const h = React.createElement;
    const mod = async (p) => {
      if (!charges.has(p)) {
        try { charges.set(p, await vite.ssrLoadModule(p)); } catch (e) { charges.set(p, { __erreur: String(e?.message ?? e).split('\n')[0] }); }
      }
      return charges.get(p);
    };
    const scene = async (cle, fabriquer) => {
      try { sorties.set(cle, renderToStaticMarkup(await fabriquer())); } catch (e) { sorties.set(cle, `ERREUR : ${String(e?.message ?? e).split('\n')[0]}`); }
    };
    for (const largeur of [null, 390, 1280]) {   // sans fenêtre (téléphone par défaut), téléphone, ordinateur
      ecran(largeur);
      const ou = largeur == null ? 'ssr' : largeur < 768 ? 'tel' : 'ordi';
      const CM = await mod('/src/components/ConversionModal.jsx');
      const EP = await mod('/src/components/ExtensionPitchScreen.jsx');
      const IC = await mod('/src/components/InstallExtensionCta.jsx');
      const EE = await mod('/src/entree/EtapeExtension.jsx');
      const XP = await mod('/src/pages/ExtensionPage.jsx');
      const SPA = await mod('/src/reglages/SousPageAbonnement.jsx');
      const RT = await mod('/src/reglages/textes.js');
      const ET = await mod('/src/entree/textes.js');
      const LG = await mod('/src/pages/Legal.jsx');
      for (const lang of ['fr', 'en']) {
        for (const userId of [U, null]) {
          for (const k of COMPTES) {
            for (const trigger of TRIGGERS) {
              // Ce que l'App passe à un compte ordinaire : pas d'hôte Cloud (null).
              await scene(`CM|${ou}|${lang}|${userId ? 'u' : '-'}|${k.nom}|${trigger}`, () => h(CM.default, {
                isOpen: true, onClose: rien, onUpgrade: rien, trigger, lang, userId, origine: 'preuve',
                isPremium: k.isPremium, isPro: k.isPro, isBusiness: k.isBusiness, onAjouterCloud: null, onCloudSeul: null,
              }));
            }
            const cAbo = {
              user: userId ? { id: userId, email: 'ordinaire@exemple.fr' } : null, lang, isPremium: k.isPremium, isPro: k.isPro, isBusiness: k.isBusiness,
              natif: largeur != null && largeur < 768, plateforme: 'web', quotas: null, ouvrirOffres: rien, prochainPrelevement: null, remiseAZero: null,
              resiliation: { resilie: false, etape: 1, setEtape: rien, lancer: rien, enCours: false }, restauration: { enCours: false, lancer: rien },
              actionsCloud: {},   // App.jsx : actionsCloud = {} pour un compte qui n'est ni témoin ni drapeau levé
            };
            if (userId && RT.txt) {
              for (const etape of [0, 1, 2]) {
                await scene(`SPA|${ou}|${lang}|${k.nom}|etape${etape}`, () => h(SPA.default, { c: { ...cAbo, resiliation: { ...cAbo.resiliation, etape } }, T: RT.txt(lang) }));
              }
              await scene(`SPA|${ou}|${lang}|${k.nom}|sans-actions`, () => h(SPA.default, { c: { ...cAbo, actionsCloud: null }, T: RT.txt(lang) }));
            }
          }
          for (const ebay of [null, { relie: false, onRelier: rien }, { relie: true, onRelier: rien }]) {
            await scene(`EP|${ou}|${lang}|${userId ? 'u' : '-'}|ebay${ebay ? (ebay.relie ? 'R' : 'N') : '0'}`, () => h(EP.default, { lang, onClose: rien, userId, ebaySansOrdinateur: ebay }));
          }
          for (const source of ['stock_annonces', 'stock', 'annonces']) {
            await scene(`IC|${ou}|${lang}|${userId ? 'u' : '-'}|${source}`, () => h(IC.default, { lang, isNative: false, userId, userEmail: userId ? 'ordinaire@exemple.fr' : null, source, message: 'm', onEnSavoirPlus: rien }));
          }
          for (const surTelephone of [true, false]) {
            for (const envoi of [{ etat: 'repos' }, { etat: 'envoi' }, { etat: 'envoye' }, { etat: 'erreur', message: 'x' }]) {
              const T = ET.textesEntree(lang);
              await scene(`EE|${ou}|${lang}|${userId ? 'u' : '-'}|${surTelephone ? 'tel' : 'ordi'}|${envoi.etat}`, () => h(EE.default, {
                c: { lang, fr: lang === 'fr', surTelephone, user: userId ? { id: userId, email: 'ordinaire@exemple.fr' } : null, envoi, secondesRestantes: 0, extensionVue: false, envoyerLien: rien, journaliser: rien },
                T, onSuivant: rien,
              }));
            }
          }
        }
        // CONTRÔLE NÉGATIF (même harnais) : pour Nico, témoin, le mur de
        // l'extension sur téléphone DOIT différer du servi au candidat — sinon
        // la comparaison serait aveugle à l'option.
        await scene(`TEMOIN|${ou}|${lang}`, () => h(EP.default, { lang, onClose: rien, userId: 'f44b5917-bccc-4431-ba41-f40571a2ed18', ebaySansOrdinateur: { relie: false, onRelier: rien } }));
        globalThis.localStorage.setItem('fs_lang', lang);
        await scene(`XP|${ou}|${lang}`, () => h(MemoryRouter, null, h(XP.default)));
        await scene(`LG|${ou}|${lang}`, () => h(MemoryRouter, null, h(LG.default)));
        globalThis.localStorage.clear();
      }
    }
    // ── 3. Les calculs (palier.js) ───────────────────────────────────────────
    const P = await mod('/src/utils/palier.js');
    const profils = [];
    for (const b of [true, false, null]) for (const pr of [true, false, null]) for (const pm of [true, false, null]) for (const c of [true, false, null]) {
      profils.push({ is_business: b, is_pro: pr, is_premium: pm, is_comped: c, is_founder: true, apple_original_transaction_id: 'x' });
    }
    const valeurs = ['gratuit', 'free', 'premium', 'pro', 'business', 'inconnu', null, undefined, ''];
    for (const [nom, f] of Object.entries(P)) {
      if (typeof f !== 'function') { sorties.set(`P|${nom}`, JSON.stringify(f)); continue; }
      const r = [];
      for (const p of profils) { try { r.push(f(p)); } catch (e) { r.push(`!${e.message}`); } }
      for (const a of valeurs) for (const b of valeurs) { try { r.push(f(a, b)); } catch (e) { r.push(`!${e.message}`); } }
      for (const d of [{ isPremium: true }, { isPro: true }, { isBusiness: true }, {}, undefined]) { try { r.push(f(d)); } catch (e) { r.push(`!${e.message}`); } }
      sorties.set(`P|${nom}`, JSON.stringify(r));
    }
    return { sorties, erreurs: [...charges].filter(([, m]) => m?.__erreur).map(([p, m]) => `${p} : ${m.__erreur}`) };
  } finally {
    await vite.close();
    ecran(null);
  }
}

console.log('\n2. Le rendu des écrans touchés, compte ordinaire (servi puis candidat)');
const dirServi = extraire(servi, `servi-${court(servi)}`);
const rServi = await rendre(dirServi);
const dirCand = extraire(candidat, `candidat-${court(candidat)}`);
const rCand = await rendre(dirCand);
const temoin = [...rServi.sorties.keys()].filter((k) => k.startsWith('TEMOIN|'));
const scenes = [...rServi.sorties.keys()].filter((k) => !k.startsWith('P|') && !k.startsWith('TEMOIN|'));
const diffs = [];
let erreursCommunes = 0;
for (const k of scenes) {
  const a = rServi.sorties.get(k), b = rCand.sorties.get(k);
  if (a !== b) {
    let i = 0; while (i < a.length && a[i] === b?.[i]) i++;
    diffs.push(`${k} — 1re différence au caractère ${i} :\n          servi    …${a.slice(Math.max(0, i - 80), i + 120)}\n          candidat …${String(b).slice(Math.max(0, i - 80), i + 120)}`);
  } else if (a.startsWith("ERREUR")) { erreursCommunes++; if (process.env.PREUVE_DETAIL) console.log(`    · ${k} : ${a.slice(0, 160)}`); }
}
const enPlus = [...rCand.sorties.keys()].filter((k) => !k.startsWith('P|') && !rServi.sorties.has(k));
{
  // Le contrôle négatif : là où la porte est OUVERTE (Nico, téléphone), le
  // harnais VOIT la différence. Seulement si le candidat ouvre l'option à Nico.
  const nicoTemoin = /CLOUD_OFFRE_TEMOINS = Object\.freeze\(\[NICO_USER_ID\]\)/.test(git('show', `${candidat}:src/config/cloudOffer.js`));
  const tel = temoin.filter((k) => !k.includes('|ordi|'));
  if (nicoTemoin) verifier(tel.length > 0 && tel.every((k) => rServi.sorties.get(k) !== rCand.sorties.get(k) && !rCand.sorties.get(k).startsWith('ERREUR')),
    `contrôle négatif : pour Nico (témoin), le mur sur téléphone DIFFÈRE bien (${tel.length} scènes) — le harnais voit l’option quand elle est là`);
}
verifier(scenes.length > 300, `les scènes sont bien rendues (${scenes.length})`);
verifier(diffs.length === 0, `${scenes.length} scènes : rendu IDENTIQUE octet pour octet`, diffs.slice(0, 6).join('\n        '));
verifier(enPlus.length === 0, 'aucune scène de plus au candidat', enPlus.join(', '));
const rendues = scenes.filter((k) => !rServi.sorties.get(k).startsWith('ERREUR')).length;
verifier(rendues >= scenes.length * 0.9, `au moins 90 % des scènes se rendent pour de vrai (${rendues}/${scenes.length} ; ${erreursCommunes} en erreur, la même des deux côtés)`,
  scenes.filter((k) => rServi.sorties.get(k).startsWith('ERREUR')).slice(0, 5).map((k) => `${k} : ${rServi.sorties.get(k)}`).join('\n        '));
verifier(JSON.stringify(rServi.erreurs) === JSON.stringify(rCand.erreurs), 'mêmes modules chargés des deux côtés', `${rServi.erreurs.join(' | ')} ≠ ${rCand.erreurs.join(' | ')}`);

console.log('\n3. Les calculs du palier');
const pServi = [...rServi.sorties.keys()].filter((k) => k.startsWith('P|'));
const pDiff = pServi.filter((k) => rServi.sorties.get(k) !== rCand.sorties.get(k));
verifier(pServi.length >= 8, `les fonctions du palier servi sont relues (${pServi.length})`);
verifier(pDiff.length === 0, 'mêmes valeurs pour chaque fonction qui existait', pDiff.join(', '));

// ── 4. Le comportement : aucune requête Cloud pour un compte ordinaire ──────
console.log('\n4. Le comportement (aucune requête, aucun geste Cloud)');
const lire = (p) => git('show', `${candidat}:${p}`);
const code = (t) => t.split('\n').filter((l) => { const s = l.trim(); return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*') && !s.startsWith('{/*'); }).join('\n');
{
  const cfg = code(lire('src/config/cloudOffer.js'));
  verifier(/export const CLOUD_OFFER_ENABLED = false;/.test(cfg), 'drapeau BAISSÉ (CLOUD_OFFER_ENABLED = false)');
  const listes = [...cfg.matchAll(/export const (CLOUD_(?:OFFRE_)?TEMOINS) = Object\.freeze\(\[([^\]]*)\]\);/g)].map((m) => [m[1], m[2].trim()]);
  verifier(listes.length === 2 && listes.every(([, v]) => v === '' || v === 'NICO_USER_ID'), 'témoins : personne, ou Nico SEUL (NICO_USER_ID)', JSON.stringify(listes));
  verifier(/export const NICO_USER_ID = 'f44b5917-bccc-4431-ba41-f40571a2ed18';/.test(cfg) || !/NICO_USER_ID/.test(cfg), 'NICO_USER_ID est bien le compte de Nico');
  verifier(/cloudOfferVisible = \(userId\) => CLOUD_OFFER_ENABLED \|\| \(userId != null && CLOUD_OFFRE_TEMOINS\.includes\(userId\)\)/.test(cfg)
    && /cloudConnexionVisible = \(userId\) => cloudOfferVisible\(userId\) \|\| \(userId != null && CLOUD_TEMOINS\.includes\(userId\)\)/.test(cfg),
  'les deux portes : drapeau OU identifiant exact dans une liste figée');
}
{
  // Chaque appel réseau de src/cloud/ vit dans un fichier dont l'entrée est gardée.
  const fichiers = git('ls-tree', '-r', '--name-only', candidat, 'src/cloud').trim().split('\n').filter(Boolean);
  const reseau = /supabase\.(from|rpc|functions|auth|channel|storage)\b|fetch\(|new WebSocket\(|XMLHttpRequest/;
  const permis = {
    'src/cloud/useCloudProfil.js': (t) => /const doitLire = Boolean\(actif && userId\);/.test(t) && /useEffect\(\(\) => \{\s*if \(!doitLire\) return undefined;/.test(t),
    'src/cloud/achatCloud.js': () => true,          // vérifié à l'exécution ci-dessous (rien à la construction)
    'src/cloud/MeConnecterCloud.jsx': () => true,   // monté seulement derrière cloudConnexionVisible (App, ci-dessous)
    'src/cloud/connexion/clientConnexion.js': () => true, // utilisé par MeConnecterCloud seulement (ci-dessous)
  };
  const fautifs = fichiers.filter((f) => reseau.test(code(lire(f))) && !(permis[f]?.(code(lire(f)))));
  verifier(fautifs.length === 0, 'src/cloud : tout appel réseau est dans un fichier à entrée gardée', fautifs.join(', '));
  // Qui IMPORTE quoi (lignes `import … from '…'`, jamais un commentaire).
  const importeursDe = (motif) => {
    const re = new RegExp(`^import\\s[^;]*from\\s+['"][^'"]*${motif}['"]`, 'm');
    return git('ls-tree', '-r', '--name-only', candidat, 'src').trim().split('\n')
      .filter((f) => /\.(jsx?|mjs|ts)$/.test(f) && re.test(lire(f)));
  };
  const importServeur = importeursDe('_shared/cloud-[a-z-]+(?:\\.(?:js|ts))?');
  verifier(importServeur.length === 0, 'l’app n’importe aucun module serveur Cloud (_shared/cloud-*)', importServeur.join(', '));
  const importeurs = importeursDe('clientConnexion(?:\\.js)?');
  verifier(importeurs.length === 1 && importeurs[0] === 'src/cloud/MeConnecterCloud.jsx', 'le client de connexion n’est importé que par « Me connecter »', importeurs.join(', '));
  const importMe = importeursDe('MeConnecterCloud(?:\\.jsx)?');
  verifier(importMe.length === 1 && importMe[0] === 'src/App.jsx', '« Me connecter » n’est importé que par App', importMe.join(', '));
  // Les lectures de l'état Cloud : chaque appel de useCloudProfil passe une porte.
  const appels = [];
  for (const f of git('grep', '-l', 'useCloudProfil(', candidat, '--', 'src').trim().split('\n').filter(Boolean).map((l) => l.replace(`${candidat}:`, ''))) {
    // les APPELS (`= useCloudProfil(…);`), pas la déclaration de la fonction
    for (const m of code(lire(f)).matchAll(/=\s*useCloudProfil\((.*)\);/g)) appels.push([f, m[1]]);
  }
  const gardes = appels;
  const sansPorte = gardes.filter(([, a]) => !/, \{ actif: (visible|Boolean\(isOpen && cloudVisible\)|visible && variante !== 'page') \}$/.test(a));
  verifier(gardes.length >= 4 && sansPorte.length === 0, `useCloudProfil : ${gardes.length} appels, chacun derrière une porte`, sansPorte.map((x) => x.join(' → ')).join(' | '));
  for (const [f, re] of [
    ['src/cloud/HoteCloud.jsx', /const visible = cloudOfferVisible\(userId\);/],
    ['src/components/ConversionModal.jsx', /const cloudVisible = cloudOfferVisible\(userId\);/],
    ['src/cloud/VoieSansOrdinateur.jsx', /const visible = cloudOfferVisible\(userId\)/],
    ['src/cloud/useCloudProfil.js', /const visible = cloudOfferVisible\(c\?\.user\?\.id\) \|\| cloudConnexionVisible\(c\?\.user\?\.id\);/],
  ]) verifier(re.test(code(lire(f))), `${f} : la porte est celle du drapeau ou des témoins`);
}
{
  // L'achat est construit à CHAQUE rendu d'App pour tout compte connecté : sa
  // construction ne doit RIEN toucher (ni base, ni boutique, ni lien, ni stockage).
  const { createServer } = await import('vite');
  const vite = await createServer({ root: dirCand, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const A = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
    const touches = [];
    const piege = (nom) => new Proxy(function () {}, { get: (_, k) => { touches.push(`${nom}.${String(k)}`); return piege(`${nom}.${String(k)}`); }, apply: () => { touches.push(`${nom}()`); return piege(`${nom}()`); } });
    const lu = globalThis.localStorage; globalThis.localStorage = piege('localStorage');
    let achat;
    try {
      achat = A.creerAchatCloud({ supabase: piege('supabase'), supabaseUrl: 'u', supabaseAnonKey: 'k', user: { id: U }, lang: 'fr', platform: 'web', purchasePremium: piege('purchasePremium'), ouvrirLien: piege('ouvrirLien'), confirmer: piege('confirmer'), notifier: piege('notifier'), paiementsAndroidCoupes: piege('paiementsAndroidCoupes') });
    } finally { globalThis.localStorage = lu; }
    verifier(touches.length === 0, 'construire l’achat ne touche à rien (aucune requête, aucun stockage)', touches.join(', '));
    verifier(achat && typeof achat.acheter === 'function', 'l’achat expose ses gestes, appelés seulement par les actions gardées');
  } finally { await vite.close(); }
}
{
  // La part Cloud d'App.jsx (lignes ajoutées et retirées par la fusion, sans
  // contexte ni numéros) est CELLE relue le 05/10 : chaque geste derrière
  // cloudOfferVisible (l'offre) ou cloudConnexionVisible (l'écran), HoteCloud
  // et VoieSansOrdinateur ne rendant rien portes fermées (rendus ci-dessus).
  const part = git('diff', '-U0', baseMain, candidat, '--', 'src/App.jsx').split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).join('\n');
  const empreinte = createHash('sha256').update(part).digest('hex').slice(0, 16);
  // = la part App.jsx de feat/cloud (5d6a0e9..feat/cloud), relue le 05/10 :
  // imports ; état meConnecterOuvert ; startTierCheckout REND sa promesse (tous
  // les autres appelants l'ignorent) ; l'achat construit sans effet ; chaque
  // geste derrière cloudOfferVisible / cloudConnexionVisible.
  const RELUE_LE_0510 = 'b8aaacb12ba4f276';
  if (!verifier(empreinte === RELUE_LE_0510, `App.jsx : la part Cloud est celle relue le 05/10 (empreinte ${empreinte})`, 'la part Cloud d’App.jsx a changé : la relire, ligne par ligne, puis reporter la nouvelle empreinte ici')) {
    console.log(part.split('\n').map((l) => `      ${l.slice(0, 160)}`).join('\n'));
  }
  const app = code(lire('src/App.jsx'));
  verifier(/if\(!achatCloud\|\|!cloudOfferVisible\(user\?\.id\)\)return;/.test(app), 'App : lancerAchatCloud refuse hors drapeau et hors témoin de l’offre');
  verifier(/\.\.\.\(cloudOfferVisible\(user\.id\)&&achatCloud\?\{/.test(app) && /\.\.\.\(cloudConnexionVisible\(user\.id\)\?\{meConnecter:/.test(app), 'App : actionsCloud vide pour un compte ordinaire');
  verifier(/onCloudSeul=\{cloudOfferVisible\(user\?\.id\)\?/.test(app) && /onAjouterCloud=\{cloudOfferVisible\(user\?\.id\)\?/.test(app), 'App : la feuille ne reçoit aucun hôte Cloud pour un compte ordinaire');
  verifier(/if\(opts\?\.cloud===true&&cloudOfferVisible\(user\?\.id\)\)\{formulePuisCloud/.test(app), 'App : onUpgrade suit le parcours d’avant pour un compte ordinaire');
  verifier(/\{meConnecterOuvert&&user&&cloudConnexionVisible\(user\.id\)&&\(/.test(app), 'App : « Me connecter » n’est jamais monté pour un compte ordinaire');
  verifier(!/from\('profiles'\)\.select\('[^']*(is_cloud|cloud_)/.test(app), 'App : aucune colonne Cloud dans un select de profiles (PostgREST tout ou rien)');
}

fs.rmSync(BASE, { recursive: true, force: true });
console.log(`\n${ko === 0 ? 'IDENTIQUE pour un compte ordinaire' : `${ko} ÉCHEC(S) — NE PAS ENVOYER L’OTA`} — ${ok + ko} contrôles (servi ${court(servi)}, candidat ${court(candidat)}).`);
process.exit(ko === 0 ? 0 : 1);
