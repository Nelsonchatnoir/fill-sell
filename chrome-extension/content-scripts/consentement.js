// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU DE CONSENTEMENT — DÉTECTÉ, PUIS REFUSÉ
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 08/09 (samira.460, abonnée Premium à 13h11) : 6 publications
// Leboncoin demandées, ZÉRO aboutie, six fois le message « Un brouillon
// Leboncoin non terminé bloque le dépôt ». Il n'y avait aucun brouillon.
//
// LA PREUVE était déjà dans nos propres jobs : `last_diagnostic` relevait les
// boutons présents sur la page au moment de l'échec, et les six portaient
//   ["Refuser","Accepter", ×7, "Voir nos partenaires"]
// — la fenêtre Didomi de Leboncoin, et rien d'autre. La page de dépôt n'avait
// jamais été atteinte ; le code cherchait un bouton « Quitter » dans un écran
// de consentement, ne le trouvait pas, et concluait « brouillon ».
//
// POURQUOI ELLE SEULE : sur 30 jours, un seul compte porte ce diagnostic, et
// c'est le seul qui n'a JAMAIS publié sur Leboncoin. Le consentement est
// stocké par navigateur : tout le parc l'a franchi une fois, il y a longtemps.
// Un compte neuf le rencontre — sur Leboncoin, et sur toute plateforme qui en
// pose un.
//
// ⛔ ON REFUSE, ON N'ACCEPTE JAMAIS (décision Nico, 08/09). C'est l'option la
// plus protectrice : aucune donnée ne part chez les partenaires, l'utilisateur
// ne perd aucun droit et peut changer d'avis quand il veut sur la plateforme.
// Aucune branche de ce fichier ne clique « Accepter » — si le refus n'est pas
// trouvé, on s'arrête et on le DIT, on ne se rabat pas sur l'acceptation.
//
// ⚠️ CLIC DOM UNIQUEMENT, jamais l'API Didomi. `Didomi.setUserDisagreeToAll()`
// serait plus direct mais vit dans le monde MAIN de la page — et le pont MAIN
// est muet dans 100 % des jobs de production depuis la 0.5.8 (mesuré). On
// n'appuie pas une garde sur un canal dont on sait qu'il ne répond pas.
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */

// Sélecteurs de REFUS, du plus précis au plus général. Didomi d'abord : c'est
// le CMP de Leboncoin, relevé en direct le 08/09 (#didomi-host, window.Didomi).
const FS_CONSENT_REFUS_SELECTEURS = [
  '#didomi-notice-disagree-button',
  'button[aria-label="Refuser"]',
  'button[aria-label="Refuser tout"]',
  '#onetrust-reject-all-handler',
  '.ot-pc-refuse-all-handler',
  'button[data-testid="uc-deny-all-button"]',
  'button[id*="reject" i]',
  'button[class*="refuse" i]',
];

// Repli par LIBELLÉ. Les formulations sont celles réellement affichées en
// France ; « Continuer sans accepter » est le lien légal des éditeurs de
// presse et vaut refus.
const FS_CONSENT_REFUS_TEXTES = [
  /^refuser$/i,
  /^tout refuser$/i,
  /^refuser tout$/i,
  /^continuer sans accepter$/i,
  /^reject all$/i,
  /^decline$/i,
];

/** Le conteneur du bandeau, s'il est réellement affiché. */
function fsConsentBandeau() {
  const candidats = [
    document.getElementById('didomi-host'),
    document.getElementById('onetrust-banner-sdk'),
    document.querySelector('[id*="sp_message_container"]'),
    document.querySelector('[class*="didomi-popup" i]'),
    document.querySelector('[id*="cmp" i][role="dialog"]'),
  ].filter(Boolean);
  for (const el of candidats) {
    // offsetParent seul ne suffit pas : un hôte en position:fixed le rend nul.
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Y a-t-il un bandeau de consentement DEVANT nous ?
 * Volontairement conservateur : on ne répond vrai que si un conteneur connu
 * est visible ET qu'il porte un contrôle de refus. Un faux positif ferait
 * abandonner une publication qui pouvait aboutir.
 */
function fsConsentPresent() {
  const hote = fsConsentBandeau();
  if (!hote) return false;
  return !!fsConsentTrouverRefus(hote);
}

function fsConsentTrouverRefus(racine) {
  const zone = racine ?? document;
  for (const sel of FS_CONSENT_REFUS_SELECTEURS) {
    const el = zone.querySelector(sel);
    if (el && el.getBoundingClientRect().height > 0) return el;
  }
  const boutons = [...zone.querySelectorAll('button, a[role="button"]')];
  for (const b of boutons) {
    if (b.getBoundingClientRect().height <= 0) continue;
    const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (FS_CONSENT_REFUS_TEXTES.some((re) => re.test(t))) return b;
  }
  return null;
}

/**
 * Refuse le consentement et attend que le bandeau ait réellement disparu.
 * @returns {Promise<{present:boolean, refuse:boolean, restant:boolean, motif?:string}>}
 *   present : un bandeau était là ;
 *   refuse  : on a cliqué le refus ;
 *   restant : il est TOUJOURS là après le clic — c'est ce cas, et lui seul,
 *             qui doit remonter un message à l'utilisateur.
 */
async function fsConsentRefuser({ attenteMs = 6000 } = {}) {
  const hote = fsConsentBandeau();
  if (!hote) return { present: false, refuse: false, restant: false };
  const bouton = fsConsentTrouverRefus(hote);
  if (!bouton) {
    // Bandeau visible mais aucun refus identifiable : on ne clique RIEN. Un
    // clic au hasard dans un écran de consentement peut valoir acceptation.
    return { present: true, refuse: false, restant: true, motif: 'aucun contrôle de refus reconnu' };
  }
  const libelle = (bouton.textContent ?? '').replace(/\s+/g, ' ').trim() || bouton.id || '(sans libellé)';
  console.log(`[consentement] bandeau détecté — clic sur le refus « ${libelle} »`);
  try { bouton.click(); } catch (e) {
    return { present: true, refuse: false, restant: true, motif: `clic impossible : ${e?.message ?? e}` };
  }
  // Le bandeau part rarement dans la même frame : on attend sa disparition
  // réelle plutôt que de supposer que le clic a suffi.
  const limite = Date.now() + attenteMs;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 200));
    if (!fsConsentBandeau()) {
      console.log('[consentement] bandeau refusé et disparu — la page est utilisable');
      return { present: true, refuse: true, restant: false };
    }
  }
  return { present: true, refuse: true, restant: true, motif: 'bandeau toujours affiché après le refus' };
}

/** Le message utilisateur, quand le bandeau résiste. Il ne parle JAMAIS de
 *  brouillon : c'est précisément la confusion qui a coûté ses six
 *  publications à samira.460. */
function fsConsentMessage(plateforme, domaine) {
  return `${plateforme} affiche sa fenêtre de cookies et la publication ne peut pas commencer tant qu'elle est là. ` +
    `Ouvre ${domaine} dans Chrome, réponds à la fenêtre, puis relance la publication. C'est à faire une seule fois.`;
}
