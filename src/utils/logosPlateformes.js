// ═══════════════════════════════════════════════════════════════════════════
// LES LOGOS DES PLATEFORMES DANS UN TEXTE (09/11/2026, maquette « les carrés au tap » validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Chaque nom de plateforme écrit dans une phrase (Vinted, Leboncoin, eBay, Beebs, Depop) porte l'icône de son app
// devant lui. Les icônes sont celles des mails (public/email/, validées par Nico) : servies à /email/… par Vercel ET
// par l'app iPhone / Android (Capacitor sert dist/, où Vite copie public/). Beebs : le logo du 29/10
// (logo-beebs-2910.png, docs/regles/plateformes.md) — jamais l'ancien logo-beebs.png, gardé pour les vieux mails.
// Aucun import : chargé tel quel par l'app (Vite) et par les selftests (Node).

export const LOGOS_PLATEFORMES = Object.freeze({
  Vinted: '/email/logo-vinted.png',
  Leboncoin: '/email/logo-leboncoin.png',
  eBay: '/email/logo-ebay.png',
  Beebs: '/email/logo-beebs-2910.png',
  Depop: '/email/logo-depop.png',
});

const MOTIF = /\b(Vinted|Leboncoin|eBay|Beebs|Depop)\b/;

/**
 * Un texte découpé en morceaux : { texte } pour le texte courant, { nom, logo } pour un nom de plateforme.
 * « Ton pull sur Vinted et eBay » → [{texte:'Ton pull sur '}, {nom:'Vinted',logo}, {texte:' et '}, {nom:'eBay',logo}].
 */
export function morceauxAvecLogos(texte) {
  return String(texte ?? '')
    .split(MOTIF)
    .filter((s) => s !== '')
    .map((s) => (LOGOS_PLATEFORMES[s] ? { nom: s, logo: LOGOS_PLATEFORMES[s] } : { texte: s }));
}
