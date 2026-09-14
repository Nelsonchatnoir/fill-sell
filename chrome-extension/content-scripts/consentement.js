// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU DE CONSENTEMENT — DÉTECTÉ, PUIS REFUSÉ
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 08/09 (samira.460) : 6 publications Leboncoin demandées, ZÉRO
// aboutie, six fois « Un brouillon Leboncoin non terminé bloque le dépôt ». Il
// n'y avait aucun brouillon : `last_diagnostic` relevait les boutons présents
// au moment de l'échec, et les six portaient
//   ["Refuser","Accepter", ×7, "Voir nos partenaires"]
// — l'écran de consentement, et rien d'autre.
//
// RÉCIDIVE du 14/09 (djibril.ziate06, inscrit le 13/09, extension 0.6.33) :
// MÊME diagnostic, au caractère près, sur ses deux jobs — alors que ce module
// était embarqué depuis la 0.6.22. Le module était bien appelé ; c'est sa
// DÉTECTION qui ne voyait rien. Relevé en direct le 14/09 sur la vraie page
// leboncoin.fr/deposer-une-annonce (consentement purgé, bandeau reproduit) :
//
//   • #didomi-host EXISTE mais mesure 0 × 0 — il est vide. Leboncoin n'utilise
//     PAS le bandeau natif de Didomi pour le premier écran : il rend son PROPRE
//     modal React, <div role="dialog" class="z-modal …"> en position:fixed,
//     z-index 1400, dont l'id est généré par React (_r_0_, _r_3_ : il CHANGE
//     d'un chargement à l'autre, il ne doit JAMAIS servir de sélecteur).
//   • Le refus s'y appelle « Continuer sans accepter » : un <button> SANS id,
//     SANS aria-label, aux classes utilitaires (text-body-2 sm:text-body-1
//     text-sm underline). Aucun des cinq conteneurs que cherchait l'ancienne
//     version ne matchait → fsConsentBandeau() rendait null → fsConsentRefuser()
//     rendait { present:false } sans jamais rien cliquer. Le flux continuait,
//     ne trouvait pas le formulaire, et concluait « brouillon ».
//   • Le deuxième écran (« En savoir plus ») est, lui, le vrai Didomi :
//     #didomi-consent-popup + body.didomi-popup-open, et ses boutons sont
//     exactement les 7 paires Refuser/Accepter + « Voir nos partenaires » du
//     diagnostic de djibril, au caractère près. « Continuer sans accepter »
//     reste visible sur CET écran aussi : un seul contrôle couvre les deux.
//   • Clic mesuré : le modal disparaît entre 0,4 s et 1,3 s, le consentement
//     est enregistré en refus, le formulaire de dépôt devient utilisable.
//
// D'où la règle de conception de cette version : on ne part JAMAIS du
// conteneur — on part du CONTRÔLE DE REFUS, et on ne le valide qu'après avoir
// vérifié qu'il siège dans une surface de consentement (dialogue ou calque
// fixe couvrant l'écran). Un identifiant de conteneur, ça change ; « Continuer
// sans accepter » et « Tout refuser » sont des libellés imposés par la loi.
//
// ⛔ ON REFUSE, ON N'ACCEPTE JAMAIS (décision Nico, 08/09). C'est l'option la
// plus protectrice : aucune donnée ne part chez les partenaires, l'utilisateur
// ne perd aucun droit et peut changer d'avis quand il veut sur la plateforme.
// Aucune branche de ce fichier ne clique « Accepter » — si le refus n'est pas
// trouvé, on s'arrête et on le DIT, on ne se rabat pas sur l'acceptation.
//
// ⛔ ET SI LE REFUS N'EST PAS IDENTIFIABLE AVEC CERTITUDE, ON NE CLIQUE RIEN.
// Un clic au hasard dans un écran de consentement peut valoir ACCEPTATION.
// Seuls les libellés de refus GLOBAL sont reconnus : « Refuser » tout court,
// qui sur l'écran de préférences ne refuse QU'UNE finalité sur sept, n'en fait
// pas partie (cf. FS_CONSENT_REFUS_TEXTES).
//
// ⚠️ CLIC DOM UNIQUEMENT, jamais l'API Didomi. Didomi.setUserDisagreeToAll()
// serait plus direct mais vit dans le monde MAIN de la page — et le pont MAIN
// est muet dans 100 % des jobs de production depuis la 0.5.8 (mesuré). On
// n'appuie pas une garde sur un canal dont on sait qu'il ne répond pas.
//
// ⛔ CE MODULE EST INERTE SUR VINTED : le manifest l'injecte, vinted.js ne
// l'appelle pas (décision Nico). Ne pas l'y brancher.
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */

// Sélecteurs de REFUS GLOBAL, du plus précis au plus général. Didomi et
// Axeptio d'abord : relevés en direct (Leboncoin 08/09 et 14/09, Beebs 14/09
// où le refus global porte l'id #axeptio_btn_dismiss et le libellé
// « Tout refuser »).
const FS_CONSENT_REFUS_SELECTEURS = [
  '#didomi-notice-disagree-button',
  '#axeptio_btn_dismiss',
  'button[aria-label="Refuser"]',
  'button[aria-label="Refuser tout"]',
  '#onetrust-reject-all-handler',
  '.ot-pc-refuse-all-handler',
  'button[data-testid="uc-deny-all-button"]',
  'button[id*="reject" i]',
  'button[class*="refuse" i]',
];

// Repli par LIBELLÉ — c'est LUI qui porte le cas Leboncoin, dont le bouton n'a
// ni id ni aria-label. Les formulations sont celles réellement affichées en
// France, relevées sur la page, pas devinées. « Continuer sans accepter » est
// le libellé légal du refus global.
//
// ⛔ « Refuser » SEUL est volontairement ABSENT : sur l'écran de préférences
// de Leboncoin il y en a SEPT, un par finalité, et cliquer l'un d'eux ne
// refuse qu'un septième du consentement tout en laissant l'écran debout. Un
// refus partiel n'est pas un refus : on préfère échouer proprement.
const FS_CONSENT_REFUS_TEXTES = [
  /^continuer sans accepter$/i,
  /^tout refuser$/i,
  /^refuser tout$/i,
  /^refuser et fermer$/i,
  /^tout refuser et fermer$/i,
  /^reject all$/i,
  /^refuse all$/i,
  /^decline all$/i,
];

// Conteneurs de CMP connus, gardés comme signal SECONDAIRE : ils confirment
// qu'un écran de consentement est là quand aucun refus n'a été trouvé. Ils ne
// COMMANDENT plus la détection — c'est exactement ce qui a fait rater
// Leboncoin pendant six jours.
const FS_CONSENT_CONTENEURS = [
  '#didomi-consent-popup',
  '#didomi-host',
  '#onetrust-banner-sdk',
  '[id*="sp_message_container"]',
  '[class*="didomi-popup" i]',
  '[class*="didomi-consent-popup" i]',
  '.axeptio_widget',
  '#axeptio_overlay',
  '[id*="cmp" i][role="dialog"]',
];

/**
 * Visible POUR DE VRAI — au sens CSS, et SANS REGARDER L'OPACITÉ.
 *
 * ⛔ L'OPACITÉ NE DOIT JAMAIS SERVIR DE VERDICT ICI (mesuré le 14/09, et cette
 * version-ci a d'abord échoué dessus). Le modal de consentement de Leboncoin
 * est rendu avec une transition d'apparition : relevé en direct sur la page
 * réelle, son conteneur porte `opacity: 0` alors qu'il est parfaitement à
 * l'écran, qu'il bloque tout, et que `document.elementFromPoint()` rend bien
 * son bouton de refus. Or FillSell travaille dans une fenêtre VOLONTAIREMENT
 * INVISIBLE : dans un onglet d'arrière-plan, les transitions pilotées par
 * requestAnimationFrame sont bridées et cette opacité peut ne JAMAIS monter à
 * 1. Un `checkVisibility({checkOpacity:true})` y répond donc « invisible » sur
 * le mur qui bloque réellement le dépôt — exactement le faux négatif qu'on
 * corrige.
 *
 * On garde en revanche checkVisibilityCSS : display:none, visibility:hidden et
 * content-visibility, eux, sont des masquages francs. C'est ce qui disqualifie
 * le widget Axeptio de Beebs, qui reste à 420 × 472 après un refus alors qu'il
 * n'est plus affiché (mesuré le 14/09) — là où `offsetParent !== null` et le
 * rect seul mentent tous les deux.
 */
function fsConsentVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  if (typeof el.checkVisibility === 'function') {
    try { if (!el.checkVisibility({ checkVisibilityCSS: true })) return false; }
    catch { /* signature ancienne : la géométrie ci-dessus fait foi */ }
  }
  return true;
}

/**
 * Le contrôle est-il ATTEIGNABLE, c'est-à-dire réellement au-dessus à
 * l'endroit où on s'apprête à cliquer ? C'est le test honnête, celui qui
 * distingue « affiché » de « présent dans le DOM » sans passer par l'opacité.
 *
 * Un point de subtilité qui a sa raison d'être : sur le deuxième écran de
 * Leboncoin (« En savoir plus »), le panneau Didomi natif RECOUVRE le modal
 * qui porte « Continuer sans accepter » — le bouton reste le bon, il est juste
 * caché derrière une autre surface de consentement. On l'accepte donc quand ce
 * qui le recouvre appartient lui aussi à un écran de consentement, et
 * seulement dans ce cas : recouvert par la page ordinaire, il est refusé.
 * (Le clic, lui, est un click() DOM : il traverse le recouvrement.)
 */
function fsConsentAtteignable(el) {
  const r = el.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left + r.width / 2, 1), Math.max(2, window.innerWidth - 2));
  const cy = Math.min(Math.max(r.top + r.height / 2, 1), Math.max(2, window.innerHeight - 2));
  let dessus = null;
  try { dessus = document.elementFromPoint(cx, cy); }
  catch { return true; /* pas de hit-test possible : on ne disqualifie pas */ }
  if (!dessus) return false;
  if (dessus === el || el.contains(dessus) || dessus.contains(el)) return true;
  return !!fsConsentSurface(dessus);
}

const fsConsentTexte = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * L'élément siège-t-il dans une SURFACE DE CONSENTEMENT ?
 * C'est la garde anti-faux-positif : sans elle, un bouton « Tout refuser »
 * n'importe où dans une page suffirait à faire abandonner une publication.
 * Trois preuves acceptées, de la plus sûre à la plus générale :
 *   1. un conteneur de CMP connu le contient ;
 *   2. un ancêtre est un dialogue déclaré (role="dialog" / aria-modal) ;
 *   3. un ancêtre est un calque position:fixed qui couvre au moins le quart
 *      de la fenêtre — la forme d'un mur de consentement, pas celle d'un
 *      bouton de formulaire.
 * Le modal Leboncoin du 14/09 coche 2 ET 3 (role="dialog", fixed, z-index
 * 1400, 1000 × 674 sur 1536 × 826) ; son id React n'est jamais lu.
 */
function fsConsentSurface(el) {
  for (const sel of FS_CONSENT_CONTENEURS) {
    let hote = null;
    try { hote = el.closest(sel); } catch { continue; }
    if (hote) return { preuve: `conteneur ${sel}`, hote, certaine: true };
  }
  const aire = Math.max(1, window.innerWidth * window.innerHeight);
  let p = el;
  while (p && p !== document.body && p !== document.documentElement) {
    const role = p.getAttribute?.('role');
    if (role === 'dialog' || role === 'alertdialog' || p.getAttribute?.('aria-modal') === 'true') {
      return { preuve: `dialogue ${role ?? 'aria-modal'}`, hote: p, certaine: true };
    }
    let cs = null;
    try { cs = window.getComputedStyle(p); } catch { cs = null; }
    if (cs && cs.position === 'fixed') {
      const r = p.getBoundingClientRect();
      if ((r.width * r.height) / aire >= 0.25) {
        // Preuve FAIBLE : un calque plein écran n'est pas forcément un écran de
        // consentement. C'est la seule branche qui exige, en plus, que le
        // contrôle soit atteignable (cf. fsConsentIdentifie).
        return { preuve: `calque fixe ${Math.round(r.width)}×${Math.round(r.height)}`, hote: p, certaine: false };
      }
    }
    p = p.parentElement;
  }
  return null;
}

/**
 * Le contrôle est-il identifié de façon SÛRE ? Deux niveaux de preuve, et
 * l'atteignabilité n'est exigée que sur le plus faible des deux.
 *
 * Pourquoi (mesuré le 14/09 sur Beebs, onglet d'arrière-plan) : le bouton
 * « Tout refuser » d'Axeptio y siège à x = -180, hors écran, faute d'animation
 * d'entrée — `elementFromPoint` ne le rend donc jamais. Exiger
 * l'atteignabilité partout reviendrait à ne jamais refuser sur Beebs. Or son
 * identité n'a rien d'incertain : id `#axeptio_btn_dismiss`, libellé
 * « Tout refuser », à l'intérieur de `.axeptio_widget`. Quand la surface est
 * CERTAINE (conteneur de CMP connu ou dialogue déclaré), l'identité suffit —
 * et le clic est un `click()` DOM, qui n'a que faire de la position.
 * Quand elle ne l'est pas (simple calque plein écran), on exige que le
 * contrôle soit réellement au-dessus : c'est la garde anti-faux-positif.
 */
function fsConsentIdentifie(el, surface) {
  if (!surface) return false;
  return surface.certaine === true || fsConsentAtteignable(el);
}

/**
 * Le contrôle de refus GLOBAL, s'il est là et identifiable sans ambiguïté.
 * @returns {{bouton:Element, libelle:string, preuve:string}|null}
 */
function fsConsentTrouverRefus() {
  for (const sel of FS_CONSENT_REFUS_SELECTEURS) {
    let el = null;
    try { el = document.querySelector(sel); } catch { continue; }
    if (!el || !fsConsentVisible(el)) continue;
    const surface = fsConsentSurface(el);
    if (fsConsentIdentifie(el, surface)) return { bouton: el, libelle: fsConsentTexte(el) || el.id || sel, preuve: `${sel} · ${surface.preuve}` };
  }
  // Repli par libellé. L'ensemble balayé inclut les <a> NUS et les
  // [role="button"] : l'ancienne version ne regardait que « button,
  // a[role="button"] », or plusieurs CMP rendent le refus comme un simple lien.
  const candidats = [...document.querySelectorAll('button, a, [role="button"]')];
  for (const b of candidats) {
    const t = fsConsentTexte(b);
    if (!t || !FS_CONSENT_REFUS_TEXTES.some((re) => re.test(t))) continue;
    if (!fsConsentVisible(b)) continue;
    const surface = fsConsentSurface(b);
    if (fsConsentIdentifie(b, surface)) return { bouton: b, libelle: t, preuve: `libellé « ${t} » · ${surface.preuve}` };
  }
  return null;
}

/** Un conteneur de CMP réellement affiché, sans exiger de refus : sert à dire
 *  « il y a bien un écran de consentement » même quand le refus est
 *  introuvable — le cas où l'on ne clique RIEN mais où il faut le signaler.
 *  body.didomi-popup-open est posé par Didomi lui-même pendant l'affichage. */
function fsConsentConteneurVisible() {
  if (document.body?.classList?.contains('didomi-popup-open')) return 'body.didomi-popup-open';
  for (const sel of FS_CONSENT_CONTENEURS) {
    let el = null;
    try { el = document.querySelector(sel); } catch { continue; }
    if (el && fsConsentVisible(el)) return sel;
  }
  return null;
}

/** Un écran de consentement est-il DEVANT nous ? */
function fsConsentPresent() {
  return !!(fsConsentTrouverRefus() || fsConsentConteneurVisible());
}

/**
 * L'écran de consentement MURE-T-IL la page, ou traîne-t-il simplement sur le
 * côté ? (ajouté le 14/09 pour Beebs — Leboncoin ne l'appelle pas.)
 *
 * « Présent » et « bloquant » ne sont pas la même chose, et les confondre
 * ferait échouer des publications qui marchent. Mesuré le 14/09 sur
 * beebs.app/fr/listing, consentement purgé, dans un onglet d'ARRIÈRE-PLAN —
 * c'est-à-dire dans les conditions réelles de la fenêtre de travail de
 * FillSell : le widget Axeptio reste coincé à `opacity:0`,
 * `transform: translateX(-200px)`, rect 420 × 472 à x = -180. Il n'entre
 * jamais : son animation d'apparition ne tourne pas faute de repeint. Le
 * formulaire de dépôt, lui, est entièrement rendu et lisible derrière.
 * Le widget n'avale que la bande invisible qu'il recouvre à gauche.
 *
 * À l'inverse, le modal Leboncoin est posé d'emblée au CENTRE, en fixed : là,
 * la page est réellement murée.
 *
 * D'où ce test : c'est le CENTRE de la fenêtre qui tranche. S'il appartient à
 * une surface de consentement, rien ne peut être rempli et l'échec est
 * légitime ; sinon le travail peut continuer, et transformer ça en échec
 * serait inventer un blocage — exactement ce qu'on reproche au « brouillon ».
 */
function fsConsentBloqueLaPage() {
  let dessus = null;
  try { dessus = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2)); }
  catch { return false; }
  if (!dessus) return false;
  return !!fsConsentSurface(dessus);
}

/**
 * Le relevé des boutons réellement affichés — la mesure qui a permis de
 * trancher le 08/09 ET le 14/09. Elle ne disparaît jamais d'un diagnostic.
 */
function fsConsentReleveBoutons(max = 15) {
  return [...document.querySelectorAll('button, a[role="button"]')]
    .filter((b) => fsConsentVisible(b))
    .map((b) => fsConsentTexte(b))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Refuse le consentement et attend que l'écran ait RÉELLEMENT disparu.
 *
 * @param {object} [opts]
 * @param {number} [opts.attenteMs=8000]  attente de la DISPARITION après le clic.
 * @param {boolean} [opts.sortieSiNonBloquant=false] rendre la main dès que
 *        l'écran ne mure plus la page, même s'il traîne encore dans le DOM.
 *        Défaut false : le chemin Leboncoin garde EXACTEMENT sa sémantique.
 *        Beebs l'arme, parce que son widget Axeptio ne quitte JAMAIS le DOM,
 *        même après un refus enregistré (mesuré le 14/09) : sans cette sortie,
 *        chaque job neuf paierait les 8 s d'attente pour rien.
 * @param {number} [opts.apparitionMs=0]  attente de l'APPARITION avant de conclure
 *        « pas de bandeau ». 0 par défaut : un compte qui a déjà répondu à la
 *        fenêtre ne paie aucune milliseconde et ne voit AUCUN changement de
 *        comportement (garde-fou Nico). L'appelant ne l'arme que lorsqu'il a
 *        une raison de croire que la page n'est pas encore celle attendue.
 * @returns {Promise<{present:boolean, refuse:boolean, restant:boolean, motif?:string, libelle?:string, preuve?:string, boutons?:string[]}>}
 *   present : un écran de consentement était là ;
 *   refuse  : on a cliqué le refus global ;
 *   restant : il est TOUJOURS là — c'est ce cas, et lui seul, qui doit
 *             remonter un message à l'utilisateur.
 */
async function fsConsentRefuser({ attenteMs = 8000, apparitionMs = 0, sortieSiNonBloquant = false } = {}) {
  let cible = fsConsentTrouverRefus();
  let conteneur = cible ? null : fsConsentConteneurVisible();

  // Attente d'APPARITION. Le CMP est chargé par un script tiers : il peut se
  // poser après document_idle, donc après notre premier regard. Une lecture
  // unique le raterait — et un job raté sur ce mur coûtait une tentative à un
  // inscrit du jour.
  if (!cible && !conteneur && apparitionMs > 0) {
    const limite = Date.now() + apparitionMs;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 200));
      cible = fsConsentTrouverRefus();
      if (cible) break;
      conteneur = fsConsentConteneurVisible();
      if (conteneur) break;
    }
  }

  if (!cible && !conteneur) return { present: false, refuse: false, restant: false };

  if (!cible) {
    // Écran de consentement visible, mais AUCUN refus global identifiable :
    // on ne clique RIEN. Un clic au hasard peut valoir acceptation.
    return {
      present: true, refuse: false, restant: true,
      motif: `aucun contrôle de refus global reconnu (${conteneur})`,
      boutons: fsConsentReleveBoutons(),
    };
  }

  const { bouton, libelle, preuve } = cible;
  console.log(`[consentement] écran détecté (${preuve}) — clic sur le refus « ${libelle} »`);
  const boutons = fsConsentReleveBoutons();
  try {
    bouton.click();
  } catch (e) {
    return { present: true, refuse: false, restant: true, motif: `clic impossible : ${e?.message ?? e}`, libelle, preuve, boutons };
  }

  // L'écran ne part pas dans la même frame : mesuré entre 0,4 s et 1,3 s sur
  // Leboncoin le 14/09. On attend sa disparition RÉELLE — pas de délai fixe,
  // une vérification de présence, sur le même détecteur qu'à l'aller.
  const limite = Date.now() + attenteMs;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 200));
    if (!fsConsentPresent()) {
      console.log('[consentement] refus enregistré, écran disparu — la page est utilisable');
      return { present: true, refuse: true, restant: false, libelle, preuve, boutons };
    }
    if (sortieSiNonBloquant && !fsConsentBloqueLaPage()) {
      console.log('[consentement] refus enregistré ; le bandeau traîne encore dans le DOM mais ne mure plus la page');
      return { present: true, refuse: true, restant: false, libelle, preuve, boutons };
    }
  }
  return { present: true, refuse: true, restant: true, motif: "l'écran est resté affiché après le refus", libelle, preuve, boutons };
}

/** Le message utilisateur, quand l'écran résiste. Il ne prononce JAMAIS le mot
 *  « brouillon » autrement que pour dire qu'il n'y en a pas : c'est cette
 *  confusion qui a coûté six publications à samira.460 le 08/09 et deux à
 *  djibril.ziate06 le 14/09, en les envoyant supprimer un brouillon
 *  inexistant. */
function fsConsentMessage(plateforme, domaine) {
  return `${plateforme} affiche sa fenêtre « cookies » par-dessus la page de dépôt et FillSell n'a pas réussi ` +
    `à la fermer : rien n'a été publié, et il n'y a aucun brouillon à supprimer. ` +
    `Ouvre ${domaine} dans Chrome, réponds à cette fenêtre (« Continuer sans accepter » suffit), ` +
    `puis relance la publication depuis la fiche de l'article. C'est à faire une seule fois.`;
}
