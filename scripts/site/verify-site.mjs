#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  ORIGINE, urlAbsolue, texteBrut, mots, balisesOuvrantes, attributs, contenuPrincipal, texteComparable, decoderEntites,
} from './lib/html.mjs';
import { lireBlocsBalises, formeComparable, RELS_PARTAGES } from './lib/balises.mjs';
import { empreinteContenu, lireVerrou, verrouAuCommit } from './lib/dates.mjs';
import { routeAppPour, cheminReserve, sourceVersRegex, ROUTES_APP, HTML_PUBLIC_PERMIS } from './routes-app.mjs';
import { verifierCoquille, MARQUEUR_RACINE } from '../vite-plugin-app-shell.mjs';
import { LANGUES, langueXDefault } from '../../site/langues.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// site:verifier — contrôle d'une SORTIE du site vitrine, sans JS (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Lit le dossier de sortie (build/site-apercu par défaut) comme un robot le
// ferait : du HTML, rien d'exécuté. Rejoué à la fin de chaque génération
// (build Vercel compris) : une erreur ici = rien n'est déployé.
//
//   npm run site:verifier [dossier]
//
// Les seuils sont ceux de l'architecture (§ 5-7) et des revues B et C ; la
// revue de la fondation (09/10, docs/seo/revue-fondation/) y a ajouté ce que
// 20 fautes injectées dans une sortie verte avaient laissé passer : metas
// robots et googlebot multiples, canonicals multiples, notes sous une clé
// neutre, JSON-LD à attribut, data: avec espaces, og:image absente, fil
// d'Ariane ≠ BreadcrumbList, FAQPage réduite à un fragment, @id pendants,
// h1 vide, ancres d'une autre page, liens relatifs, http:// et www., ids en
// double, contrastes, recouvrement entre pages d'une même langue, page: restés
// dans llms*.txt.

export const URLS_SITEMAP_PROD_0910 = [
  // Le sitemap de prod relevé le 09/10/2026 (docs/seo/mesures/avant/) : chaque
  // URL reste servie (au nouveau sitemap) ou est redirigée — garde de
  // non-régression (revue B M9).
  'https://fillsell.app',
  'https://fillsell.app/legal',
  'https://fillsell.app/blog',
  'https://fillsell.app/blog/sell-same-item-vinted-leboncoin-ebay-beebs',
  'https://fillsell.app/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs',
  'https://fillsell.app/blog/cross-listing-vinted-leboncoin',
  'https://fillsell.app/blog/publier-annonce-plusieurs-plateformes',
  'https://fillsell.app/blog/how-to-calculate-reselling-profits',
  'https://fillsell.app/blog/comment-calculer-profits-vinted',
];

// Budgets relevés le 09/10 (nuit) avec la rédaction RÉELLE (80 Ko / 24 Ko avaient
// été posés sur les pages de démonstration) : les pages longues (4 000 à 6 600 mots,
// FAQ reprise dans le JSON-LD) pèsent 82 à 105 Ko bruts, ~24 Ko en brotli ; l'accueil
// porte 25,6 Ko de CSS (pages liées, tableau, capture en fenêtre). Mesures :
// docs/seo/design/DESIGN.md § 4.
const BUDGET_HTML = 120 * 1024;
const BUDGET_CSS = 26 * 1024; // par page, feuille découpée en modules (scripts/site/lib/bundles.mjs)
const BUDGET_DATA_URI = 1024;
const BUDGET_SITE_JS_GZIP = 6 * 1024;
const MOTS_MIN = {
  accueil: 150, guide: 200, trajet: 200, plateforme: 150, fonction: 150, comparatif: 150, alternative: 120,
  classement: 120, tarifs: 100, glossaire: 150, faq: 200, article: 300, liste: 40, 404: 20,
};
// JSON-LD attendu par type (docs/seo/FORMAT-CONTENU.md § 3). HowTo, FAQPage et
// VideoObject s'ajoutent quand la page montre des étapes, une FAQ, la vidéo.
const ARTICLE = ['WebPage', 'Article', 'BreadcrumbList'];
const TYPES_JSONLD = {
  'accueil:/': ['Organization', 'WebSite', 'SoftwareApplication', 'WebPage'],
  accueil: ['WebPage'],
  guide: ARTICLE,
  trajet: ARTICLE,
  plateforme: ARTICLE,
  fonction: ARTICLE,
  comparatif: ARTICLE,
  alternative: ARTICLE,
  classement: [...ARTICLE, 'ItemList'],
  tarifs: ['WebPage', 'SoftwareApplication', 'BreadcrumbList'],
  glossaire: ['WebPage', 'DefinedTermSet', 'BreadcrumbList'],
  faq: ['FAQPage', 'BreadcrumbList'],
  article: ['BlogPosting', 'BreadcrumbList'],
  liste: ['CollectionPage', 'BreadcrumbList'],
};
const TYPES_VITRINE = Object.keys(MOTS_MIN).filter((t) => !['article', 'liste', '404'].includes(t));

// Décisions de Nico du 09/10 (docs/seo/etat-des-lieux/03c-decisions-nico-0910.md)
// et lexique de la fiche de vérité (§ 15), relus dans la SORTIE :
//   · la plateforme sortie le 10/10 n'apparaît NULLE PART (pages, llms, sitemap) ;
//   · aucune trace de quota (jetons, attributs, meta, coin_config) ni chiffre de
//     quota (« 50 republications par mois ») ;
//   · aucun palier écrit à côté de la republication automatique, jamais eBay à
//     côté de la republication ;
//   · aucun logo de plateforme sur les pages (captures et vidéo exceptées :
//     « logos tels que l'app les dessine ») ;
//   · le lexique banni, sur les pages vitrine (le blog, plus ancien et au
//     vouvoiement, sera réécrit : il n'est pas relu ici).
const PLATEFORME_SORTIE = new RegExp(`\\b${String.fromCharCode(79, 112, 108, 97)}\\b`, 'i');
const TRACES_QUOTA = [/data-quota/i, /\{\{\s*quota:/i, /fillsell-quotas/i, /coin_config/i];
const CHIFFRE_QUOTA = [
  /\d[\d\s\u00a0\u202f]*\s*(annonces?|republications?|retouches?|commandes vocales|scans?)(\s+\S+){0,3}\s*(par|\/)\s*(mois|jour|semaine)/i,
  /\d[\d,]*\s*(listings?|reposts?|relists?|touch-ups?|scans?)(\s+\S+){0,3}\s*(per|a|\/)\s*(month|day|week)/i,
];
export const LEXIQUE_BANNI = [
  [/\bjobs?\b/i, 'job'], [/\bpolling\b/i, 'polling'], [/\btokens?\b/i, 'token'], [/\brobots?\b/i, 'robot'], [/\bbots?\b/i, 'bot'],
  [/100\s?%\s*automati/i, '100 % automatique'], [/temps r[ée]el|real[- ]time/i, 'temps réel'], [/z[ée]ro risque|zero risk/i, 'zéro risque'],
  [/publi[ée]e?s? partout en m[êe]me temps/i, 'publié partout en même temps'], [/retrait automatique partout/i, 'retrait automatique partout'],
  [/un e-?mail à chaque vente|an email for every sale/i, 'un e-mail à chaque vente'], [/partenaire officiel|official partner/i, 'partenaire officiel'],
  [/p[ée]pites?/i, 'pépites'], [/FillSell Cloud/i, 'FillSell Cloud'],
  [/\b(le seul|la seule) (outil|app|application|logiciel)|\bthe only (tool|app)\b/i, '« le seul »'],
];
// Décisions de Nico (09/10, 03c § 2 et P1) : « jamais Pro / Business NI AUCUN
// palier écrit à côté » de la republication automatique — « pour tous », « dès
// le gratuit », « sur tous les forfaits » aussi. La règle d'avant exigeait le
// littéral « republication automatique » suivi d'un nom de palier : « à tous
// les paliers », « la republie tout seul. Avec Pro ou Business » et le verbe
// « remonter » passaient (revue technique C-8). Désormais : toute forme de
// republi* / remont* (repost* / relist* en anglais) dans la MÊME PHRASE qu'un
// palier, un plan, un forfait ou un nom de palier, ou au début de la phrase
// suivante (« … la republie tout seul. Avec Pro ou Business »). Relue sur le
// texte visible ET sur les lignes de tableau JOINTES (th + td :
// « Republication » | « … à tous les paliers » forment une phrase).
export const REGLES_DECISION = [
  [/\b(republi|remont)\w*[^.!?]{0,160}(?:[.!?]\s*[^.!?]{0,40})?\b(paliers?|plans?|forfaits?|Pro|Premium|Business|Gratuit)\b|\b(paliers?|plans?|forfaits?|Pro|Premium|Business|Gratuit)\b[^.!?]{0,160}\b(republi|remont)\w*/i, 'palier à côté de la republication automatique'],
  [/\b(repost|relist)\w*[^.!?]{0,160}(?:[.!?]\s*[^.!?]{0,40})?\b(tiers?|plans?|Pro|Premium|Business)\b|\b(tiers?|plans?|Pro|Premium|Business)\b[^.!?]{0,160}\b(repost|relist)\w*/i, 'plan next to automatic reposting'],
  [/\b(republi|remont|repost|relist)\w*[^.!?]{0,60}\beBay\b|\beBay\b[^.!?]{0,60}\b(republi|remont|repost|relist)/i, 'eBay à côté de la republication'],
];
// Noms PROPRES d'outils concurrents qui commencent comme le verbe (Relistly,
// Reposter) : ce ne sont pas des republications (09/10, intégration de la
// rédaction — « eBay … Relistly » passait pour « eBay à côté de la
// republication »). Neutralisés avant les règles de décision seulement.
export const sansNomsOutils = (texte) => String(texte).replace(/\bRelistly\b/gi, 'Rel1stly').replace(/\bReposter\b/g, 'Rep0ster');
// « Depop partout » (décision de Nico du 09/10) dans le TEXTE : une phrase qui
// énumère TOUTES les autres plateformes ouvertes sans nommer Depop est une liste
// d'avant Depop (« Vinted, Leboncoin, eBay et Beebs ») — revue
// technique C-9 : la transcription de la vidéo l'a publiée, et
// selftest:depop-partout (qui lit le CODE) ne voit pas les textes.
export const AUTRES_QUE_DEPOP = ['Vinted', 'Leboncoin', 'eBay', 'Beebs'];
export function listeSansDepop(texte) {
  for (const phrase of String(texte).split(/[.!?]\s/)) {
    if (/\bDepop\b/i.test(phrase)) continue;
    const vus = AUTRES_QUE_DEPOP.filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(phrase));
    if (vus.length === AUTRES_QUE_DEPOP.length) return phrase.trim().slice(0, 140);
  }
  return null;
}
// Couleurs de marque des plateformes (un logo dessiné en SVG en ligne les porterait).
const COULEURS_PLATEFORMES = /#(007782|09B1BA|E53238|0064D2|F5AF02|86B817|FF2300|EC5A13|FF6E14)\b/i;
const TYPES_INTERDITS = ['AggregateRating', 'Review', 'Rating', 'EmployerAggregateRating'];

// Recouvrement entre deux pages d'une même langue (revue de la fondation
// I-6) : part des séquences de 5 mots de la PLUS COURTE que l'autre reprend
// mot pour mot. Jaccard (seuil 0,5) laissait passer deux pages identiques à
// 65 % — exactement les pages en série prévues (trajets X → Y). Comparées
// quel que soit leur type (page ou guide est au choix du rédacteur). Les
// listes du blog en sont exclues : elles SONT, par construction, les
// descriptions des articles qu'elles listent.
export const RECOUVREMENT_REFUS = 0.4;
export const RECOUVREMENT_AVERTISSEMENT = 0.25;

// Contrastes WCAG AA vérifiés sur les JETONS de site/styles/site.css (revue de
// la fondation I-5) : [texte, fond, seuil, usage]. 4,5:1 pour du texte
// courant, 3:1 pour un anneau de focus (critère 1.4.11).
export const PAIRES_CONTRASTE = [
  ['--bouton-texte', '--bouton-fond', 4.5, 'texte des boutons pleins (fin du dégradé)'],
  ['--bouton-texte', '--cd', 4.5, 'texte des boutons pleins (début du dégradé #238478)'],
  ['--bouton-texte', '--bouton-fond-survol', 4.5, 'boutons pleins au survol'],
  ['--lien', '--to', 4.5, 'liens et texte teal sur le fond de page'],
  ['--lien', '--bl', 4.5, 'liens et bouton contour sur blanc'],
  ['--lien', '--pa', 4.5, 'liens sur papier (en-tête, bandeaux)'],
  ['--lien-survol', '--to', 4.5, 'liens au survol'],
  ['--en', '--to', 4.5, 'texte courant'],
  ['--gr', '--to', 4.5, "texte secondaire, fil d'Ariane, dates"],
  ['--gr', '--bl', 4.5, 'texte des cartes'],
  ['--gr', '--pa', 4.5, 'texte secondaire sur papier'],
  ['--gc', '--bl', 4.5, 'sources et dates relevées (petit texte)'],
  ['--gc', '--pa', 4.5, 'petit texte discret sur papier'],
  ['--ss', '--nu', 4.5, 'texte des sections sombres'],
  ['--s2', '--nu', 4.5, 'texte secondaire des sections sombres'],
  ['--s2', '--en', 4.5, 'texte secondaire sur encre (palier mis en avant, appel, pied)'],
  ['--me', '--nu', 4.5, 'menthe sur sombre (numéros d\'étapes, liens)'],
  ['--mp', '--nu', 4.5, 'menthe pâle sur sombre (étiquettes de la colonne FillSell)'],
  ['--en', '--pe', 4.5, 'badge « Notre conseil » (encre sur pêche)'],
  ['--focus', '--to', 3, 'anneau de focus sur le fond de page'],
  ['--focus', '--bl', 3, 'anneau de focus sur blanc'],
  ['--focus', '--pa', 3, "anneau de focus dans l'en-tête"],
  ['--focus-sur-fonce', '--en', 3, 'anneau de focus dans le pied de page'],
  ['--focus-sur-fonce', '--nu', 3, 'anneau de focus dans les sections sombres'],
  // Fonds MÊLÉS (revue technique C-3) : [couleur à alpha, fond] composés au
  // plus fort — le pire cas, là où le halo ou le dégradé est à pleine force.
  ['--gt', ['--ht', '--to'], 4.5, 'texte secondaire de tête (chapô, fil, dates) au cœur du halo teal'],
  ['--gt', ['--hp', '--to'], 4.5, 'texte secondaire de tête au cœur du halo pêche'],
  ['--st', ['--ht', '--to'], 4.5, 'surtitre, liens et bouton contour de tête au cœur du halo teal'],
  ['--st', ['--hp', '--to'], 4.5, 'surtitre, liens et bouton contour de tête au cœur du halo pêche'],
  ['--ss', '--sf', 4.5, "numéros d'étapes et texte clair à la tête du dégradé des sections sombres (--sf)"],
  ['--ss', ['--at', '--en'], 4.5, "texte de l'appel final au cœur de son coin teal"],
  ['--ss', ['--ap', '--en'], 4.5, "texte de l'appel final au cœur de son coin pêche"],
  ['--ss', ['--hm', '--nu'], 3, 'anneau clair du bouton « Lire » sur son halo menthe'],
  ['--ss', '--en', 3, 'anneau clair du bouton « Lire » sur son liseré sombre'],
];

function fichiersHtml(dossier, base = dossier, sortie = []) {
  for (const nom of readdirSync(dossier)) {
    const p = path.join(dossier, nom);
    if (statSync(p).isDirectory()) {
      if (path.relative(base, p) === 'assets') continue;
      fichiersHtml(p, base, sortie);
    } else if (nom.endsWith('.html')) {
      sortie.push(path.relative(base, p).split(path.sep).join('/'));
    }
  }
  return sortie;
}

const metaContenu = (html, nom, attr = 'name') => balisesOuvrantes(html, 'meta').find((m) => m.attrs[attr] === nom)?.attrs.content ?? null;

function cheminDeFichier(relatif) {
  if (relatif === 'index.html') return '/';
  if (relatif.endsWith('/index.html')) return '/' + relatif.slice(0, -'/index.html'.length);
  return null;
}

/**
 * Lecture d'un href comme un navigateur (résolu contre l'URL de la page).
 * Rend { genre: 'ancre'|'externe'|'interne'|'autre', chemin, ancre, erreur }.
 */
const decoder = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function lireHref(href, urlPage) {
  if (href.startsWith('#')) return { genre: 'ancre', ancre: decoder(href.slice(1)) };
  if (/^(mailto|tel):/i.test(href)) return { genre: 'autre' };
  if (href.startsWith('//')) return { genre: 'externe', erreur: `lien sans protocole « ${href} »` };
  const absolu = /^[a-z][a-z0-9+.-]*:/i.test(href);
  if (!absolu && !href.startsWith('/')) {
    return { genre: 'interne', erreur: `lien RELATIF « ${href} » (servi sous un sous-dossier, il vise une autre adresse)` };
  }
  let u;
  try { u = new URL(href, urlPage); } catch { return { genre: 'autre', erreur: `lien illisible « ${href} »` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { genre: 'autre', erreur: `protocole ${u.protocol} (« ${href} »)` };
  const nous = u.hostname === 'fillsell.app' || u.hostname === 'www.fillsell.app';
  if (!nous) return { genre: 'externe' };
  const erreur = u.protocol === 'http:' || u.hostname !== 'fillsell.app'
    ? `lien « ${href} » vers le site en http:// ou par www. (une redirection de plus, et un signal mêlé)` : null;
  return { genre: 'interne', chemin: u.pathname || '/', ancre: u.hash ? decoder(u.hash.slice(1)) : null, erreur };
}

/** Tous les <script> JSON-LD, QUELS QUE SOIENT leurs attributs (type en casse libre, id=…). */
function scriptsJsonLd(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => String(attributs(`<script${m[1]}>`).type ?? '').trim().toLowerCase() === 'application/ld+json')
    .map((m) => m[2]);
}

function noeudsJsonLd(html, erreurs, origine) {
  const noeuds = [];
  for (const texte of scriptsJsonLd(html)) {
    let obj;
    try { obj = JSON.parse(texte); } catch (e) { erreurs.push(`${origine} : JSON-LD illisible (${e.message})`); continue; }
    for (const o of [].concat(obj)) noeuds.push(...(Array.isArray(o?.['@graph']) ? o['@graph'] : [o]));
  }
  return noeuds;
}

/** Notes et avis, où qu'ils soient : clés ET @type (un nœud AggregateRating sous une clé neutre passait). */
function notesInterdites(obj, chemin = '') {
  if (!obj || typeof obj !== 'object') return [];
  const trouvees = [];
  const types = [].concat(obj['@type'] ?? []);
  for (const t of types) if (TYPES_INTERDITS.includes(t)) trouvees.push(`${chemin || 'racine'} (@type ${t})`);
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'aggregateRating' || k === 'review' || k === 'reviews') trouvees.push(`${chemin}${k}`);
    trouvees.push(...notesInterdites(v, `${chemin}${k}.`));
  }
  return trouvees;
}

/** @id DÉFINIS (un nœud porte autre chose que son @id) et RÉFÉRENCÉS ({ "@id": … } seul). */
function idsJsonLd(obj, definis = new Set(), references = new Set()) {
  if (!obj || typeof obj !== 'object') return { definis, references };
  if (Array.isArray(obj)) { for (const x of obj) idsJsonLd(x, definis, references); return { definis, references }; }
  const cles = Object.keys(obj);
  if (typeof obj['@id'] === 'string') (cles.length === 1 ? references : definis).add(obj['@id']);
  for (const v of Object.values(obj)) idsJsonLd(v, definis, references);
  return { definis, references };
}

/** Fil d'Ariane VISIBLE : [{ nom, href|null }]. */
function filVisible(html) {
  const nav = /<nav class="fil"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
  if (!nav) return null;
  return [...nav.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
    nom: texteBrut(m[1]),
    href: balisesOuvrantes(m[1], 'a')[0]?.attrs.href ?? null,
  }));
}

/** Questions (h3) et réponses VISIBLES : Map question → réponse, en forme comparable. */
export function faqVisible(contenu) {
  const morceaux = String(contenu).split(/(<h[23]\b[^>]*>[\s\S]*?<\/h[23]>)/);
  const blocs = new Map();
  for (let i = 1; i < morceaux.length; i += 2) {
    if (!/^<h3/.test(morceaux[i])) continue;
    blocs.set(texteComparable(texteBrut(morceaux[i])), texteComparable(texteBrut(morceaux[i + 1] ?? '')));
  }
  return blocs;
}

/** Longueur de chaque URI data:, jusqu'à SON délimiteur fermant (espaces comprises). */
function urisData(html) {
  const sortie = [];
  const fermant = { '"': '"', "'": "'", '(': ')' };
  for (const m of html.matchAll(/data:[a-z]+\/[a-z0-9.+-]+[;,]/gi)) {
    const avant = html[m.index - 1];
    if (!fermant[avant]) continue;
    const fin = html.indexOf(fermant[avant], m.index);
    sortie.push((fin < 0 ? html.length : fin) - m.index);
  }
  return sortie;
}

function sequences(texte) {
  const m = mots(texte);
  const s = new Set();
  for (let i = 0; i + 5 <= m.length; i++) s.add(m.slice(i, i + 5).join(' '));
  return s;
}
/** Part des séquences de la plus courte que l'autre reprend. */
export function recouvrement(a, b) {
  if (!a.size || !b.size) return 0;
  const [petit, grand] = a.size <= b.size ? [a, b] : [b, a];
  let communs = 0;
  for (const x of petit) if (grand.has(x)) communs++;
  return communs / petit.size;
}
export const sequencesDe = sequences;

/** La coquille Vite, ramenée à index.html : retire ce que Vite injecte. */
function coquilleCommeSource(html) {
  return html
    .replace(/<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>/g, '')
    .replace(/<link rel="(modulepreload|stylesheet)" crossorigin href="\/assets\/[^"]+">/g, '')
    .replace('<script type="module" src="/src/main.jsx"></script>', '')
    .replace(/\s+/g, ' ').trim();
}

// ── Contraste ──────────────────────────────────────────────────────────────
/**
 * Une couleur CSS (#rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() — la forme
 * minifiée de lightningcss comprise) en [r, g, b, a], ou null.
 */
export function couleurRgba(v) {
  const t = String(v ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
    return [n[0], n[1], n[2], n[3] / 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  return null;
}
/** Couleur posée sur un fond opaque (composition « source over »). */
export function composer(dessus, fond) {
  const a = dessus[3];
  return [0, 1, 2].map((i) => dessus[i] * a + fond[i] * (1 - a)).concat(1);
}
function luminance(c) {
  const rgb = Array.isArray(c) ? c : couleurRgba(c);
  const [r, g, b] = rgb.slice(0, 3).map((x) => x / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratioContraste(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Ratio d'une paire de PAIRES_CONTRASTE sur les jetons de la CSS servie. Le
 * fond est un jeton opaque, ou une PILE [jeton à alpha, …, jeton opaque] :
 * les couches se composent de bas en haut (fond MÊLÉ, revue technique C-3).
 * Rend { ratio, nomFond } ou { erreur }.
 */
export function contrastePaire(jetons, texte, fond) {
  const pile = [].concat(fond);
  const couleurs = [texte, ...pile].map((j) => [j, jetons.get(j), couleurRgba(jetons.get(j))]);
  const illisible = couleurs.find(([, , c]) => !c);
  if (illisible) return { erreur: `jeton ${illisible[0]} (${illisible[1]}) illisible — une couleur attendue dans :root (site.css)` };
  const cTexte = couleurs[0][2];
  const couches = couleurs.slice(1).map(([, , c]) => c);
  if (cTexte[3] < 1 || couches.at(-1)[3] < 1) return { erreur: `${texte} et le fond de base (${pile.at(-1)}) doivent être opaques` };
  const fondFinal = couches.slice(0, -1).reduceRight((dessous, dessus) => composer(dessus, dessous), couches.at(-1));
  const nomFond = pile.map((j) => `${j} ${jetons.get(j)}`).join(' sur ');
  return { ratio: ratioContraste(cTexte, fondFinal), nomFond };
}
/** Jetons :root de la CSS servie (minifiée), var() résolus. */
export function jetonsCss(css) {
  const racine = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const brut = new Map([...racine.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)].map((m) => [m[1], m[2].trim()]));
  const resoudre = (v, profondeur = 0) => {
    const m = /^var\((--[a-z0-9-]+)\)$/i.exec(v ?? '');
    return m && profondeur < 10 ? resoudre(brut.get(m[1]), profondeur + 1) : v;
  };
  return new Map([...brut.keys()].map((k) => [k, resoudre(brut.get(k))]));
}

export async function verifierSite(dossier, { racine = process.cwd(), git = true, datesStrictes = true, env = process.env } = {}) {
  const erreurs = [];
  const avertissements = [];
  const err = (m) => erreurs.push(m);
  // Dates : sur Vercel, un avertissement (un oubli de site:dater ne bloque
  // jamais le correctif urgent de l'app, revue de la fondation I-3).
  const errDate = (m) => (datesStrictes ? erreurs : avertissements).push(m);
  if (!existsSync(dossier)) return { erreurs: [`dossier ${dossier} introuvable`], avertissements, resume: '' };

  // ── La coquille ─────────────────────────────────────────────────────────
  const fichierCoquille = path.join(dossier, 'app-shell.html');
  let blocsCoquille = null;
  let coquille = '';
  if (!existsSync(fichierCoquille)) {
    err('app-shell.html absent : les routes de l\'app répondraient 404');
  } else {
    coquille = readFileSync(fichierCoquille, 'utf8');
    try { verifierCoquille(coquille, 'app-shell.html'); } catch (e) { err(e.message); }
    const entree = /\/assets\/(index-[^"']+\.js)/.exec(coquille)?.[1];
    if (entree && !existsSync(path.join(dossier, 'assets', entree))) err(`app-shell.html : entrée /assets/${entree} absente du dossier`);
    try { blocsCoquille = lireBlocsBalises(coquille, 'app-shell.html'); } catch (e) { err(e.message); }
    const source = readFileSync(path.join(racine, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    if (coquilleCommeSource(coquille.replace(/\r\n/g, '\n')) !== coquilleCommeSource(source)) {
      err('app-shell.html n\'est pas la coquille Vite d\'index.html (au-delà des balises injectées par Vite) : copie retouchée ?');
    }
  }

  // ── Inventaire des pages ────────────────────────────────────────────────
  const permis = new Set(HTML_PUBLIC_PERMIS.map((h) => h.fichier));
  const pages = [];
  const parChemin = new Map();
  for (const rel of fichiersHtml(dossier)) {
    if (rel === 'app-shell.html' || permis.has(rel)) continue;
    const html = readFileSync(path.join(dossier, rel), 'utf8');
    const id = metaContenu(html, 'fillsell-page');
    if (!id) { err(`${rel} : page HTML sans marqueur fillsell-page (coquille, reste d'un autre build, ou fichier de public/ à nommer dans HTML_PUBLIC_PERMIS ?)`); continue; }
    const est404 = rel === '404.html';
    const chemin = est404 ? null : cheminDeFichier(rel);
    if (!est404 && !chemin) { err(`${rel} : page hors convention (<chemin>/index.html)`); continue; }
    const p = {
      rel, html, id, chemin, est404,
      url: chemin ? urlAbsolue(chemin) : null,
      type: metaContenu(html, 'fillsell-type'),
      lang: /<html lang="([a-z-]+)"/.exec(html)?.[1] ?? null,
      title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null,
      description: metaContenu(html, 'description'),
      contenu: contenuPrincipal(html),
      liensEntrants: 0,
    };
    p.texte = p.contenu === null ? '' : texteBrut(p.contenu);
    p.maj = /<time datetime="([^"]+)" data-maj>/.exec(html)?.[1] ?? null;
    p.ids = [...html.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi, '').matchAll(/\sid="([^"]*)"/g)].map((m) => decoderEntites(m[1]));
    pages.push(p);
    if (chemin) parChemin.set(chemin, p);
  }
  // Google OAuth (vérification de la marque) : la page d'accueil doit mener à
  // la politique de confidentialité, la même que l'écran de consentement (revue A M10).
  if (parChemin.get('/') && !parChemin.get('/').html.includes('href="/legal#confidentialite"')) {
    err("index.html : aucun lien vers /legal#confidentialite (exigé par Google OAuth sur la page d'accueil)");
  }
  if (!parChemin.get('/')) err('index.html n\'est pas l\'accueil statique : ce dossier n\'est pas un build du site (FILLSELL_SITE=1)');
  if (!pages.some((p) => p.est404)) err('404.html absent : les URL inconnues ne répondraient pas 404 proprement');

  const vercel = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
  const redirections = (vercel.redirects ?? []).map((r) => ({ ...r, regex: sourceVersRegex(r.source) }));
  const estRedirige = (chemin) => redirections.find((r) => r.regex.test(chemin));

  const titres = new Map();
  const descriptions = new Map();
  let liensInternes = 0;
  const siteJsVus = new Set();
  const ancresAVerifier = [];

  for (const p of pages) {
    const o = p.rel;
    const h = p.html;
    if (h.includes(MARQUEUR_RACINE)) err(`${o} : porte la racine de l'app (${MARQUEUR_RACINE}) — une page vitrine n'est jamais la coquille`);
    if (/\/assets\/index-[^"'\s]+\.js/.test(h)) err(`${o} : référence l'entrée SPA /assets/index-*.js`);
    if (!p.est404 && p.chemin !== '/' && cheminReserve(p.chemin) && !p.chemin.startsWith('/blog')) {
      err(`${o} : chemin ${p.chemin} réservé à l'app (${cheminReserve(p.chemin)})`);
    }
    if (!p.lang || !LANGUES.some((l) => l.code === p.lang)) err(`${o} : <html lang="${p.lang}"> absent ou langue non déclarée (site/langues.mjs)`);

    // Texte et structure.
    if (p.contenu === null) err(`${o} : région <!--fs:contenu--> absente`);
    const nbMots = mots(p.texte).length;
    const seuil = MOTS_MIN[p.est404 ? 404 : p.type] ?? 150;
    if (nbMots < seuil) err(`${o} : ${nbMots} mots dans le contenu principal, au moins ${seuil} attendus (type ${p.type})`);
    const h1 = [...h.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    if (h1.length !== 1) err(`${o} : ${h1.length} <h1>, un seul attendu`);
    else if (!texteBrut(h1[0][1])) err(`${o} : <h1> vide`);
    const enDouble = [...new Set(p.ids.filter((x, i) => p.ids.indexOf(x) !== i))];
    if (enDouble.length) err(`${o} : id en double (${enDouble.map((x) => `« ${x} »`).join(', ')}) — un titre reprend un id du gabarit ?`);

    // Titre et description.
    if (!p.title) err(`${o} : <title> absent ou vide`);
    else {
      if (p.title.length < 10 || p.title.length > 120) err(`${o} : <title> de ${p.title.length} caractères (10 à 120)`);
      else if (p.title.length > 70) avertissements.push(`${o} : <title> de ${p.title.length} caractères, tronqué au-delà de ~70 dans les résultats`);
      if (titres.has(p.title)) err(`${o} : <title> identique à ${titres.get(p.title)}`);
      titres.set(p.title, o);
    }
    if (!p.description) err(`${o} : meta description absente`);
    else {
      if (p.description.length < 50 || p.description.length > 320) err(`${o} : description de ${p.description.length} caractères (50 à 320)`);
      else if (p.description.length > 170) avertissements.push(`${o} : description de ${p.description.length} caractères, tronquée au-delà de ~160`);
      if (descriptions.has(p.description)) err(`${o} : description identique à ${descriptions.get(p.description)}`);
      descriptions.set(p.description, o);
    }

    // Indexation : TOUTES les metas robots et des robots nommés, un seul canonical.
    const metasRobots = balisesOuvrantes(h, 'meta').filter((m) => /^(robots|googlebot|googlebot-news|bingbot)$/i.test(m.attrs.name ?? ''));
    const robots = metasRobots.filter((m) => /^robots$/i.test(m.attrs.name));
    p.robots = robots[0]?.attrs.content ?? '';
    if (robots.length !== 1) err(`${o} : ${robots.length} <meta name="robots">, une seule attendue`);
    const canons = balisesOuvrantes(h, 'link').filter((l) => String(l.attrs.rel ?? '').toLowerCase() === 'canonical');
    if (p.est404) {
      if (!p.robots.startsWith('noindex')) err(`${o} : la page 404 doit porter noindex`);
      if (canons.length) err(`${o} : la page 404 ne porte pas de canonical`);
    } else {
      for (const m of metasRobots) {
        if (/noindex|none/i.test(m.attrs.content ?? '')) err(`${o} : <meta name="${m.attrs.name}" content="${m.attrs.content}"> sur une page vitrine indexable`);
      }
      if (canons.length !== 1) err(`${o} : ${canons.length} canonical, un seul attendu`);
      else if (canons[0].attrs.href !== p.url) err(`${o} : canonical ${canons[0].attrs.href} ≠ ${p.url}`);
      const ogUrl = metaContenu(h, 'og:url', 'property');
      if (ogUrl !== p.url) err(`${o} : og:url ${ogUrl} ≠ ${p.url}`);
    }
    // Images de partage : présentes, absolues, servies (revue de la fondation M-4 n° 11).
    for (const [nom, attr] of [['og:image', 'property'], ['twitter:image', 'name']]) {
      const v = metaContenu(h, nom, attr);
      if (!v) { err(`${o} : ${nom} absente`); continue; }
      if (!v.startsWith(`${ORIGINE}/`)) { err(`${o} : ${nom} « ${v} » hors de ${ORIGINE}/`); continue; }
      const f = path.join(dossier, ...new URL(v).pathname.split('/').filter(Boolean));
      if (!existsSync(f)) err(`${o} : ${nom} ${v} absente de la sortie (chaque partage montrerait une image cassée)`);
    }
    const viewport = metaContenu(h, 'viewport') ?? '';
    if (/user-scalable\s*=\s*no|maximum-scale/i.test(viewport)) err(`${o} : viewport « ${viewport} » bloque le zoom (accessibilité)`);

    // Hreflang réciproques.
    p.alternates = balisesOuvrantes(h, 'link').filter((l) => l.attrs.rel === 'alternate' && l.attrs.hreflang)
      .map((l) => ({ lang: l.attrs.hreflang, url: l.attrs.href }));

    // JSON-LD.
    const noeuds = noeudsJsonLd(h, erreurs, o);
    p.jsonld = noeuds;
    for (const c of notesInterdites(noeuds)) err(`${o} : JSON-LD porte une note ou un avis (${c}) — aucune note ni avis, revue B`);
    if (!p.est404) {
      const types = new Set(noeuds.flatMap((n) => [].concat(n['@type'] ?? [])));
      const attendus = TYPES_JSONLD[p.type === 'accueil' && p.chemin === '/' ? 'accueil:/' : p.type] ?? [];
      for (const t of attendus) if (!types.has(t)) err(`${o} : JSON-LD sans @type ${t}`);
      if (p.chemin !== '/' && types.has('Organization')) err(`${o} : Organization hors de l'accueil (les autres pages y renvoient par @id)`);
      if (p.chemin !== '/' && types.has('WebSite')) err(`${o} : WebSite hors de l'accueil`);
      // Une seule entité de chaque sorte : un second nœud Organization (un
      // autre nom, un autre logo) brouillerait FillSell avec fillsell.com.
      for (const t of ['Organization', 'WebSite', 'SoftwareApplication', 'WebPage', 'BreadcrumbList', 'FAQPage', 'BlogPosting', 'Article', 'HowTo', 'VideoObject', 'DefinedTermSet', 'ItemList']) {
        const n = noeuds.filter((x) => [].concat(x['@type'] ?? []).includes(t)).length;
        if (n > 1) err(`${o} : ${n} nœuds JSON-LD ${t}, un seul attendu`);
      }
      for (const n of noeuds) {
        if (n.dateModified && n.dateModified !== p.maj) err(`${o} : dateModified ${n.dateModified} ≠ date visible ${p.maj}`);
      }
      // FAQPage : chaque question est un h3 VISIBLE et sa réponse est TOUT le
      // texte affiché sous ce h3 — jamais un fragment (« Non. ») ni un texte
      // parallèle (revue B M1). Forme comparable des deux côtés : « gratuit . »
      // (balise remplacée par une espace) ≡ « gratuit. » (revue de la fondation I-1).
      const visibles = faqVisible(p.contenu ?? '');
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('FAQPage'))) {
        for (const q of n.mainEntity ?? []) {
          const question = texteComparable(q.name ?? '');
          const reponse = texteComparable(q.acceptedAnswer?.text ?? '');
          if (!question || !visibles.has(question)) err(`${o} : FAQPage « ${q.name} » : aucune question visible (h3) de ce texte`);
          else if (!reponse || visibles.get(question) !== reponse) err(`${o} : FAQPage « ${q.name} » : la réponse ne reprend pas le texte affiché sous la question`);
        }
      }
      // HowTo : chaque étape est un h3 VISIBLE du bloc d'étapes, avec son texte.
      const texteContenu = texteComparable(p.texte);
      const titresH3 = new Set([...(p.contenu ?? '').matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => texteComparable(texteBrut(m[1]))));
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('HowTo'))) {
        if (!p.html.includes('class="etapes ')) err(`${o} : HowTo sans bloc d'étapes visible`);
        for (const st of n.step ?? []) {
          if (!titresH3.has(texteComparable(st.name ?? ''))) err(`${o} : HowTo « ${st.name} » : aucune étape visible (h3) de ce titre`);
          if (!texteContenu.includes(texteComparable(st.text ?? '\u0000'))) err(`${o} : HowTo « ${st.name} » : le texte de l'étape n'est pas affiché`);
        }
      }
      // DefinedTermSet : chaque terme est un h3 visible, sa définition est affichée.
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('DefinedTermSet'))) {
        for (const d of n.hasDefinedTerm ?? []) {
          if (!titresH3.has(texteComparable(d.name ?? ''))) err(`${o} : DefinedTerm « ${d.name} » : aucun terme visible (h3) de ce nom`);
          if (!texteContenu.includes(texteComparable(d.description ?? '\u0000'))) err(`${o} : DefinedTerm « ${d.name} » : la définition n'est pas affichée`);
        }
      }
      // ItemList : chaque élément du classement est nommé dans la page, dans l'ordre.
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('ItemList'))) {
        (n.itemListElement ?? []).forEach((it, i) => {
          if (it.position !== i + 1) err(`${o} : ItemList : position ${it.position} au rang ${i + 1}`);
          if (!texteContenu.includes(texteComparable(it.name ?? '\u0000'))) err(`${o} : ItemList « ${it.name} » : absent du texte de la page`);
        });
      }
      // VideoObject : la vidéo est montrée dans la page, ses fichiers existent.
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('VideoObject'))) {
        if (!/<video\b/.test(h)) err(`${o} : VideoObject sans lecteur <video> dans la page`);
        for (const u of [n.contentUrl, ...[].concat(n.thumbnailUrl ?? [])]) {
          if (typeof u !== 'string' || !u.startsWith(`${ORIGINE}/`)) { err(`${o} : VideoObject : URL « ${u} » hors de ${ORIGINE}/`); continue; }
          if (!existsSync(path.join(dossier, ...new URL(u).pathname.split('/').filter(Boolean)))) err(`${o} : VideoObject : ${u} absent de la sortie`);
        }
        for (const champ of ['name', 'description', 'uploadDate', 'duration']) if (!n[champ]) err(`${o} : VideoObject sans « ${champ} »`);
      }
      // BreadcrumbList = fil d'Ariane VISIBLE, étape par étape.
      const fil = filVisible(h);
      for (const n of noeuds.filter((x) => [].concat(x['@type']).includes('BreadcrumbList'))) {
        const items = n.itemListElement ?? [];
        if (!fil) { err(`${o} : BreadcrumbList sans fil d'Ariane visible`); continue; }
        const egal = items.length === fil.length && items.every((it, i) => it.name === fil[i].nom && it.position === i + 1 &&
          (i === fil.length - 1 ? !it.item : it.item === urlAbsolue(fil[i].href)));
        if (!egal) err(`${o} : BreadcrumbList ≠ fil d'Ariane visible (${items.map((x) => x.name).join(' › ')} / ${fil.map((x) => x.nom).join(' › ')})`);
      }
      if (!p.maj) err(`${o} : date de mise à jour visible absente (<time data-maj>)`);
    }

    // Liens.
    p.liensSortants = [];
    for (const a of balisesOuvrantes(h, 'a')) {
      const href = a.attrs.href;
      if (href === undefined) continue;
      if (href === '' || href === '#') { err(`${o} : lien vide ou « # » seul`); continue; }
      if (/^(page|media):/.test(href)) { err(`${o} : lien non résolu « ${href} »`); continue; }
      const lu = lireHref(href, p.url ?? `${ORIGINE}/404`);
      if (lu.erreur) { err(`${o} : ${lu.erreur}`); continue; }
      if (lu.genre === 'ancre') {
        if (!p.ids.includes(lu.ancre)) err(`${o} : ancre ${href} sans cible dans la page`);
        continue;
      }
      if (lu.genre !== 'interne') continue;
      const chemin = lu.chemin;
      liensInternes++;
      if (chemin !== '/' && chemin.endsWith('/')) { err(`${o} : lien interne avec slash final « ${href} » (308 inutile)`); continue; }
      if (estRedirige(chemin)) { err(`${o} : lien vers ${chemin}, qui est une redirection — lier la destination`); continue; }
      const cible = parChemin.get(chemin);
      if (cible) {
        if (cible !== p) p.liensSortants.push(chemin);
        if (lu.ancre) ancresAVerifier.push({ o, href, cible, ancre: lu.ancre });
        continue;
      }
      const fichier = path.join(dossier, ...chemin.split('/').filter(Boolean));
      if (existsSync(fichier) && statSync(fichier).isFile()) continue;
      const route = routeAppPour(chemin);
      if (route && !route.partagee) continue;
      err(`${o} : lien « ${href} » ${route ? 'tomberait sur la coquille de l\'app (aucune page statique à ce chemin)' : 'répondrait 404'}`);
    }

    // Images.
    const contenuImgs = p.contenu ? balisesOuvrantes(p.contenu, 'img') : [];
    let prioritaires = 0;
    for (const img of balisesOuvrantes(h, 'img')) {
      if (img.attrs.alt === undefined) err(`${o} : image ${img.attrs.src} sans attribut alt`);
      if (!/^\d+$/.test(img.attrs.width ?? '') || !/^\d+$/.test(img.attrs.height ?? '')) err(`${o} : image ${img.attrs.src} sans width/height (décalage de mise en page)`);
      if (img.attrs.fetchpriority === 'high') prioritaires++;
    }
    for (const img of contenuImgs) {
      if (img.attrs.fetchpriority !== 'high' && img.attrs.loading !== 'lazy') err(`${o} : image ${img.attrs.src} ni lazy ni principale`);
    }
    if (prioritaires > 1) err(`${o} : ${prioritaires} images en fetchpriority=high, une seule permise`);

    // Budgets et fichiers référencés.
    const taille = Buffer.byteLength(h);
    if (taille > BUDGET_HTML) err(`${o} : ${taille} o de HTML, budget ${BUDGET_HTML}`);
    const css = [...h.matchAll(/<style>([\s\S]*?)<\/style>/g)].reduce((s, m) => s + Buffer.byteLength(m[1]), 0);
    if (css > BUDGET_CSS) err(`${o} : ${css} o de CSS en ligne, budget ${BUDGET_CSS}`);
    for (const longueur of urisData(h)) {
      if (longueur > BUDGET_DATA_URI) err(`${o} : URI data: de ${longueur} caractères (budget ${BUDGET_DATA_URI}) — un fichier, pas du base64`);
    }
    const references = [
      ...balisesOuvrantes(h, 'script').map((s) => s.attrs.src),
      ...balisesOuvrantes(h, 'link').filter((l) => ['preload', 'icon', 'apple-touch-icon', 'manifest', 'stylesheet'].includes(l.attrs.rel)).map((l) => l.attrs.href),
      ...balisesOuvrantes(h, 'img').map((i) => i.attrs.src),
      ...balisesOuvrantes(h, 'source').flatMap((s) => String(s.attrs.srcset ?? '').split(',').map((x) => x.trim().split(/\s+/)[0])),
    ].filter((r) => r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/_vercel/'));
    for (const r of references) {
      const f = path.join(dossier, ...r.split('?')[0].split('/').filter(Boolean));
      if (!existsSync(f)) err(`${o} : fichier référencé ${r} absent de la sortie (servi en 404)`);
      if (r.startsWith('/assets/') && !r.startsWith('/assets/site/')) err(`${o} : référence ${r} hors de /assets/site/`);
      if (/^\/assets\/site\/site\.[0-9a-f]+\.js$/.test(r)) siteJsVus.add(r);
    }
    if (!/text-size-adjust:\s*100%/.test(h)) err(`${o} : correctif iOS text-size-adjust absent de la CSS`);

    // Décisions de Nico (09/10) et lexique, relus dans la sortie.
    // Les FAITS DES CONCURRENTS (cellules, cartes et sections marquées
    // data-tiers, tirées de concurrents.yml avec leur source) ne sont pas des
    // affirmations de FillSell : retirés avant le lexique et les chiffres.
    // Le <main> seulement : l'en-tête et le pied sont des listes de liens du
    // gabarit (des noms de pages côte à côte ne font pas une phrase).
    const principal = /<main\b[\s\S]*<\/main>/.exec(h)?.[0] ?? '';
    // Chaque fin de bloc vaut une fin de phrase (un titre suivi d'une puce ne
    // forme pas une phrase : « … eBay » + « Republier … » ne se lisent pas ensemble).
    const visible = texteBrut(principal.replace(/<(td|li|section)\b[^>]*\bdata-tiers\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
      .replace(/<\/(p|li|h[1-6]|td|th|dt|dd|div|section|summary|figcaption|small|strong|b)>/g, '. </$1>'));
    if (PLATEFORME_SORTIE.test(h)) err(`${o} : la plateforme sortie le 10/10 est nommée (décision de Nico : nulle part)`);
    for (const r of TRACES_QUOTA) if (r.test(h)) err(`${o} : trace de la mécanique des quotas (${r.source}) — retirée le 09/10`);
    for (const r of CHIFFRE_QUOTA) { const m = r.exec(visible); if (m) err(`${o} : chiffre de quota « ${m[0]} » (décision de Nico : aucun chiffre de quota ni de plafond)`); }
    const jeton = /\{\{[^{}]*\}\}/.exec(visible);
    if (jeton) err(`${o} : jeton non remplacé « ${jeton[0]} »`);
    // Lignes de tableau JOINTES : un th et ses td forment une phrase, une fin
    // de ligne la termine (règles de décision seulement).
    const lignes = texteBrut(principal.replace(/<(td|li|section)\b[^>]*\bdata-tiers\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
      .replace(/<\/(p|li|h[1-6]|tr|dt|dd|div|section|summary|figcaption)>/g, '. </$1>'));
    const decisions = [];
    for (const [r, nom] of REGLES_DECISION) {
      const m = r.exec(sansNomsOutils(visible)) ?? r.exec(sansNomsOutils(lignes));
      if (m) decisions.push(`lexique banni « ${nom} » (« ${m[0]} »), décisions de Nico du 09/10`);
    }
    const sansDepop = listeSansDepop(visible);
    if (sansDepop) decisions.push(`liste de plateformes sans Depop (« ${sansDepop} ») — décision de Nico : Depop partout`);
    // Le lexique vise la VOIX de FillSell, pas les CITATIONS (09/10, intégration
    // de la rédaction) : les conditions des plateformes, citées mot pour mot
    // (« des bots », « search robots »), ne se réécrivent pas. Retirés avant le
    // lexique seulement : <blockquote>, <q>, passages entre « » ou “ ”, et le
    // nom du fichier robots.txt. Les décisions et les chiffres lisent tout.
    const horsCitations = texteBrut(principal.replace(/<(td|li|section)\b[^>]*\bdata-tiers\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
      .replace(/<(blockquote|q)\b[\s\S]*?<\/\1>/g, ' ')
      .replace(/<\/(p|li|h[1-6]|td|th|dt|dd|div|section|summary|figcaption|small|strong|b)>/g, '. </$1>'))
      .replace(/«[^«»]*»|“[^“”]*”/g, ' ').replace(/\brobots\.txt\b/gi, ' ');
    if (TYPES_VITRINE.includes(p.type)) {
      for (const [r, nom] of LEXIQUE_BANNI) { const m = r.exec(horsCitations); if (m) err(`${o} : lexique banni « ${nom} » (« ${m[0]} »), fiche de vérité § 15 et décisions de Nico`); }
      for (const d of decisions) err(`${o} : ${d}`);
    } else if (p.type === 'article') {
      // Le blog (plus ancien, partagé avec l'app) n'est pas relu par tout le
      // lexique ; les DÉCISIONS de Nico, si — en avertissement tant que Nico
      // n'a pas décidé s'il est relu avant la fusion (revue technique C-8).
      for (const d of decisions) avertissements.push(`${o} : ${d} (blog : avertissement, article à relire avant la fusion)`);
    }
    for (const img of balisesOuvrantes(h, 'img')) {
      const src = img.attrs.src ?? '';
      if (/logo/i.test(`${src} ${img.attrs.alt ?? ''}`) && src !== '/icon-192x192.png') err(`${o} : image « ${src} » ressemble à un logo — aucun logo de plateforme sur les pages (noms en texte)`);
    }
    for (const svg of h.match(/<svg\b[\s\S]*?<\/svg>/gi) ?? []) {
      if (COULEURS_PLATEFORMES.test(svg)) err(`${o} : SVG en ligne aux couleurs d'une plateforme — aucun logo de plateforme sur les pages`);
    }

    // Parité des balises communes avec l'app.
    if (blocsCoquille) {
      try {
        const blocs = lireBlocsBalises(h, o);
        for (const [nom, contenu] of Object.entries(blocsCoquille)) {
          if (formeComparable(blocs[nom]) !== formeComparable(contenu)) err(`${o} : bloc de balises « ${nom} » différent de celui de l'app`);
        }
      } catch (e) { err(e.message); }
      const liensCoquille = balisesOuvrantes(coquille, 'link').filter((l) => RELS_PARTAGES.includes(l.attrs.rel)).map((l) => `${l.attrs.rel} ${l.attrs.href}`);
      const liensPage = new Set(balisesOuvrantes(h, 'link').map((l) => `${l.attrs.rel} ${l.attrs.href}`));
      for (const l of liensCoquille) if (!liensPage.has(l)) err(`${o} : lien d'icône/manifeste de l'app absent (${l})`);
      const couleur = metaContenu(coquille, 'theme-color');
      if (couleur && metaContenu(h, 'theme-color') !== couleur) err(`${o} : theme-color différent de l'app`);
    }
  }

  // ── Croisements entre pages ──────────────────────────────────────────────
  // Ancres vers une AUTRE page : la cible doit porter cet id.
  for (const { o, href, cible, ancre } of ancresAVerifier) {
    if (!cible.ids.includes(ancre)) err(`${o} : lien « ${href} » vers une ancre absente de ${cible.rel}`);
  }
  // @id du graphe : chaque renvoi vise un nœud de la page, ou une entité de
  // l'accueil (#organization, #website, #app : les autres pages y renvoient).
  const definisAccueil = parChemin.get('/') ? idsJsonLd(parChemin.get('/').jsonld).definis : new Set();
  for (const p of pages.filter((x) => !x.est404)) {
    const { definis, references } = idsJsonLd(p.jsonld);
    for (const r of references) if (!definis.has(r) && !definisAccueil.has(r)) err(`${p.rel} : JSON-LD renvoie à @id ${r}, défini nulle part`);
  }

  const parUrl = new Map(pages.filter((p) => p.url).map((p) => [p.url, p]));
  const codeDeHreflang = (h) => LANGUES.find((l) => l.hreflang === h)?.code ?? null;
  for (const p of pages.filter((x) => !x.est404)) {
    for (const c of p.liensSortants) parChemin.get(c).liensEntrants++;
    if (!p.alternates.length) continue;
    const langues = p.alternates.filter((a) => a.lang !== 'x-default');
    const soi = p.alternates.find((a) => a.url === p.url && a.lang !== 'x-default');
    if (!soi) err(`${p.rel} : hreflang sans la page elle-même`);
    for (const a of langues) if (!codeDeHreflang(a.lang)) err(`${p.rel} : hreflang « ${a.lang} » ne correspond à aucune langue déclarée (site/langues.mjs)`);
    const xdef = p.alternates.find((a) => a.lang === 'x-default');
    const attendue = langueXDefault(langues.map((a) => codeDeHreflang(a.lang)).filter(Boolean));
    const versionAttendue = langues.find((a) => codeDeHreflang(a.lang) === attendue);
    if (!xdef || !versionAttendue || xdef.url !== versionAttendue.url) err(`${p.rel} : x-default doit viser la version « ${attendue} » (PRIORITE_X_DEFAULT de site/langues.mjs)`);
    const signature = JSON.stringify([...p.alternates].sort((a, b) => (a.lang + a.url).localeCompare(b.lang + b.url)));
    for (const a of langues) {
      const autre = parUrl.get(a.url);
      if (!autre) { err(`${p.rel} : hreflang ${a.lang} vers ${a.url}, page absente`); continue; }
      const sienne = JSON.stringify([...autre.alternates].sort((x, y) => (x.lang + x.url).localeCompare(y.lang + y.url)));
      if (sienne !== signature) err(`${p.rel} : hreflang non réciproque avec ${autre.rel}`);
      if (autre.lang !== codeDeHreflang(a.lang)) err(`${p.rel} : hreflang ${a.lang} vers une page en ${autre.lang}`);
    }
  }
  for (const p of pages) {
    if (p.est404 || p.chemin === '/') continue;
    if (p.liensEntrants === 0) err(`${p.rel} : page ORPHELINE (aucune autre page n'y mène)`);
  }

  // Recouvrement entre pages d'une même langue, tous types (pages à la chaîne).
  const parLangue = new Map();
  for (const p of pages.filter((x) => !x.est404 && x.type !== 'liste')) {
    p.sequences = sequences(p.texte);
    if (!parLangue.has(p.lang)) parLangue.set(p.lang, []);
    parLangue.get(p.lang).push(p);
  }
  const paires = [];
  for (const groupe of parLangue.values()) {
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const r = recouvrement(groupe[i].sequences, groupe[j].sequences);
        paires.push({ a: groupe[i].rel, b: groupe[j].rel, r });
        if (r >= RECOUVREMENT_REFUS) err(`${groupe[i].rel} et ${groupe[j].rel} : ${Math.round(r * 100)} % de séquences de 5 mots en commun (refus ≥ ${RECOUVREMENT_REFUS * 100} %) — pages trop proches`);
        else if (r >= RECOUVREMENT_AVERTISSEMENT) avertissements.push(`${groupe[i].rel} et ${groupe[j].rel} : ${Math.round(r * 100)} % de séquences de 5 mots en commun (avertissement ≥ ${RECOUVREMENT_AVERTISSEMENT * 100} %)`);
      }
    }
  }
  const plusProches = paires.sort((x, y) => y.r - x.r).slice(0, 3);

  // Contrastes des jetons de la CSS servie.
  const cssServie = /<style>([\s\S]*?)<\/style>/.exec(parChemin.get('/')?.html ?? '')?.[1] ?? '';
  if (cssServie) {
    const jetons = jetonsCss(cssServie);
    for (const [texte, fond, seuil, usage] of PAIRES_CONTRASTE) {
      const c = contrastePaire(jetons, texte, fond);
      if (c.erreur) { err(`contraste : ${usage} — ${c.erreur}`); continue; }
      if (c.ratio < seuil) err(`contraste : ${usage} — ${texte} ${jetons.get(texte)} sur ${c.nomFond} = ${c.ratio.toFixed(2)}:1, seuil ${seuil}:1 (WCAG AA)`);
    }
  }

  // site.js : présent, budget.
  if (!siteJsVus.size) err('aucune page ne charge /assets/site/site.<empreinte>.js');
  for (const r of siteJsVus) {
    const f = path.join(dossier, ...r.split('/').filter(Boolean));
    if (!existsSync(f)) continue;
    const gz = gzipSync(readFileSync(f), { level: 9 }).length;
    if (gz > BUDGET_SITE_JS_GZIP) err(`${r} : ${gz} o gzip, budget ${BUDGET_SITE_JS_GZIP}`);
  }

  // ── Sitemap ─────────────────────────────────────────────────────────────
  const fichierSitemap = path.join(dossier, 'sitemap.xml');
  const routesSitemap = ROUTES_APP.filter((r) => r.sitemap).map((r) => urlAbsolue(r.source));
  let locs = new Set();
  if (!existsSync(fichierSitemap)) err('sitemap.xml absent (servi en 404 aux robots)');
  else {
    const xml = readFileSync(fichierSitemap, 'utf8');
    if (!xml.startsWith('<?xml')) err('sitemap.xml n\'est pas du XML');
    if (/<changefreq>|<priority>/.test(xml)) err('sitemap.xml porte changefreq/priority (ignorés par Google, retirés)');
    const entrees = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
      loc: /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1],
      lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1],
      alternates: [...m[1].matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((x) => ({ lang: x[1], url: x[2] })),
    }));
    locs = new Set(entrees.map((e) => e.loc));
    const attendues = new Set([...pages.filter((p) => !p.est404).map((p) => p.url), ...routesSitemap]);
    for (const u of attendues) if (!locs.has(u)) err(`sitemap.xml : ${u} manque`);
    for (const e of entrees) {
      if (!attendues.has(e.loc)) err(`sitemap.xml : ${e.loc} n'est pas une page générée`);
      if (routesSitemap.includes(e.loc) && e.lastmod) err(`sitemap.xml : ${e.loc} (route de l'app) porte un lastmod — elle n'a pas de date suivie`);
      const p = parUrl.get(e.loc);
      if (!p) continue;
      if (e.lastmod !== p.maj) err(`sitemap.xml : lastmod de ${e.loc} = ${e.lastmod}, la page affiche ${p.maj}`);
      const cle = (l) => JSON.stringify([...l].sort((a, b) => (a.lang + a.url).localeCompare(b.lang + b.url)));
      if (cle(e.alternates) !== cle(p.alternates)) err(`sitemap.xml : hreflang de ${e.loc} ≠ ceux du HTML`);
    }
  }
  for (const u of URLS_SITEMAP_PROD_0910) {
    const chemin = u === ORIGINE ? '/' : u.slice(ORIGINE.length);
    if (!locs.has(u) && !estRedirige(chemin)) err(`non-régression : ${u} (sitemap de prod du 09/10) n'est plus au sitemap ni redirigée`);
  }

  // ── Dates (verrou) ──────────────────────────────────────────────────────
  let verrou = { pages: {} };
  try { verrou = lireVerrou(racine); } catch (e) { err(e.message); }
  const vus = new Set();
  for (const p of pages.filter((x) => !x.est404)) {
    const v = verrou.pages[p.chemin];
    vus.add(p.chemin);
    if (!v) { errDate(`${p.rel} : absente de site/dates.lock.json (npm run site:dater)`); continue; }
    const e = empreinteContenu(p.html);
    if (v.empreinte !== e) errDate(`${p.rel} : contenu changé sans nouvelle date (empreinte ${e} ≠ verrou ${v.empreinte}) — npm run site:dater`);
    if (v.maj !== p.maj) err(`${p.rel} : date affichée ${p.maj} ≠ verrou ${v.maj}`);
  }
  for (const c of Object.keys(verrou.pages)) if (!vus.has(c)) errDate(`site/dates.lock.json : ${c} n'est plus une page`);
  // L'inverse : une date qui avance sans que le contenu change (verrou retouché
  // à la main). Comparée au verrou de HEAD (avant le commit), de origin/main
  // (avant la fusion) et, sur Vercel, du commit précédent déployé
  // (VERCEL_GIT_PREVIOUS_SHA) — HEAD seul était muet sur Vercel, où le verrou
  // commité EST HEAD (revue de la fondation M-1).
  if (git) {
    const references = ['HEAD', 'origin/main', env.VERCEL_GIT_PREVIOUS_SHA].filter(Boolean);
    for (const ref of references) {
      const avant = verrouAuCommit(racine, ref);
      if (!avant) {
        if (ref === env.VERCEL_GIT_PREVIOUS_SHA) avertissements.push(`verrou des dates du commit précédent (${ref.slice(0, 8)}) illisible : clone superficiel ? (contrôle « date sans contenu » sauté)`);
        continue;
      }
      for (const [c, v] of Object.entries(avant.pages ?? {})) {
        const maintenant = verrou.pages[c];
        if (maintenant && maintenant.empreinte === v.empreinte && maintenant.maj !== v.maj) {
          errDate(`site/dates.lock.json : date de ${c} changée (${v.maj} → ${maintenant.maj}, par rapport à ${ref}) sans changement de contenu`);
        }
      }
    }
  }

  // ── Fichiers de la racine ───────────────────────────────────────────────
  const robotsTxt = path.join(dossier, 'robots.txt');
  if (!existsSync(robotsTxt)) err('robots.txt absent');
  else {
    const t = readFileSync(robotsTxt, 'utf8');
    const groupes = t.split(/\r?\n/).filter((l) => /^user-agent:/i.test(l.trim()));
    if (groupes.length !== 1 || !/\*\s*$/.test(groupes[0])) err('robots.txt : un seul groupe « User-agent: * » attendu');
    if (!t.includes(`Sitemap: ${ORIGINE}/sitemap.xml`)) err('robots.txt : ligne Sitemap absente');
  }
  for (const nom of ['llms.txt', 'llms-full.txt']) {
    const f = path.join(dossier, nom);
    if (!existsSync(f)) { err(`${nom} absent`); continue; }
    const t = readFileSync(f, 'utf8');
    if (!t.startsWith('# ')) err(`${nom} : un titre « # » en première ligne attendu (llmstxt.org)`);
    if (PLATEFORME_SORTIE.test(t)) err(`${nom} : la plateforme sortie le 10/10 est nommée`);
    for (const r of TRACES_QUOTA.slice(0, 2)) if (r.test(t)) err(`${nom} : trace de quota`);
    for (const r of CHIFFRE_QUOTA) { const m = r.exec(t); if (m) err(`${nom} : chiffre de quota « ${m[0]} »`); }
    // Aucun lien du moteur ne doit survivre au rendu (revue de la fondation M-5).
    const brut = /(^|[\s(\]<:])(page|media):[a-z0-9/]/m.exec(t);
    if (brut) err(`${nom} : « ${brut[0].trim()}… » — un lien page:/media: non résolu`);
    for (const m of t.matchAll(/\]\((https?:[^)\s]+)/g)) {
      if (nom === 'llms.txt' && m[1].startsWith(ORIGINE) && !locs.has(m[1])) err(`llms.txt : ${m[1]} hors du sitemap`);
      if (/^http:\/\/(www\.)?fillsell\.app|^https:\/\/www\.fillsell\.app/.test(m[1])) err(`${nom} : ${m[1]} — https://fillsell.app attendu`);
    }
  }

  const nbPages = pages.length;
  return {
    erreurs,
    avertissements,
    pages: nbPages,
    plusProches,
    resume: `${nbPages} pages (404 comprise), ${liensInternes} liens internes contrôlés, recouvrement max ${plusProches.map((x) => `${Math.round(x.r * 100)} % (${x.a} / ${x.b})`).join(', ') || '—'}, ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s)`,
  };
}

// ── Ligne de commande ─────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dossier = path.resolve(racine, process.argv[2] ?? path.join('build', 'site-apercu'));
  const r = await verifierSite(dossier, { racine });
  for (const a of r.avertissements) console.warn(`  avertissement : ${a}`);
  for (const e of r.erreurs) console.error(`  ✗ ${e}`);
  console.log(`site:verifier ${path.relative(racine, dossier)} — ${r.resume}`);
  process.exit(r.erreurs.length ? 1 : 0);
}
