// Source de vérité UNIQUE de la protection du code de l'extension Chrome.
// Utilisé par (1) le plugin vite qui émet le zip public fillsell.app, et par
// (2) le script `npm run build:extension` qui produit le dossier minifié à
// charger « unpacked » pour le test manuel + à zipper pour le Chrome Web Store.
// Les deux passent par ICI → un seul comportement, testé une fois.
//
// ── Choix : MINIFICATION conservatrice, PAS d'obfuscation ────────────────────
// Le Chrome Web Store INTERDIT l'obfuscation (« Developers must not obfuscate
// code or conceal functionality ») mais AUTORISE la minification (retrait des
// commentaires/espaces, raccourcissement des noms de variables). Obfusquer
// exposerait la soumission au rejet. On s'en tient donc à terser, profil prudent.
//
// ── Profil prudent (validé 2026-07-17, soumission CWS le soir même) ──────────
// Objectif n°1 : ZÉRO casse silencieuse d'un sélecteur DOM ou d'une manip
// React/fiber. D'où :
//   · mangle.toplevel = false → seules les variables LOCALES des fonctions sont
//     renommées. Aucun nom top-level/global touché : FILLSELL_CONFIG (défini
//     dans config.js, lu par background.js via importScripts et par popup.js via
//     <script src>) reste intact, de même que tous les noms de fonctions
//     top-level. C'est la garantie anti-casse du lien inter-fichiers.
//   · mangle.properties = false → aucune propriété d'objet renommée : props.onClick,
//     props.onChange (fiber-click), et tous les accès de propriété survivent.
//   · Les CHAÎNES ne sont jamais modifiées par terser → tous les sélecteurs DOM
//     restent littéraux et fonctionnels.
//   · console.* CONSERVÉS (drop_console:false) — nécessaires au test manuel.
//   · drop_debugger:true, compress défauts sûrs (aucune option `unsafe`).
//   · ecma 2020 : préserve async/await, ?. et ?? sans les transpiler.
//
// Passer un jour au cran plus fort (toplevel:true + reserved:['FILLSELL_CONFIG'])
// se fera ICI, dans un commit dédié, une fois le pipeline éprouvé en prod.

import { minify } from 'terser';

export const TERSER_OPTIONS = {
  compress: {
    drop_console: false,   // logs gardés (test manuel des 4 plateformes)
    drop_debugger: true,
    ecma: 2020,
  },
  mangle: {
    toplevel: false,       // renomme UNIQUEMENT les locales — top-level/globals intacts
    properties: false,     // aucune propriété renommée (props.onClick, fiber…)
  },
  format: {
    comments: false,       // retire tous les commentaires
    ecma: 2020,
  },
};

// Fichiers exclus du paquet livré (documentation interne, jamais du runtime).
// README.md décrit en clair DRY_RUN, le flow de suppression et l'anti-bot :
// zéro raison de l'embarquer, gain de confidentialité, risque nul.
export function isExcludedFromPackage(relPath) {
  return /\.md$/i.test(relPath);
}

// Minifie un fichier .js ; laisse tout le reste (HTML/CSS/SVG/PNG/JSON) tel quel.
// `relPath` sert uniquement aux messages d'erreur. Lève si terser échoue
// (syntaxe inattendue) → le build échoue BRUYAMMENT, jamais un .js à moitié
// transformé livré en silence.
export async function transformExtensionFile(relPath, buffer) {
  if (!/\.js$/i.test(relPath)) return buffer; // passthrough binaire/texte
  const source = buffer.toString('utf8');
  const result = await minify({ [relPath]: source }, TERSER_OPTIONS);
  if (result.error) throw result.error;
  if (typeof result.code !== 'string') {
    throw new Error(`terser n'a renvoyé aucun code pour ${relPath}`);
  }
  return Buffer.from(result.code, 'utf8');
}
