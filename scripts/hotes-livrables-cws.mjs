// SOURCE DE VÉRITÉ UNIQUE des hôtes que l'extension a le droit d'emporter en
// production — lue par les DEUX gardes qui en dépendent, et par elles seules :
//
//   • scripts/package-extension.mjs   → refuse d'empaqueter un hôte absent d'ici ;
//   • scripts/check-legal-permissions.mjs → n'exige sur fillsell.app/legal QUE
//     les hôtes présents ici.
//
// Les deux lisent CETTE liste, jamais une copie : un hôte est soit livrable
// (empaqueté ET justifié sur /legal), soit de chantier (refusé à l'empaquetage
// ET absent de /legal). Depuis le 16/09, un TROISIÈME état existe, et il est
// représenté ici et nulle part ailleurs : livrable en OPTIONNEL.
//
// Pourquoi une allowlist FERMÉE : un hôte de plus dans le manifest, c'est un
// AVERTISSEMENT DE PERMISSION chez TOUS les utilisateurs à la mise à jour, et
// une nouvelle revue au Chrome Web Store. Pour un chantier à drapeau éteint,
// c'est non.
//
// ── OBLIGATOIRE vs OPTIONNEL (2026-09-16, décision Nico) ─────────────────────
// Un hôte OBLIGATOIRE (host_permissions, `matches` des content_scripts, `matches`
// des web_accessible_resources) est un PRIVILÈGE ACCRU à la mise à jour : Chrome
// compare les ensembles d'hôtes, pas les messages (IsHostPrivilegeIncrease,
// chrome_permission_message_provider.cc) — l'extension est DÉSACTIVÉE chez tout
// le parc jusqu'au clic « Réactiver », files gelées. Un hôte OPTIONNEL
// (optional_host_permissions) n'est accordé qu'à la demande, par un clic de la
// personne dans le popup, et ne déclenche rien à l'installation ni à la mise à
// jour. opla.co est livré ainsi : présent dans le paquet, inerte tant que
// personne n'a cliqué « Autoriser Opla ».
//
// Le 14/09, `https://www.opla.co/*` avait été ajouté au manifest SOURCE pour le
// seul build unpacked (lot 2 : chrome.windows.update exige la permission
// d'hôte), et la garde d'empaquetage le refusait — d'où trois allers-retours
// manuels du manifest avant chaque paquet. Fini : l'hôte est dans le paquet, en
// optionnel, et la garde vérifie qu'il n'apparaît QU'en optionnel.
//
// ⚠️ Pour livrer un jour un nouvel hôte pour de vrai : l'ajouter ICI (dans la
// bonne liste), dans le MÊME commit que le manifest, ET écrire sa ligne de
// justification dans `extensionPermissions` (src/pages/Legal.jsx) — sinon le
// build casse, ce qui est exactement le but. C'est le seul geste qui doit
// pouvoir lever les deux gardes ensemble — jamais un oubli.

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

// Hôtes livrés en OPTIONNEL : acceptés dans `optional_host_permissions` SEULEMENT.
// Les trouver dans host_permissions, content_scripts.matches ou
// web_accessible_resources.matches fait échouer l'empaquetage (ce serait un
// hôte obligatoire, donc un privilège accru). Exigibles sur /legal comme les
// autres : ils partent dans le paquet et le Web Store les lit.
export const HOTES_OPTIONNELS_CWS = [
  'https://www.opla.co/*',
];

export function estHoteLivrable(motif) {
  return HOTES_LIVRABLES_CWS.includes(motif);
}

export function estHoteOptionnel(motif) {
  return HOTES_OPTIONNELS_CWS.includes(motif);
}

// Un motif d'hôte est « de chantier » exactement quand l'empaquetage le refuse
// partout. Même prédicat des deux côtés : c'est ce qui interdit la divergence.
export function estHoteDeChantier(motif) {
  return !estHoteLivrable(motif) && !estHoteOptionnel(motif);
}
