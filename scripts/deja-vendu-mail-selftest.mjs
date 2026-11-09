// selftest:deja-vendu-mail — (09/11, point 1 de Nico — xxewwer, « MediEvil Resurrection Platinum PSP »)
// UNE ANNONCE DE L'ARTICLE VENDU ENCORE EN LIGNE AILLEURS SE DIT DANS LE MAIL DE VENTE.
//
//   npm run selftest:deja-vendu-mail
//
// Cas : vendu sur Vinted le 09/11 à 00:47 (annonce:vinted:10722008876). Ses annonces eBay 377476217083 et Leboncoin
// 3298682693 sont rattachées à la fiche par le TITRE (19/09, auto / titre_exact) : la vente a posé, à la même seconde,
// deux questions « Déjà vendu ? » (copie_non_prouvee) au lieu de retraits — voulu : ce compte a répondu « Non » 5 fois
// sur des photos identiques (plusieurs exemplaires photographiés une fois). Mais le mail de vente (00:47:58) n'en disait
// rien (retraitsACliquer: 0 codé en dur) : la question attendait que la personne ouvre l'app, l'article en vente ailleurs.
// Règle : le mail de vente nomme les annonces encore en ligne (question ouverte) et son bouton ouvre la question.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };

const E = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/emails-fillsell.ts')).href);
const L = await import(pathToFileURL(path.join(RACINE, 'src/utils/lienDejaVendu.js')).href);
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

console.log('1. Le texte « encore en ligne »');
ok(E.texteDejaVendu([], 'fr') === null && E.texteDejaVendu(undefined, 'fr') === null, 'aucune question ouverte → rien à dire');
const deux = E.texteDejaVendu(['ebay', 'leboncoin'], 'fr');
ok(/^Attention : 2 annonces de cet article sont encore en ligne \((Leboncoin et eBay)\)\./.test(deux), `MediEvil : « ${deux?.slice(0, 80)}… »`, deux);
ok(/ne les retire pas sans toi/.test(deux) && /Réponds à « Déjà vendu \? » dans FillSell : « Oui » les retire tout de suite, pour ne pas vendre deux fois\./.test(deux),
  'il dit pourquoi rien n\'est retiré et quel geste le retire (jamais « retirée »)');
const une = E.texteDejaVendu(['beebs'], 'fr');
ok(/^Attention : une annonce de cet article est encore en ligne \(Beebs\)\./.test(une) && /ne la retire pas sans toi/.test(une) && /« Oui » la retire/.test(une), 'une seule annonce : singulier');
ok(/de ces articles/.test(E.texteDejaVendu(['ebay', 'beebs'], 'fr', false)), 'plusieurs articles vendus : « de ces articles »');
const en = E.texteDejaVendu(['ebay', 'leboncoin'], 'en');
ok(/^Heads up: 2 listings of this item are still online \((Leboncoin and eBay)\)\./.test(en) && /Answer “Already sold\?” in FillSell/.test(en), `anglais : « ${en.slice(0, 70)}… »`);
ok(E.URL_DEJA_VENDU.endsWith('/app?ventes=deja-vendu') && E.URL_VENTES_A_CONFIRMER.endsWith('/app?ventes=a-decider'), 'liens : ?ventes=deja-vendu (nouveau), ?ventes=a-decider (inchangé)');

console.log('\n2. Le mail d\'une vente');
const medievil = { ventes: [{ titre: 'MediEvil Resurrection Platinum PSP – sans notice – jaquette FR', plateforme: 'vinted', prixVente: 8.9, benefice: null }],
  retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: false, dejaVendu: ['ebay', 'leboncoin'] };
const m = E.mailVentes(medievil, 'fr');
const tm = texte(m.html);
ok(m.sujet === 'Vendu sur Vinted 🎉', 'le sujet ne change pas');
ok(tm.includes('2 annonces de cet article sont encore en ligne (Leboncoin et eBay)'), 'le corps nomme les deux annonces encore en ligne');
ok(m.html.includes(E.URL_DEJA_VENDU) && !m.html.includes(E.URL_VENTES_A_CONFIRMER) && tm.includes('Répondre à « Déjà vendu ? »'),
  'le bouton ouvre « Déjà vendu ? » (/app?ventes=deja-vendu)');
const aConf = E.mailVentes({ ...medievil, aConfirmer: true }, 'fr');
ok(!texte(aConf.html).includes('encore en ligne') && aConf.html.includes(E.URL_VENTES_A_CONFIRMER), 'vente « à confirmer » : pas de question encore posée → le mail d\'avant');
const vide = E.mailVentes({ ...medievil, dejaVendu: [] }, 'fr');
const sans = E.mailVentes({ ventes: medievil.ventes, retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: false }, 'fr');
ok(vide.html === sans.html && !texte(sans.html).includes('encore en ligne') && sans.html.includes(E.URL_VENTES_A_CONFIRMER), 'aucune question ouverte : le mail d\'avant');

// Sans question ouverte : le mail est identique, OCTET POUR OCTET, au gabarit de HEAD avant ce correctif (72d0135).
const REF = '72d0135';
const dirRef = path.join(RACINE, 'build', 'selftest-deja-vendu-mail', REF);
let A = null;
try {
  rmSync(dirRef, { recursive: true, force: true });
  mkdirSync(dirRef, { recursive: true });
  const fichiers = execFileSync('git', ['ls-tree', '--name-only', REF, 'supabase/functions/_shared/'], { cwd: RACINE, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(ts|js)$/.test(f));
  for (const f of fichiers) {
    writeFileSync(path.join(dirRef, path.basename(f)), execFileSync('git', ['show', `${REF}:${f}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
  }
  A = await import(pathToFileURL(path.join(dirRef, 'emails-fillsell.ts')).href);
} catch (e) { A = null; console.log('   (référence illisible : ' + String(e?.message ?? e).slice(0, 120) + ')'); }
if (A) {
  const cas = [
    { ventes: [{ titre: 'Veste', plateforme: 'vinted', prixVente: 35, benefice: 22 }], retraitsACliquer: 2, retraitsBeebsAuto: 1 },
    { ventes: [{ titre: 'Lampe', plateforme: 'leboncoin', prixVente: 20, benefice: null }, { titre: null, plateforme: 'ebay', prixVente: 12, benefice: 4 }], retraitsACliquer: 0, retraitsBeebsAuto: 0 },
    { ventes: [{ titre: 'Puzzle', plateforme: 'vinted', prixVente: 14, benefice: -3 }], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true },
    { ventes: [{ titre: 'Sac', plateforme: 'ailleurs', prixVente: null, benefice: null }], retraitsACliquer: 0, retraitsBeebsAuto: 0, dejaVendu: [] },
  ];
  ok(cas.every((c) => ['fr', 'en'].every((l) => { const a = A.mailVentes(c, l), b = E.mailVentes(c, l); return a.sujet === b.sujet && a.html === b.html; })),
    `sans question ouverte : mailVentes identique à l'octet à ${REF}, FR et EN`);
  const raf = { ventes: Array.from({ length: 9 }, (_, i) => ({ titre: `A${i}`, plateforme: 'leboncoin', prixVente: 10, benefice: null, aConfirmer: i === 3 })) };
  ok(['fr', 'en'].every((l) => A.mailRafale(raf, l).html === E.mailRafale(raf, l).html && A.mailRafale(raf, l).html === E.mailRafale({ ...raf, dejaVendu: [] }, l).html),
    `sans question ouverte : mailRafale identique à l'octet à ${REF}`);
} else ok(false, `gabarit de référence ${REF} illisible`);

console.log('\n3. Le récapitulatif d\'une rafale');
const raf2 = { ventes: Array.from({ length: 8 }, (_, i) => ({ titre: `Jeu ${i}`, plateforme: 'vinted', prixVente: 9, benefice: null })), dejaVendu: ['ebay', 'leboncoin', 'beebs'] };
const r = E.mailRafale(raf2, 'fr');
ok(texte(r.html).includes('3 annonces de ces articles sont encore en ligne (Leboncoin, eBay et Beebs)') || /3 annonces de ces articles sont encore en ligne \(/.test(texte(r.html)),
  'le récapitulatif nomme les annonces encore en ligne (« de ces articles »)', texte(r.html).slice(0, 600));
ok(r.html.includes(E.URL_DEJA_VENDU), 'son bouton ouvre « Déjà vendu ? »');
const r2 = E.mailRafale({ ventes: raf2.ventes.map((v, i) => ({ ...v, aConfirmer: i === 0 })), dejaVendu: ['ebay'] }, 'fr');
ok(r2.html.includes(E.URL_VENTES_A_CONFIRMER) && texte(r2.html).includes('encore en ligne'), 'une vente à confirmer dans la rafale : bouton « Confirmer les ventes », le paragraphe reste');

console.log('\n4. push-ventes : les questions OUVERTES des fiches vendues du mail, rien d\'autre');
const PV = lire('supabase/functions/push-ventes/index.ts');
const f = PV.slice(PV.indexOf('async function annoncesEncoreEnLigne('), PV.indexOf('const idsDesArticles'));
ok(/\.from\("inventaire_doublons"\)\.select\("id, preuves"\)/.test(f) &&/\.eq\("user_id", userId\)\.eq\("motif", "copie_non_prouvee"\)\.eq\("statut", "proposee"\)\.in\("garde", ids\)\.limit\(50\)/.test(f),
  'lecture : inventaire_doublons du compte, motif copie_non_prouvee, statut proposee, fiches du mail, 50 au plus');
ok(/slice\(0, 100\)/.test(f) && /if \(error \|\| !Array\.isArray\(data\)\) return \[\];/.test(f) && /catch \{\s*return \[\];/.test(f), 'bornée (100 fiches) ; une lecture ratée = le mail d\'avant, jamais un mail bloqué');
ok(!/\.(insert|upsert|delete)\(/.test(f) && (f.match(/\.update\(/g) ?? []).length === 1,
  'une seule écriture : la réservation de la question (jamais une insertion, jamais un effacement)');
// (09/11, garde-fou de Nico) Une question n'est citée que dans UN mail : la note qui la cite d'abord la réserve.
ok(/if \(deja\) \{ if \(String\(deja\.note \?\? ""\) === note\) citees\.push\(pf\); continue; \}/.test(f)
  && /mail_vente: \{ note, le: new Date\(\)\.toISOString\(\) \}/.test(f)
  && /\.eq\("id", q\.id\)\.eq\("statut", "proposee"\)\.is\("preuves->mail_vente", null\)\.select\("id"\)/.test(f)
  && /if \(pris\?\.length\) citees\.push\(pf\);/.test(f),
  'une question n\'est citée qu\'une fois : réservée (compare-and-set) par la note qui la cite ; le même mail réessayé la garde, un autre jamais');
// Aucun mail de plus : le paragraphe voyage dans le mail de la vente (même nombre d'envois que 72d0135).
const PV_AVANT = execFileSync('git', ['show', '72d0135:supabase/functions/push-ventes/index.ts'], { cwd: RACINE, encoding: 'utf8' });
ok(!/envoyerEmail\(/.test(f) && (PV.match(/envoyerEmail\(\{/g) ?? []).length === (PV_AVANT.match(/envoyerEmail\(\{/g) ?? []).length,
  'aucun mail de plus : rien n\'est envoyé pour la question, le nombre d\'envois de push-ventes est celui d\'avant');
const fv = PV.slice(PV.indexOf('async function envoyerMailVente('), PV.indexOf('async function envoyerMailVentesGroupe('));
ok(/const dejaVendu = n\.a_decider === true \? \[\] : await annoncesEncoreEnLigne\(admin, n\.user_id, groupe\.flatMap\(idsDesArticles\), n\.id\);/.test(fv)
  && /\.\.\.\(dejaVendu\.length \? \{ dejaVendu \} : \{\}\)/.test(fv) && /retraitsACliquer: 0,/.test(fv), 'mail d\'une vente (et de son groupe) : les fiches de TOUTES ses ventes ; vente à confirmer → rien');
const fr = PV.slice(PV.indexOf('async function envoyerMailRafale('), PV.indexOf('function messageDuRecap('));
ok(/lignesRafale\(n\.articles\)\.filter\(\(l\) => l\.a_decider !== true\)/.test(fr) && /mailRafale\(\{ ventes, \.\.\.dv \}, lang\)/.test(fr), 'récapitulatif : les ventes enregistrées de la rafale');
ok(/const idsDesArticles = \(n: NoteServie\): unknown\[\] =>\s*\(Array\.isArray\(n\.articles\) && n\.articles\.length \? n\.articles\.map\(\(a\) => a\?\.inventaire_id\) : \[n\.inventaire_id\]\);/.test(PV),
  'une commande Vinted à plusieurs articles : la fiche de chaque article');

console.log('\n5. L\'app : le lien ouvre « Déjà vendu ? » une fois');
let pris = 0;
const prendre = (v) => () => { pris++; return v; };
ok(L.ouvrirDejaVenduAuLien({ lues: false, nbQuestions: 2, prendre: prendre(true) }) === false && pris === 0, 'questions pas encore lues : on attend, le lien n\'est pas consommé');
ok(L.ouvrirDejaVenduAuLien({ lues: true, nbQuestions: 2, prendre: prendre(true) }) === true, 'lien + questions → l\'écran s\'ouvre');
ok(L.ouvrirDejaVenduAuLien({ lues: true, nbQuestions: 0, prendre: prendre(true) }) === false, 'lien sans question (déjà répondue) → rien');
ok(L.ouvrirDejaVenduAuLien({ lues: true, nbQuestions: 3, prendre: prendre(false) }) === false, 'sans lien → rien (jamais d\'ouverture spontanée)');
const APP = lire('src/App.jsx');
ok(/get\('ventes'\)==='deja-vendu'\)\{\s*noterLienDejaVendu\(\);\s*setTab\(1\);/.test(APP) && APP.includes("import { noterLienDejaVendu } from './utils/lienDejaVendu';"),
  'App : ?ventes=deja-vendu → intention notée (survit à la connexion), onglet Stock, paramètre effacé');
ok(/get\('ventes'\)==='a-decider'\)\{\s*sessionStorage\.setItem\('fillsell:ventes-a-decider','1'\);/.test(APP), 'App : ?ventes=a-decider inchangé');
const ST = lire('src/tabs/StockTab.jsx');
ok(/if \(ouvrirDejaVenduAuLien\(\{ lues: doublonsLus && items\.length > 0, nbQuestions: questionsDejaVendu\.length \}\)\) setEcranDejaVendu\(true\);/.test(ST)
  && /setDoublonsProposes\(Array\.isArray\(d\) \? d : \[\]\); setDoublonsLus\(true\);/.test(ST), 'Stock : l\'écran « Déjà vendu ? » s\'ouvre une fois les questions lues ; aucune lecture en base de plus');
ok((ST.match(/lireDoublonsProposes\(/g) ?? []).length === (lire('src/tabs/StockTab.jsx').match(/lireDoublonsProposes\(/g) ?? []).length
  && /useEffect\(\(\) => \{ relireDoublons\(\); \}, \[relireDoublons\]\);/.test(ST), 'Stock : la lecture des questions est celle d\'avant (même effet, même nombre d\'appels)');

console.log(`\n${echecs ? '✗' : '✓'} selftest:deja-vendu-mail — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
