// SOURCE DE VÉRITÉ UNIQUE des hôtes que l'extension a le droit d'emporter en
// production — lue par les DEUX gardes qui en dépendent, et par elles seules :
//
//   • scripts/package-extension.mjs   → refuse d'empaqueter un hôte absent d'ici ;
//   • scripts/check-legal-permissions.mjs → n'exige sur fillsell.app/legal QUE
//     les hôtes présents ici.
//
// Les deux lisent CETTE liste, jamais une copie : un hôte est soit livrable
// (empaqueté ET justifié sur /legal), soit de chantier (refusé à l'empaquetage
// ET absent de /legal). Aucun troisième état n'est représentable, donc les deux
// gardes ne peuvent pas diverger.
//
// Pourquoi une allowlist FERMÉE : un hôte de plus dans le manifest, c'est un
// AVERTISSEMENT DE PERMISSION chez TOUS les utilisateurs à la mise à jour, et
// une nouvelle revue au Chrome Web Store. Pour un chantier à drapeau éteint,
// c'est non.
//
// Le 14/09, `https://www.opla.co/*` a été ajouté au manifest SOURCE pour le
// seul build unpacked (lot 2 : chrome.windows.update exige la permission
// d'hôte). Nico charge l'extension depuis le dossier source — donc ce même
// fichier sert de base à tous les paquets suivants, et l'oubli était
// structurellement garanti. D'où la garde d'empaquetage. Et comme cet hôte ne
// part pas en production, il n'a rien à faire non plus sur la page légale
// publique : Opla nous connaît nommément, un chantier à drapeau éteint ne
// s'annonce pas sur fillsell.app/legal.
//
// ⚠️ Pour livrer un jour un nouvel hôte pour de vrai : l'ajouter ICI, dans le
// MÊME commit que le manifest, ET écrire sa ligne de justification dans
// `extensionPermissions` (src/pages/Legal.jsx) — sinon le build casse, ce qui
// est exactement le but. C'est le seul geste qui doit pouvoir lever les deux
// gardes ensemble — jamais un oubli.

export const HOTES_LIVRABLES_CWS = [
  'https://*.vinted.fr/*',
  'https://*.vinted.com/*',
  'https://*.leboncoin.fr/*',
  'https://*.ebay.fr/*',
  'https://*.ebay.com/*',
  'https://*.beebs.app/*',
  'https://fillsell.app/*',
  'https://tojihnuawsoohlolangc.supabase.co/*',
];

// Un motif d'hôte est « de chantier » exactement quand l'empaquetage le refuse.
// Même prédicat des deux côtés : c'est ce qui interdit la divergence.
export function estHoteDeChantier(motif) {
  return !HOTES_LIVRABLES_CWS.includes(motif);
}
