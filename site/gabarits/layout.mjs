import { esc, jsonEnLigne, typographie } from '../../scripts/site/lib/html.mjs';
import { blocEnPage } from '../../scripts/site/lib/balises.mjs';
import { LANGUES, langue, accueilDe } from '../langues.mjs';
import { TEXTES, LIENS } from './textes.mjs';
import { attrsAutreLangue } from './composants.mjs';

// Gabarit commun du site vitrine (09/10/2026). Rend une page HTML COMPLÈTE,
// sans hydratation. Design : docs/seo/design/DESIGN.md.
//
// Ce que la tête porte, et pourquoi :
//   · le script d'aiguillage EN LIGNE, juste après le charset : il doit partir
//     avant tout (confirmation, /app) et survivre à un 404 de site.js ;
//   · les balises de mesure entre leurs marqueurs : le bloc « consentement »
//     (GTM et Google Ads chargés SEULEMENT après l'accord, identifiants lus
//     dans index.html — 09/10, CNIL) et « insights » recopié d'index.html ;
//     parité avec app-shell.html vérifiée par site:verifier ;
//   · les icônes et le manifeste, recopiés d'index.html (même source) ;
//   · viewport SANS user-scalable=no (accessibilité, revue B M8) ;
//   · canonical absolu sans slash final, hreflang réciproques + x-default
//     anglais quand la paire existe, OG/Twitter (carte générée par
//     npm run site:og), marqueur fillsell-page (le contrôle sur la
//     prévisualisation distingue ainsi une page vitrine d'une coquille servie
//     en 200, revue A I7) ;
//   · toute la CSS en ligne, une seule police préchargée, site.js en defer —
//     son attribut onerror retire la classe « js » posée par le script en
//     ligne : un 404 de site.js au CDN rend la navigation VISIBLE, jamais un
//     bouton de menu mort (revue de la fondation I-8).
//
// En-tête : logo, navigation (Comment ça marche, Plateformes [sous-menu en
// <details> : marche sans JS], Comparatif, Tarifs, Blog, FAQ), langue,
// « Se connecter », CTA. Mobile : logo + CTA + bouton de menu ; le panneau
// porte la navigation, la langue et la connexion.
// ORDRE DU DOM = ordre visuel, sur mobile COMME sur ordinateur (revue
// technique C-1, WCAG 2.4.3) : logo, CTA « téléphone », bouton de menu, PUIS
// le panneau <nav> — ouvert, le Tab suivant le bouton entre dans le menu, au
// lieu de filer sous le panneau. Sur ordinateur (bouton et CTA « téléphone »
// masqués), le CTA vit en fin de <nav> (`entete-cta-large`) : logo, liens,
// langue, connexion, CTA — l'ordre de lecture. Un seul des deux CTA est
// affiché à la fois (display: none retire l'autre du clavier et des lecteurs).
// Pied : tous les hubs, plateformes, fonctions, comparatifs, ressources,
// mentions, périmètre DATÉ et non-affiliation tirés des données.

/** Sélecteur de langue : un lien par AUTRE langue déclarée, vers la version de
 *  la page si elle existe, sinon vers l'accueil de cette langue. */
function selecteurLangues(page, t) {
  const liens = LANGUES.filter((l) => l.code !== page.lang).map((l) => {
    const chemin = page.alternates.find((a) => a.lang === l.hreflang)?.chemin ?? accueilDe(l.code);
    return `<a class="langue" href="${esc(chemin)}" hreflang="${esc(l.hreflang)}" lang="${esc(l.code)}" data-langue="${esc(l.code)}" aria-label="${esc(`${l.code.toUpperCase()} — ${l.nom}`)}">${esc(l.code.toUpperCase())}</a>`;
  });
  return liens.length ? `<span class="langues" role="group" aria-label="${esc(t.autresLangues)}">${liens.join('')}</span>` : '';
}

const lienNav = (l, classe = '') => `<a${classe ? ` class="${classe}"` : ''} href="${esc(l.chemin)}"${l.courant ? ' aria-current="page"' : ''}${attrsAutreLangue(l.hreflang)}>${esc(l.libelle)}</a>`;

function entete({ site, page, t }) {
  const items = site.navigation(page).map((n) => (n.sous
    ? `<li class="nav-sous"><details class="sous-menu"><summary>${esc(n.libelle)}</summary><ul>${n.sous.map((s) => `<li>${lienNav(s)}</li>`).join('')}</ul></details></li>`
    : `<li>${lienNav(n)}</li>`)).join('');
  const marque = `<a class="logo" href="${esc(site.chemin('accueil', page.lang))}"><img src="${esc(site.logo)}" alt="" width="32" height="32"><span class="wordmark">FillSell</span></a>`;
  const cta = (classe) => `<a class="bouton bouton-premier bouton-petit ${classe}" href="/login?mode=signup" data-cta="signup_entete">${esc(t.creerCompte)}</a>`;
  return `<header class="entete">
<div class="cadre entete-ligne">
${marque}
${cta('entete-cta')}
<button type="button" class="menu-bouton" data-menu aria-expanded="false" aria-controls="navigation" aria-label="${esc(t.menu)}"><span></span></button>
<nav class="navigation" id="navigation" aria-label="${esc(t.navigation)}"><ul>${items}</ul>
<div class="entete-actions">
${selecteurLangues(page, t)}
<a class="bouton bouton-premier bouton-petit" href="/app" data-si-jeton hidden>${esc(t.ouvrirApp)}</a>
<a class="lien-connexion" href="/login" data-cta="login">${esc(t.seConnecter)}</a>
${cta('entete-cta-large')}
</div>
</nav>
</div>
</header>`;
}

function pied({ site, page, t }) {
  const p = t.pied;
  const legal = langue(page.lang).legal;
  const colonnes = site.pied(page).filter((c) => c.liens.length).map((c) =>
    `<div><h2>${esc(c.titre)}</h2><ul>${c.liens.map((l) => `<li><a href="${esc(l.chemin)}"${attrsAutreLangue(l.hreflang)}>${esc(l.libelle)}</a></li>`).join('')}</ul></div>`).join('');
  return `<footer class="pied">
<div class="cadre">
<div class="pied-haut">
<a class="logo logo-clair" href="${esc(site.chemin('accueil', page.lang))}"><img src="${esc(site.logo)}" alt="" width="32" height="32" loading="lazy"><span class="wordmark">FillSell</span></a>
<p>${esc(p.resume)}</p>
</div>
<div class="pied-colonnes">${colonnes}
<div><h2>${esc(p.aide)}</h2><ul><li><a href="${legal}#mentions">${esc(p.mentions)}</a></li><li><a href="${legal}#confidentialite">${esc(p.confidentialite)}</a></li><li><a href="${LIENS.contact}">${esc(p.contact)}</a></li><li><a href="/extension">${esc(p.extension)}</a></li><li><a href="${LIENS.appStore}" target="_blank" rel="noopener">${esc(p.appStore)}</a></li><li><a href="${LIENS.googlePlay}" target="_blank" rel="noopener">${esc(p.googlePlay)}</a></li><li><a href="${LIENS.chromeStore}" data-cta="extension_webstore" target="_blank" rel="noopener">${esc(p.chromeStore)}</a></li></ul></div>
</div>
<div class="pied-bas">
<p>${esc(site.perimetre(page.lang))}</p>
<p>${esc(site.nonAffiliation(page.lang))}</p>
<p>© ${new Date().getUTCFullYear()} ${esc(p.droits)} · support@fillsell.app</p>
</div>
</div>
</footer>`;
}

/**
 * page : { id, type, lang, chemin, url, title, description, robots, racine,
 *          alternates [{ lang, url, chemin }], ogImage, ogType, jsonld (objets
 *          du @graph) }
 * principal : le HTML du <main> (rendu par accueil.mjs, page.mjs, article.mjs…)
 */
export function layout({ site, page, principal }) {
  const t = TEXTES[page.lang];
  const hreflang = page.alternates.map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(a.url)}">`).join('\n');
  const canonique = page.robots.startsWith('noindex') ? '' : `<link rel="canonical" href="${esc(page.url)}">\n`;
  const graphe = page.jsonld?.length
    ? `<script type="application/ld+json">${jsonEnLigne({ '@context': 'https://schema.org', '@graph': page.jsonld })}</script>\n`
    : '';
  const ogLocale = langue(page.lang).ogLocale;
  // Le corps d'abord : la feuille en ligne ne porte que les modules dont il emploie les classes.
  // Typographie française : insécables avant « : ; ? ! » (jamais « : » en début de ligne).
  const corps = typographie(`<a class="evitement" href="#contenu">${esc(t.evitement)}</a>
${entete({ site, page, t })}
<main id="contenu">
${principal}
</main>
${pied({ site, page, t })}`, page.lang);
  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script${page.racine ? ' data-racine="1"' : ''}>${site.aiguillage}</script>
${blocEnPage(site.balises, 'consentement')}
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="${esc(page.robots)}">
${canonique}${hreflang ? hreflang + '\n' : ''}<meta name="fillsell-page" content="${esc(page.id)}">
<meta name="fillsell-type" content="${esc(page.type)}">
<meta property="og:type" content="${esc(page.ogType)}">
<meta property="og:site_name" content="FillSell">
<meta property="og:url" content="${esc(page.url)}">
<meta property="og:locale" content="${ogLocale}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${esc(page.ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${esc(page.ogImage)}">
<meta name="theme-color" content="#2F9E90">
${site.liensIcones}
<link rel="preload" href="${esc(site.police)}" as="font" type="font/woff2" crossorigin>
<style>${site.cssPour(corps)}</style>
${blocEnPage(site.balises, 'insights')}
<script defer src="${esc(site.siteJs)}" onerror="document.documentElement.classList.remove('js')"></script>
${graphe}</head>
<body class="type-${esc(page.type)}">
${corps}
</body>
</html>
`;
}
