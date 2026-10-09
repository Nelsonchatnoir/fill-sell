import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { lireBlocsBalises, blocsSousConsentement, scriptConsentement, RELS_PARTAGES } from './lib/balises.mjs';
import { lirePagesSite, lireArticlesBlog, jetonsDe } from './lib/contenu.mjs';
import { lirePlateformes, lireTarifs, lireConcurrents, remplacerJetonsProfond } from './lib/donnees.mjs';
import { rendreMarkdown } from './lib/markdown.mjs';
import { creerActifs, empreinteSource } from './lib/actifs.mjs';
import { bundler, preparerCss, tailleGzip, BUDGET_SITE_JS_GZIP } from './lib/bundles.mjs';
import { constantesSupabase } from './lib/constantes-app.mjs';
import { empreinteContenu, lireVerrou, brancheCourante, dateValide } from './lib/dates.mjs';
import { entreeOg, lireManifesteOg, DOSSIER_OG } from './lib/og.mjs';
import { ORIGINE, esc, urlAbsolue, dateLisible, aujourdhuiParis, balisesOuvrantes } from './lib/html.mjs';
import { cheminReserve, ROUTES_APP } from './routes-app.mjs';
import { LANGUES, LANGUE_RACINE, PRIORITE_X_DEFAULT, CODES_LANGUES, langue, accueilDe, cheminDans, langueXDefault } from '../../site/langues.mjs';
import { TEXTES_CONSENTEMENT } from '../../src/utils/consentementTextes.js';
import { layout } from '../../site/gabarits/layout.mjs';
import { page as gabaritPage } from '../../site/gabarits/page.mjs';
import { article as gabaritArticle } from '../../site/gabarits/article.mjs';
import { accueil as gabaritAccueil } from '../../site/gabarits/accueil.mjs';
import { liste as gabaritListe } from '../../site/gabarits/liste.mjs';
import { introuvable as gabaritIntrouvable } from '../../site/gabarits/introuvable.mjs';
import { prix as formaterPrix } from '../../site/gabarits/composants.mjs';
import { grapheJsonLd } from '../../site/gabarits/donnees-structurees.mjs';
import { TEXTES } from '../../site/gabarits/textes.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DU SITE VITRINE STATIQUE (09/10/2026, docs/seo/ARCHITECTURE.md,
// contrat des types : docs/seo/FORMAT-CONTENU.md, design : docs/seo/design/DESIGN.md)
// ═══════════════════════════════════════════════════════════════════════════
// Écrit, dans le dossier de sortie d'un build du site (FILLSELL_SITE=1), une
// page HTML COMPLÈTE par page de site/contenu et par article de src/blog —
// aucune hydratation, aucun JS de l'app : un robot sans JS lit tout (l'accueil
// d'avant servait 0 mot), un mobile n'a plus 220 Ko gzip de JS à analyser.
//
// Ce qu'il écrit : <chemin>/index.html (accueil → index.html, APRÈS la copie
// de la coquille en app-shell.html par le plugin appShell), 404.html,
// sitemap.xml, robots.txt, llms.txt, llms-full.txt, et les fichiers à
// empreinte sous /assets/site/ (police, site.js, images, badges des stores,
// cartes de partage, vidéo). Plus d'indexnow.json servi (revue de la
// fondation M-8) : `npm run site:indexnow-liste` compare les sitemaps.
//
// Ce qu'il tire des DONNÉES (site/donnees/) : périmètre daté et
// non-affiliation (plateformes.yml), jetons {{plateformes}} {{republication}}
// {{nb_plateformes}}, grille des capacités et trajets, cartes et offres des
// tarifs (tarifs.yml), comparaisons, alternatives et classement
// (concurrents.yml, npm run site:concurrents). Aucun chiffre de quota nulle
// part (décision de Nico du 09/10 : la mécanique {{quota:…}} est retirée).
//
// Ce qu'il REFUSE (build rouge, jamais une page partie de travers) :
//   · une page sur un chemin réservé à l'app (routes-app.mjs) ou qui écraserait
//     un fichier de public/ ou du build ;
//   · un lien `page:` inconnu ou vers un brouillon, un lien relatif, un média
//     absent du manifeste, un frontmatter hors contrat, un jeton inconnu, une
//     date qui n'existe pas ou qui est dans le futur ;
//   · une langue déclarée (site/langues.mjs) sans ses libellés ;
//   · en PRODUCTION (Vercel « production », ou un build local sur main), toute
//     page de démonstration (revue de la fondation I-7) ;
//   · une empreinte de contenu qui ne correspond plus au verrou des dates
//     (npm run site:dater) — dans les builds DU SITE en local seulement :
//     sur Vercel ET dans les builds de l'app (natif, OTA, npm run build : mode
//     « controle »), un avertissement (revue technique C-6 : une vidéo refaite
//     par un autre terminal bloquait l'OTA de tous) ;
//   · une carte de partage absente ou périmée (npm run site:og) — en build du
//     site local seulement ; avertissement (et repli sur la carte de
//     l'accueil) sur Vercel et dans les builds de l'app ;
//   · tout ce que site:verifier refuse : il est rejoué à la fin, sur la sortie.
//
// Modes :
//   · « build »    : le site, dans le dossier de sortie de Vite ;
//   · « dater »    : même rendu, dans un dossier jetable, pour écrire
//                    site/dates.lock.json (npm run site:dater) — le SEUL geste
//                    qui écrit une date ;
//   · « controle » : même rendu, dans un dossier jetable, pour REFUSER un
//                    verrou périmé dans un build qui ne génère pas le site
//                    (natif, OTA, build de l'app) — et éprouver au passage les
//                    fichiers de l'app que le build Vercel lit par motif
//                    (constantes Supabase, marqueurs et JSON-LD d'index.html) ;
//   · « og »       : les pages et ce que leurs cartes de partage affichent
//                    (npm run site:og), sans rien écrire.

const ENTITES_INDEX = { Organization: 'organization', WebSite: 'website', SoftwareApplication: 'app' };

// Contenu de démonstration (revue de la fondation I-7). Le drapeau
// `demonstration: true` d'abord ; puis les formules d'un brouillon laissé dans
// un titre ou une description.
const MARQUES_DEMONSTRATION = /brouillon de d[ée]monstration|demonstration draft/i;

// Navigation de l'en-tête (des IDS de pages, jamais un chemin écrit à la main ;
// une entrée dont la page n'existe dans aucune langue est omise, et le journal le dit).
const NAVIGATION = ['comment-ca-marche', '@plateformes', 'comparatif/meilleures-applications-crosslisting', 'tarifs', 'blog', 'faq'];
// Pied : colonnes par TYPE de page (toutes les pages de ce type, dans la langue
// ou, à défaut, dans une autre langue — lien marqué hreflang).
const PIED = [
  { cle: 'produit', ids: ['accueil', 'comment-ca-marche', 'tarifs', 'crosslisting'] },
  { cle: 'plateformes', types: ['plateforme', 'trajet'] },
  { cle: 'fonctions', types: ['fonction'] },
  { cle: 'comparer', types: ['classement', 'comparatif', 'alternative'] },
  { cle: 'ressources', ids: ['blog', 'faq'], types: ['glossaire', 'guide'] },
];

// Fichiers OFFICIELS (site/medias/badges, téléchargés le 09/10 : Apple
// toolbox.marketingtools.apple.com, badge NOIR ; Google play.google.com/intl/…/badges).
// Google Play est servi en WebP SANS PERTE (pixels visibles identiques au PNG
// officiel, vérifié : 5 Ko au lieu de 18) ; ses dimensions sont lues sur le PNG.
const BADGES = {
  apple: { fr: 'app-store-fr.svg', en: 'app-store-en.svg' },
  google: { fr: 'google-play-fr.webp', en: 'google-play-en.webp' },
};
// Badge Google : 646×250 avec sa marge de protection (29 px en haut et en bas)
// — affiché à 52 px, sa partie visible fait 40 px, la hauteur du badge Apple
// (Google demande « the same size or larger »).
const HAUTEUR_BADGE_APPLE = 40;
const HAUTEUR_BADGE_GOOGLE = 52;

/** Les trois JSON-LD d'index.html (sans @context), source unique de l'entité. */
function lireEntites(index) {
  const entites = {};
  for (const m of index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const obj = JSON.parse(m[1]);
    const cle = ENTITES_INDEX[obj['@type']];
    if (!cle) continue;
    const { '@context': _contexte, ...reste } = obj;
    entites[cle] = reste;
  }
  for (const cle of Object.values(ENTITES_INDEX)) {
    if (!entites[cle]) throw new Error(`[site] index.html : JSON-LD « ${cle} » introuvable (source de l'entité FillSell)`);
  }
  return entites;
}

/** Les <link> d'icônes et de manifeste d'index.html, recopiés tels quels. */
function lireLiensIcones(index) {
  const liens = balisesOuvrantes(index.replace(/<!--[\s\S]*?-->/g, ''), 'link')
    .filter((l) => RELS_PARTAGES.includes(l.attrs.rel));
  if (!liens.length) throw new Error('[site] index.html : aucun lien d\'icône ni de manifeste');
  return liens.map((l) => l.brut.replace(/\s*\/>$/, '>')).join('\n');
}

/** Manifeste des médias (npm run site:images) : variantes AVIF/WebP vérifiées. */
function lireManifeste(racine) {
  const fichier = path.join(racine, 'site', 'medias', 'generees', 'manifeste.json');
  if (!existsSync(fichier)) return {};
  const manifeste = JSON.parse(readFileSync(fichier, 'utf8'));
  for (const [cle, e] of Object.entries(manifeste.medias ?? {})) {
    const source = path.join(racine, e.source);
    if (!existsSync(source)) throw new Error(`[site] manifeste des médias : source « ${e.source} » absente (clé ${cle})`);
    if (empreinteSource(source, readFileSync(source)) !== e.empreinte) {
      throw new Error(`[site] média « ${cle} » modifié depuis sa génération : npm run site:images`);
    }
    for (const v of [...(e.variantes.avif ?? []), ...(e.variantes.webp ?? [])]) {
      if (!existsSync(path.join(racine, 'site', 'medias', 'generees', v.fichier))) {
        throw new Error(`[site] variante « ${v.fichier} » absente de site/medias/generees : npm run site:images`);
      }
    }
  }
  return manifeste.medias ?? {};
}

/** Clés (profondes) d'un objet de libellés, pour comparer deux langues. */
function clesProfondes(objet, prefixe = '') {
  return Object.entries(objet).flatMap(([k, v]) => (v && typeof v === 'object' ? clesProfondes(v, `${prefixe}${k}.`) : [`${prefixe}${k}`])).sort();
}

/**
 * Chaque langue déclarée a ses libellés, avec les mêmes clés que la langue
 * racine, et le texte du bandeau de consentement.
 */
function verifierLangues() {
  const reference = JSON.stringify(clesProfondes(TEXTES[LANGUE_RACINE]));
  for (const l of LANGUES) {
    if (!TEXTES[l.code]) throw new Error(`[site] langue « ${l.code} » déclarée dans site/langues.mjs sans libellés dans site/gabarits/textes.mjs`);
    if (JSON.stringify(clesProfondes(TEXTES[l.code])) !== reference) {
      const manquent = clesProfondes(TEXTES[LANGUE_RACINE]).filter((k) => !clesProfondes(TEXTES[l.code]).includes(k));
      throw new Error(`[site] site/gabarits/textes.mjs : libellés « ${l.code} » incomplets ou en trop (manquent : ${manquent.join(', ') || 'aucun'})`);
    }
    if (!TEXTES_CONSENTEMENT[l.code]) throw new Error(`[site] langue « ${l.code} » sans texte de consentement (src/utils/consentementTextes.js)`);
    if (!BADGES.apple[l.code] || !BADGES.google[l.code]) throw new Error(`[site] langue « ${l.code} » sans badges des stores (BADGES, scripts/site/build-site.mjs)`);
  }
  for (const code of PRIORITE_X_DEFAULT) langue(code);
  langue(LANGUE_RACINE);
}

/** Production : Vercel « production », ou un build local sur la branche main (qui y partira au prochain push). */
export function enProduction(racine, env = process.env) {
  if (env.VERCEL) return env.VERCEL_ENV === 'production';
  return brancheCourante(racine) === 'main';
}

function cheminVersFichier(chemin) {
  return chemin === '/' ? 'index.html' : path.join(...chemin.split('/').filter(Boolean), 'index.html');
}

/** Liste lisible des plateformes ouvertes (« Vinted, Leboncoin, eBay, Beebs et Depop »). */
function listePlateformes(noms, lang) {
  return new Intl.ListFormat(langue(lang).locale, { style: 'long', type: 'conjunction' }).format(noms);
}

/**
 * Transcription de la vidéo, regroupée par CHAPITRE (video.json) : les légendes
 * incrustées se chevauchent (un titre, puis la même phrase en plus long) ; on
 * garde chaque texte une fois, celui qui en contient un autre l'emporte. Sans
 * chapitres (traduction anglaise : déjà regroupée), les lignes telles quelles.
 */
function transcriptionParChapitre(lignes, chapitres) {
  if (!Array.isArray(chapitres) || !chapitres.length) return lignes.map((l) => ({ temps: minutes(l.debut_s), texte: l.texte }));
  return chapitres.map((c) => {
    const textes = lignes.filter((l) => l.debut_s >= c.debut_s && l.debut_s < c.fin_s).map((l) => l.texte.trim());
    const uniques = textes.filter((t, i) => textes.indexOf(t) === i && !textes.some((u) => u !== t && u.includes(t)));
    return { temps: minutes(c.debut_s), titre: c.titre, texte: uniques.join(' ') };
  }).filter((c) => c.texte);
}

/** « 4:05 » depuis des secondes. */
const minutes = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// `verrou` : un verrou des dates FOURNI (selftests seulement) à la place de site/dates.lock.json.
export async function genererSite({ dossier, racine = process.cwd(), mode = 'build', journal = console, verifier = true, env = process.env, verrou: verrouFourni = null } = {}) {
  const t0 = performance.now();
  if (!['build', 'dater', 'controle', 'og'].includes(mode)) throw new Error(`[site] mode « ${mode} » inconnu (build, dater, controle, og)`);
  const dater = mode === 'dater';
  const controle = mode === 'controle';
  const modeOg = mode === 'og';
  const jetable = dater || controle || modeOg;
  // Une date périmée n'échoue que dans un build DU SITE en local (npm run
  // site:apercu) ; sur Vercel et dans les builds de l'app (mode « controle » :
  // natif, OTA, npm run build), un avertissement — jamais une OTA bloquée pour
  // une date (revue technique C-6).
  const datesStrictes = !env.VERCEL && !controle;
  // Cartes de partage : strictes seulement dans un build du site LOCAL.
  const ogStrictes = mode === 'build' && !env.VERCEL;
  const avertir = (m) => journal.warn(`[site] avertissement : ${m.replace(/^\[site\] /, '')}`);

  // ── 1. Sources communes ──────────────────────────────────────────────────
  verifierLangues();
  const index = readFileSync(path.join(racine, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  // Balises de mesure : lues dans index.html (la source, embarquée telle quelle
  // par le natif), écrites dans les pages SOUS CONSENTEMENT (09/10, CNIL) :
  // bloc « consentement » (GTM et Google Ads après l'accord) + « insights ».
  const blocsIndex = lireBlocsBalises(index, 'index.html');
  const balises = blocsSousConsentement(blocsIndex, await scriptConsentement(racine, blocsIndex));
  const entites = lireEntites(index);
  const liensIcones = lireLiensIcones(index);
  const supabase = constantesSupabase(racine);
  const plateformes = lirePlateformes(racine);
  const tarifs = lireTarifs(racine, CODES_LANGUES);
  const concurrents = lireConcurrents(racine);
  if (!jetable && !existsSync(path.join(dossier, 'app-shell.html'))) {
    throw new Error('[site] app-shell.html absent : le plugin appShell doit copier la coquille AVANT le générateur (vite.config.js)');
  }

  // ── 2. Contenu ───────────────────────────────────────────────────────────
  const toutesPagesSite = await lirePagesSite(racine, { concurrents: () => concurrents });
  const brouillons = new Set(toutesPagesSite.filter((p) => p.brouillon).map((p) => `${p.id}|${p.lang}`));
  const pagesSite = toutesPagesSite.filter((p) => !p.brouillon);
  const articles = await lireArticlesBlog(racine);

  // Démonstration en production : refus (revue de la fondation I-7).
  if (enProduction(racine, env)) {
    const demo = pagesSite.filter((p) => p.demonstration || [p.title, p.description, p.h1, p.chapo].some((x) => MARQUES_DEMONSTRATION.test(x ?? '')));
    if (demo.length) {
      throw new Error(
        `[site] CONTENU DE DÉMONSTRATION REFUSÉ EN PRODUCTION (${env.VERCEL ? 'Vercel, VERCEL_ENV=production' : 'build local sur main'}) :\n` +
        demo.map((p) => `   · ${p.fichier}${p.demonstration ? ' (demonstration: true)' : ' (« Brouillon de démonstration » dans le titre ou la description)'}`).join('\n') +
        '\n   → le contenu réel remplace ces brouillons AVANT la fusion sur main ; une prévisualisation (autre branche) les accepte.',
      );
    }
  }

  // ── 3. Registre des pages : id + langue → chemin ─────────────────────────
  const registre = new Map();
  const parChemin = new Map();
  const inscrire = (e) => {
    const cle = `${e.id}|${e.lang}`;
    if (registre.has(cle)) throw new Error(`[site] id « ${e.id} » (${e.lang}) en double : ${registre.get(cle).fichier} et ${e.fichier}`);
    if (parChemin.has(e.chemin)) throw new Error(`[site] chemin ${e.chemin} en double : ${parChemin.get(e.chemin).fichier} et ${e.fichier}`);
    const reserve = cheminReserve(e.chemin);
    if (reserve && !e.chemin.startsWith('/blog')) throw new Error(`[site] ${e.fichier} : le chemin ${e.chemin} recoupe ${reserve}`);
    registre.set(cle, { ...e, hreflang: langue(e.lang).hreflang });
    parChemin.set(e.chemin, registre.get(cle));
  };
  for (const p of pagesSite) {
    inscrire({ id: p.id, lang: p.lang, type: p.type, chemin: p.chemin, fichier: p.fichier, nom: p.nom, titre: p.h1, texte: p.description, plateforme: p.plateforme ?? null, trajet: p.trajet ?? null });
  }
  // Une liste du blog par langue qui a au moins un article (une liste vide
  // serait une page creuse) ; libellés dans textes.mjs.
  const listeBlog = {};
  for (const { code } of LANGUES) {
    if (!articles.some((a) => a.lang === code)) continue;
    const b = TEXTES[code].blog;
    listeBlog[code] = { id: 'blog', lang: code, type: 'liste', chemin: cheminDans(code, 'blog'), fichier: `(liste du blog, ${code})`, nom: b.nom, titre: b.titre, texte: b.texte };
    inscrire(listeBlog[code]);
  }
  for (const a of articles) {
    inscrire({ id: `blog/${a.slug}`, lang: a.lang, type: 'article', chemin: `/blog/${a.slug}`, fichier: a.fichier, nom: a.title, titre: a.title, texte: a.description });
  }

  /**
   * Résolution d'un id de CONTENU (page:, liens:, fil:) : la version de la
   * langue visée (celle de la page, ou `page:<langue>:<id>`), jamais un repli
   * silencieux — le brouillon d'abord (revue de la fondation M-2).
   */
  const entreePour = (id, lang, fichier, langueVisee = null) => {
    if (langueVisee && !CODES_LANGUES.includes(langueVisee)) {
      throw new Error(`[site] ${fichier} : page:${langueVisee}:${id} — langue « ${langueVisee} » non déclarée (${CODES_LANGUES.join(', ')})`);
    }
    const visee = langueVisee ?? lang;
    const exacte = registre.get(`${id}|${visee}`);
    if (exacte) return exacte;
    if (brouillons.has(`${id}|${visee}`)) throw new Error(`[site] ${fichier} : page:${id} (${visee}) est un BROUILLON (jamais généré) — retire le lien ou publie la page`);
    const autres = [...registre.values()].filter((e) => e.id === id);
    if (!autres.length) throw new Error(`[site] ${fichier} : page:${id} inconnu`);
    throw new Error(
      `[site] ${fichier} : page:${id} n'existe pas en ${visee} (versions : ${autres.map((e) => e.lang).join(', ')}) — ` +
      `pour viser une autre langue, écris-le : page:${autres[0].lang}:${id}`,
    );
  };
  // Gabarits (menu, pied, cartes, 404) : la version de la langue, sinon un
  // repli DÉCLARÉ (porte internationale, puis la langue racine) — une langue
  // nouvelle n'a pas encore toutes ses pages. null si aucune langue ne l'a.
  const entreeGabaritOuRien = (id, lang) => {
    for (const code of [lang, ...PRIORITE_X_DEFAULT, LANGUE_RACINE, ...CODES_LANGUES]) {
      const e = registre.get(`${id}|${code}`);
      if (e) return e;
    }
    return null;
  };
  const entreeGabarit = (id, lang) => {
    const e = entreeGabaritOuRien(id, lang);
    if (!e) throw new Error(`[site] gabarit : la page « ${id} » n'existe dans aucune langue`);
    return e;
  };
  /** Lien de gabarit vers une page : chemin, et hreflang si la version est d'une autre langue. */
  const lienVers = (e, lang, libelle = e.nom) => ({ chemin: e.chemin, libelle, ...(e.lang !== lang ? { hreflang: e.hreflang } : {}) });
  /** Les ids (uniques, dans l'ordre des fichiers) des pages d'un type, toutes langues. */
  const idsDuType = (type) => [...new Set([...registre.values()].filter((e) => e.type === type).map((e) => e.id))];
  const ordrePlateforme = (id) => {
    const pf = [...registre.values()].find((e) => e.id === id)?.plateforme;
    return plateformes.ouvertes.findIndex((p) => p.id === pf);
  };

  // Périmètre DATÉ et non-affiliation, tirés des données (architecture § 2.7).
  // Une plateforme dont certains pays restent fermés se nomme avec ses
  // domaines ouverts : « Vinted (vinted.fr) ».
  const nomsOuverts = plateformes.ouvertes.map((p) => (p.pays.some((x) => !x.ouvert)
    ? `${p.nom} (${p.pays.filter((x) => x.ouvert).map((x) => x.domaine.replace(/^www\./, '')).join(', ')})`
    : p.nom));
  const perimetres = Object.fromEntries(LANGUES.map((l) => [l.code,
    TEXTES[l.code].pied.perimetre(dateLisible(plateformes.date, l.code), listePlateformes(nomsOuverts, l.code))]));
  const nonAffiliations = Object.fromEntries(LANGUES.map((l) => [l.code,
    TEXTES[l.code].pied.nonAffiliation(listePlateformes(plateformes.ouvertes.map((p) => p.nom), l.code))]));
  const avertisNav = new Set();
  const site = {
    balises,
    liensIcones,
    plateformes,
    chemin: (id, lang) => (id === 'accueil' ? accueilDe(lang) : entreeGabarit(id, lang).chemin),
    nomCourt: (id, lang) => (id === 'accueil' ? TEXTES[lang].accueil : entreeGabarit(id, lang).nom),
    perimetre: (lang) => perimetres[lang],
    nonAffiliation: (lang) => nonAffiliations[lang],
    locale: (lang) => langue(lang).locale,
    dateLisible: (iso, lang) => dateLisible(iso, lang),
    navigation(page) {
      const t = TEXTES[page.lang];
      const items = [];
      for (const id of NAVIGATION) {
        if (id === '@plateformes') {
          const sous = idsDuType('plateforme').sort((a, b) => ordrePlateforme(a) - ordrePlateforme(b))
            .map((x) => entreeGabarit(x, page.lang)).map((e) => ({ ...lienVers(e, page.lang), courant: e.chemin === page.chemin }));
          if (sous.length) items.push({ libelle: t.plateformesMenu, sous });
          continue;
        }
        const e = entreeGabaritOuRien(id, page.lang);
        if (!e) {
          if (!avertisNav.has(id)) { avertisNav.add(id); if (!jetable) avertir(`menu : la page « ${id} » n'existe dans aucune langue, entrée omise`); }
          continue;
        }
        items.push({ ...lienVers(e, page.lang), courant: e.chemin === page.chemin });
      }
      return items;
    },
    pied(page) {
      const t = TEXTES[page.lang];
      return PIED.map((col) => {
        const ids = [...(col.ids ?? []), ...(col.types ?? []).flatMap((ty) => (ty === 'plateforme' ? idsDuType(ty).sort((a, b) => ordrePlateforme(a) - ordrePlateforme(b)) : idsDuType(ty)))];
        const vus = new Set();
        const liens = [];
        for (const id of ids) {
          if (vus.has(id)) continue;
          vus.add(id);
          if (id === 'accueil') { liens.push({ chemin: accueilDe(page.lang), libelle: t.accueil }); continue; }
          const e = entreeGabaritOuRien(id, page.lang);
          if (e) liens.push(lienVers(e, page.lang));
        }
        // Les pages déjà nommées par une autre colonne ne sont pas répétées.
        return { titre: t.pied[col.cle], liens };
      }).map((col, i, toutes) => ({ ...col, liens: col.liens.filter((l) => !toutes.slice(0, i).some((c) => c.liens.some((x) => x.chemin === l.chemin))) }));
    },
  };

  // Collision, AVANT toute écriture du site : le premier segment d'une page ne
  // peut pas être un fichier ou un dossier de public/ (email/, landing/…) ou du
  // build (build.json…) — la page s'y mêlerait ou l'écraserait sans un mot.
  const lister = (d) => (existsSync(d) ? readdirSync(d) : []);
  const dejaLa = new Set([...lister(dossier), ...lister(path.join(racine, 'public'))]);
  for (const e of registre.values()) {
    const premier = e.chemin.split('/')[1];
    if (premier && dejaLa.has(premier)) {
      throw new Error(`[site] ${e.fichier} : « ${premier} » existe déjà dans public/ ou dans la sortie du build — choisis un autre chemin que ${e.chemin}`);
    }
  }

  // ── 4. Fichiers : police, CSS, scripts, médias, badges, vidéo ────────────
  const actifs = creerActifs(dossier);
  site.police = await actifs.publierFichier(path.join(racine, 'site', 'polices', 'space-grotesk-latin.woff2'));
  // Icône de la marque à la taille de l'en-tête (64 px pour 32 px affichés) : 3,5 Ko au lieu des 45 Ko d'icon-192x192.png.
  site.logo = await actifs.publierFichier(path.join(racine, 'site', 'medias', 'marque', 'fillsell-icone-64.png'));
  await actifs.publierFichier(path.join(racine, 'site', 'polices', 'OFL.txt')); // licence livrée avec la police (OFL 1.1, condition 2)
  // CSS : socle + modules ; chaque page ne met en ligne que ce qu'elle emploie
  // (site.cssPour(html), budget de 20 Ko PAR PAGE). Le module « bandeaux »
  // part dans site.js, jamais en ligne.
  const feuille = await preparerCss(path.join(racine, 'site', 'styles', 'site.css'), {
    remplacements: { 'police:space-grotesk-latin.woff2': site.police },
  });
  site.cssPour = feuille.pour;
  if (!feuille.pourJs.bandeaux) throw new Error('[site] site.css : module « bandeaux : @js » absent (styles du consentement et de la suggestion de langue)');
  site.aiguillage = await bundler(path.join(racine, 'site', 'js', 'aiguillage-lancement.js'), {
    racine, define: { __FS_CLE_JETON__: supabase.cleJeton },
  });
  if (site.aiguillage.includes('</script')) throw new Error('[site] le script d\'aiguillage contient « </script » : il ne peut pas être mis en ligne');
  const siteJs = await bundler(path.join(racine, 'site', 'js', 'site.js'), {
    racine,
    define: { __FS_CLE_JETON__: supabase.cleJeton, __FS_CSS_BANDEAUX__: feuille.pourJs.bandeaux },
  });
  const gzipSite = tailleGzip(siteJs);
  if (gzipSite > BUDGET_SITE_JS_GZIP) throw new Error(`[site] site.js : ${gzipSite} o gzip, budget ${BUDGET_SITE_JS_GZIP} o`);
  site.siteJs = await actifs.publierOctets('site.js', Buffer.from(siteJs + '\n'));

  const manifeste = lireManifeste(racine);
  const urlsMedias = new Map();
  for (const e of Object.values(manifeste)) {
    for (const v of [...(e.variantes.avif ?? []), ...(e.variantes.webp ?? [])]) {
      if (!urlsMedias.has(v.fichier)) {
        urlsMedias.set(v.fichier, await actifs.publierFichier(path.join(racine, 'site', 'medias', 'generees', v.fichier)));
      }
    }
  }
  site.url = (fichier) => urlsMedias.get(fichier);
  const medias = {
    entree(cle) {
      const e = manifeste[cle];
      if (!e) return null;
      // Repli <img> : le fichier public d'origine s'il en est un, sinon la plus
      // grande variante WebP (tous les navigateurs servis la lisent).
      const plusGrande = [...(e.variantes.webp ?? [])].sort((a, b) => b.largeur - a.largeur)[0];
      return { largeur: e.largeur, hauteur: e.hauteur, variantes: e.variantes, repli: cle.startsWith('/') ? cle : urlsMedias.get(plusGrande.fichier) };
    },
  };
  /** Média d'un champ du frontmatter (hero_media, etapes, fonctions) : doit être au manifeste. */
  const mediaDe = (cle, fichier, champ) => {
    const m = medias.entree(cle);
    if (!m) throw new Error(`[site] ${fichier} : ${champ} « ${cle} » absent du manifeste des médias — npm run site:images`);
    return m;
  };

  // Badges officiels des stores, auto-hébergés (Apple NOIR, Google Play).
  const badges = {};
  for (const [store, parLangue] of Object.entries(BADGES)) {
    for (const [lang, nom] of Object.entries(parLangue)) {
      const f = path.join(racine, 'site', 'medias', 'badges', nom);
      if (!existsSync(f)) throw new Error(`[site] badge ${store} (${lang}) absent : site/medias/badges/${nom}`);
      const url = await actifs.publierFichier(f);
      let largeur;
      if (nom.endsWith('.svg')) {
        const svg = readFileSync(f, 'utf8');
        const w = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
        const h = Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1]);
        if (!w || !h) throw new Error(`[site] badge ${nom} : width/height illisibles`);
        largeur = Math.round((w * HAUTEUR_BADGE_APPLE) / h);
        (badges[lang] ??= {}).apple = { url, largeur, hauteur: HAUTEUR_BADGE_APPLE };
      } else {
        // Dimensions lues sur le PNG officiel (en-tête IHDR) posé à côté du WebP.
        const png = f.replace(/\.webp$/, '.png');
        if (!existsSync(png)) throw new Error(`[site] badge ${nom} : PNG officiel ${path.basename(png)} absent (dimensions)`);
        const octets = readFileSync(png);
        const w = octets.readUInt32BE(16);
        const h = octets.readUInt32BE(20);
        largeur = Math.round((w * HAUTEUR_BADGE_GOOGLE) / h);
        (badges[lang] ??= {}).google = { url, largeur, hauteur: HAUTEUR_BADGE_GOOGLE };
      }
    }
  }
  site.badges = (lang) => badges[lang];

  // Vidéo de présentation (site/medias/video/video.json) : seulement si une page la montre.
  let videoSource = null;
  if (pagesSite.some((p) => p.video)) {
    const dossierVideo = path.join(racine, 'site', 'medias', 'video');
    const fv = path.join(dossierVideo, 'video.json');
    if (!existsSync(fv)) throw new Error('[site] une page porte « video: true » mais site/medias/video/video.json est absent');
    const v = JSON.parse(readFileSync(fv, 'utf8'));
    const rang = (type) => (/av01/.test(type) ? 0 : /vp9/.test(type) ? 1 : 2);
    const sources = [];
    // INTÉGRITÉ (revue technique M-9 : un build a publié l'AV1 à 1 048 576 o
    // pile, copié pendant que l'agent vidéo l'écrivait) : chaque fichier que
    // video.json décrit doit avoir le poids qu'il y déclare (poids_octets,
    // obligatoire) et, s'il est déclaré, la même empreinte sha256.
    // Builds de l'app (mode « controle ») : un avertissement — la vidéo ne
    // concerne que le site, elle ne bloque jamais une OTA (même règle que C-6).
    const ecartVideo = (m) => { if (controle) avertir(m); else throw new Error(m); };
    const integre = (f) => {
      const chemin = path.join(dossierVideo, f.chemin);
      if (!existsSync(chemin)) throw new Error(`[site] vidéo : ${f.chemin} absent de site/medias/video`);
      if (!Number.isInteger(f.poids_octets)) { ecartVideo(`[site] vidéo : ${f.chemin} sans « poids_octets » dans video.json — le poids déclaré garde d'un fichier tronqué`); return chemin; }
      const octets = readFileSync(chemin);
      if (octets.length !== f.poids_octets) {
        ecartVideo(`[site] vidéo : ${f.chemin} fait ${octets.length} o, video.json en déclare ${f.poids_octets} — fichier tronqué ou en cours d'écriture ? (refaire video.json, ou attendre la fin de l'encodage)`);
      } else if (f.sha256 && createHash('sha256').update(octets).digest('hex') !== String(f.sha256).toLowerCase()) {
        ecartVideo(`[site] vidéo : ${f.chemin} — empreinte sha256 différente de celle de video.json`);
      }
      return chemin;
    };
    for (const f of (v.fichiers ?? []).filter((x) => x.role === 'video').sort((a, b) => rang(a.type) - rang(b.type))) {
      sources.push({ url: await actifs.publierFichier(integre(f)), type: f.type });
    }
    if (!sources.some((s) => s.type.startsWith('video/mp4'))) throw new Error('[site] vidéo : aucune source MP4 (repli universel)');
    const affiche = (v.fichiers ?? []).filter((x) => x.role === 'affiche').sort((a, b) => b.largeur - a.largeur)[0];
    if (!affiche || !existsSync(path.join(dossierVideo, affiche.chemin))) throw new Error('[site] vidéo : affiche (poster) absente');
    videoSource = { v, sources, affiche: await actifs.publierFichier(integre(affiche)) };
  }
  const videoPour = (lang, publie) => {
    const { v, sources, affiche } = videoSource;
    const lignes = (lang === 'fr' ? v.transcription_fr : v[`transcription_${lang}_traduction`] ?? v.transcription_en_traduction ?? v.transcription_fr) ?? [];
    return {
      sources,
      affiche,
      largeur: v.largeur,
      hauteur: v.hauteur,
      titre: v.titre?.[lang] ?? v.titre?.fr,
      // Texte du site (décisions de Nico : aucun palier à côté de la republication) — pas la description de video.json.
      description: TEXTES[lang].videoTexte,
      aria: v.accessibilite?.[`aria_label_${lang}`] ?? v.accessibilite?.aria_label_fr ?? v.titre?.fr,
      duree: v.duree_iso8601,
      langueVideo: v.json_ld_videoobject?.inLanguage ?? 'fr',
      // Date de mise en ligne : celle de video.json si elle est écrite, sinon
      // la date de publication de la page qui la montre.
      miseEnLigne: dateValide(v.mise_en_ligne) ? v.mise_en_ligne : publie,
      transcription: transcriptionParChapitre(lignes, lang === 'fr' ? v.chapitres : null),
    };
  };

  // Cartes de partage (npm run site:og).
  const manifesteOg = lireManifesteOg(racine);
  const urlsOg = new Map();
  const cartePour = async (og, fichier) => {
    const c = manifesteOg.cartes?.[og.cle];
    const f = c ? path.join(racine, DOSSIER_OG, ...c.fichier.split('/')) : null;
    if (c && c.empreinte === og.empreinte && existsSync(f)) {
      if (!urlsOg.has(og.cle)) urlsOg.set(og.cle, ORIGINE + await actifs.publierFichier(f));
      return urlsOg.get(og.cle);
    }
    return { manque: `${fichier} : carte de partage ${og.cle} ${c ? 'périmée (titre ou plateformes changés)' : 'absente'} — npm run site:og` };
  };

  // ── 5. Modèles de page ───────────────────────────────────────────────────
  const verrou = verrouFourni ?? lireVerrou(racine);
  const pages = [];
  const etapeAccueil = (lang) => ({ nom: TEXTES[lang].accueil, chemin: accueilDe(lang), url: urlAbsolue(accueilDe(lang)) });
  const etape = (e) => ({ nom: e.nom, chemin: e.chemin, url: urlAbsolue(e.chemin) });
  /** hreflang pour N langues : les versions qui EXISTENT (Map langue → chemin), x-default déclaré. */
  const alternatesDe = (versions) => {
    const codes = CODES_LANGUES.filter((c) => versions.has(c));
    const xDefault = langueXDefault(codes);
    if (!xDefault) return [];
    return [
      ...codes.map((c) => ({ lang: langue(c).hreflang, chemin: versions.get(c), url: urlAbsolue(versions.get(c)) })),
      { lang: 'x-default', chemin: versions.get(xDefault), url: urlAbsolue(versions.get(xDefault)) },
    ];
  };
  const rendreCorps = (markdown, ctx) => rendreMarkdown(markdown, {
    racine,
    medias,
    url: (fichier) => urlsMedias.get(fichier),
    libelleTableau: TEXTES[ctx.lang].tableau,
    libelleCapture: TEXTES[ctx.lang].captureDemo,
    resoudre: (id, f, langueVisee) => {
      const e = entreePour(id, ctx.lang, f, langueVisee);
      return { chemin: e.chemin, lang: e.lang, hreflang: e.hreflang };
    },
    ...ctx,
  });
  const plateformeParId = new Map(plateformes.ouvertes.map((p) => [p.id, p]));
  const tarifsPour = (lang, avecLien) => {
    const communs = remplacerJetonsProfond(tarifs.communs, jetonsDe(lang, plateformes), 'site/donnees/tarifs.yml');
    const lienTarifs = avecLien ? entreeGabaritOuRien('tarifs', lang) : null;
    return { ...tarifs, communs, lien: lienTarifs ? lienVers(lienTarifs, lang) : null };
  };

  // Comparaisons (site/donnees/concurrents.yml) : une cellule par outil et par critère.
  const resumePrix = (v, lang) => {
    if (!v?.paliers?.length) return null;
    const t = TEXTES[lang];
    const payants = v.paliers.map((p) => p.prix_mensuel).filter((x) => typeof x === 'number' && x > 0);
    if (!payants.length) return null;
    const min = formaterPrix(Math.min(...payants), lang, v.devise ?? 'EUR');
    const gratuit = v.paliers.some((p) => p.prix_mensuel === 0);
    return `${gratuit ? t.prixGratuitPuis(min) : t.prixDes(min)}${v.par_site ? ` ${t.parSite}` : ''}`;
  };
  // Texte d'un fait concurrent DANS LA LANGUE de la page quand la donnée l'a
  // (concurrents.yml : `traductions`, revue technique C-11), sinon le français
  // — le gabarit le marque alors lang="fr".
  const traduit = (v, champ, lang) => {
    const t = v?.traductions?.[champ]?.[lang];
    return t ? { texte: t, langue: lang } : { texte: v?.[champ] ?? null, langue: LANGUE_RACINE };
  };
  const celluleDe = (outil, critere, lang) => {
    if (critere === 'plateformes') {
      const v = outil.criteres.plateformes ?? {};
      const items = plateformes.ouvertes.map((p) => ({ nom: p.nom, oui: (v[p.id] ?? (p.id === 'depop' ? outil.criteres.depop : null))?.verdict === 'oui' }));
      const valeurs = Object.values(v).filter((x) => x?.date);
      return {
        plateformes: items,
        sources: [...new Set(valeurs.flatMap((x) => x.sources ?? []))],
        date: valeurs.map((x) => x.date).sort().at(-1) ?? concurrents.meta.observe_le,
      };
    }
    const brut = outil.criteres[critere];
    if (!brut) return null;
    const { texte, langue: langueTexte } = traduit(brut, 'valeur', lang);
    const v = { ...brut, valeur: texte, langue: langueTexte };
    if (critere === 'prix') return { ...v, resume: resumePrix(brut, lang) };
    return v;
  };
  const comparaisonDe = (slugs, criteres, lang) => {
    const outils = [concurrents.nous, ...slugs.map((s) => concurrents.parSlug.get(s))];
    return {
      outils: outils.map((o) => ({ slug: o.slug, nom: o.nom, notre_produit: !!o.notre_produit })),
      criteres: criteres.map((id) => ({ id, cellules: outils.map((o) => celluleDe(o, id, lang)) })),
    };
  };
  const CRITERES_COMPARATIF = ['plateformes', 'app_mobile', 'extension', 'ordinateur_eteint', 'ia_photo', 'import_synchro', 'regroupement_multi_plateformes', 'retrait_auto_copies', 'republication', 'stock_ventes_marges', 'prix', 'essai', 'pays_langues'];
  const nomOutil = (slug) => concurrents.parSlug.get(slug)?.nom ?? slug;
  const urlOutil = (slug) => (concurrents.parSlug.get(slug)?.notre_produit ? ORIGINE : concurrents.parSlug.get(slug)?.url ?? ORIGINE);

  for (const p of pagesSite) {
    const corps = await rendreCorps(p.markdown, { fichier: p.fichier, source: 'site', type: p.type, lang: p.lang, faqAttendue: !!p.faq });
    const versions = new Map(pagesSite.filter((q) => q.id === p.id).map((q) => [q.lang, q.chemin]));
    const modele = {
      ...p,
      gabarit: p.type === 'accueil' ? 'accueil' : 'page',
      url: urlAbsolue(p.chemin),
      racine: p.chemin === '/',
      robots: 'index, follow',
      alternates: alternatesDe(versions),
      fil: p.type === 'accueil' ? [] : [etapeAccueil(p.lang), ...(p.fil ?? []).map((id) => etape(entreePour(id, p.lang, p.fichier))), etape(registre.get(`${p.id}|${p.lang}`))],
      liees: (p.liens ?? []).map((id) => { const e = entreePour(id, p.lang, p.fichier); return { chemin: e.chemin, titre: e.titre, texte: e.texte }; }),
      ogType: 'website',
      corps,
      dateDeclaree: p.publie,
      hero: p.hero_media ? mediaDe(p.hero_media, p.fichier, 'hero_media') : null,
      etapes: p.etapes?.map((e, i) => ({ ...e, image: e.media ? mediaDe(e.media, p.fichier, `etapes[${i}].media`) : null })),
    };
    // Étiquettes de la tête : plateformes citées, celles du trajet ou de la plateforme.
    const ids = p.plateformes_citees ?? (p.trajet ? [p.trajet.de, p.trajet.vers] : p.plateforme ? [p.plateforme] : []);
    modele.etiquettes = ids.map((id) => plateformeParId.get(id).nom);
    if (p.type === 'accueil') {
      modele.fonctions = p.fonctions?.map((f, i) => {
        const [langueVisee, idPage] = f.page.includes(':') ? f.page.split(':') : [null, f.page];
        const e = entreePour(idPage, p.lang, p.fichier, langueVisee);
        return { ...f, chemin: e.chemin, ...(e.lang !== p.lang ? { hreflang: e.hreflang } : {}), image: f.media ? mediaDe(f.media, p.fichier, `fonctions[${i}].media`) : null };
      });
      if (p.comparaison) {
        const lien = entreeGabaritOuRien('comparatif/meilleures-applications-crosslisting', p.lang);
        modele.comparaison = { ...comparaisonDe(p.comparaison.concurrents, p.comparaison.criteres, p.lang), date: concurrents.meta.observe_le, lien: lien ? lienVers(lien, p.lang) : null };
      }
      modele.tarifs = p.tarifs ? tarifsPour(p.lang, true) : null;
      modele.video = p.video ? videoPour(p.lang, p.publie) : null;
    }
    if (p.type === 'tarifs') modele.tarifs = tarifsPour(p.lang, false);
    if (p.type === 'plateforme') {
      modele.plateformeDonnees = plateformeParId.get(p.plateforme);
      modele.trajets = idsDuType('trajet').map((id) => entreeGabarit(id, p.lang))
        .filter((e) => e.trajet && (e.trajet.de === p.plateforme || e.trajet.vers === p.plateforme))
        .map((e) => ({ ...lienVers(e, p.lang), titre: e.titre, texte: e.texte }));
    }
    if (p.type === 'trajet') {
      const pagesPf = idsDuType('plateforme').map((id) => entreeGabarit(id, p.lang)).filter((e) => [p.trajet.de, p.trajet.vers].includes(e.plateforme));
      modele.trajetDonnees = {
        de: plateformeParId.get(p.trajet.de),
        vers: plateformeParId.get(p.trajet.vers),
        pages: pagesPf.sort((a, b) => [p.trajet.de, p.trajet.vers].indexOf(a.plateforme) - [p.trajet.de, p.trajet.vers].indexOf(b.plateforme)).map((e) => ({ ...lienVers(e, p.lang), titre: e.nom })),
      };
    }
    if (['comparatif', 'alternative', 'classement'].includes(p.type)) modele.dateReleve = concurrents.meta.observe_le;
    if (p.type === 'comparatif') {
      const c = comparaisonDe([p.concurrent], CRITERES_COMPARATIF, p.lang);
      modele.comparatif = { ...c, concurrent: concurrents.parSlug.get(p.concurrent) };
    }
    if (p.type === 'alternative') {
      const liste = [concurrents.nous, ...p.alternatives.map((s) => concurrents.parSlug.get(s))].map((o) => ({
        nom: o.nom,
        notre_produit: !!o.notre_produit,
        categorie: traduit(o, 'categorie', p.lang).texte,
        categorieLangue: traduit(o, 'categorie', p.lang).langue,
        plateformes: plateformes.ouvertes.filter((pf) => (o.criteres.plateformes?.[pf.id])?.verdict === 'oui').map((pf) => pf.nom),
        prixEntree: o.criteres.prix ? (resumePrix(o.criteres.prix, p.lang) ?? o.criteres.prix.valeur) : null,
        sources: o.criteres.prix?.sources ?? [],
        date: o.criteres.prix?.date ?? concurrents.meta.observe_le,
      }));
      modele.alternativeDonnees = { concurrent: concurrents.parSlug.get(p.concurrent), liste };
    }
    if (p.type === 'classement') {
      if (!concurrents.classement?.notes?.length) throw new Error(`[site] ${p.fichier} : type classement, mais site/donnees/concurrents.yml n'a pas de classement — npm run site:concurrents`);
      const c = concurrents.classement;
      const champs = (x, noms) => Object.assign({}, x, ...noms.map((n) => { const t = traduit(x, n, p.lang); return { [n]: t.texte, [`${n}Langue`]: t.langue }; }));
      modele.classementDonnees = {
        ...c,
        criteres: c.criteres.map((x) => champs(x, ['nom', 'grille'])),
        variantes: (c.variantes ?? []).map((x) => champs(x, ['nom', 'ordre'])),
        hors: (c.hors_classement ?? []).map((x) => champs(x, ['raison'])),
        nom: nomOutil,
        url: urlOutil,
      };
    }
    modele.og = entreeOg({ id: p.id, lang: p.lang, titre: p.h1, surtitre: p.surtitre ?? p.nom, plateformes: modele.etiquettes.length ? modele.etiquettes : plateformes.ouvertes.map((x) => x.nom) });
    pages.push(modele);
  }

  for (const a of articles) {
    const corps = await rendreCorps(a.content, { fichier: a.fichier, source: 'blog', type: 'article', lang: a.lang });
    const trad = a.translation ? articles.find((o) => o.slug === a.translation) : null;
    const chemin = `/blog/${a.slug}`;
    const versions = new Map([[a.lang, chemin], ...(trad ? [[trad.lang, `/blog/${trad.slug}`]] : [])]);
    pages.push({
      id: `blog/${a.slug}`, lang: a.lang, type: 'article', gabarit: 'article', fichier: a.fichier,
      chemin, url: urlAbsolue(chemin), racine: false, robots: 'index, follow',
      title: `${a.title} — FillSell`, description: a.description, h1: a.title, chapo: a.description,
      publie: a.date, nom: a.title,
      alternates: alternatesDe(versions),
      fil: [etapeAccueil(a.lang), etape(listeBlog[a.lang]), { nom: a.title, chemin, url: urlAbsolue(chemin) }],
      liees: [],
      ogType: 'article',
      corps,
      dateDeclaree: a.updated || a.date,
      og: entreeOg({ id: `blog/${a.slug}`, lang: a.lang, titre: a.title, surtitre: TEXTES[a.lang].blog.nom, plateformes: [] }),
    });
  }

  const versionsListe = new Map(Object.values(listeBlog).map((e) => [e.lang, e.chemin]));
  for (const e of Object.values(listeBlog)) {
    const t = TEXTES[e.lang].blog;
    const siens = articles.filter((a) => a.lang === e.lang);
    pages.push({
      id: 'blog', lang: e.lang, type: 'liste', gabarit: 'liste', fichier: e.fichier, chemin: e.chemin, url: urlAbsolue(e.chemin),
      racine: false, robots: 'index, follow', nom: t.nom, title: t.title, h1: t.h1, chapo: t.chapo, description: t.description,
      alternates: alternatesDe(versionsListe),
      fil: [etapeAccueil(e.lang), etape(e)],
      cartes: siens.map((a) => ({ chemin: `/blog/${a.slug}`, titre: a.title, texte: a.description, date: a.date, dateLisible: dateLisible(a.date, e.lang) })),
      liees: [],
      ogType: 'website',
      corps: null,
      dateDeclaree: siens.reduce((m, a) => ((a.updated || a.date) > m ? (a.updated || a.date) : m), ''),
      og: entreeOg({ id: 'blog', lang: e.lang, titre: t.h1, surtitre: t.nom, plateformes: [] }),
    });
  }

  // Mode og : les pages et leurs cartes, rien d'autre (npm run site:og).
  if (modeOg) return { pages, duree: Math.round(performance.now() - t0) };

  // Cartes de partage : la carte de la page, sinon (avertissement) celle de l'accueil de la langue.
  const manquesOg = [];
  for (const p of pages) {
    const r = await cartePour(p.og, p.fichier);
    if (typeof r === 'string') { p.ogImage = r; continue; }
    manquesOg.push(r.manque);
    p.ogImage = null;
  }
  if (manquesOg.length) {
    const message = `[site] CARTES DE PARTAGE à (re)générer :\n${manquesOg.map((m) => `   · ${m}`).join('\n')}`;
    if (ogStrictes) throw new Error(message);
    if (!jetable) avertir(message);
  }
  const ogRepli = (lang) => pages.find((x) => x.type === 'accueil' && x.lang === lang && x.ogImage)?.ogImage
    ?? pages.find((x) => x.type === 'accueil' && x.ogImage)?.ogImage
    ?? `${ORIGINE}/icon-512x512.png`;
  for (const p of pages) if (!p.ogImage) p.ogImage = ogRepli(p.lang);

  // ── 6. Rendu, empreintes, dates ──────────────────────────────────────────
  const aujourdhui = aujourdhuiParis();
  const rendre = (p) => {
    p.majLisible = dateLisible(p.maj, p.lang);
    p.publieLisible = p.publie ? dateLisible(p.publie, p.lang) : '';
    p.jsonld = grapheJsonLd({ page: p, corps: p.corps, entites });
    const principal = { accueil: gabaritAccueil, page: gabaritPage, article: gabaritArticle, liste: gabaritListe }[p.gabarit]({ site, page: p, corps: p.corps });
    return layout({ site, page: p, principal });
  };
  const nouveauVerrou = { pages: {} };
  const perimees = [];
  for (const p of pages) {
    const ancien = verrou.pages[p.chemin];
    p.maj = ancien?.maj ?? p.dateDeclaree ?? aujourdhui;
    p.html = rendre(p);
    p.empreinte = empreinteContenu(p.html);
    if (!p.empreinte) throw new Error(`[site] ${p.fichier} : région fs:contenu absente du gabarit ${p.gabarit}`);
    if (!ancien || ancien.empreinte !== p.empreinte) {
      perimees.push(`${p.chemin} (${ancien ? 'contenu changé' : 'page nouvelle'})`);
      if (dater) {
        // Page nouvelle : sa date déclarée (publication, `updated` du blog) ;
        // contenu changé : aujourd'hui. Jamais la date du build pour tout le site.
        p.maj = ancien ? aujourdhui : (p.dateDeclaree || aujourdhui);
        p.html = rendre(p);
      }
    }
    nouveauVerrou.pages[p.chemin] = { empreinte: p.empreinte, maj: p.maj };
  }
  // /legal (route de l'app indexable, au sitemap de prod) : SANS date.
  const routesSitemap = ROUTES_APP.filter((r) => r.sitemap).map((r) => ({ chemin: r.source, url: urlAbsolue(r.source) }));
  const orphelinesVerrou = Object.keys(verrou.pages).filter((c) => !nouveauVerrou.pages[c]);
  const ecarts = [...perimees, ...orphelinesVerrou.map((c) => `${c} (au verrou, mais plus générée)`)];
  if (!dater && ecarts.length) {
    const message = '[site] DATES PÉRIMÉES — le contenu a changé sans nouvelle date (ou l\'inverse) :\n' +
      ecarts.map((l) => `   · ${l}`).join('\n') +
      '\n   → npm run site:dater, puis commite site/dates.lock.json avec le contenu (le build n\'écrit jamais de date).';
    if (datesStrictes) throw new Error(message);
    avertir(`${message}\n   (${controle ? 'build de l\'app' : 'Vercel'} : build maintenu, dates du verrou gardées — à corriger au prochain lot, le build du site local le refuse)`);
  }

  // Mode contrôle : rien d'autre à écrire, le verdict est rendu.
  if (controle) {
    const duree = Math.round(performance.now() - t0);
    return { pages, verrou: nouveauVerrou, perimees: ecarts, duree };
  }

  // ── 7. Écriture (collisions déjà refusées au § 3) ────────────────────────
  for (const p of pages) {
    const cible = path.join(dossier, cheminVersFichier(p.chemin));
    await mkdir(path.dirname(cible), { recursive: true });
    await writeFile(cible, p.html);
  }

  const t404 = TEXTES[LANGUE_RACINE].introuvable;
  const page404 = {
    id: '404', lang: LANGUE_RACINE, type: '404', chemin: '/404', url: `${ORIGINE}/404`, racine: false, robots: 'noindex, follow',
    title: t404.title, description: t404.description,
    alternates: [], fil: [], ogImage: ogRepli(LANGUE_RACINE), ogType: 'website', jsonld: [],
  };
  await writeFile(path.join(dossier, '404.html'), layout({ site, page: page404, principal: gabaritIntrouvable({ site }) }));

  const indexables = pages.filter((p) => p.robots.startsWith('index'));
  await writeFile(path.join(dossier, 'sitemap.xml'), sitemap(indexables, routesSitemap));
  await writeFile(path.join(dossier, 'robots.txt'), await robots(racine));
  await writeFile(path.join(dossier, 'llms.txt'), llms(indexables, pagesSite));
  await writeFile(path.join(dossier, 'llms-full.txt'), llmsComplet(indexables));

  const duree = Math.round(performance.now() - t0);
  const nb = pages.length + 1;
  if (dater) {
    journal.log(`[site] empreintes calculées : ${pages.length} pages en ${duree} ms`);
  } else {
    journal.log(`[site] site généré : ${nb} pages en ${duree} ms (dont 404.html ; site.js ${gzipSite} o gzip, CSS en ligne : socle ${Buffer.byteLength(feuille.socle)} o + modules)`);
    if (verifier) {
      const { verifierSite } = await import('./verify-site.mjs');
      const rapport = await verifierSite(dossier, { racine, datesStrictes, env });
      for (const a of rapport.avertissements) avertir(a);
      if (rapport.erreurs.length) {
        throw new Error(`[site] site:verifier refuse la sortie (${rapport.erreurs.length}) :\n${rapport.erreurs.map((e) => `   · ${e}`).join('\n')}`);
      }
      journal.log(`[site] vérification : ${rapport.resume}`);
    }
  }
  return { pages, verrou: nouveauVerrou, perimees: ecarts, duree };
}

// ── Fichiers de la racine ──────────────────────────────────────────────────

function sitemap(pages, routes) {
  const url = (loc, lastmod, alternates = []) =>
    `  <url>\n    <loc>${esc(loc)}</loc>\n${lastmod ? `    <lastmod>${esc(lastmod)}</lastmod>\n` : ''}` +
    alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.url)}"/>\n`).join('') +
    '  </url>\n';
  // Pas de changefreq ni de priority : Google les ignore (revue B I3). Les
  // routes de l'app (/legal) sans lastmod : on ne date pas ce qu'on ne suit pas.
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    pages.map((p) => url(p.url, p.maj, p.alternates)).join('') +
    routes.map((r) => url(r.url, null)).join('') +
    '</urlset>\n';
}

// robots.txt : les règles ACTUELLES (public/robots.txt), gardées telles quelles
// — `$` compris, qui empêche « /app » de bloquer /apple-touch-icon.png. On ne
// fait que vérifier les pièges de la revue B (I7).
async function robots(racine) {
  const texte = (await readFile(path.join(racine, 'public', 'robots.txt'), 'utf8')).replace(/\r\n/g, '\n');
  const groupes = texte.split('\n').filter((l) => /^user-agent:/i.test(l.trim()));
  if (groupes.length !== 1 || !/^user-agent:\s*\*$/i.test(groupes[0].trim())) {
    throw new Error('[site] public/robots.txt : un seul groupe « User-agent: * » attendu (un groupe nommé ignore les règles de *, revue B I7)');
  }
  if (!texte.includes(`Sitemap: ${ORIGINE}/sitemap.xml`)) throw new Error('[site] public/robots.txt : ligne « Sitemap: » absolue absente');
  for (const l of texte.split('\n').filter((x) => /^disallow:/i.test(x.trim()))) {
    const motif = l.split(':').slice(1).join(':').trim();
    const route = ROUTES_APP.find((r) => r.noindex && motif && r.source.startsWith(motif.replace(/\$$/, '')));
    if (route) throw new Error(`[site] public/robots.txt : « ${l.trim()} » cache le noindex de ${route.source} (une URL bloquée peut être indexée nue)`);
  }
  return texte;
}

// llms.txt : la langue racine d'abord (pages, puis blog), puis une section par
// autre langue déclarée, sous son propre nom (« English »).
function llms(pages, pagesSite) {
  const accueil = pagesSite.find((p) => p.type === 'accueil' && p.lang === LANGUE_RACINE);
  const ligne = (p) => `- [${p.h1 ?? p.title}](${p.url}): ${p.description}`;
  const groupe = (filtre) => pages.filter(filtre).map(ligne).join('\n');
  const autres = LANGUES.filter((l) => l.code !== LANGUE_RACINE && pages.some((p) => p.lang === l.code))
    .map((l) => `## ${l.nom}\n\n${groupe((p) => p.lang === l.code)}\n\n`).join('');
  return `# FillSell\n\n> ${accueil.description}\n\n${accueil.chapo}\n\n` +
    `## Pages\n\n${groupe((p) => p.lang === LANGUE_RACINE && p.type !== 'article' && p.type !== 'liste')}\n\n` +
    `## Blog\n\n${groupe((p) => p.lang === LANGUE_RACINE && (p.type === 'article' || p.type === 'liste'))}\n\n` +
    autres +
    `## Optional\n\n- [Mentions légales et confidentialité](${ORIGINE}/legal): éditeur, données personnelles, cookies.\n`;
}

// llms-full.txt : le Markdown RÉSOLU de chaque page (liens et images en URL
// absolues), re-sérialisé depuis l'arbre du rendu — liens titrés et par
// référence compris (revue de la fondation M-5). Les points clés en tête.
function llmsComplet(pages) {
  const sourceDe = (p) => {
    if (p.type === 'liste') return p.cartes.map((c) => `- [${c.titre}](${ORIGINE}${c.chemin}): ${c.texte}`).join('\n');
    const points = p.points_cles?.length ? `${p.points_cles.map((x) => `- ${x}`).join('\n')}\n\n` : '';
    const etapes = p.etapes?.length ? `${p.etapes.map((e, i) => `${i + 1}. **${e.titre}** — ${e.texte}`).join('\n')}\n\n` : '';
    return points + etapes + (p.corps?.markdown ?? '');
  };
  return '# FillSell — contenu complet du site\n\n' + pages.map((p) =>
    `# ${p.h1 ?? p.title}\n\nURL : ${p.url}\nMis à jour : ${p.maj}\n\n${p.chapo ?? p.description}\n\n${sourceDe(p).trim()}\n`,
  ).join('\n---\n\n');
}
