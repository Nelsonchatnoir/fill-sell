// selftest:site-moteur — les règles du moteur du site vitrine (09/10/2026,
// corrections de la revue de la fondation, docs/seo/revue-fondation/).
//
// Hors ligne, sans build ni écriture dans l'arbre (< 5 s). Prouve :
//   1. FAQ : une réponse avec gras, lien, code, liste, apostrophe typographique
//      ou insécable est reprise TELLE QU'AFFICHÉE dans la FAQPage, et le
//      vérificateur l'accepte ; un fragment (« Non. ») est refusé (I-1) ;
//   2. liens : relatif, http://, www., absolu vers le site depuis le contenu
//      refusés ; externe https, ancre, mailto acceptés (I-2) ;
//   3. un titre « ## Contenu » ne reprend jamais l'id du gabarit (M-3) ;
//   4. page:<langue>:<id> vise une autre langue, avec hreflang (M-2) ;
//   5. llms-full : liens titrés et par référence résolus (M-5) ;
//   6. dates : 31 février et futur refusés (M-1) ;
//   7. recouvrement : deux pages identiques à 60 % refusées, là où Jaccard
//      les laissait passer (I-6) ;
//   8. l'habillage du gabarit ne change pas l'empreinte des dates (I-9) ;
//   9. contrastes des jetons de site.css ≥ WCAG AA, et l'ancien bouton refusé (I-5) ;
//  10. langues déclarées : libellés, consentement, x-default (I-4) ;
//  11. la production refuse le contenu de démonstration, la prévisualisation
//      l'accepte (I-7) ;
//  12. lecture des href par le vérificateur ;
//  13. jetons {{plateformes}} {{republication}} {{nb_plateformes}} tirés des
//      données, jeton inconnu et ancien jeton de quota refusés ;
//  14. contrat des types (FORMAT-CONTENU.md) : champ propre à un autre type
//      refusé, cartes de fonctions et étapes validées ;
//  15. tarifs : un chiffre dans ce qui est inclus = refus (aucun quota) ;
//  16. FAQ en <details>, glossaire (DefinedTermSet) depuis le texte visible ;
//  17. habillage imbriqué retiré sans marqueur orphelin ; typographie française ;
//  18. lexique banni (décisions de Nico) reconnu par le vérificateur — palier
//      à côté de la republication sous toutes ses formes (revue technique C-8) ;
//  19. « Depop partout » dans le texte : une liste d'avant Depop refusée (C-9) ;
//  20. contrastes sur fonds MÊLÉS (halos, dégradés) : les anciennes couleurs
//      refusées, les nouvelles acceptées (C-3) ;
//  21. tableaux Markdown : coin vide → en-têtes de ligne, région nommée par le
//      titre ; <pre> focalisable (M-2, C-10) ;
//  22. faits concurrents : la ligne FillSell perd le palier écrit à côté de la
//      republication, les valeurs { fr, en } passent en traductions (C-8, C-11) ;
//  23. (09/11) grille à 3 jauges des cartes LUE EN BASE (scripts/site/lib/grille.mjs) :
//      carrés et lignes chiffrées, interrupteur, base illisible = aucun carré ; cartes
//      avec et sans grille, boîtes d'explication, section FillSell Cloud sans Android ;
//  24. (09/11) logos des plateformes : devant leur nom (alt vide), jamais à sa place.
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendreMarkdown, texteVisible } from './site/lib/markdown.mjs';
import { texteBrut, texteComparable, contenuPrincipal, sansRegions, typographie } from './site/lib/html.mjs';
import { remplacerJetons, remplacerJetonsProfond, valeursJetons, lireTarifs } from './site/lib/donnees.mjs';
import { validerFrontmatter } from './site/lib/contenu.mjs';
import { lirePlateformes } from './site/lib/donnees.mjs';
import { LEXIQUE_BANNI, REGLES_DECISION, CLOUD_ANDROID_OUVERT, REGLE_CLOUD_ANDROID, CLOUD_IPHONE_OUVERT, REGLE_CLOUD_IPHONE, listeSansDepop, contrastePaire, couleurRgba, logosPlateformesFautifs } from './site/verify-site.mjs';
import { lireGrilleEnBase, jaugesDeCarte } from './site/lib/grille.mjs';
import { cartesTarifs, blocCloud } from '../site/gabarits/blocs.mjs';
import { importer as importerConcurrents } from './site/importer-concurrents.mjs';
import { mkdirSync, writeFileSync as ecrire } from 'node:fs';
import { dateValide, dateFuture, empreinteContenu } from './site/lib/dates.mjs';
import {
  faqVisible, recouvrement, sequencesDe, lireHref, jetonsCss, ratioContraste, PAIRES_CONTRASTE, RECOUVREMENT_REFUS,
} from './site/verify-site.mjs';
import { LANGUES, langueXDefault } from '../site/langues.mjs';
import { TEXTES } from '../site/gabarits/textes.mjs';
import { TEXTES_CONSENTEMENT } from '../src/utils/consentementTextes.js';
import { genererSite, prixAvecCloud, supplementsCloud, formulesAvecEssai } from './site/build-site.mjs';
import { lireInterrupteurFormules, valeurOuverte, CLE_INTERRUPTEUR_SITE } from './site/lib/interrupteur-cloud.mjs';
import * as FORMULES_CLOUD from '../supabase/functions/_shared/formules-cloud.js';
import { readdirSync } from 'node:fs';
import { lirePagesSite } from './site/lib/contenu.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}
const leve = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const ctx = (extra = {}) => ({
  fichier: 'essai.md', source: 'site', type: 'page', lang: 'fr', racine, faqAttendue: false,
  medias: { entree: () => null }, url: () => null, libelleTableau: 'Tableau',
  resoudre: (id, _f, l) => ({ chemin: (l && l !== 'fr' ? `/${l}` : '') + `/${id}`, lang: l ?? 'fr', hreflang: l ?? 'fr' }),
  ...extra,
});

// ── 1. FAQ affichée = FAQPage ───────────────────────────────────────────────
{
  const md = [
    '## Questions fréquentes',
    '',
    '### Est-ce gratuit ?',
    '',
    "Oui, c'est **gratuit**. Voir [le guide](page:faq), grâce à l’**extension** et à `npm`.",
    '',
    '### Où publier ?',
    '',
    'Sur deux sites :',
    '',
    '- Vinted',
    '- Leboncoin',
    '',
    `### Combien${String.fromCharCode(0xa0)}?`,
    '',
    'Le plan inclut des republications.',
  ].join('\n');
  const r = await rendreMarkdown(md, ctx({ faqAttendue: true }));
  ok(r.faq?.length === 3, `3 questions extraites (${r.faq?.length})`);
  ok(r.faq?.[1]?.reponse === 'Sur deux sites : Vinted Leboncoin', `liste jointe par des espaces (« ${r.faq?.[1]?.reponse} »)`);
  const visibles = faqVisible(r.html);
  for (const q of r.faq ?? []) {
    const cle = texteComparable(q.question);
    ok(visibles.has(cle), `question visible : « ${q.question} »`);
    ok(visibles.get(cle) === texteComparable(q.reponse), `réponse « ${q.question} » = texte affiché\n      JSON-LD : ${texteComparable(q.reponse)}\n      page    : ${visibles.get(cle)}`);
  }
  ok(visibles.get(texteComparable('Est-ce gratuit ?')) !== texteComparable('Oui.'), 'un fragment (« Oui. ») ne passe pas pour la réponse');
  ok(texteComparable(texteBrut("<p>c'est <strong>gratuit</strong>.</p>")) === texteComparable("c'est gratuit."), 'gras collé à un point : même forme');
  ok(texteComparable(texteBrut('<p>l’<strong>extension</strong></p>')) === texteComparable('l’extension'), 'apostrophe typographique avant du gras : même forme');
  ok(texteVisible({ type: 'paragraph', children: [{ type: 'image', alt: 'texte alternatif' }, { type: 'text', value: 'visible' }] }) === 'visible', 'le texte alternatif des images ne passe pas dans la FAQPage');
}

// ── 2. Liens écrits dans le Markdown ────────────────────────────────────────
for (const [lien, refuse, source = 'site'] of [
  ['faq', 'RELATIF'], ['../faq', 'RELATIF'], ['./faq', 'RELATIF'], ['?q=1', 'RELATIF'],
  ['http://fillsell.app/faq', 'www'], ['https://www.fillsell.app/faq', 'www'], ['https://fillsell.app/faq', 'adresse absolue'],
  ['//example.com', 'sans protocole'], ['javascript:alert(1)', 'protocole'], ['http://example.com', 'https:// attendu'],
  ['/faq', 'écrit à la main'],
  ['https://example.com/x', null], ['#ancre', null], ['mailto:support@fillsell.app', null], ['/login?mode=signup', null],
  ['https://fillsell.app', null, 'blog'], ['/blog/x', null, 'blog'], ['faq', 'RELATIF', 'blog'],
]) {
  const e = await leve(() => rendreMarkdown(`Voir [ici](${lien}).`, ctx({ source })));
  if (refuse) ok(e && e.includes(refuse), `lien « ${lien} » (${source}) refusé (« ${refuse} ») — reçu : ${e}`);
  else ok(!e, `lien « ${lien} » (${source}) accepté — reçu : ${e}`);
}

// ── 3. Ids du gabarit réservés ──────────────────────────────────────────────
{
  const r = await rendreMarkdown('## Contenu\n\nUn.\n\n## Navigation\n\nDeux.', ctx());
  ok(r.html.includes('id="contenu-2"') && r.html.includes('id="navigation-2"') && !/id="contenu"/.test(r.html), `ids du gabarit évités (${r.titres.map((t) => t.id).join(', ')})`);
}

// ── 4. Lien vers une autre langue, explicite ───────────────────────────────
{
  const r = await rendreMarkdown('Voir [the FAQ](page:en:faq) et [ref][f].\n\n[f]: page:en:faq', ctx());
  ok((r.html.match(/<a href="\/en\/faq" hreflang="en">/g) ?? []).length === 2, `page:en:faq → hreflang="en", lien direct et par référence (${r.html})`);
}

// ── 5. llms-full : Markdown résolu ──────────────────────────────────────────
{
  const r = await rendreMarkdown('Voir [la FAQ][f] ou [celle-ci](page:faq "La FAQ").\n\n[f]: page:faq', ctx());
  ok(!/page:/.test(r.markdown) && r.markdown.includes('https://fillsell.app/faq'), `Markdown résolu : ${r.markdown}`);
}

// ── 6. Dates ────────────────────────────────────────────────────────────────
ok(dateValide('2026-10-09') && dateValide('2024-02-29'), 'dates réelles acceptées');
ok(!dateValide('2026-02-31') && !dateValide('2026-13-01') && !dateValide('2026-1-01') && !dateValide(20261009), 'dates impossibles refusées');
ok(dateFuture('2030-01-01', '2026-10-09') && !dateFuture('2026-10-09', '2026-10-09'), 'futur reconnu (Paris)');

// ── 7. Recouvrement ─────────────────────────────────────────────────────────
{
  const mot = (p, i) => `${p}${i}`;
  const commun = Array.from({ length: 600 }, (_, i) => mot('commun', i)).join(' ');
  const a = `${commun} ${Array.from({ length: 400 }, (_, i) => mot('alpha', i)).join(' ')}`;
  const b = `${commun} ${Array.from({ length: 400 }, (_, i) => mot('bravo', i)).join(' ')}`;
  const sa = sequencesDe(a);
  const sb = sequencesDe(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const jaccard = inter / (sa.size + sb.size - inter);
  const r = recouvrement(sa, sb);
  ok(jaccard < 0.5, `témoin : Jaccard ${jaccard.toFixed(2)} laissait passer deux pages identiques à 60 %`);
  ok(r >= RECOUVREMENT_REFUS, `recouvrement ${r.toFixed(2)} ≥ ${RECOUVREMENT_REFUS} : refusé`);
}

// ── 8. Habillage hors empreinte ─────────────────────────────────────────────
{
  const page = (lib, desc) => `<!--fs:contenu:debut--><h1>T</h1><p>Texte de la page.</p><!--fs:habillage:debut--><section><h2>${lib}</h2><a href="/faq"><span>${desc}</span></a></section><!--fs:habillage:fin--><!--fs:contenu:fin-->`;
  ok(empreinteContenu(page('À lire aussi', 'Description A')) === empreinteContenu(page('Lire aussi', 'Description B')), 'libellé du gabarit et description d\'une autre page : empreinte inchangée');
  ok(empreinteContenu(page('À lire aussi', 'x')) !== empreinteContenu(page('À lire aussi', 'x').replace('Texte de la page', 'Autre texte')), 'texte du contenu : empreinte changée');
  ok(!texteBrut(contenuPrincipal(page('À lire aussi', 'x'))).includes('lire aussi'), 'habillage hors du texte compté (mots, similarité)');
}

// ── 9. Contrastes ───────────────────────────────────────────────────────────
{
  const css = readFileSync(path.join(racine, 'site', 'styles', 'site.css'), 'utf8');
  const jetons = jetonsCss(css);
  for (const [texte, fond, seuil, usage] of PAIRES_CONTRASTE) {
    const c = contrastePaire(jetons, texte, fond);
    ok(!c.erreur && c.ratio >= seuil, `${usage} : ${texte} ${jetons.get(texte)} / ${c.nomFond ?? fond} = ${c.ratio?.toFixed(2) ?? c.erreur}:1 (seuil ${seuil})`);
  }
  ok(ratioContraste('#FFFFFF', '#2F9E90') < 4.5, 'témoin : l\'ancien bouton (blanc sur #2F9E90) est sous le seuil');
}

// ── 20. Contrastes sur fonds MÊLÉS ─────────────────────────────────────────
{
  const j = new Map([['--gr', '#5C6560'], ['--gt', '#4D5752'], ['--ht', '#2f9e9042'], ['--to', '#EDEAE0'], ['--me', '#4ECDC4'], ['--sf', '#1B6E62'], ['--s2', '#BFCBC6'], ['--ap', 'rgba(232,149,109,.62)'], ['--en', '#10201B'], ['--x', 'rgba(1,2,3,.5)']]);
  ok(JSON.stringify(couleurRgba('#2f9e9042').slice(0, 3)) === '[47,158,144]' && Math.abs(couleurRgba('#2f9e9042')[3] - 0.26) < 0.01, 'couleur #rrggbbaa (forme minifiée de lightningcss) lue avec son alpha');
  ok(contrastePaire(j, '--gr', ['--ht', '--to']).ratio < 4.5, `témoin : l'ancien chapô (--gr) au cœur du halo teal = ${contrastePaire(j, '--gr', ['--ht', '--to']).ratio.toFixed(2)}:1, refusé`);
  ok(contrastePaire(j, '--gt', ['--ht', '--to']).ratio >= 4.5, 'le gris de tête (--gt) au cœur du halo teal passe');
  ok(contrastePaire(j, '--me', '--sf').ratio < 4.5, 'témoin : l\'ancien numéro d\'étape (menthe) sur la tête du dégradé, refusé');
  ok(contrastePaire(j, '--s2', ['--ap', '--en']).ratio < 4.5, 'témoin : l\'ancienne note de l\'appel final sur le coin pêche à 62 %, refusée');
  ok(!!contrastePaire(j, '--x', '--to').erreur, 'un texte à alpha est refusé (on ne compose que les fonds)');
}

// ── 10. Langues déclarées ───────────────────────────────────────────────────
for (const l of LANGUES) {
  ok(!!TEXTES[l.code] && !!TEXTES_CONSENTEMENT[l.code], `langue ${l.code} : libellés et consentement`);
  ok(typeof TEXTES[l.code]?.pied?.perimetre === 'function' && !/française|french app/i.test(TEXTES[l.code]?.pied?.resume ?? ''), `langue ${l.code} : périmètre daté, aucune identité « app française »`);
}
ok(langueXDefault(['fr', 'en']) === 'en' && langueXDefault(['fr', 'de']) === 'fr' && langueXDefault(['fr']) === null, 'x-default : en, sinon fr, rien pour une seule version');

// ── 11. Démonstration : production refusée, prévisualisation acceptée ──────
{
  const demo = (await lirePagesSite(racine)).some((p) => p.demonstration);
  const essai = async (env) => {
    const temp = mkdtempSync(path.join(tmpdir(), 'fs-moteur-'));
    try { return await leve(() => genererSite({ dossier: temp, racine, mode: 'controle', journal: { log() {}, warn() {} }, env })); }
    finally { rmSync(temp, { recursive: true, force: true }); }
  };
  const prod = await essai({ VERCEL: '1', VERCEL_ENV: 'production' });
  const prev = await essai({ VERCEL: '1', VERCEL_ENV: 'preview' });
  if (demo) ok(prod && prod.includes('DÉMONSTRATION REFUSÉ EN PRODUCTION'), `production : contenu de démonstration refusé (reçu ${prod})`);
  else ok(!prod, `production : aucun contenu de démonstration, accepté (reçu ${prod})`);
  ok(!prev, `prévisualisation : acceptée (reçu ${prev})`);
}

// ── 11 bis. Verrou des dates périmé : seul le build DU SITE local échoue ───
// (revue technique C-6 : une vidéo refaite par un autre terminal bloquait les
// builds natif et OTA). Le verrou réel, avec l'empreinte de « / » faussée.
{
  const reel = JSON.parse(readFileSync(path.join(racine, 'site', 'dates.lock.json'), 'utf8'));
  const faux = { pages: { ...reel.pages, '/': { ...reel.pages['/'], empreinte: '00000000000000000000' } } };
  const avertis = [];
  const journal = { log() {}, warn(m) { avertis.push(m); } };
  const essai = async (mode, env) => {
    const temp = mkdtempSync(path.join(tmpdir(), 'fs-dates-'));
    try {
      ecrire(path.join(temp, 'app-shell.html'), '<!doctype html><div id="root"></div>');
      return await leve(() => genererSite({ dossier: temp, racine, mode, journal, env, verrou: faux, verifier: false }));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  };
  const app = await essai('controle', {});
  ok(!app && avertis.some((m) => m.includes('DATES PÉRIMÉES') && m.includes("build de l'app")), `build de l'app (natif, OTA) : verrou périmé = avertissement, jamais un échec (reçu ${app})`);
  const site = await essai('build', {});
  ok(!!site && site.includes('DATES PÉRIMÉES'), `build du site en local : verrou périmé refusé (reçu ${site?.slice(0, 60)})`);
  const vercel = await essai('build', { VERCEL: '1', VERCEL_ENV: 'preview' });
  ok(!vercel || !vercel.includes('DATES PÉRIMÉES'), `Vercel : verrou périmé = avertissement (reçu ${vercel?.slice(0, 80)})`);
}

// ── 12. Lecture des href par le vérificateur ────────────────────────────────
{
  const u = 'https://fillsell.app/crosslisting/vinted-vers-leboncoin';
  ok(lireHref('faq', u).erreur?.includes('RELATIF'), 'href relatif : erreur');
  ok(lireHref('https://www.fillsell.app/x', u).erreur && lireHref('http://fillsell.app/x', u).erreur, 'www. et http:// vers le site : erreur');
  const i = lireHref('/faq#plateformes', u);
  ok(i.genre === 'interne' && i.chemin === '/faq' && i.ancre === 'plateformes' && !i.erreur, 'href interne avec ancre lu');
  ok(lireHref('https://fillsell.app', u).chemin === '/' && lireHref('https://example.com', u).genre === 'externe', 'origine nue = /, externe reconnu');
}

// ── 13. Jetons ──────────────────────────────────────────────────────────────
{
  const plateformes = lirePlateformes(racine);
  const fr = valeursJetons({ plateformes, locale: 'fr-FR', nombres: TEXTES.fr.nombres });
  const en = valeursJetons({ plateformes, locale: 'en-US', nombres: TEXTES.en.nombres });
  const auto = plateformes.ouvertes.filter((p) => p.republication_auto).map((p) => p.nom);
  ok(fr.plateformes.startsWith(plateformes.ouvertes[0].nom) && fr.plateformes.includes(' et '), `{{plateformes}} FR : « ${fr.plateformes} »`);
  ok(en.plateformes.includes(' and '), `{{plateformes}} EN : « ${en.plateformes} »`);
  ok(auto.every((n) => fr.republication.includes(n)) && !fr.republication.includes('eBay'), `{{republication}} tirée de republication_auto, jamais eBay : « ${fr.republication} »`);
  ok(fr.nb_plateformes === TEXTES.fr.nombres[plateformes.ouvertes.length], `{{nb_plateformes}} : « ${fr.nb_plateformes} »`);
  ok(remplacerJetons('Sur {{plateformes}}.', fr, 'x.md') === `Sur ${fr.plateformes}.`, 'jeton remplacé dans le corps');
  ok(remplacerJetonsProfond({ a: ['{{ nb_plateformes }} plateformes'] }, fr, 'x.md').a[0] === `${fr.nb_plateformes} plateformes`, 'jeton remplacé dans le frontmatter (listes comprises, espaces tolérées)');
  const inconnu = await leve(() => remplacerJetons('{{plateforms}}', fr, 'x.md'));
  ok(inconnu && inconnu.includes('inconnu'), `jeton inconnu refusé (${inconnu})`);
  const quota = await leve(() => remplacerJetons('{{quota:REPUB_FREE}}', fr, 'x.md'));
  ok(quota && quota.includes('quotas'), `ancien jeton de quota refusé avec sa raison (${quota})`);
}

// ── 14. Contrat des types ──────────────────────────────────────────────────
{
  const plateformes = lirePlateformes(racine);
  const base = { id: 'essai', type: 'guide', lang: 'fr', nom: 'Essai', title: 'Un titre de page assez long', description: 'Une description assez longue pour passer le contrôle de longueur minimale du schéma, sans plus.', h1: 'Un titre', chapo: 'Un chapô assez long pour passer le minimum de quarante caractères.', publie: '2026-10-09' };
  const v = (data) => leve(() => validerFrontmatter(data, { fichier: 'essai.md', langDossier: 'fr', cheminFichier: 'essai', plateformes, racine, aujourdhui: '2026-10-09' }));
  ok(!(await v(base)), 'guide minimal accepté');
  const reserve = await v({ ...base, fonctions: [] });
  ok(reserve && reserve.includes('réservé au type accueil'), `champ propre à l'accueil refusé sur un guide (${reserve})`);
  const etapes = await v({ ...base, etapes: [{ titre: 'Un', texte: 'trop court' }] });
  ok(etapes && /étapes|étape/.test(etapes), `étapes hors contrat refusées (${etapes})`);
  const media = await v({ ...base, hero_media: 'captures/n-existe-pas.png', hero_alt: 'Un texte alternatif assez long.' });
  ok(media && media.includes('absent de site/medias'), `capture absente refusée (${media})`);
  const sansAlt = await v({ ...base, plateformes_citees: ['vinted'], surtitre: 'Guide', points_cles: ['Un point clé assez long pour passer.', 'Un deuxième point clé assez long.', 'Un troisième point clé assez long.'] });
  ok(!sansAlt, `champs communs acceptés (${sansAlt})`);
  const pfInconnue = await v({ ...base, plateformes_citees: ['poshmark'] });
  ok(pfInconnue && pfInconnue.includes("n'est pas une plateforme ouverte"), `plateforme inconnue refusée (${pfInconnue})`);
}

// ── 15. Tarifs : AUCUN chiffre de volume dans tarifs.yml ─────────────────────
// (10/10, Nico : les cartes portent les volumes de l'app. 09/11, maquette « tarifs
// à 3 jauges » validée par Nico : ces volumes sont LUS EN BASE au build —
// scripts/site/lib/grille.mjs —, un volume recopié dans tarifs.yml avait dérivé :
// il est refusé, « inclus » compris.)
{
  const temp = mkdtempSync(path.join(tmpdir(), 'fs-tarifs-'));
  try {
    mkdirSync(path.join(temp, 'site', 'donnees'), { recursive: true });
    const vrai = readFileSync(path.join(racine, 'site', 'donnees', 'tarifs.yml'), 'utf8');
    ok(!(await leve(() => lireTarifs(racine, ['fr', 'en']))), 'site/donnees/tarifs.yml accepté (aucun volume recopié)');
    ok(!/^\s+- "[^"\n]*\d/m.test(vrai), 'aucune ligne de carte ne porte de chiffre (les volumes viennent de la base)');
    ecrire(path.join(temp, 'site', 'donnees', 'tarifs.yml'), vrai.replace('Pour vendre chaque semaine', '40 annonces par mois'));
    const e = await leve(() => lireTarifs(temp, ['fr', 'en']));
    ok(e && e.includes('aucun chiffre de quota'), `chiffre de quota dans « pour » refusé (${e})`);
    ecrire(path.join(temp, 'site', 'donnees', 'tarifs.yml'), vrai.replace('"Support prioritaire"', '"120 annonces créées et publiées par mois"'));
    const e2 = await leve(() => lireTarifs(temp, ['fr', 'en']));
    ok(e2 && e2.includes('aucun chiffre de quota'), `volume recopié dans « inclus » refusé (${e2})`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// ── 16. FAQ en <details>, glossaire ────────────────────────────────────────
{
  const r = await rendreMarkdown('## Questions fréquentes\n\n### Est-ce gratuit ?\n\nOui.\n\n### Et ensuite ?\n\nOn verra.', ctx({ faqAttendue: true }));
  ok((r.html.match(/<details class="faq-item"><summary><h3/g) ?? []).length === 2, 'FAQ : chaque question dans un <details>, le h3 dans le <summary>');
  const vis = faqVisible(r.html);
  ok(vis.get(texteComparable('Est-ce gratuit ?')) === 'Oui.', 'FAQ en <details> : la réponse visible reste la réponse seule');
  const g = await rendreMarkdown('### Crosslisting\n\nPublier un article sur plusieurs plateformes.\n\nExemple : une veste.\n\n### Fiche\n\nLa description unique d\'un article.', ctx({ type: 'glossaire' }));
  ok(g.termes?.length === 2 && g.termes[0].definition === 'Publier un article sur plusieurs plateformes.' && g.termes[0].id === 'crosslisting', `glossaire : termes et définitions (${JSON.stringify(g.termes)})`);
  const sansDef = await leve(() => rendreMarkdown('### Terme\n\n- une liste', ctx({ type: 'glossaire' })));
  ok(sansDef && sansDef.includes('sans définition'), `terme sans définition refusé (${sansDef})`);
}

// ── 17. Habillage imbriqué, typographie ────────────────────────────────────
{
  const h = 'A<!--fs:habillage:debut-->B<!--fs:habillage:debut-->C<!--fs:habillage:fin-->D<!--fs:habillage:fin-->E';
  ok(sansRegions(h, 'habillage') === 'AE', `habillage imbriqué retiré entier (${sansRegions(h, 'habillage')})`);
  const t = typographie('<p title="a : b">StoFlow : lequel ? « oui »</p>', 'fr');
  const nb = String.fromCharCode(0xa0);
  ok(t === `<p title="a : b">StoFlow${nb}: lequel${nb}? «${nb}oui${nb}»</p>`, `typographie FR dans le texte seulement (${t})`);
  ok(typographie('<p>Price : x</p>', 'en') === '<p>Price : x</p>', 'typographie : rien en anglais');
  // (09/11) Un montant ne se coupe pas : « 24,99 € », « 15 % » insécables ; un € sans chiffre devant reste tel quel.
  ok(typographie('<p>FillSell Cloud : 24,99 € par mois, 15 % de frais. Prix en €.</p>', 'fr') === `<p>FillSell Cloud${nb}: 24,99${nb}€ par mois, 15${nb}% de frais. Prix en €.</p>`,
    'typographie FR : « 24,99 € » et « 15 % » insécables');
}

// ── 18. Lexique banni ──────────────────────────────────────────────────────
{
  const banni = (texte) => [...LEXIQUE_BANNI, ...REGLES_DECISION].some(([r]) => r.test(texte));
  for (const t of [
    'Republication automatique avec Pro ou Business.', 'Synchronisation en temps réel.', 'Un bot qui publie.', 'Republier sur eBay et Vinted.', 'Le seul outil du marché.',
    // Les trois passages publiés le 09/10 à 19:34 avec 0 erreur (revue technique C-8) :
    'Republication Manuelle et automatique, à tous les paliers',
    'FillSell la republie tout seul. Avec Pro ou Business, au créneau que tu choisis.',
    'La republication Vinted existe à côté, à votre main : rythme humain, plafond que vous réglez, coupure à tout moment — manuelle sur tous les plans, automatisable avec le plan Pro.',
    'Tes annonces remontent dès le palier Gratuit.', 'It reposts your listings on every plan.', 'Tes annonces remontent sur eBay aussi.',
  ]) ok(banni(t), `lexique banni reconnu : « ${t} »`);
  for (const t of [
    'Tes annonces remontent toutes seules sur Vinted, Leboncoin, Beebs et Depop.', 'Premium, Pro et Business ajoutent du volume.', 'Publie sur eBay.',
    // Cartes de tarifs (une inclusion par puce, chaque fin de bloc finit la phrase) :
    'Republier en lot, sans y penser. Support prioritaire. Passer Pro',
    'Une annonce qui remonte en un appui. Marges et bénéfices calculés pour toi. Commencer gratuitement',
  ]) ok(!banni(t), `phrase permise : « ${t} »`);
  // (09/11, décision de Nico) « Aucun Cloud » levé : FillSell Cloud se nomme ; Opla reste interdit (PLATEFORME_SORTIE).
  ok(!banni('FillSell Cloud : plus besoin d’ordinateur, sur iPhone et sur le web.'), 'FillSell Cloud se nomme sur le site (règle « aucun Cloud » levée le 09/11)');
  // Garde : le Cloud ne s'annonce pas sur Android tant que Google n'a pas validé la vc37 ; (12/11, décision 3a de Nico)
  // ni sur l'iPhone tant que cloud_formules_apple n'est pas à 1. Les drapeaux disent ce qui est ouvert ; la règle reste
  // écrite et appliquée tant que son drapeau est faux.
  ok(REGLE_CLOUD_ANDROID.test('FillSell Cloud, sur iPhone, Android et le web.') && REGLE_CLOUD_ANDROID.test('Sur Android aussi, FillSell Cloud publie sans ordinateur.'),
    'la règle reconnaît FillSell Cloud + Android (refusé tant que CLOUD_ANDROID_OUVERT est faux)');
  ok(REGLE_CLOUD_IPHONE.test('Avec FillSell Cloud, sur iPhone et sur le web, plus besoin d’ordinateur.') && REGLE_CLOUD_IPHONE.test('Sur iPhone aussi, FillSell Cloud publie sans ordinateur.')
    && !REGLE_CLOUD_IPHONE.test('FillSell Cloud, sur le web. L’app iPhone et Android pilote FillSell.'),
    'la règle reconnaît FillSell Cloud + iPhone dans une phrase, pas l’app iPhone dans une autre (refusé tant que CLOUD_IPHONE_OUVERT est faux)');
  ok(!REGLE_CLOUD_ANDROID.test('FillSell Cloud, sur iPhone et sur le web. Les apps iPhone et Android pilotent FillSell.') && !REGLE_CLOUD_ANDROID.test('Apps iPhone et Android, et le web.'),
    'Android cité AILLEURS (apps, autre phrase) → permis');
}

// ── 19. « Depop partout » dans le texte ────────────────────────────────────
{
  ok(!!listeSansDepop('Tu vends sur… Vinted · Leboncoin · eBay · Beebs. Et tu recopies.'), 'liste d\'avant Depop (les quatre autres, sans Depop) refusée');
  ok(!listeSansDepop('Une photo, cinq plateformes : Vinted, Leboncoin, eBay, Beebs et Depop.'), 'liste avec Depop permise');
  ok(!listeSansDepop('Comme pour Vinted, Leboncoin et Beebs, l\'extension agit dans ta session.'), 'sous-ensemble sans eBay permis (page Depop, extension)');
}

// ── 21. Tableaux Markdown, <pre> ───────────────────────────────────────────
{
  const r = await rendreMarkdown('## Frais comparés\n\n| | Vinted | Beebs |\n|---|---|---|\n| Frais | 5 % | 0 € |\n| Public | Mode | Enfant |\n\n```\nProfit = Prix de vente − Prix d\'achat − Frais − Envoi\n```\n', ctx({ type: 'guide' }));
  const h = r.html;
  ok(/<div class="defile" role="region" tabindex="0" data-defile="" aria-labelledby="frais-compares">/.test(h), `région du tableau nommée par le titre qui précède (${(h.match(/<div class="defile"[^>]*>/) ?? [''])[0]})`);
  ok(/<thead><tr><td><\/td><th scope="col">Vinted<\/th>/.test(h), 'coin d\'en-tête vide : cellule ordinaire, en-têtes de colonne en scope="col"');
  ok(/<tr><th scope="row">Frais<\/th><td>5 %<\/td>/.test(h.replace(/\u00a0/g, ' ')), 'première colonne : en-têtes de ligne (th scope="row")');
  ok(/<pre class="bloc-code" tabindex="0" data-defile="">/.test(h), `bloc <pre> : classe du module « code », focalisable (site.js ne garde l'arrêt que s'il défile) — ${(h.match(/<pre[^>]*>/) ?? [''])[0]}`);
  const cleValeur = (await rendreMarkdown('## Exemple\n\n| | |\n|---|---|\n| Prix de vente | 32 € |\n', ctx({ type: 'guide' }))).html;
  ok(!/<thead>/.test(cleValeur) && /<tr><th scope="row">Prix de vente<\/th><td>32 €<\/td>/.test(cleValeur.replace(/\u00a0/g, ' ')), `tableau clé → valeur (en-tête vide) : ligne d'en-tête retirée, clés en en-têtes de ligne (${cleValeur.slice(0, 160)})`);
  const sansTitre = (await rendreMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n', ctx({ type: 'guide' }))).html;
  ok(/aria-label="Tableau"/.test(sansTitre) && /<tr><td>1<\/td>/.test(sansTitre), 'sans titre ni coin vide : libellé de repli, cellules inchangées');
}

// ── 22. Faits concurrents : palier retiré de la ligne FillSell, langues ──────
{
  const fait = (valeur) => ({ valeur, sources: ['https://exemple.fr'], date: '2026-10-09', niveau: 'verifie' });
  const brief = {
    meta: { niveaux: { verifie: 'lu' }, criteres: { republication: 'x', import_synchro: 'x', app_mobile: 'x' }, observe_le: '2026-10-09' },
    outils: [
      { slug: 'fillsell', nom: 'FillSell', url: 'https://fillsell.app', notre_produit: true, criteres: {
        republication: fait('manuelle et automatique, à tous les paliers ; par créneaux ; plateformes : voir plateformes_auto ; ordinateur allumé'),
        import_synchro: fait('oui — sur « Synchroniser », sans quota, tous paliers'),
      } },
      { slug: 'autre', nom: 'Autre', url: 'https://autre.fr', criteres: {
        republication: fait('automatique à partir de Pro'),
        app_mobile: fait({ fr: 'non — extension seulement', en: 'no — extension only' }),
      } },
    ],
  };
  const d = importerConcurrents(brief);
  const nous = d.outils.find((o) => o.slug === 'fillsell');
  const autre = d.outils.find((o) => o.slug === 'autre');
  ok(nous.criteres.republication.valeur === 'manuelle et automatique ; par créneaux ; ordinateur allumé', `ligne FillSell : palier et renvoi interne retirés (« ${nous.criteres.republication.valeur} »)`);
  ok(nous.criteres.import_synchro.valeur.includes('tous paliers'), 'ligne FillSell : un palier loin de la republication reste (synchronisation)');
  ok(autre.criteres.republication.valeur === 'automatique à partir de Pro', 'concurrent : son fait daté reste tel quel (data-tiers)');
  ok(autre.criteres.app_mobile.valeur === 'non — extension seulement' && autre.criteres.app_mobile.traductions?.valeur?.en === 'no — extension only' && autre.criteres.app_mobile.verdict === 'non', 'valeur { fr, en } : français en base, anglais en traductions, verdict lu en français');
}

// ── 23. Grille à 3 jauges des cartes, lue en base (09/11, maquette validée par Nico) ──
{
  // coin_config tel que la base le rend (0 = illimité), interrupteur à 1.
  const K = { grille_trois_jauges: 1, jauge_annonces_free: 5, jauge_publications_free: 50, jauge_remontees_free: 30, quota_retouche_free: 0,
    jauge_annonces_premium: 40, jauge_publications_premium: 400, jauge_remontees_premium: 1500, quota_retouche_premium: 5,
    jauge_annonces_pro: 120, jauge_publications_pro: 1200, jauge_remontees_pro: 0, quota_retouche_pro: 20,
    jauge_annonces_business: 0, jauge_publications_business: 0, jauge_remontees_business: 0, quota_retouche_business: 50, jauge_lens_business: 600 };
  const pro = jaugesDeCarte(K, 'pro', 'fr');
  const nbsp = (t) => t.replace(/[\u00a0\u202f]/g, ' ');
  ok(pro && pro.carres.map((c) => nbsp(c.valeur)).join('|') === '120|1 200|illimitées' && pro.carres.map((c) => c.mot).join('|') === 'annonces|publications|remontées',
    `carrés du Pro lus dans K, 0 = « illimitées » (${pro?.carres.map((c) => c.valeur).join('|')})`);
  ok(pro.carres[0].aria === "120 annonces — qu'est-ce que ça compte ?" && pro.carres[2].illimite, `nom accessible du carré = celui de l'app (${pro.carres[0].aria})`);
  ok(pro.lignes.join('|') === 'Retouche IA : 20 annonces retouchées par mois', `ligne de retouche du Pro (${pro.lignes})`);
  const business = jaugesDeCarte(K, 'business', 'en');
  ok(business.lignes.length === 2 && /^Lens: 600 scans a month$/.test(nbsp(business.lignes[0])) && business.carres.every((c) => c.valeur === 'unlimited'),
    `Business EN : Lens d'abord (ordre de la maquette), tout « unlimited » (${business.lignes.join(' | ')})`);
  ok(jaugesDeCarte(K, 'gratuit', 'fr').lignes.length === 0, 'Gratuit : aucune retouche, aucune ligne chiffrée');
  ok(jaugesDeCarte(null, 'pro', 'fr') === null, 'base illisible : aucune grille (la carte part sans carrés, jamais un repli recopié)');
  const hors = await lireGrilleEnBase({ url: 'https://x.supabase.co', cle: 'k' }, { env: { FILLSELL_SITE_GRILLE_HORS_LIGNE: '1' } });
  ok(hors.K === null, 'hors ligne : aucune requête, aucune grille');
  const lignes = Object.entries(K).map(([key, value]) => ({ key, value }));
  const reponse = (rows) => async () => ({ ok: true, status: 200, json: async () => rows });
  const lue = await lireGrilleEnBase({ url: 'https://x.supabase.co', cle: 'k' }, { env: {}, fetcher: reponse(lignes) });
  ok(lue.source === 'base' && lue.K.jauge_annonces_pro === 120, 'grille lue en base');
  const coupee = await lireGrilleEnBase({ url: 'https://x.supabase.co', cle: 'k' }, { env: {}, fetcher: reponse(lignes.map((l) => (l.key === 'grille_trois_jauges' ? { ...l, value: 0 } : l))) });
  ok(coupee.K === null && /interrupteur/.test(coupee.raison), `interrupteur à 0 en base : pas de carrés (le serveur décide, comme l'app) (${coupee.raison})`);
  const trouee = await lireGrilleEnBase({ url: 'https://x.supabase.co', cle: 'k' }, { env: {}, fetcher: reponse(lignes.filter((l) => l.key !== 'jauge_annonces_pro')) });
  ok(trouee.K === null && /jauge_annonces_pro/.test(trouee.raison), 'une clé de volume absente : aucune grille (jamais une grille à moitié vraie)');
  const panne = await lireGrilleEnBase({ url: 'https://x.supabase.co', cle: 'k' }, { env: {}, essais: 2, fetcher: async () => ({ ok: false, status: 503 }) });
  ok(panne.K === null && /503/.test(panne.raison), 'base en panne : aucune grille, la raison dite');

  // Les blocs : cartes avec et sans grille, section FillSell Cloud.
  const site = {
    logos: { Vinted: '/assets/site/vinted.0123456789.webp', Leboncoin: '/assets/site/leboncoin.0123456789.webp', eBay: '/assets/site/ebay.0123456789.webp', Beebs: '/assets/site/beebs.0123456789.webp', Depop: '/assets/site/depop.0123456789.webp' },
    iconeAppStore: '/assets/site/app-store.0123456789.svg',
    // (11/11 au soir) Plus de Cloud seul : prix des formules AVEC Cloud lus dans l'app (PRIX_AVEC_CLOUD) ; ici, absents.
    cloud: { avecCloud: null, essaiJours: 7, plateformes: ['Vinted', 'Leboncoin', 'Beebs', 'Depop'] },
  };
  // (12/11, plan de nuit de Nico) Interrupteur cloud_formules_stripe OUVERT : prix, supplément, essai et mise en avant LUS
  // dans supabase/functions/_shared/formules-cloud.js par les fonctions du build (jamais recopiés dans le gabarit).
  const siteAvec = { ...site, cloud: { ...site.cloud, avecCloud: prixAvecCloud(FORMULES_CLOUD.PRIX_AVEC_CLOUD_EUR),
    supplement: supplementsCloud(FORMULES_CLOUD.supplementCloud), essaiFormules: formulesAvecEssai(FORMULES_CLOUD.FORMULES_AVEC_ESSAI),
    miseEnAvant: String(FORMULES_CLOUD.FORMULE_MISE_EN_AVANT).replace(/_cloud$/, '') } };
  const tarifs = { ...lireTarifs(racine, ['fr', 'en']), communs: { fr: ['Publication sur Vinted, Leboncoin, eBay, Beebs et Depop'], en: ['Publishing on Vinted, Leboncoin, eBay, Beebs and Depop'] }, lien: null, lienCloud: '#cloud-titre' };
  for (const lang of ['fr', 'en']) {
    const avec = cartesTarifs(site, { lang, tarifs: { ...tarifs, grille: K } });
    const sans = cartesTarifs(site, { lang, tarifs: { ...tarifs, grille: null } });
    ok((avec.match(/class="carre[ "]/g) ?? []).length === 12 && (avec.match(/<dialog class="explication"/g) ?? []).length === 3, `${lang} : 12 carrés et 3 boîtes d'explication`);
    ok(/popovertarget="explication-remontees" aria-haspopup="dialog"/.test(avec) && /role="dialog" popover aria-labelledby="explication-annonces-titre"/.test(avec), `${lang} : carré → sa boîte (popover sans JS), boîte nommée par son titre`);
    ok(!/class="carre|<dialog/.test(sans) && !/\d+ (annonces|listings)/.test(texteBrut(sans)), `${lang} : sans grille, ni carré ni boîte ni volume`);
    ok(!/\d/.test(texteBrut(sansRegions(avec, 'habillage')).replace(/(\d+[,.]\d{2}|\d+)\s?€|€\s?\d+[.,]?\d*|\d+-day|\d+ jours/g, '')), `${lang} : les chiffres de volume sont de l'habillage (hors empreinte des dates)`);
    ok(logosPlateformesFautifs(avec, ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop']).length === 0 && (avec.match(/class="logo-pf"/g) ?? []).length >= 6, `${lang} : logos devant leur nom (« dans tous les forfaits », exemples, option Cloud)`);
    const cloud = blocCloud(site, { lang });
    const texte = texteBrut(cloud);
    // (12/11, décision 3a de Nico) La section Cloud ne nomme que ce qui est ouvert ; jamais Google Play.
    ok((CLOUD_ANDROID_OUVERT || !/Android/.test(texte)) && (CLOUD_IPHONE_OUVERT || !/iPhone/.test(texte)) && !/Google Play/i.test(cloud),
      `${lang} : section FillSell Cloud — Android ${CLOUD_ANDROID_OUVERT ? 'permis' : 'absent'}, iPhone ${CLOUD_IPHONE_OUVERT ? 'permis' : 'absent'}, jamais Google Play`);
    // (11/11 au soir, verrou) Le Cloud SEUL n'est plus vendu : jamais « 24,99 » ni « option » ; prix AVEC Cloud lus dans
    // l'app, absents = aucun prix (jamais un chiffre recopié) ; l'essai et l'ancre restent.
    const prixAvec = lang === 'fr' ? ['34,99', '49,99', '79,99'] : ['34.99', '49.99', '79.99'];
    const cloudAvec = blocCloud(siteAvec, { lang });
    ok(!/24[,.]99/.test(cloud + cloudAvec) && !/\boption\b/i.test(texteBrut(cloud) + texteBrut(cloudAvec)) && (lang === 'fr' ? /7[ \u00a0]jours/ : /7-day/).test(cloud) && /id="cloud-titre"/.test(cloud),
      `${lang} : section Cloud sans Cloud seul (ni 24,99 ni « option »), essai et ancre gardés`);
    ok(!/\d+[,.]\d\d/.test(texteBrut(cloud)) && prixAvec.every((x) => texteBrut(cloudAvec).includes(x)), `${lang} : prix des formules avec Cloud lus dans l'app, aucun prix sans eux`);
    const tarifsAvec = cartesTarifs(siteAvec, { lang, tarifs: { ...tarifs, grille: K } });
    ok(/class="bascule"/.test(tarifsAvec) && /id="formules-sans"[^>]*checked/.test(tarifsAvec) && /id="formules-avec"/.test(tarifsAvec)
      && prixAvec.every((x) => tarifsAvec.includes(x)) && (tarifsAvec.match(/class="prix-avec"/g) ?? []).length >= 9,
      `${lang} : interrupteur « Sans Cloud / Avec Cloud », « Sans » coché, prix avec Cloud sur les trois formules payantes`);
    ok(!/class="bascule"/.test(avec) && /class="option-cloud"/.test(avec) && !/24[,.]99|\boption\b/i.test(texteBrut(avec)),
      `${lang} : sans prix avec Cloud, pas d'interrupteur, le bandeau de repli sans prix ni « option »`);
    // (12/11, VERROU du plan de nuit de Nico) Les textes VALIDÉS des formules avec Cloud :
    //   · « Premium + Cloud », « Pro + Cloud » (« Notre conseil »), « Business + Cloud » — les noms de l'app ;
    //   · « Le Cloud pour 22 € de plus » / « 20 € » (supplementCloud), JAMAIS une « économie » (décision 4) ;
    //   · l'essai SEULEMENT sur Premium + Cloud et Pro + Cloud ; Business + Cloud : « Passer à Business + Cloud » ;
    //   · jamais « n'importe quelle formule » / « any plan » ; plus de Cloud seul ni de 24,99 €.
    const nb = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
    const T = nb(texteBrut(tarifsAvec));
    const carte = (id) => nb(texteBrut((tarifsAvec.match(new RegExp(`<li class="palier palier-${id}[^"]*">[\\s\\S]*?</a></li>`)) ?? [''])[0]));
    const [cPremium, cPro, cBusiness] = ['premium', 'pro', 'business'].map(carte);
    const essayer = lang === 'fr' ? 'Essayer 7 jours' : 'Try it for 7 days';
    const sup = (n) => (lang === 'fr' ? `Le Cloud pour ${n} € de plus` : `Cloud for €${n} more`);
    const passer = lang === 'fr' ? 'Passer à Business + Cloud' : 'Switch to Business + Cloud';
    ok(cPremium && cPro && cBusiness, `${lang} : les trois cartes payantes (repérées par <li class="palier …"> sans autre attribut, comme le vérificateur)`);
    ok(cPremium.includes('Premium + Cloud') && cPro.includes('Pro + Cloud') && cBusiness.includes('Business + Cloud'), `${lang} : noms de l'app « Premium + Cloud », « Pro + Cloud », « Business + Cloud »`);
    ok(cPremium.includes(nb(prixAvec[0])) && cPro.includes(nb(prixAvec[1])) && cBusiness.includes(nb(prixAvec[2])), `${lang} : 34,99 / 49,99 / 79,99 sur leur carte`);
    ok(cPremium.includes(sup(22)) && cPro.includes(sup(20)) && cBusiness.includes(sup(20)) && (tarifsAvec.match(/class="supplement"/g) ?? []).length === 3
      && nb(texteBrut(cloudAvec)).includes(sup(22)), `${lang} : « ${sup(22)} » / « ${sup(20)} » sur chaque carte avec Cloud et dans la section Cloud`);
    ok(!/[ée]conomi|saving|\bsave\b|− ?\d/i.test(T + nb(texteBrut(cloudAvec))) && !/class="economie"/.test(tarifsAvec + cloudAvec), `${lang} : jamais d'« économie » (décision 4 de Nico)`);
    ok(cPremium.includes(essayer) && cPro.includes(essayer), `${lang} : « ${essayer} » sur Premium + Cloud et Pro + Cloud`);
    ok(!cBusiness.includes(essayer) && !/\d+[ -]?(jours|day)|essai|trial/i.test(cBusiness) && cBusiness.includes(passer),
      `${lang} : Business + Cloud SANS essai, bouton « ${passer} »`);
    ok(/palier-pro palier-sombre palier-avant/.test(tarifsAvec) && cPro.includes(TEXTES[lang].misEnAvant) && /<li class="avant"><span>Pro \+ Cloud <em>/.test(cloudAvec),
      `${lang} : Pro + Cloud « ${TEXTES[lang].misEnAvant} » (carte et section Cloud)`);
    const essaiPP = lang === 'fr' ? /7 jours d’essai gratuit,? sur Premium ou Pro avec Cloud/ : /7-day free trial,? on Premium or Pro with Cloud/;
    ok(essaiPP.test(T) && essaiPP.test(nb(texteBrut(avec))) && essaiPP.test(nb(texteBrut(cloud))),
      `${lang} : l'essai dit « sur Premium ou Pro avec Cloud » (interrupteur, repli, section Cloud)`);
    ok(!/importe quelle formule|any plan/i.test(T + texteBrut(cloud) + texteBrut(cloudAvec) + texteBrut(avec)), `${lang} : jamais « n'importe quelle formule » / « any plan »`);
    ok(/^<li class="palier palier-[a-z]+[^"]*">/m.test(tarifsAvec.replace(/<li class="palier/g, '\n<li class="palier')) && !/<li class="palier[^>]*" data-/.test(tarifsAvec)
      && !/class="bascule"|class="prix-avec"|\d+[,.]\d\d\s?€\s?\/|Cloud pour|Cloud for/.test(avec + cloud.replace(/class="cloud-sans-prix"/, '')),
      `${lang} : interrupteur FERMÉ : ni bascule, ni prix avec Cloud, ni supplément`);
    ok(texteBrut(sansRegions(tarifsAvec, 'habillage')) === texteBrut(sansRegions(avec, 'habillage'))
      && texteBrut(sansRegions(cloudAvec, 'habillage')) === texteBrut(sansRegions(cloud, 'habillage')),
      `${lang} : ouvrir l'interrupteur ne change que l'HABILLAGE (aucune date périmée)`);
    ok(!/Places limitées|Limited places|places disponibles|while places last/i.test(cloud + cloudAvec + tarifsAvec), `${lang} : plus de « Places limitées »`);
    ok(['Vinted', 'Leboncoin', 'Beebs', 'Depop'].every((n) => cloud.includes(`>${n}</span>`)) && !/>eBay<\/span><span class="etat/.test(cloud), `${lang} : les quatre plateformes du Cloud, eBay à part (API)`);
    ok(logosPlateformesFautifs(cloud, ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop']).length === 0, `${lang} : logos de la scène devant leur nom`);
  }
}

// ── 23 bis. Formules avec Cloud : le contrat de l'app et l'interrupteur du site (12/11, plan de nuit de Nico) ──
{
  // Le contrat du terminal 1 (supabase/functions/_shared/formules-cloud.js) tel que Nico l'a validé : si un prix, un
  // supplément ou l'essai change dans l'app, ce verrou rougit et les textes du site sont à relire avant tout déploiement.
  ok(JSON.stringify(prixAvecCloud(FORMULES_CLOUD.PRIX_AVEC_CLOUD_EUR)) === JSON.stringify({ premium: 34.99, pro: 49.99, business: 79.99 }),
    `prix avec Cloud lus dans l'app : 34,99 / 49,99 / 79,99 (${JSON.stringify(prixAvecCloud(FORMULES_CLOUD.PRIX_AVEC_CLOUD_EUR))})`);
  ok(JSON.stringify(supplementsCloud(FORMULES_CLOUD.supplementCloud)) === JSON.stringify({ premium: 22, pro: 20, business: 20 }), 'supplément lu dans l\'app : 22 / 20 / 20 €');
  ok(JSON.stringify(formulesAvecEssai(FORMULES_CLOUD.FORMULES_AVEC_ESSAI)) === JSON.stringify(['premium', 'pro']), 'essai : Premium + Cloud et Pro + Cloud seulement, jamais Business');
  ok(FORMULES_CLOUD.FORMULE_MISE_EN_AVANT === 'pro_cloud' && FORMULES_CLOUD.ESSAI_JOURS === 7, 'Pro + Cloud mis en avant, essai de 7 jours');
  ok(prixAvecCloud({ premium_cloud: 34.99, pro_cloud: 0, business_cloud: 79.99 }) === null && prixAvecCloud(null) === null, 'un prix manquant : aucun prix (jamais un repli)');
  ok(supplementsCloud(undefined) === null && supplementsCloud(() => { throw new Error('x'); }) === null, 'supplément illisible : aucun');
  ok(formulesAvecEssai(['business_cloud']).length === 1 && formulesAvecEssai(null).length === 0, 'essai lu tel quel, liste illisible = aucun essai');

  // L'interrupteur : coin_config.cloud_formules_stripe, la clé du web de l'app ; OUVERT = 1 seulement.
  ok(CLE_INTERRUPTEUR_SITE === FORMULES_CLOUD.CLE_INTERRUPTEUR_FORMULES.stripe && CLE_INTERRUPTEUR_SITE === 'cloud_formules_stripe', 'le site lit la clé du web (cloud_formules_stripe)');
  ok(valeurOuverte(1) && valeurOuverte('1') && !valeurOuverte(0) && !valeurOuverte('0') && !valeurOuverte(null) && !valeurOuverte(true) && !valeurOuverte(2), 'ouvert = 1 seulement');
  const sb = { url: 'https://x.supabase.co', cle: 'k' };
  const rep = (rows) => async (url) => ({ ok: true, status: 200, json: async () => (url.includes('key=eq.cloud_formules_stripe') ? rows : []) });
  ok((await lireInterrupteurFormules(sb, { env: {}, fetcher: rep([{ value: 1 }]) })).ouvert === true, 'value 1 en base : ouvert');
  ok((await lireInterrupteurFormules(sb, { env: {}, fetcher: rep([{ value: '1' }]) })).ouvert === true, 'value « 1 » en base : ouvert');
  ok((await lireInterrupteurFormules(sb, { env: {}, fetcher: rep([]) })).ouvert === false, 'aucune ligne : fermé');
  ok((await lireInterrupteurFormules(sb, { env: {}, fetcher: rep([{ value: 0 }]) })).ouvert === false, 'value 0 : fermé');
  const panneI = await lireInterrupteurFormules(sb, { env: {}, essais: 2, fetcher: async () => ({ ok: false, status: 503 }) });
  ok(panneI.ouvert === false && /503/.test(panneI.raison), 'base en panne : fermé (jamais une offre montrée sur un doute)');
  ok((await lireInterrupteurFormules(sb, { env: {}, essais: 1, fetcher: async () => { throw new Error('réseau'); } })).ouvert === false, 'réseau coupé : fermé');
  ok((await lireInterrupteurFormules(sb, { env: { FILLSELL_SITE_GRILLE_HORS_LIGNE: '1' }, fetcher: rep([{ value: 1 }]) })).ouvert === false, 'hors ligne (selftests) : fermé, aucune requête');
  ok((await lireInterrupteurFormules(sb, { env: { FILLSELL_SITE_FORMULES_CLOUD: 'ouvert' }, fetcher: rep([]) })).ouvert === true, 'forçage LOCAL « ouvert » (aperçu, captures)');
  ok((await lireInterrupteurFormules(sb, { env: { VERCEL: '1', FILLSELL_SITE_FORMULES_CLOUD: 'ouvert' }, fetcher: rep([]) })).ouvert === false, 'sur Vercel, le forçage est IGNORÉ : seule la base décide');
  ok((await lireInterrupteurFormules({ url: '', cle: '' }, { env: {}, fetcher: rep([{ value: 1 }]) })).ouvert === false, 'clé publique illisible : fermé');

  // Le contenu : plus jamais l'essai « sur n'importe quelle formule » (correction de Nico du 11/11 22:55), et plus
  // jamais le Cloud « en option » (décision de Nico du 12/11 : le Cloud se prend AVEC une formule).
  const fautifs = [];
  const enOption = [];
  // (12/11, décision 5a de Nico) « On te prévient la veille de la fin de l'essai » : sans preuve côté Stripe ET côté
  // Apple, la phrase sort du mail ET du site ; elle ne revient que sur décision de Nico.
  // (12/11 ~16 h, décision 3a de Nico) Une PHRASE du Cloud ne nomme que les canaux ouverts : l'iPhone seulement quand
  // CLOUD_IPHONE_OUVERT, Android seulement quand CLOUD_ANDROID_OUVERT (le site dit « sur le web » ce soir). Les
  // phrases sur l'APP (« app iPhone et Android ») et la connexion Apple ne nomment pas le Cloud.
  const canalFerme = [];
  const phrasesCloud = (t) => t.split(/(?<=[.!?])\s+|\n/).filter((s) => /\bCloud\b/.test(s) && !/connexion Apple|Sign in with Apple|ou Apple sur|or Apple on/i.test(s));
  const canalInterdit = (s) => (!CLOUD_IPHONE_OUVERT && /\biPhone\b/.test(s)) || (!CLOUD_ANDROID_OUVERT && /\bAndroid\b/.test(s));
  const veille = [];
  const PROMESSE_VEILLE = /veille de la fin de l[’']essai|prévient la veille|the day before (it|the trial|your trial) ends|remind you the day before/i;
  const CLOUD_EN_OPTION = /\bCloud\b[^.!?\n]{0,160}\b(en option|an add-on|add-on)\b|\b(en option|an add-on)\b[^.!?\n]{0,160}\bCloud\b|l[’']option FillSell Cloud|the FillSell Cloud (option|add-on)|en option chez FillSell|plutôt qu[’']en option/i;
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.(md|ya?ml)$/.test(e.name)) {
        const t = readFileSync(p, 'utf8');
        if (/n[’']importe quelle formule avec Cloud|any plan with Cloud|formule de ton choix avec Cloud/i.test(t)) fautifs.push(path.relative(racine, p));
        if (CLOUD_EN_OPTION.test(t)) enOption.push(path.relative(racine, p));
        if (PROMESSE_VEILLE.test(t)) veille.push(path.relative(racine, p));
        for (const s of phrasesCloud(t)) if (canalInterdit(s)) canalFerme.push(`${path.relative(racine, p)} « ${s.slice(0, 90)} »`);
      }
    }
  };
  for (const d of ['site/contenu', 'src/blog', 'site/donnees']) parcourir(path.join(racine, d));
  ok(!fautifs.length, `contenu : jamais l'essai « sur n'importe quelle formule avec Cloud » / « any plan with Cloud » (${fautifs.join(', ') || 'aucun'})`);
  ok(!enOption.length, `contenu : jamais le Cloud « en option » (${enOption.join(', ') || 'aucun'})`);
  ok(!canalFerme.length, `contenu : une phrase du Cloud ne nomme que les canaux ouverts (${canalFerme.slice(0, 4).join(' ; ') || 'aucune faute'}${canalFerme.length > 4 ? ` … +${canalFerme.length - 4}` : ''})`);
  const noteFr = TEXTES.fr.cloudFormules.note(7);
  const noteEn = TEXTES.en.cloudFormules.note(7);
  // Les canaux ouverts, dans l'ordre iPhone, Android, web : « sur iPhone, sur Android et sur le web » / « on iPhone,
  // Android and the web » ; deux : « sur iPhone et sur le web » ; le web seul : « sur le web » / « on the web ».
  const enListe = (l, et) => (l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} ${et} ${l[l.length - 1]}`);
  const canauxFr = enListe([CLOUD_IPHONE_OUVERT && 'sur iPhone', CLOUD_ANDROID_OUVERT && 'sur Android', 'sur le web'].filter(Boolean), 'et');
  const canauxEn = `on ${enListe([CLOUD_IPHONE_OUVERT && 'iPhone', CLOUD_ANDROID_OUVERT && 'Android', 'the web'].filter(Boolean), 'and')}`;
  ok(noteFr.includes(`En France, ${canauxFr}.`) && noteEn.includes(`In France, ${canauxEn}.`),
    `gabarits : la note des formules avec Cloud dit « En France, ${canauxFr}. » / « In France, ${canauxEn}. »`);
  const pastillesAttendues = [CLOUD_IPHONE_OUVERT && 'iPhone', CLOUD_ANDROID_OUVERT && 'Android', 'Web'].filter(Boolean).join(' · ');
  ok(TEXTES.fr.cloud.ou.join(' · ') === pastillesAttendues && TEXTES.en.cloud.ou.join(' · ') === pastillesAttendues,
    `gabarits : pastilles de la section Cloud = canaux ouverts (« ${pastillesAttendues} »)`);
  ok(canalInterdit('Avec FillSell Cloud (formules avec Cloud, sur iPhone et sur le web), plus besoin d’ordinateur.') === !CLOUD_IPHONE_OUVERT
    && canalInterdit('Avec FillSell Cloud (formules avec Cloud, sur Android et sur le web), plus besoin d’ordinateur.') === !CLOUD_ANDROID_OUVERT
    && !canalInterdit('Avec FillSell Cloud, plus besoin d’ordinateur.'),
    `le verrou des canaux refuse l’iPhone ${CLOUD_IPHONE_OUVERT ? '(ouvert : permis)' : '(fermé)'} et Android ${CLOUD_ANDROID_OUVERT ? '(ouvert : permis)' : '(fermé)'} dans une phrase du Cloud`);
  // (12/11, décision 4 de Nico) Google ne donne l'essai qu'à qui n'a JAMAIS eu d'abonnement FillSell sur Google Play :
  // UNE ligne, dans la FAQ des tarifs (FR et EN), et seulement quand Android est ouvert ; jamais dans les textes de
  // présentation.
  const LIGNE_GOOGLE = { fr: "Sur Android, l'essai gratuit est réservé à un premier abonnement FillSell sur Google Play.", en: 'On Android, the free trial is reserved for a first FillSell subscription on Google Play.' };
  const occurrencesGoogle = (lang) => { let n = 0; const compter = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) compter(p); else if (/\.(md|ya?ml)$/.test(e.name)) n += readFileSync(p, 'utf8').split(LIGNE_GOOGLE[lang]).length - 1; } }; for (const d of ['site/contenu', 'src/blog', 'site/donnees']) compter(path.join(racine, d)); return n; };
  const dansFaqTarifs = (f, lang) => { const t = readFileSync(path.join(racine, f), 'utf8'); const i = t.indexOf(LIGNE_GOOGLE[lang]); return i > 0 && /\n### (Combien coûte FillSell Cloud|How much is FillSell Cloud)\s*\?[^#]*$/.test(t.slice(0, i)); };
  ok(CLOUD_ANDROID_OUVERT
    ? occurrencesGoogle('fr') === 1 && occurrencesGoogle('en') === 1 && dansFaqTarifs('site/contenu/fr/tarifs.md', 'fr') && dansFaqTarifs('site/contenu/en/pricing.md', 'en')
    : occurrencesGoogle('fr') === 0 && occurrencesGoogle('en') === 0,
    `contenu : la règle de l'essai Google, ${CLOUD_ANDROID_OUVERT ? 'UNE ligne dans la FAQ des tarifs (FR et EN)' : 'absente (Android fermé)'}`);
  ok(!veille.length, `contenu : jamais « on te prévient la veille de la fin de l'essai » sans preuve (${veille.join(', ') || 'aucun'})`);
  ok(PROMESSE_VEILLE.test("Tu arrêtes le Cloud en un geste, et on te prévient la veille de la fin de l'essai.") && PROMESSE_VEILLE.test('we remind you the day before it ends')
    && !PROMESSE_VEILLE.test('Tu arrêtes le Cloud en un geste.'), 'le verrou « veille » reconnaît la promesse FR et EN, pas la phrase qui la remplace');
  ok(CLOUD_EN_OPTION.test('## Ordinateur éteint : inclus chez StoFlow, en option chez FillSell') && CLOUD_EN_OPTION.test('quand FillSell le vend en option (FillSell Cloud)')
    && !CLOUD_EN_OPTION.test('par l\'extension ou FillSell Cloud, republie sans option payante de Leboncoin'), 'le verrou « Cloud en option » reconnaît les anciennes phrases, pas l\'option payante d\'une plateforme');
}

// ── 24. Logos des plateformes : devant le nom, jamais à sa place (09/11) ──────
{
  const ids = ['vinted', 'ebay'];
  ok(logosPlateformesFautifs('<span><img class="logo-pf" src="/assets/site/vinted.0123456789.webp" alt="" width="20" height="20">Vinted</span>', ids).length === 0, 'logo devant son nom, alt vide : permis');
  ok(logosPlateformesFautifs('<img src="/assets/site/ebay.0123456789.webp" alt="" width="20" height="20"> eBay, une fois relié', ids).length === 0, 'eBay (casse du nom) : permis');
  ok(logosPlateformesFautifs('<img src="/assets/site/vinted.0123456789.webp" alt="Vinted" width="20" height="20">Vinted', ids).length === 1, 'logo avec texte alternatif : refusé (le nom est écrit à côté)');
  ok(logosPlateformesFautifs('<p>Publie sur <img src="/assets/site/vinted.0123456789.webp" alt="" width="20" height="20"> et le reste</p>', ids).length === 1, 'logo à la PLACE du nom : refusé');
  ok(logosPlateformesFautifs('<img src="/assets/site/capture.0123456789.webp" alt="Vinted">', ids).length === 0, 'une capture n\'est pas un logo');
}

console.log(`selftest:site-moteur — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
