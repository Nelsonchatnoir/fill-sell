import { esc } from '../../scripts/site/lib/html.mjs';
import { langue, LANGUES } from '../langues.mjs';
import { TEXTES, LIENS } from './textes.mjs';

// COMPOSANTS du site vitrine (09/10/2026) — fonctions PURES qui rendent du
// HTML à partir des données que le générateur prépare (scripts/site/build-site.mjs).
// Aucun style= (toute la mise en forme vit dans site/styles/site.css), aucun
// logo de plateforme (les plateformes s'écrivent en TEXTE, dans des étiquettes
// neutres — décision de Nico du 09/10), aucun chiffre de quota.
//
// HABILLAGE : ce qui n'est pas le contenu de la page (badges des stores,
// libellés des blocs répétés d'une page à l'autre, tarifs et comparaison
// RÉSUMÉS sur l'accueil…) est entouré par `habillage()` : hors empreinte des
// dates, hors compte de mots et de recouvrement (scripts/site/lib/html.mjs).

/**
 * hreflang ET lang d'un lien de GABARIT vers une page d'une autre langue (menu,
 * pied, cartes des trajets) : son libellé est le nom de cette page, dans SA
 * langue — lang le dit aux lecteurs d'écran (WCAG 3.1.2, revue technique
 * C-11). Jamais sur un lien dont le texte est écrit dans la langue de la page
 * (cartes de fonctions de l'accueil, liens du Markdown) : hreflang seul.
 */
export const attrsAutreLangue = (hreflang) => {
  if (!hreflang) return '';
  const code = LANGUES.find((l) => l.hreflang === hreflang)?.code;
  return ` hreflang="${esc(hreflang)}"${code ? ` lang="${esc(code)}"` : ''}`;
};

export const habillage = (html) => (html ? `<!--fs:habillage:debut-->${html}<!--fs:habillage:fin-->` : '');

/** Formate un prix mensuel (« 12,99 € », « €12.99 », « 0 € »). */
export function prix(valeur, lang, devise = 'EUR') {
  const entier = Number.isInteger(valeur);
  return new Intl.NumberFormat(langue(lang).locale, {
    style: 'currency', currency: devise, currencyDisplay: 'narrowSymbol', minimumFractionDigits: entier ? 0 : 2, maximumFractionDigits: 2,
  }).format(valeur);
}

/** Liste lisible (« Vinted, Leboncoin et Beebs »). */
export const listeLisible = (noms, lang) => new Intl.ListFormat(langue(lang).locale, { style: 'long', type: 'conjunction' }).format(noms);

/**
 * <picture> d'un média du manifeste (AVIF/WebP, dimensions, lazy ou principale).
 * `image` : { largeur, hauteur, variantes, repli, alt }, `url(fichier)` : URL publiée.
 */
export function picture(image, { url, alt, sizes = '100vw', principale = false, classe = '' }) {
  // AVIF en <source> (toutes les largeurs) ; le WebP le plus grand reste le
  // repli de l'<img> (navigateurs sans AVIF : Safari < 16,4). Une seule liste de
  // largeurs par image : l'accueil, riche en captures, tient son budget HTML.
  const format = image.variantes?.avif?.length ? 'avif' : (image.variantes?.webp?.length ? 'webp' : null);
  const sources = format
    ? `<source type="image/${format}" srcset="${image.variantes[format].map((v) => `${esc(url(v.fichier))} ${v.largeur}w`).join(', ')}" sizes="${esc(sizes)}">`
    : '';
  const attrs = principale ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<picture${classe ? ` class="${classe}"` : ''}>${sources}<img src="${esc(image.repli)}" alt="${esc(alt)}" width="${image.largeur}" height="${image.hauteur}" decoding="async" ${attrs}></picture>`;
}

/** Forme d'une capture : téléphone (haute), fenêtre (large), carte. */
export function forme(image) {
  if (image.hauteur / image.largeur > 1.6) return 'telephone';
  if (image.largeur / image.hauteur > 1.3) return 'fenetre';
  return 'carte';
}

/**
 * `sizes` des captures, ALIGNÉS sur la largeur que site.css donne à l'image
 * (cadre moins ses 2 × 9 px de bord) : un `sizes` trop large fait partir la
 * variante de 720 px là où 480 suffit (revue technique M-7, 32 à 46 Kio de
 * trop sur mobile). Changer la largeur d'un cadre dans site.css = changer ici.
 *   · tete    : .tete .telephone, .prose .telephone → min(64vw, 270px)
 *   · etape   : .etapes-medias → min(78vw, 300px) ; ordinateur : min(100 %, 290px)
 *   · defaut  : .telephone → min(70vw, 290px)
 */
export const TAILLES_TELEPHONE = {
  tete: '(min-width: 422px) 252px, calc(64vw - 18px)',
  etape: '(min-width: 1000px) 272px, (min-width: 385px) 282px, calc(78vw - 18px)',
  defaut: '(min-width: 415px) 272px, calc(70vw - 18px)',
};

/**
 * Une capture dans son CADRE dessiné en CSS : téléphone pour un écran de
 * l'app, fenêtre de navigateur pour un écran d'ordinateur, carte sinon.
 */
export function capture(image, { url, alt, principale = false, legende = '', sizes: tailles = null, cadre: place = 'defaut' }) {
  const f = forme(image);
  const sizes = tailles ?? (f === 'telephone' ? TAILLES_TELEPHONE[place] ?? TAILLES_TELEPHONE.defaut : '(min-width: 1000px) 640px, 92vw');
  const cadre = f === 'telephone' ? 'telephone' : f === 'fenetre' ? 'fenetre' : 'carte-media';
  return `<figure class="media media-${f}"><div class="${cadre}">${picture(image, { url, alt, sizes, principale })}</div>${legende ? `<figcaption>${esc(legende)}</figcaption>` : ''}</figure>`;
}

/** Étiquettes de plateformes, en TEXTE (aucun logo). */
export function etiquettes(noms, { classe = '' } = {}) {
  if (!noms?.length) return '';
  return `<ul class="etiquettes${classe ? ` ${classe}` : ''}">${noms.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

/** Badges officiels des stores (auto-hébergés, Apple NOIR à côté de Google Play — règle d'Apple). */
export function badges(site, lang) {
  const t = TEXTES[lang];
  const b = site.badges(lang);
  return habillage(`<div class="badges">` +
    `<a class="badge badge-apple" href="${LIENS.appStore}" target="_blank" rel="noopener" data-cta="store_apple"><img src="${esc(b.apple.url)}" alt="${esc(t.appStore)}" width="${b.apple.largeur}" height="${b.apple.hauteur}" loading="lazy"></a>` +
    `<a class="badge badge-google" href="${LIENS.googlePlay}" target="_blank" rel="noopener" data-cta="store_google"><img src="${esc(b.google.url)}" alt="${esc(t.googlePlay)}" width="${b.google.largeur}" height="${b.google.hauteur}" loading="lazy"></a>` +
    `</div>`);
}

const ICONE_PIECE = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v3h-1a2 2 0 1 0 0 4h1v3a2 2 0 0 1-2 2h-3v-1a2 2 0 1 0-4 0v1H8a2 2 0 0 1-2-2v-3H5a2 2 0 1 1 0-4h1V8a2 2 0 0 1 2-2h2V5a2 2 0 0 1 2-2z"/></svg>';

/** Bouton d'inscription (lien réel, data-cta pour la mesure). */
export const boutonInscription = (t, lieu, classe = 'bouton-premier') =>
  `<a class="bouton ${classe}" href="/login?mode=signup" data-cta="signup_${esc(lieu)}">${esc(t.creerCompte)}</a>`;

/** Lien vers l'extension (Chrome Web Store). */
export const boutonExtension = (t, classe = 'bouton-contour') =>
  `<a class="bouton ${classe}" href="${LIENS.chromeStore}" target="_blank" rel="noopener" data-cta="extension_webstore">${ICONE_PIECE}${esc(t.installerExtension)}</a>`;

/**
 * Les appels d'un héros selon `cta` (inscription | extension | stores) :
 * l'appel principal d'abord, les deux autres ensuite.
 */
export function appelsHeros(site, page, lieu) {
  const t = TEXTES[page.lang];
  const cta = page.cta ?? 'inscription';
  const inscription = `<div class="appels">${boutonInscription(t, lieu)}${boutonExtension(t)}</div>`;
  const note = habillage(`<p class="note-gratuit">${esc(t.gratuitSansCarte)}</p>`);
  if (cta === 'extension') {
    return `<div class="appels">${boutonExtension(t, 'bouton-premier')}${boutonInscription(t, lieu, 'bouton-contour')}</div>${habillage(`<p class="note-gratuit">${esc(t.extensionPour)}</p>`)}${badges(site, page.lang)}`;
  }
  if (cta === 'stores') {
    return `${badges(site, page.lang)}<div class="appels">${boutonInscription(t, lieu, 'bouton-contour')}${boutonExtension(t, 'bouton-lien')}</div>${note}`;
  }
  // Badges des stores dans le héros de l'accueil ; sur les autres pages, dans l'appel final.
  return `${inscription}${note}${page.type === 'accueil' ? badges(site, page.lang) : ''}`;
}

/** « L'essentiel en 10 secondes » (points_cles). */
export function pointsCles(page) {
  if (!page.points_cles?.length) return '';
  const t = TEXTES[page.lang];
  return `<section class="carte essentiel" aria-labelledby="essentiel-titre"><h2 id="essentiel-titre">${habillage(esc(t.essentiel))}</h2><ul>${page.points_cles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`;
}

/** Bloc d'étapes numérotées (une vraie suite : les numéros portent l'ordre). JSON-LD HowTo depuis les mêmes données. */
export function etapes(site, page, { titre, sombre = false } = {}) {
  if (!page.etapes?.length) return '';
  const t = TEXTES[page.lang];
  const items = page.etapes.map((e, i) => `<li class="etape" id="etape-${i + 1}"><p class="etape-numero">${habillage(`<span class="etape-mot">${esc(t.etape)} </span>`)}${i + 1}</p><h3>${esc(e.titre)}</h3><p>${esc(e.texte)}</p>` +
    `${e.image ? capture(e.image, { url: site.url, alt: e.alt, cadre: 'etape' }) : ''}</li>`).join('');
  const aDesCaptures = page.etapes.some((e) => e.image && forme(e.image) === 'telephone');
  return `<section class="bloc-etapes${sombre ? ' sombre' : ''}" aria-labelledby="etapes-titre"><div class="cadre">` +
    `<h2 id="etapes-titre">${esc(titre ?? t.etapesTitre)}</h2>` +
    `<ol class="etapes ${page.etapes.some((e) => e.image) ? 'etapes-medias" tabindex="0" data-defile="' : 'etapes-liste'}" aria-labelledby="etapes-titre">${items}</ol>` +
    `${aDesCaptures ? habillage(`<p class="note-demo">${esc(t.captureDemo)}</p>`) : ''}</div></section>`;
}

/** Ligne des dates — hors empreinte du contenu (marqueurs fs:dates). */
export function lignesDates(page, t, { auteur = true, publie = false } = {}) {
  const morceaux = [];
  if (auteur) morceaux.push(`<span>${esc(t.auteur)}</span>`);
  if (publie && page.publie) morceaux.push(`<span>${esc(t.publie)} <time datetime="${page.publie}">${esc(page.publieLisible)}</time></span>`);
  morceaux.push(`<span>${esc(t.misAJour)} <time datetime="${page.maj}" data-maj>${esc(page.majLisible)}</time></span>`);
  return `<!--fs:dates:debut--><p class="meta-dates">${morceaux.join('')}</p><!--fs:dates:fin-->`;
}

/** Fil d'Ariane visible (le JSON-LD BreadcrumbList reprend les mêmes étapes). */
export function filAriane(page, t) {
  const etapesFil = page.fil.map((e, i) => (i === page.fil.length - 1
    ? `<li aria-current="page">${esc(e.nom)}</li>`
    : `<li><a href="${esc(e.chemin)}">${esc(e.nom)}</a></li>`)).join('');
  return `<nav class="fil" aria-label="${esc(t.filAriane)}"><ol>${etapesFil}</ol></nav>`;
}

/** Sommaire cliquable des h2 (au moins 3), collant sur ordinateur. */
export function sommaire(titres, t) {
  const h2 = titres.filter((x) => x.niveau === 2);
  if (h2.length < 3) return '';
  return habillage(`<nav class="carte sommaire" aria-label="${esc(t.sommaire)}"><p>${esc(t.sommaire)}</p><ol>${h2.map((x) => `<li><a href="#${esc(x.id)}">${esc(x.texte)}</a></li>`).join('')}</ol></nav>`);
}

/** Cartes des pages liées. */
export function pagesLiees(liees, t) {
  if (!liees?.length) return '';
  return habillage(`<section class="liees" aria-labelledby="liees-titre"><h2 id="liees-titre">${esc(t.pagesLiees)}</h2><ul class="cartes-liees">${liees.map((l) =>
    `<li><a class="carte" href="${esc(l.chemin)}"${attrsAutreLangue(l.hreflang)}><strong>${esc(l.titre)}</strong><span>${esc(l.texte)}</span></a></li>`).join('')}</ul></section>`);
}

/** Appel final (bloc sombre, halos teal et pêche). */
export function appelFinal(site, page, lieu) {
  const t = TEXTES[page.lang];
  return habillage(`<section class="appel" aria-labelledby="appel-titre"><div class="cadre"><div class="appel-bloc">` +
    `<h2 id="appel-titre">${esc(t.appelTitre)}</h2><p>${esc(t.appelTexte)}</p>` +
    `<div class="appels">${boutonInscription(t, `final_${lieu}`, 'bouton-clair')}${boutonExtension(t, 'bouton-contour-clair')}</div>` +
    `${badges(site, page.lang)}<p class="note-gratuit">${esc(t.gratuitSansCarte)}</p></div></div></section>`);
}

/** Bandeau « brouillon de démonstration » (contenu provisoire du chantier). */
export function bandeauDemonstration(page, t) {
  return page.demonstration ? habillage(`<p class="demonstration">${esc(t.demonstration)}</p>`) : '';
}

/** Verdict (oui / non / partiel…) : pastille lisible, icône dessinée en CSS. */
export function verdict(v, lang) {
  const t = TEXTES[lang].verdicts;
  const cle = v && t[v] ? v : 'inconnu';
  return `<span class="verdict v-${cle}">${esc(t[cle])}</span>`;
}
