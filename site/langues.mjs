// LANGUES DU SITE VITRINE — une LISTE déclarée (09/10/2026, architecture § 2.7).
//
// Consigne de Nico (09/10) : « un jour on ouvrira à l'Europe et au monde ».
// Avant ce fichier, une vingtaine de `lang === 'en' ? … : …` vivaient dans le
// générateur, les gabarits, site.js et le vérificateur : ajouter /de aurait
// demandé de toucher chacun d'eux (revue de la fondation, I-4). Désormais,
// ajouter une langue = une entrée ici, ses libellés dans
// site/gabarits/textes.mjs et src/utils/consentementTextes.js, et un dossier
// site/contenu/<code>/ — le build REFUSE une langue déclarée sans ses libellés.
//
// Module PUR, sans aucun import : site.js l'embarque aussi (langue de la page,
// format des nombres, suggestion de langue) et chaque octet compte dans son
// budget de 6 Ko gzip. Les libellés longs restent dans textes.mjs (gabarits,
// côté build seulement).
//
// Champs :
//   code        code de la langue = dossier site/contenu/<code>/ = <html lang>
//   prefixe     préfixe d'URL ('' = à la racine) ; l'accueil est `prefixe || '/'`
//   hreflang    code hreflang ET inLanguage du JSON-LD — une LANGUE tant qu'aucun
//               contenu n'est propre à un pays (fr-BE, en-GB : le jour où il diffère)
//   ogLocale    og:locale
//   locale      format des dates et des nombres (Intl)
//   nom         nom de la langue, écrit dans la langue elle-même (sélecteur, llms.txt)
//   (l'image de partage de chaque page est la carte générée par npm run site:og,
//   site/medias/og/<code>/<id>.png : plus aucune image de public/ — 09/10)
//   legal       lien vers les mentions légales (la page /legal de l'app ne
//               connaît que fr et en : une langue nouvelle choisit l'une des deux)
//   langueApp   valeur de `fs_lang` écrite pour l'app (qui ne connaît que fr et
//               en) sur un choix explicite ou un CTA ; null = rien n'est écrit
//               (la langue par défaut de l'app), comme avant le site statique
//   suggestion  bandeau « cette page existe dans ta langue », écrit DANS cette langue
//   fermer      libellé du bouton qui ferme ce bandeau, dans cette langue

export const LANGUES = [
  {
    code: 'fr', prefixe: '', hreflang: 'fr', ogLocale: 'fr_FR', locale: 'fr-FR', nom: 'Français',
    legal: '/legal', langueApp: null,
    suggestion: 'Cette page existe en français', fermer: 'Fermer',
  },
  {
    code: 'en', prefixe: '/en', hreflang: 'en', ogLocale: 'en_US', locale: 'en-US', nom: 'English',
    legal: '/legal?lang=en', langueApp: 'en',
    suggestion: 'This page is available in English', fermer: 'Close',
  },
];

// La langue À LA RACINE (sans préfixe) : celle de « / », des libellés de repli
// et de la page 404. La seule langue où l'on suggère une autre version (comme
// avant le site statique : jamais de suggestion sur /en/…).
export const LANGUE_RACINE = 'fr';

// x-default : la PREMIÈRE de ces langues dont la page existe (architecture § 2.7 :
// la version anglaise quand elle existe — la porte d'entrée internationale —,
// sinon la version française). Une seule règle pour tout le site, blog compris.
export const PRIORITE_X_DEFAULT = ['en', 'fr'];

export const CODES_LANGUES = LANGUES.map((l) => l.code);

/** L'entrée d'une langue déclarée ; lève pour un code inconnu. */
export function langue(code) {
  const l = LANGUES.find((x) => x.code === code);
  if (!l) throw new Error(`[site] langue « ${code} » non déclarée dans site/langues.mjs (langues : ${CODES_LANGUES.join(', ')})`);
  return l;
}

/** Chemin de l'accueil d'une langue : « / », « /en »… */
export const accueilDe = (code) => langue(code).prefixe || '/';

/** Chemin d'une page de cette langue : `cheminDans('en', 'faq')` → « /en/faq ». */
export const cheminDans = (code, relatif) => `${langue(code).prefixe}/${relatif}`;

/**
 * La langue x-default parmi les versions existantes d'une page (codes), ou
 * null s'il n'y a qu'une version (pas de hreflang du tout).
 */
export function langueXDefault(codes) {
  if (codes.length < 2) return null;
  return PRIORITE_X_DEFAULT.find((c) => codes.includes(c)) ?? codes[0];
}
