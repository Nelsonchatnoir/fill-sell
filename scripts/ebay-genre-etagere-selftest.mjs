// selftest:ebay-genre-etagere — (19/11/2026, décision de Nico)
// QUAND LE VENDEUR A RANGÉ SON ARTICLE DANS UNE ÉTAGÈRE VINTED, C'EST ELLE QUI FAIT FOI POUR LE GENRE eBAY,
// AVANT TOUTE DÉDUCTION DE L'APP.
//
//   npm run selftest:ebay-genre-etagere
//   (node --import ./scripts/loader-ext.mjs scripts/ebay-genre-etagere-selftest.mjs)
//
// Cas (compte 2f8b09d2, 17/11 22:28) : « Parka longue NikeLab ACG Gore-Tex taille S », étagère Vinted 2551 « Hommes ›
// … › Vestes coupe-vent » ; la copie eBay sort de la rédaction au genre DEVINÉ « Femme » (« tranche toujours ») et
// l'app pose « Femme : … › Manteaux, vestes et gilets » (63862). Mesuré sur 60 jours (2 902 publications eBay décidées
// par l'app, 1 106 à étagère genrée) : 91 copies au genre contraire à l'étagère, 77 publiées dans le rayon de l'autre
// genre, 20 comptes ; 915 déjà d'accord et 17 au genre choisi par la personne ne bougent pas.
// Ce que le verrou prouve :
//   1. la règle (une seule : _shared/genre-etagere-vinted.js) — étagère › déduction, le choix de la personne au-dessus,
//      rien sans étagère genrée, rien pour un objet dont eBay ne demande pas le genre ;
//   2. l'app (resolutionPublication.js, la vraie cascade, hors ligne) : étagère Hommes → Homme et 57988 même quand le
//      texte « tranche » Femme ; le choix de la personne au-dessus ; SANS étagère (ou étagère compatible), la sortie de
//      la résolution est celle d'AVANT à l'octet (comparée au fichier d'avant la règle, commit ce6e27f, imports réécrits) ;
//   3. le worker eBay après un refus (ebay-genre-apres-refus.js) lit la même règle : l'étagère avant le texte.
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };
const charger = async (f) => { try { return await import(pathToFileURL(path.join(RACINE, f)).href); } catch (e) { return { __absent: String(e?.message ?? e).slice(0, 200) }; } };
const appel = (M, n, ...a) => { try { return typeof M[n] === 'function' ? M[n](...a) : undefined; } catch (e) { return { __erreur: e.message }; } };

const R = await charger('supabase/functions/_shared/genre-etagere-vinted.js');
const VB = await charger('supabase/functions/_shared/vinted-branche.ts');
const GAR = await charger('supabase/functions/_shared/ebay-genre-apres-refus.js');
const RP = await charger('src/utils/resolutionPublication.js');

// ── L'AVANT : resolutionPublication.js tel qu'au commit ce6e27f (le dernier avant la règle), imports réécrits vers le dépôt.
const PIN = 'ce6e27f';
let AVANT = null, dossierAvant = null;
try {
  const rel = 'src/utils/resolutionPublication.js';
  const src = execFileSync('git', ['show', `${PIN}:${rel}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 << 20 });
  const cible = (spec) => {
    const base = path.resolve(path.dirname(path.join(RACINE, rel)), spec);
    for (const s of ['', '.js', '.mjs', '/index.js']) if (existsSync(base + s) && statSync(base + s).isFile()) return pathToFileURL(base + s).href;
    throw new Error(`import introuvable : ${spec}`);
  };
  const reecrit = src.replace(/(from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\2/g, (_, a, q, spec) => `${a}${q}${cible(spec)}${q}`);
  dossierAvant = mkdtempSync(path.join(os.tmpdir(), 'ebay-genre-etagere-'));
  mkdirSync(dossierAvant, { recursive: true });
  const f = path.join(dossierAvant, 'resolutionPublication.avant.mjs');
  writeFileSync(f, reecrit);
  AVANT = await import(pathToFileURL(f).href);
} catch (e) { AVANT = { __absent: String(e?.message ?? e).slice(0, 200) }; }

// ── La résolution, hors ligne (aucune IA, aucun appel) — la vraie cascade.
const fauxSupabase = {
  functions: { invoke: async () => ({ data: null, error: { message: 'hors ligne (selftest)' } }) },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [] }) }; return q; },
};
const outilsPour = (icone) => ({ platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null, GENERIC_ASPECTS_PF_KEY: {},
  normAspectVal: (s) => s, resolveArticleIcon: () => icone, resolveArticleIconDetail: () => ({ icon: icone, source: 'ia' }), OPLA_ETAT_PAR_LIBELLE: {} });
const logs = console.log, warns = console.warn;
const silence = async (fn) => { console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = logs; console.warn = warns; } };
const TITRE = 'Parka longue NikeLab ACG Gore‑Tex taille S kaki olive neuve avec étiquette';
const ETAGERE_2551 = { v: 2551, source: 'vinted_detail', at: '2026-11-17T21:00:00.000Z' };
/** Un article : copies (genre par plateforme, titre par plateforme), fiche (colonne, attribut), choix. */
const article = ({ icone = '🧥', objet = 'parka', titre = TITRE, genres = { vinted: 'Homme', beebs: 'Homme', ebay: 'Femme' }, titres = {}, colonne = 2551,
  attribut = ETAGERE_2551, pfEbay = {}, rayonsChoisis = {}, description = 'Superbe parka longue, modèle technique et recherché.' } = {}) => {
  const pfs = Object.keys(genres);
  const edited = Object.fromEntries(pfs.map((p) => [p, { title: titres[p] ?? titre, description,
    platform_fields: { genre: genres[p], etat: 'Neuf avec étiquette', marque: 'Nike', ...(p === 'ebay' ? pfEbay : {}) },
    ...(rayonsChoisis[p] ? { rayon_choisi: rayonsChoisis[p] } : {}) }]));
  return { plateformes: pfs, selected: new Set(pfs), edited,
    initialListing: { titre, description, vinted_catalog_id: colonne, attributs: attribut ? { categorie_vinted: attribut } : {} },
    sharedFields: {}, sharedOverrides: {}, activeAiIcon: icone, activeAiObjet: objet, origineCat: null, lang: 'fr', supabase: fauxSupabase, ebayVoieApi: true,
    outils: outilsPour(icone) };
};
const resoudre = async (M, ctx) => { try { return typeof M?.resoudrePublication === 'function' ? await silence(() => M.resoudrePublication(ctx)) : null; } catch (e) { return { __erreur: e.message }; } };
const sansDates = (x) => JSON.stringify(x ?? null).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<le>');
const ebay = (r) => r?.pfParPlateforme?.ebay ?? {};

console.log("1. La règle : _shared/genre-etagere-vinted.js (une seule, lue par l'app et par le worker)");
ok(!R.__absent, 'le module existe', R.__absent);
const e2551 = appel(R, 'etagereDeLaFiche', { categorieVinted: ETAGERE_2551, colonne: 2551 }, VB.brancheVinted);
ok(e2551?.genre === 'Homme' && e2551?.id === 2551, `étagère 2551 (relevé) → public « Homme » (${JSON.stringify(e2551)})`);
const G = (x) => appel(R, 'genreDeLEtagere', x);
const d1 = G({ genre: 'Femme', pf: {}, etagere: e2551 });
ok(d1?.genre === 'Homme' && d1.change === true && d1.avant === 'Femme' && d1.source === 'etagere_vinted', `genre deviné « Femme » contraire à l'étagère Hommes → « Homme » (${JSON.stringify(d1)})`);
const d2 = G({ genre: 'Homme', pf: {}, etagere: e2551 });
ok(d2?.genre === 'Homme' && d2.change === false, "genre déjà celui de l'étagère : fixé, inchangé (plus aucune déduction après)");
ok(G({ genre: 'Femme', pf: { categorie_source: 'choix_humain' }, etagere: e2551 }) === null, 'rayon eBay choisi par la personne : la règle se tait (le choix reste au-dessus)');
ok(G({ genre: 'Femme', pf: { genre_du_choix: { de: 'vinted' } }, etagere: e2551 }) === null, "public d'un rayon Vinted choisi à l'écran : la règle se tait");
ok(G({ genre: 'Femme', pf: { genre_aligne_sur_rayon: { avant: 'Homme' } }, etagere: e2551 }) === null, 'genre aligné sur un rayon choisi : la règle se tait');
ok(G({ genre: 'Femme', pf: {}, etagere: e2551, choixPersonne: true }) === null, "un choix que l'appelant connaît (rayon choisi) : la règle se tait");
ok(G({ genre: 'Femme', pf: {}, etagere: null }) === null, 'sans étagère genrée : null (la règle d\'avant)');
ok(appel(R, 'etagereDeLaFiche', { categorieVinted: { v: 2551, source: 'ia' }, colonne: null }, VB.brancheVinted) === null, "un attribut qui ne vient pas d'un relevé ne compte pas");
ok(appel(R, 'etagereDeLaFiche', { categorieVinted: null, colonne: 3048 }, VB.brancheVinted) === null, 'une étagère sans public (Livres et médias › VHS) : rien');
ok(G({ genre: '', pf: {}, etagere: e2551, genreRequis: false }) === null, 'genre vide sur un objet dont eBay ne demande pas le genre (hors mode) : rien');
ok(G({ genre: '', pf: {}, etagere: e2551, genreRequis: true })?.genre === 'Homme', "genre vide sur un article qui EXIGE un genre : l'étagère le donne (avant l'auto-genre)");
ok(G({ genre: 'Mixte', pf: {}, etagere: { genre: 'Femme', via: 'x' }, genreRequis: false }) === null, '🌸 + « Mixte » (Parfums mixtes, un vrai rayon) : rien');
ok(G({ genre: 'Bébé', pf: {}, etagere: { genre: 'Fille', via: 'x' } })?.change === false, 'Bébé sous une étagère Enfants › filles : compatible, gardé');
const ed = { ebay: { title: 't', platform_fields: { genre: 'Femme' } } };
const c1 = appel(R, 'copieEbayALEtagere', ed, { etagere: e2551, le: 'L' });
ok(c1?.edited?.ebay?.platform_fields?.genre === 'Homme' && c1.edited.ebay.platform_fields.genre_de_l_etagere?.avant === 'Femme' && ed.ebay.platform_fields.genre === 'Femme',
  'copieEbayALEtagere : la copie eBay prend le genre, tracé (genre_de_l_etagere, genre d\'avant), sans muter l\'entrée');
ok(appel(R, 'copieEbayALEtagere', ed, { etagere: null })?.edited === ed, 'sans étagère : le même objet, intact');
const edChoisi = { ebay: { ...ed.ebay, rayon_choisi: { chemin: ['Vêtements, accessoires', 'Femme : vêtements, accessoires'], id: '63862' } } };
ok(appel(R, 'copieEbayALEtagere', edChoisi, { etagere: e2551 })?.edited === edChoisi, 'rayon eBay choisi par la personne : la copie ne bouge pas');

console.log("\n2. L'app : resolutionPublication.js, la vraie cascade (hors ligne)");
ok(!RP.__absent && !AVANT.__absent, `la résolution d'aujourd'hui et celle d'avant (${PIN}) se chargent`, RP.__absent ?? AVANT.__absent);
// a. Le cas 2f8b09d2.
{
  const ctx = article();
  const [av, ap] = [await resoudre(AVANT, ctx), await resoudre(RP, article())];
  ok(ebay(av).genre === 'Femme' && String(ebay(av).ebayCategoryId) === '63862', `avant : copie eBay « Femme » → 63862 (le défaut) (${ebay(av).genre}, ${ebay(av).ebayCategoryId})`);
  ok(ebay(ap).genre === 'Homme' && String(ebay(ap).ebayCategoryId) === '57988', `après : l'étagère 2551 → « Homme » → 57988 « Homme : … › Manteaux, vestes et gilets » (${ebay(ap).genre}, ${ebay(ap).ebayCategoryId})`);
  ok(ebay(ap).genre_de_l_etagere?.avant === 'Femme' && /2551/.test(ebay(ap).genre_de_l_etagere?.via ?? ''), `tracé sur la tâche (${JSON.stringify(ebay(ap).genre_de_l_etagere ?? null)})`);
  ok(ap?.pfParPlateforme?.beebs?.genre === av?.pfParPlateforme?.beebs?.genre && ap?.pfParPlateforme?.vinted?.genre === av?.pfParPlateforme?.vinted?.genre, 'eBay seulement : Vinted et Beebs inchangés');
}
// b. Le texte « tranche » Femme (titre réécrit par l'IA) : l'étagère passe AVANT.
{
  const titres = { vinted: 'Parka longue femme NikeLab ACG Gore-Tex S kaki' };
  const ctx = () => article({ genres: { vinted: 'Homme', beebs: 'Homme', ebay: 'Homme' }, titres });
  const [av, ap] = [await resoudre(AVANT, ctx()), await resoudre(RP, ctx())];
  ok(ebay(av).genre === 'Femme', `avant : le texte « femme » retournait la copie eBay « Homme » en « Femme » (${ebay(av).genre})`);
  ok(ebay(ap).genre === 'Homme' && String(ebay(ap).ebayCategoryId) === '57988', `après : étagère Hommes → « Homme » même si le texte tranche « Femme » (${ebay(ap).genre}, ${ebay(ap).ebayCategoryId})`);
  ok(ap?.pfParPlateforme?.vinted?.genre === av?.pfParPlateforme?.vinted?.genre, 'la règle du texte reste ce qu\'elle était pour les autres copies');
}
// c. La colonne seule, l'attribut seul.
{
  const col = await resoudre(RP, article({ attribut: null }));
  ok(ebay(col).genre === 'Homme', `la colonne vinted_catalog_id seule suffit (${ebay(col).genre})`);
  const att = await resoudre(RP, article({ colonne: null }));
  ok(ebay(att).genre === 'Homme', `l'attribut categorie_vinted (relevé) seul suffit (${ebay(att).genre})`);
}
// d. Genre vide sur un article qui exige un genre : l'étagère, pas l'auto-genre (copie Vinted « Femme »).
{
  const ap = await resoudre(RP, article({ genres: { vinted: 'Femme', beebs: 'Femme', ebay: '' } }));
  ok(ebay(ap).genre === 'Homme', `genre eBay vide : l'étagère le donne avant l'auto-genre des copies sœurs (${ebay(ap).genre})`);
}
// e. Le choix de la personne reste au-dessus.
{
  const choixEbay = await resoudre(RP, article({ rayonsChoisis: { ebay: { chemin: ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : vêtements', 'Manteaux, vestes et gilets'], id: '63862' } } }));
  ok(ebay(choixEbay).genre === 'Femme' && !ebay(choixEbay).genre_de_l_etagere, `rayon eBay choisi par la personne : son genre reste (${ebay(choixEbay).genre})`);
  const duChoix = await resoudre(RP, article({ pfEbay: { genre_du_choix: { de: 'vinted', genre: 'Femme', avant: 'Homme' } } }));
  ok(ebay(duChoix).genre === 'Femme', `public d'un rayon Vinted choisi à l'écran (genre_du_choix) : il reste (${ebay(duChoix).genre})`);
  const vintedChoisi = await resoudre(RP, article({ rayonsChoisis: { vinted: { chemin: ['Femmes', 'Vêtements', 'Manteaux et vestes', 'Parkas'], id: '1' } } }));
  ok(ebay(vintedChoisi).genre === 'Femme', `rayon Vinted « Femmes › … » choisi à l'écran : la personne passe avant l'étagère relevée (${ebay(vintedChoisi).genre})`);
}
// f. SANS étagère (ou étagère compatible, ou objet sans genre) : la sortie de la résolution est celle d'avant, à l'octet.
const identiques = [
  ['parka sans étagère (ni colonne, ni attribut)', () => article({ colonne: null, attribut: null })],
  ['attribut qui ne vient pas d\'un relevé', () => article({ colonne: null, attribut: { v: 2551, source: 'ia' } })],
  ['étagère sans public (Livres et médias › VHS)', () => article({ icone: '📼', objet: 'cassette', titre: 'Cassette VHS Le Roi Lion', colonne: 3048, attribut: null, genres: { vinted: '', ebay: '' } })],
  ['texte « femme » sans étagère (la règle du texte, comme avant)', () => article({ colonne: null, attribut: null, genres: { vinted: 'Homme', beebs: 'Homme', ebay: 'Homme' }, titres: { vinted: 'Parka longue femme NikeLab' } })],
  ['étagère Hommes et copie eBay déjà « Homme » (part déjà bien)', () => article({ genres: { vinted: 'Homme', beebs: 'Homme', ebay: 'Homme' } })],
  ['objet hors mode sous une étagère genrée (Femmes › Beauté), genre vide', () => article({ icone: '💄', objet: 'rouge à lèvres', titre: 'Rouge à lèvres Dior 999', colonne: 964, attribut: null, genres: { vinted: '', ebay: '' } })],
  ['parfum « Mixte » sous une étagère Femmes (Parfums mixtes, un vrai rayon)', () => article({ icone: '🌸', objet: 'parfum', titre: 'Parfum CK One 100 ml', colonne: 964, attribut: null, genres: { vinted: 'Femme', ebay: 'Mixte' } })],
  ['enfant compatible : Bébé sous Enfants › filles', () => article({ icone: '👗', objet: 'robe', titre: 'Robe bébé 6 mois', colonne: 1243, attribut: null, genres: { vinted: 'Fille', ebay: 'Bébé' } })],
];
for (const [quoi, ctx] of identiques) {
  const [av, ap] = [await resoudre(AVANT, ctx()), await resoudre(RP, ctx())];
  const [a, b] = [sansDates(av), sansDates(ap)];
  ok(!av?.__erreur && !ap?.__erreur && a === b, `à l'octet — ${quoi}`, a === b ? (av?.__erreur ?? ap?.__erreur ?? '') : `avant ${a.slice(0, 160)}…\n    après ${b.slice(0, 160)}…`);
}
// g. L'empreinte du pré-calcul suit l'étagère (attribut lu après le pré-calcul → le clic recalcule).
{
  const sig = (attr) => RP.signatureResolution?.({ ...article({ colonne: null, attribut: attr }), ficheAttributs: attr ? { categorie_vinted: attr } : {} });
  ok(typeof RP.signatureResolution === 'function' && sig(ETAGERE_2551) !== sig(null), "l'empreinte change quand l'étagère de la fiche arrive (pré-calcul jamais repris sans elle)");
}

console.log("\n3. Le worker eBay après un refus : la même règle, l'étagère avant le texte");
const GR = (x) => appel(GAR, 'genreApresRefus', x);
const PFR = { genre: 'Homme', categorie_icone: '🧥', categorie_source: 'icone_non_confirmee' };
ok(GR({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: PFR, etagere: e2551 })?.genre === 'Homme', "étagère Hommes : « Homme » même si le titre (réécrit par l'IA) dit « femme »");
ok(GR({ genre: 'Femme', titre: TITRE, pf: { ...PFR, genre: 'Femme' }, etagere: e2551 })?.genre === 'Homme', 'le cas 2f8b09d2 reste réglé (Femme → Homme)');
ok(GR({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: PFR, etagere: null })?.genre === 'Femme', 'sans étagère : le texte, comme avant');
ok(GR({ genre: 'Femme', titre: TITRE, pf: { ...PFR, categorie_source: 'choix_humain' }, etagere: e2551 })?.genre === 'Femme', 'un choix de la personne : son genre reste');
const W = lire('supabase/functions/_shared/ebay-genre-apres-refus.js');
ok(/from "\.\/genre-etagere-vinted\.js"/.test(W) && !/export function genreContredit/.test(W) && !/export function etagereDeLaFiche/.test(W),
  'ebay-genre-apres-refus.js lit la règle commune (aucune copie de genreContredit / etagereDeLaFiche)');
const A = lire('src/utils/resolutionPublication.js');
ok(/from "\.\.\/\.\.\/supabase\/functions\/_shared\/genre-etagere-vinted\.js"/.test(A) && /await import\("\.\.\/\.\.\/supabase\/functions\/_shared\/vinted-branche\.ts"\)/.test(A)
  && !/^import [^\n]*vinted-branche\.ts/m.test(A),
  "resolutionPublication.js lit la règle commune et l'étagère par son identifiant (vinted-branche.ts, chargée à la demande)");

if (dossierAvant) { try { rmSync(dossierAvant, { recursive: true, force: true }); } catch { /* dossier temporaire */ } }
console.log(`\n${echecs ? '✗' : '✓'} selftest:ebay-genre-etagere — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
