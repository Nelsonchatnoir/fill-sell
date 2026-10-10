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
//      republication, les valeurs { fr, en } passent en traductions (C-8, C-11).
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
import { LEXIQUE_BANNI, REGLES_DECISION, listeSansDepop, contrastePaire, couleurRgba } from './site/verify-site.mjs';
import { importer as importerConcurrents } from './site/importer-concurrents.mjs';
import { mkdirSync, writeFileSync as ecrire } from 'node:fs';
import { dateValide, dateFuture, empreinteContenu } from './site/lib/dates.mjs';
import {
  faqVisible, recouvrement, sequencesDe, lireHref, jetonsCss, ratioContraste, PAIRES_CONTRASTE, RECOUVREMENT_REFUS,
} from './site/verify-site.mjs';
import { LANGUES, langueXDefault } from '../site/langues.mjs';
import { TEXTES } from '../site/gabarits/textes.mjs';
import { TEXTES_CONSENTEMENT } from '../src/utils/consentementTextes.js';
import { genererSite } from './site/build-site.mjs';
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

// ── 15. Tarifs : chiffres de quota dans les lignes des cartes SEULEMENT ─────
// (10/10, Nico : les cartes portent les volumes de l'app ; « pour », « communs »
// et « mentions » restent sans chiffre.)
{
  const temp = mkdtempSync(path.join(tmpdir(), 'fs-tarifs-'));
  try {
    mkdirSync(path.join(temp, 'site', 'donnees'), { recursive: true });
    const vrai = readFileSync(path.join(racine, 'site', 'donnees', 'tarifs.yml'), 'utf8');
    ok(!(await leve(() => lireTarifs(racine, ['fr', 'en']))), 'site/donnees/tarifs.yml accepté (chiffres des cartes compris)');
    ok(/\d+ annonces créées et publiées/.test(vrai), 'les lignes des cartes portent le volume d\'annonces');
    ecrire(path.join(temp, 'site', 'donnees', 'tarifs.yml'), vrai.replace('Pour vendre chaque semaine', '40 annonces par mois'));
    const e = await leve(() => lireTarifs(temp, ['fr', 'en']));
    ok(e && e.includes('aucun chiffre de quota'), `chiffre de quota hors des lignes des cartes refusé (${e})`);
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

console.log(`selftest:site-moteur — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
