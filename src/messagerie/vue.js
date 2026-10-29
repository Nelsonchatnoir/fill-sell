// ═══════════════════════════════════════════════════════════════════════════
// BÊTA MESSAGES + BORDEREAUX — CE QUE L'ÉCRAN AFFICHE (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES (testées : scripts/messagerie-app-selftest.mjs). Les écrans
// de src/messagerie/ ne décident de rien d'autre : libellés, tri, états des
// réponses et des commandes, action de chaque commande, murs des relevés.
// (16/10 soir, clôture du chantier) Le bouton « Bordereau » est ACTIF quand le
// bordereau est prêt chez la plateforme : un clic dépose une demande
// (bordereau_demander), l'ordinateur de la personne le récupère.
// (16/10 nuit, mission de Nico) « Générer le bordereau » : Vinted « commander
// l'étiquette », Leboncoin « confirmer la disponibilité », Beebs « accepter la
// commande » — un appui ouvre l'ÉCRAN DE CONFIRMATION (phraseEngagement), seul
// le second appui dépose la demande (bordereau_generer) ; jamais seul, jamais
// en lot. L'étiquette eBay (payante) reste sur eBay ; Depop n'a pas de
// bordereau en France.

import { urlPhoto, urlsPhotos } from '../utils/photos.js';

// (17/10) La vignette d'une conversation ou d'une commande (Vignette.jsx) :
// la photo de l'annonce, puis les photos de la fiche du stock rattachée — une
// LISTE (chaînes du CDN ou objets {url}), lue par le normaliseur unique. Avant,
// la liste partait telle quelle dans <img src> : image cassée « ? ».
const VIGNETTE_FICHE_MAX = 3;
/** Les adresses à essayer pour une vignette, dans l'ordre, sans doublon. */
export function sourcesVignette(photoAnnonce, photosFiche) {
  const fiche = Array.isArray(photosFiche) ? urlsPhotos(photosFiche) : [urlPhoto(photosFiche)];
  return [...new Set([urlPhoto(photoAnnonce), ...fiche.slice(0, VIGNETTE_FICHE_MAX)].filter(Boolean))];
}

export const NOMS_PLATEFORMES = Object.freeze({
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay',
});
export const ORDRE_PLATEFORMES = Object.freeze(['vinted', 'leboncoin', 'beebs', 'ebay', 'depop']);

export function nomPlateforme(p) {
  return NOMS_PLATEFORMES[p] ?? (p ? String(p) : '—');
}

// Vinted, eBay et Depop ont des pseudos (« @login ») ; Leboncoin et Beebs
// montrent un nom public (« Marc », « Julie D. ») : pas d'arobase devant.
const A_PSEUDO = Object.freeze(['vinted', 'ebay', 'depop']);
export function pseudoAffiche(platform, pseudo) {
  const p = String(pseudo ?? '').trim();
  if (!p) return null;
  return A_PSEUDO.includes(platform) ? `@${p}` : p;
}

// Les codes de transporteur des plateformes, en clair (inconnu : le code lisible).
const TRANSPORTEURS = Object.freeze({
  mondial_relay: 'Mondial Relay', mondialrelay: 'Mondial Relay', shop2shop: 'Shop2Shop', colissimo: 'Colissimo',
  relais_colis: 'Relais Colis', relaiscolis: 'Relais Colis', chronopost: 'Chronopost', chrono_relais: 'Chronopost Relais',
  ups: 'UPS', dpd: 'DPD', gls: 'GLS', vinted_go: 'Vinted Go', inpost: 'InPost', courrier_suivi: 'Courrier suivi',
  fr_coliposte_colissimo: 'Colissimo', fr_colissimo: 'Colissimo', fr_mondial_relay: 'Mondial Relay', fr_chronopost: 'Chronopost',
});
export function libelleTransporteur(code) {
  const brut = String(code ?? '').trim();
  if (!brut) return null;
  const cle = brut.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_');
  if (TRANSPORTEURS[cle]) return TRANSPORTEURS[cle];
  const sansPays = cle.replace(/^fr_/, '');
  if (TRANSPORTEURS[sansPays]) return TRANSPORTEURS[sansPays];
  return sansPays.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Une conversation compte comme non lue (même règle que messagerie_compteurs). */
export function conversationNonLue(c) {
  if (!c || c.systeme || !(Number(c.non_lus) > 0)) return false;
  const vue = Date.parse(c.vu_dans_app_le ?? '');
  const derniere = Date.parse(c.dernier_message_le ?? c.cree_le ?? '');
  return !Number.isFinite(vue) || (Number.isFinite(derniere) && vue < derniere);
}

/** Tri : non lues d'abord, puis la plus récente. Les messages des plateformes en dernier. */
export function trierConversations(liste) {
  return [...(liste ?? [])].sort((a, b) => {
    const s = Number(Boolean(a.systeme)) - Number(Boolean(b.systeme));
    if (s) return s;
    const n = Number(conversationNonLue(b)) - Number(conversationNonLue(a));
    if (n) return n;
    return (Date.parse(b.dernier_message_le ?? '') || 0) - (Date.parse(a.dernier_message_le ?? '') || 0);
  });
}

/** Date courte, heure de Paris. */
export function dateCourte(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const auj = new Date();
  const memeJour = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) === auj.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  return memeJour
    ? d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
}

/** « 22/10 à 14:00 », heure de Paris. */
export function dateEtHeure(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const jour = d.toLocaleDateString(loc, { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  const heure = d.toLocaleTimeString(loc, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return lang === 'en' ? `${jour} at ${heure}` : `${jour} à ${heure}`;
}

export function montantTexte(v, devise = 'EUR') {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return null;
  try { return n.toLocaleString('fr-FR', { style: 'currency', currency: devise || 'EUR' }); }
  catch { return `${n.toFixed(2)} ${devise ?? ''}`.trim(); }
}

/** Ce que l'app dit d'une réponse écrite par la personne. */
export function etatReponse(r, lang = 'fr') {
  const fr = lang !== 'en';
  switch (r?.statut) {
    case 'verrouillee':
      if (r.motif === 'plafond_jour') return { ton: 'ambre', texte: fr ? 'Non envoyée : 20 réponses par jour au plus pendant la bêta.' : 'Not sent: 20 replies a day at most during the beta.' };
      if (r.motif === 'reponse_fermee_par_la_plateforme') return { ton: 'ambre', texte: fr ? 'Non envoyée : la plateforme ne permet plus de répondre ici.' : 'Not sent: the platform no longer allows replies here.' };
      if (r.motif === 'envoi_ferme') return { ton: 'ambre', texte: fr ? 'Non envoyée : l’envoi depuis FillSell est coupé pour le moment. Rien n’est parti.' : 'Not sent: sending from FillSell is switched off for now. Nothing went out.' };
      return { ton: 'ambre', texte: fr ? 'Enregistrée, non envoyée : l’envoi est verrouillé pour cette conversation (hors liste blanche).' : 'Saved, not sent: sending is locked for this conversation (not whitelisted).' };
    case 'en_attente': return { ton: 'neutre', texte: fr ? 'En attente : ton extension l’enverra à son prochain passage, ordinateur allumé.' : 'Waiting: your extension will send it on its next pass, computer on.' };
    case 'en_cours': return { ton: 'neutre', texte: fr ? 'Envoi en cours…' : 'Sending…' };
    case 'envoyee': return { ton: 'ok', texte: fr ? 'Envoyée, telle que tu l’as écrite.' : 'Sent, exactly as you wrote it.' };
    case 'echec':
      // (16/10 nuit) Prise mais jamais confirmée : elle a PU partir — FillSell ne
      // la renvoie jamais (un doublon chez l'acheteur est pire qu'un raté).
      if (r.motif === 'sans_confirmation') return { ton: 'ambre', texte: fr ? 'Envoi non confirmé : vérifie sur la plateforme avant de réécrire. FillSell ne la renverra jamais.' : 'Sending not confirmed: check on the platform before writing again. FillSell will never resend it.' };
      if (r.motif === 'empreinte_differente') return { ton: 'rouge', texte: fr ? 'Non envoyée : le texte reçu par ton ordinateur n’était pas exactement le tien. Rien n’est parti.' : 'Not sent: the text your computer received was not exactly yours. Nothing went out.' };
      if (r.motif === 'trop_ancienne') return { ton: 'ambre', texte: fr ? 'Non envoyée : ton ordinateur ne l’a pas prise dans les 24 h (éteint ?). Rien n’est parti ; réécris-la si elle compte encore.' : 'Not sent: your computer did not pick it up within 24 h (off?). Nothing went out; write it again if it still matters.' };
      return { ton: 'rouge', texte: fr ? 'Non envoyée (rien n’est parti). Réécris-la depuis la plateforme si besoin.' : 'Not sent (nothing went out). Write it on the platform if needed.' };
    case 'annulee': return { ton: 'neutre', texte: fr ? 'Annulée.' : 'Cancelled.' };
    default: return { ton: 'neutre', texte: '' };
  }
}

/**
 * L'état de la zone de réponse d'une conversation.
 * (16/10 nuit) `modeEnvoi` = coin_config.messagerie_envoi_mode lu par
 * messagerie_compteurs : 2 = ouvert aux comptes bêta (sans liste blanche),
 * 1 = liste blanche, 0 = fermé ; absent = 1 (le fonctionnement d'avant).
 */
export function etatZoneReponse(conv, enListeBlanche, lang = 'fr', modeEnvoi = 1) {
  const fr = lang !== 'en';
  if (conv?.systeme) return { possible: false, ton: 'neutre', texte: fr ? 'Message de la plateforme : pas de réponse possible.' : 'Message from the platform: no reply possible.' };
  if (conv?.reponse_possible === false) return { possible: false, ton: 'neutre', texte: fr ? `${nomPlateforme(conv.platform)} ne permet pas de répondre à cette conversation.` : `${nomPlateforme(conv?.platform)} does not allow replies here.` };
  const mode = Number.isFinite(Number(modeEnvoi)) ? Number(modeEnvoi) : 1;
  if (mode === 0) return { possible: true, verrouillee: true, ton: 'ambre', texte: fr ? 'Envoi coupé pour le moment : ta réponse est enregistrée, elle ne part pas.' : 'Sending is switched off for now: your reply is saved, it does not go out.' };
  if (mode === 1 && !enListeBlanche) return { possible: true, verrouillee: true, ton: 'ambre', texte: fr ? 'Envoi verrouillé pendant la bêta : ta réponse est enregistrée, elle ne part que si cette conversation est dans la liste blanche.' : 'Sending is locked during the beta: your reply is saved and only goes out if this conversation is whitelisted.' };
  return { possible: true, verrouillee: false, ton: 'ok', texte: fr ? `Envoi actif : ta réponse part telle que tu l’écris, par ton extension, sur ${nomPlateforme(conv?.platform)}, une seule fois.` : `Sending on: your reply goes out exactly as written, through your extension, on ${nomPlateforme(conv?.platform)}, once.` };
}

const ETATS_COMMANDE = Object.freeze({
  a_confirmer: ['À confirmer', 'To confirm'],
  a_expedier: ['À expédier', 'To ship'],
  expediee: ['Expédiée', 'Shipped'],
  livree: ['Livrée', 'Delivered'],
  terminee: ['Terminée', 'Completed'],
  annulee: ['Annulée', 'Cancelled'],
  retour: ['Retour', 'Return'],
  litige: ['Incident', 'Issue'],
  inconnu: ['État à vérifier', 'Status to check'],
});

/** Le libellé d'un état (Leboncoin « à confirmer » = disponibilité ; Beebs = commande à accepter). */
export function libelleEtatCommande(etat, lang = 'fr', platform = null) {
  const fr = lang !== 'en';
  if (etat === 'a_confirmer' && platform === 'leboncoin') return fr ? 'Disponibilité à confirmer' : 'Availability to confirm';
  if (etat === 'a_confirmer' && platform === 'beebs') return fr ? 'Commande à accepter' : 'Order to accept';
  const l = ETATS_COMMANDE[etat] ?? ETATS_COMMANDE.inconnu;
  return fr ? l[0] : l[1];
}

/**
 * Les commandes de la section « À expédier » : à confirmer d'abord, puis à
 * expédier (la date limite la plus proche, sinon la vente la plus ancienne),
 * puis les états à vérifier (une forme jamais vue ne disparaît pas de l'écran).
 */
export function commandesAExpedier(liste) {
  const rang = (c) => (c?.etat === 'a_confirmer' ? 0 : c?.etat === 'a_expedier' ? 1 : 2);
  return (liste ?? [])
    .filter((c) => c?.etat === 'a_confirmer' || c?.etat === 'a_expedier' || c?.etat === 'inconnu')
    .sort((a, b) => {
      const p = rang(a) - rang(b);
      if (p) return p;
      const da = Date.parse(a.a_expedier_avant ?? '') || Date.parse(a.vendue_le ?? '') || 0;
      const db = Date.parse(b.a_expedier_avant ?? '') || Date.parse(b.vendue_le ?? '') || 0;
      return da - db;
    });
}

/** La date limite d'envoi, et si elle presse (moins de 48 h). */
export function delaiEnvoi(c, lang = 'fr', maintenant = Date.now()) {
  const t = Date.parse(c?.a_expedier_avant ?? '');
  if (!Number.isFinite(t)) return null;
  const fr = lang !== 'en';
  const reste = t - maintenant;
  if (reste < 0) return { urgent: true, depasse: true, texte: fr ? `Date limite dépassée (${dateEtHeure(c.a_expedier_avant, lang)})` : `Deadline passed (${dateEtHeure(c.a_expedier_avant, lang)})` };
  return { urgent: reste < 48 * 3600 * 1000, depasse: false, texte: fr ? `À déposer avant le ${dateEtHeure(c.a_expedier_avant, lang)}` : `Ship before ${dateEtHeure(c.a_expedier_avant, lang)}` }; // estimation-ok: date limite DONNÉE par la plateforme (eBay shipByDate, Beebs, Depop)
}

const enc = (v) => encodeURIComponent(String(v ?? ''));

/** La page de la commande chez la plateforme (vérifiées le 16/10 dans le code des sites). */
export function lienCommande(c) {
  switch (c?.platform) {
    case 'vinted': return c.conversation_ref ? `https://www.vinted.fr/inbox/${enc(c.conversation_ref)}` : 'https://www.vinted.fr/my_orders';
    case 'leboncoin': return c.commande_ref ? `https://www.leboncoin.fr/compte/part/transaction/${enc(c.commande_ref)}` : 'https://www.leboncoin.fr/compte/part/mes-transactions';
    case 'beebs': return c.commande_ref ? `https://www.beebs.app/fr/account/orders/${enc(c.commande_ref)}` : 'https://www.beebs.app/fr/account/orders/list/seller';
    case 'ebay': return c.commande_ref ? `https://www.ebay.fr/sh/ord/details?orderid=${enc(c.commande_ref)}` : 'https://www.ebay.fr/sh/ord';
    case 'depop': return 'https://www.depop.com/sellinghub/sold-items/';
    default: return null;
  }
}

/** La conversation chez la plateforme (pour répondre directement là-bas). */
export function lienConversation(c) {
  switch (c?.platform) {
    case 'vinted': return c.conversation_ref ? `https://www.vinted.fr/inbox/${enc(c.conversation_ref)}` : 'https://www.vinted.fr/inbox';
    case 'beebs': return c.conversation_ref ? `https://www.beebs.app/fr/account/chats/${enc(c.conversation_ref)}` : 'https://www.beebs.app/fr/account/chats';
    case 'leboncoin': return 'https://www.leboncoin.fr/messages';
    case 'depop': return 'https://www.depop.com/messages/';
    case 'ebay': return 'https://www.ebay.fr/mye/myebay/v2/messages';
    default: return null;
  }
}

/** Les plateformes dont FillSell récupère le bordereau au clic (chemin codé jusqu'au fichier). */
export const PLATEFORMES_BORDEREAU = Object.freeze(['vinted', 'leboncoin', 'beebs']);
/** (24/10 soir, décision 2 de Nico) Celles dont le bordereau est OUVERT (tous les comptes) : Vinted seulement. */
export const PLATEFORMES_BORDEREAU_OUVERTES = Object.freeze(['vinted']);

/**
 * (16/10 nuit) La commande attend le geste qui crée le bordereau : Vinted
 * « commander l'étiquette », Leboncoin « confirmer la disponibilité », Beebs
 * « accepter la commande ».
 */
export function attendGeneration(c) {
  if (c?.platform === 'vinted') return c.etat === 'a_expedier' && c.bordereau === 'a_obtenir';
  if (c?.platform === 'leboncoin' || c?.platform === 'beebs') return c.etat === 'a_confirmer' && c.bordereau === 'a_generer';
  return false;
}

/**
 * La phrase de l'écran de confirmation : ce que le geste ENGAGE, en une
 * phrase. Elle est gardée en base avec la demande (bordereau_generer).
 * (17/10) `variante` 'adresse' : Leboncoin Colissimo / courrier suivi (le
 * bordereau porte l'adresse enregistrée dans le compte Leboncoin).
 */
export function phraseEngagement(platform, lang = 'fr', variante = null) {
  const fr = lang !== 'en';
  switch (platform) {
    case 'vinted': return fr ? 'Commander l’étiquette engage l’envoi : Vinted attend ton colis au point relais avant la date limite qu’il fixe.' : 'Ordering the label commits you to ship: Vinted expects your parcel at the drop-off point before the deadline it sets.';
    case 'leboncoin':
      if (variante === 'adresse') return fr ? 'Confirmer la disponibilité valide la vente : Leboncoin crée le bordereau avec l’adresse de ton compte Leboncoin et attend ton colis dans le délai qu’il fixe.' : 'Confirming availability validates the sale: Leboncoin creates the label with your Leboncoin account address and expects your parcel within the time it sets.';
      return fr ? 'Confirmer la disponibilité valide la vente : Leboncoin crée le bordereau et attend ton colis dans le délai qu’il fixe.' : 'Confirming availability validates the sale: Leboncoin creates the label and expects your parcel within the time it sets.';
    // estimation-ok: délai IMPOSÉ par Beebs (centre d'aide 360018436119 : 6 jours pour déposer)
    case 'beebs': return fr ? 'Accepter la commande débite l’acheteur : Beebs crée le bordereau et te laisse 6 jours pour déposer le colis.' : 'Accepting the order charges the buyer: Beebs creates the label and gives you 6 days to drop the parcel.';
    default: return null;
  }
}

/** Les types d'étiquette Vinted, en clair (1 papier, 2 code, 3 QR). */
export function libelleTypeEtiquette(type, lang = 'fr') {
  const fr = lang !== 'en';
  switch (Number(type)) {
    case 1: return fr ? 'Étiquette à imprimer (PDF)' : 'Label to print (PDF)';
    case 3: return fr ? 'Code QR à montrer au point relais (sans impression)' : 'QR code to show at the drop-off point (no printing)';
    case 2: return fr ? 'Code de dépôt (sans impression)' : 'Drop-off code (no printing)';
    default: return null;
  }
}

/** (17/10) Les types d'envoi Leboncoin dont la confirmation porte l'adresse de l'expéditeur. */
export const LBC_TYPES_ADRESSE = Object.freeze(['colissimo', 'courrier_suivi']);

/** Pourquoi une génération n'est pas faisable depuis FillSell (options relevées). */
function raisonNonGenerable(c, fr) {
  const o = c?.options_bordereau ?? {};
  const pf = nomPlateforme(c?.platform);
  if (c?.platform === 'vinted') {
    if (o.domicile_seul) return fr ? 'Cette commande demande un enlèvement à domicile (date à choisir) : FillSell ne choisit pas de date, commande l’étiquette sur Vinted.' : 'This order needs a home pickup (date to choose): FillSell does not pick dates, order the label on Vinted.';
    if (o.telephone_manquant) return fr ? 'Vinted demande ton numéro de téléphone pour ce transporteur : ajoute-le sur Vinted, puis génère à nouveau ici.' : 'Vinted needs your phone number for this carrier: add it on Vinted, then generate again here.';
  }
  if (c?.platform === 'leboncoin') return fr ? 'Envoi libre ou remise en main propre : Leboncoin ne fournit pas de bordereau, il n’y a rien à générer. Confirme sur Leboncoin.' : 'Free shipping or hand delivery: Leboncoin provides no label, nothing to generate. Confirm on Leboncoin.';
  if (c?.platform === 'beebs') return fr ? 'Remise en main propre : pas de bordereau, elle se gère dans l’app Beebs.' : 'Hand delivery: no label, it is handled in the Beebs app.';
  return fr ? `À faire sur ${pf}.` : `To do on ${pf}.`;
}

/**
 * L'action d'une commande dans « À expédier » — (17/10, règle de Nico) TOUT ce
 * que FillSell sait faire se fait dans FillSell ; la plateforme n'est qu'un
 * dernier recours.
 *   type 'bordereau' : bordereau prêt chez la plateforme → « Récupérer » ;
 *   type 'generer'   : « Générer le bordereau » — un appui, PUIS l'écran de
 *                      confirmation (phrase d'engagement) ; seul le second
 *                      appui dépose la demande (bordereau_generer). Options pas
 *                      encore relues : le bouton reste (l'extension les relit
 *                      juste avant le geste) ; ordinateur éteint : la demande
 *                      l'attend ici ;
 *   type 'attente'   : la plateforme prépare quelque chose, FillSell le guette —
 *                      rien à faire, le lien est discret ;
 *   type 'lien'      : seulement ce que FillSell ne peut pas faire (et dit
 *                      pourquoi) : acheter une étiquette eBay, enlèvement Vinted
 *                      à domicile, remise en main propre, Depop sans bordereau.
 * `generation` : true ouverte, false FERMÉE par le serveur, null inconnue (pas
 * encore lue) — inconnue, le bouton reste : la base refuse si c'est fermé.
 */
/**
 * (18/10) La plus ancienne extension qui commande l'étiquette Vinted comme la
 * page de Vinted (type d'étiquette en toutes lettres) : 0.6.126. Avant elle, la
 * commande partait sans type et Vinted échouait (Louis, 18/10) — le serveur ne
 * lui donne plus de génération Vinted. Horodatage du BUILD_ID de la 0.6.126.
 */
export const GENERATION_VINTED_BUILD_MIN = '2026-10-18T10:56:25Z';

/** (18/10) L'extension de ce compte sait-elle commander l'étiquette Vinted ? true, false, ou null (inconnu). */
export function extensionCommandeVinted(extensionBuild) {
  const t = String(extensionBuild ?? '').slice(0, 20);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t)) return null;
  return t >= GENERATION_VINTED_BUILD_MIN;
}

/** (18/10) Les noms de types d'étiquette que FillSell connaît (Vinted les écrit en toutes lettres). */
const TYPES_VINTED_CONNUS = Object.freeze(['printable', 'code', 'digital']);

export function actionCommande(c, lang = 'fr', generation = null, extensionVinted = null, bordereaux = true) {
  const fr = lang !== 'en';
  const pf = nomPlateforme(c?.platform);
  const url = lienCommande(c);
  const lien = (libelle, aide, ton = 'neutre') => ({ type: 'lien', libelle, aide, url, ton });
  const attente = (aide) => ({ type: 'attente', libelle: fr ? `Voir sur ${pf}` : `See on ${pf}`, aide, url, ton: 'neutre' });
  // (24/10 nuit, Nico) Les bordereaux : paliers Pro et Business seulement. Free et Premium (bêta comprise) : la commande
  // est suivie, sans aucun bouton ni aucune mention de bordereau.
  if (bordereaux === false) return attente(fr ? `FillSell suit cette commande ${pf}.` : `FillSell is tracking this ${pf} order.`);
  // (24/10 soir, décision 2 de Nico) Le bordereau depuis FillSell : VINTED seulement, pour tous les comptes. Leboncoin,
  // Beebs, Depop, eBay : un message court et clair, jamais un bouton qui échoue (la base répond « bientot » à toute
  // demande hors Vinted) ; le lien discret vers la plateforme reste.
  if (c?.platform && !PLATEFORMES_BORDEREAU_OUVERTES.includes(c.platform) && ['a_confirmer', 'a_expedier'].includes(c?.etat)) {
    return { type: 'bientot', libelle: fr ? 'Bientôt disponible' : 'Coming soon', url, ton: 'neutre',
      aide: fr ? `Bordereau ${pf} depuis FillSell : bientôt disponible.` : `${pf} labels from FillSell: coming soon.` };
  }
  if (PLATEFORMES_BORDEREAU.includes(c?.platform) && c?.etat === 'a_expedier' && c?.bordereau === 'pret') {
    return { type: 'bordereau', libelle: fr ? 'Récupérer le bordereau' : 'Fetch the label', ton: 'ok', url,
      aide: fr ? `Bordereau prêt sur ${pf} : FillSell le récupère par ton ordinateur et l’affiche ici, gardé 5 jours.` : `Label ready on ${pf}: FillSell fetches it through your computer and shows it here, kept 5 days.` };
  }
  if (attendGeneration(c)) {
    const o = c.options_bordereau ?? null;
    if (o && o.generable === false) return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, raisonNonGenerable(c, fr), 'ambre');
    if (generation === false) {
      return attente(fr ? 'La génération des bordereaux depuis FillSell est fermée pour le moment (bêta) : le bouton revient ici dès sa réouverture.' : 'Generating labels from FillSell is closed for now (beta): the button comes back here as soon as it reopens.');
    }
    // (18/10) Une extension d'avant la 0.6.126 commanderait l'étiquette sans son type :
    // Vinted échouerait. Le seul geste juste, pour CETTE commande : sur Vinted.
    if (c.platform === 'vinted' && extensionVinted === false) {
      return lien(fr ? 'Commander sur Vinted' : 'Order on Vinted', fr ? 'Ton extension FillSell se met à jour d’elle-même dans les prochains jours ; ensuite, FillSell commandera l’étiquette Vinted pour toi. Pour cette commande : commande l’étiquette sur Vinted, FillSell récupère le bordereau ici dès qu’il est prêt.' : 'Your FillSell extension updates itself in the coming days; then FillSell will order the Vinted label for you. For this order: order the label on Vinted, FillSell fetches it here as soon as it is ready.', 'ambre');
    }
    // (18/10) Vinted propose un type d'étiquette que FillSell ne connaît pas encore : jamais deviné.
    if (c.platform === 'vinted' && Array.isArray(o?.types_vinted) && o.types_vinted.some((t) => !TYPES_VINTED_CONNUS.includes(String(t)))) {
      return lien(fr ? 'Commander sur Vinted' : 'Order on Vinted', fr ? 'Vinted propose pour cette commande un type d’étiquette que FillSell ne connaît pas encore : commande-la sur Vinted, FillSell récupère le bordereau ici dès qu’il est prêt.' : 'Vinted offers a label type FillSell does not know yet for this order: order it on Vinted, FillSell fetches it here as soon as it is ready.', 'ambre');
    }
    const connus = c.platform === 'vinted' && Array.isArray(o?.types_etiquette) ? o.types_etiquette.map(Number).filter((t) => [1, 2, 3].includes(t)) : [];
    // Vinted, options pas encore relues : papier ou QR au choix ; l'extension
    // vérifie juste avant le geste que Vinted propose bien ce type (sinon : rien).
    const types = c.platform === 'vinted' ? (connus.length ? connus : [1, 3]) : [];
    const adresse = c.platform === 'leboncoin' && (o?.adresse_requise === true || LBC_TYPES_ADRESSE.includes(String(o?.type_envoi ?? '')));
    return { type: 'generer', libelle: fr ? 'Générer le bordereau' : 'Generate the label', ton: 'ambre', url,
      phrase: phraseEngagement(c.platform, lang, adresse ? 'adresse' : null), types, typesSupposes: c.platform === 'vinted' && !connus.length, adresse,
      aide: fr ? `FillSell fait le geste sur ${pf} par ton ordinateur, après ta confirmation, puis affiche le bordereau ici.` : `FillSell does it on ${pf} through your computer, after you confirm, then shows the label here.` };
  }
  switch (c?.platform) {
    case 'vinted':
      // (18/10) Vinted a dit « Échec du bordereau d'envoi » (envoi 210) : la vraie raison et le geste.
      if (c.etat === 'a_expedier' && c.bordereau === 'indisponible') return lien(fr ? 'Redemander sur Vinted' : 'Ask again on Vinted', fr ? 'Vinted a refusé d’émettre ce bordereau (« Échec du bordereau d’envoi »). Sur Vinted, ouvre la commande et redemande le bordereau : dès qu’il est prêt, FillSell le récupère ici.' : 'Vinted refused to issue this label (“Shipping label failed”). On Vinted, open the order and request the label again: once it is ready, FillSell fetches it here.', 'rouge');
      break;
    case 'leboncoin':
      if (c.etat === 'a_expedier' && c.bordereau === 'a_obtenir') return attente(fr ? 'Disponibilité confirmée : Leboncoin prépare le bordereau, il arrive ici dès qu’il est prêt.' : 'Availability confirmed: Leboncoin is preparing the label, it shows up here once ready.');
      // (18/10, lot 1.2) Leboncoin a signalé l'échec de l'étiquette : la vraie raison et le geste.
      if (c.etat === 'a_expedier' && c.bordereau === 'indisponible') return lien(fr ? 'Redemander sur Leboncoin' : 'Ask again on Leboncoin', fr ? 'Leboncoin n’a pas pu émettre ce bordereau. Ouvre la vente sur Leboncoin pour le redemander : dès qu’il est prêt, FillSell le récupère ici.' : 'Leboncoin could not issue this label. Open the sale on Leboncoin to request it again: once it is ready, FillSell fetches it here.', 'rouge');
      break;
    case 'beebs':
      if (c.etat === 'a_expedier' && c.bordereau === 'a_obtenir') return attente(fr ? 'Commande acceptée : Beebs prépare le bordereau, FillSell le cherche à chaque passage de ton ordinateur.' : 'Order accepted: Beebs is preparing the label, FillSell looks for it on each pass of your computer.');
      break;
    case 'ebay':
      // (16/10 nuit) L'achat d'étiquette eBay n'a pas d'API en France et les conditions d'eBay
      // interdisent de le faire par un procédé automatique — FillSell ne l'achète jamais (rapport § 10).
      if (c.etat === 'a_expedier') return lien(fr ? 'Acheter l’étiquette sur eBay' : 'Buy the label on eBay', fr ? 'L’étiquette eBay est payante et ses conditions interdisent de l’acheter par un outil : c’est le seul geste à faire sur eBay. Une fois achetée, son suivi s’affiche ici — n’en rachète pas une seconde.' : 'The eBay label is paid and its terms forbid buying it with a tool: it is the only step to do on eBay. Once bought, its tracking shows up here — do not buy a second one.', 'ambre');
      break;
    case 'depop':
      if (c.etat === 'a_expedier') return lien(fr ? 'Indiquer l’envoi sur Depop' : 'Mark shipped on Depop', fr ? 'Depop ne fournit pas de bordereau en France : expédie avec le transporteur de ton choix, puis indique l’envoi sur Depop. Tout ce que Depop donne (acheteur, date limite, suivi) est ici.' : 'Depop provides no label in France: ship with the carrier of your choice, then mark it shipped on Depop. Everything Depop gives (buyer, deadline, tracking) is here.');
      break;
    default: break;
  }
  if (c?.etat === 'inconnu') return attente(fr ? `État pas encore reconnu : FillSell le relit au prochain passage de ton ordinateur.` : `Status not recognised yet: FillSell reads it again on your computer’s next pass.`);
  return attente(fr ? `FillSell suit cette commande ${pf}.` : `FillSell is tracking this ${pf} order.`);
}

/** (17/10) Le numéro de suivi lisible d'une commande (eBay, Depop, Beebs), sinon null. */
export function suiviCommande(c, lang = 'fr') {
  const fr = lang !== 'en';
  if (!c?.envoi_ref || !['ebay', 'depop', 'beebs'].includes(c.platform)) return null;
  const t = libelleTransporteur(c.transporteur);
  return { numero: String(c.envoi_ref), transporteur: t, texte: `${fr ? 'Suivi' : 'Tracking'}${t ? ` ${t}` : ''} : ${c.envoi_ref}` };
}

/** (17/10) Les commandes expédiées depuis peu (3 jours), pour en montrer le suivi. */
export function expedieesRecentes(liste, maintenant = Date.now()) {
  return (liste ?? []).filter((c) => c?.etat === 'expediee' && Number.isFinite(Date.parse(c.maj_le ?? ''))
    && maintenant - Date.parse(c.maj_le) < 3 * 86400000)
    .sort((a, b) => Date.parse(b.maj_le) - Date.parse(a.maj_le));
}

/** (16/10 nuit) Les refus d'une génération, en clair : RIEN n'a été fait chez la plateforme. */
function motifGenerationEnClair(motif, pf, fr) {
  const m = String(motif ?? '');
  const table = {
    adresse_vinted_incomplete: fr ? 'Ton adresse d’expédition Vinted est incomplète : complète-la sur Vinted, puis génère à nouveau ici. Rien n’a été commandé.' : 'Your Vinted shipping address is incomplete: complete it on Vinted, then generate again here. Nothing was ordered.',
    adresse_vinted_absente: fr ? 'Vinted n’a pas d’adresse d’expédition pour toi : ajoute-la sur Vinted, puis génère à nouveau ici. Rien n’a été commandé.' : 'Vinted has no shipping address for you: add it on Vinted, then generate again here. Nothing was ordered.',
    telephone_vinted_requis: fr ? 'Vinted demande ton numéro de téléphone pour ce transporteur : ajoute-le sur Vinted, puis génère à nouveau ici.' : 'Vinted needs your phone number for this carrier: add it on Vinted, then generate again here.',
    enlevement_domicile_sur_vinted: fr ? 'Enlèvement à domicile : la date se choisit sur Vinted (FillSell ne choisit pas de date).' : 'Home pickup: the date is chosen on Vinted (FillSell does not pick dates).',
    date_a_choisir_sur_vinted: fr ? 'Ce transporteur demande une date : elle se choisit sur Vinted (FillSell ne choisit pas de date).' : 'This carrier needs a date: it is chosen on Vinted (FillSell does not pick dates).',
    type_etiquette_a_choisir: fr ? 'Vinted propose plusieurs types d’étiquette : génère à nouveau et choisis-en un. Rien n’a été commandé.' : 'Vinted offers several label types: generate again and pick one. Nothing was ordered.',
    type_etiquette_indisponible: fr ? 'Vinted ne propose pas ce type d’étiquette pour cette commande : rien n’a été commandé. Génère à nouveau et choisis l’autre type.' : 'Vinted does not offer this label type for this order: nothing was ordered. Generate again and pick the other type.',
    etiquette_echouee_chez_vinted: fr ? 'Vinted a refusé d’émettre l’étiquette demandée depuis FillSell : rien n’est en cours. Redemande-la sur Vinted, FillSell récupère ensuite le bordereau ici.' : 'Vinted refused to issue the label requested from FillSell: nothing is in progress. Request it again on Vinted, FillSell then fetches the label here.',
    extension_a_mettre_a_jour: fr ? 'Ton extension FillSell n’est pas encore à jour pour commander l’étiquette Vinted : rien n’a été commandé. Commande-la sur Vinted, FillSell récupère ensuite le bordereau ici.' : 'Your FillSell extension is not up to date yet to order the Vinted label: nothing was ordered. Order it on Vinted, FillSell then fetches the label here.',
    adresse_expediteur_a_completer: fr ? 'L’adresse de ton compte Leboncoin est incomplète (nom, adresse ou téléphone) : complète-la dans ton compte Leboncoin, puis génère à nouveau ici. Rien n’a été fait.' : 'Your Leboncoin account address is incomplete (name, address or phone): complete it in your Leboncoin account, then generate again here. Nothing was done.',
    confirmation_sur_leboncoin: fr ? 'Envoi libre ou remise en main propre : pas de bordereau à générer, confirme sur Leboncoin.' : 'Free shipping or hand delivery: no label to generate, confirm on Leboncoin.',
    remise_en_main_propre_sur_beebs: fr ? 'Remise en main propre : pas de bordereau, elle se gère dans l’app Beebs.' : 'Hand delivery: no label, it is handled in the Beebs app.',
    telephone_beebs_non_verifie: fr ? 'Beebs exige un numéro de téléphone vérifié pour générer le bordereau : vérifie-le sur Beebs, puis génère à nouveau ici.' : 'Beebs requires a verified phone number to generate the label: verify it on Beebs, then generate again here.',
    action_beebs_introuvable: fr ? 'Le bouton de Beebs a changé : FillSell ne l’a pas trouvé, rien n’a été fait. Réessaie plus tard ici.' : 'Beebs changed its button: FillSell could not find it, nothing was done. Try again later here.',
    beebs_refus: fr ? 'Beebs a refusé (vérification de paiement ou de téléphone ?) : rien n’a été fait. Réessaie plus tard ici.' : 'Beebs refused (payment or phone check?): nothing was done. Try again later here.',
    commande_annulee: fr ? `La commande a été annulée sur ${pf} : rien n’a été fait.` : `The order was cancelled on ${pf}: nothing was done.`,
    deja_expediee: fr ? `La commande est déjà expédiée sur ${pf} : rien n’a été fait.` : `The order is already shipped on ${pf}: nothing was done.`,
    plateforme_en_pause: fr ? `${pf} a freiné nos lectures : pause de sécurité, rien n’a été fait. Réessaie plus tard ici.` : `${pf} slowed our reads down: safety pause, nothing was done. Try again later here.`,
    // (24/10 soir, bordereau automatique) Deux commandes en cours pour le même article : rien n'est demandé seul.
    deux_commandes_meme_fiche: fr ? 'Deux commandes en cours pour le même article : FillSell n’a rien demandé tout seul. Choisis celle que tu honores, puis génère le bordereau ici.' : 'Two orders in progress for the same item: FillSell requested nothing on its own. Pick the one you fulfil, then generate the label here.',
  };
  if (table[m]) return table[m];
  // (18/10, lot 1.2) Une étiquette que la plateforme n'a pas pu émettre (Leboncoin…) : la vraie raison, le geste.
  if (/^etiquette_echouee_chez_/.test(m)) return fr ? `${pf} n’a pas pu émettre l’étiquette demandée depuis FillSell : rien n’est en cours. Ouvre la commande sur ${pf} pour la redemander ; FillSell récupère ensuite le bordereau ici.` : `${pf} could not issue the label requested from FillSell: nothing is in progress. Open the order on ${pf} to request it again; FillSell then fetches the label here.`;
  if (/^http_(403|429)$|captcha|blocage/.test(m)) return fr ? `${pf} a refusé : rien n’a été fait, pause de sécurité. Réessaie plus tard ici.` : `${pf} refused: nothing was done, safety pause. Try again later here.`;
  return fr ? `Le bordereau n’a pas pu être généré (rien n’a été fait sur ${pf}). Réessaie : le bouton est de nouveau là.` : `The label could not be generated (nothing was done on ${pf}). Retry: the button is back.`;
}

/** Ce que l'app dit d'une demande de bordereau (table bordereaux_demandes). */
export function etatDemandeBordereau(d, lang = 'fr', platform = null) {
  const fr = lang !== 'en';
  const pf = nomPlateforme(platform ?? d?.platform);
  // (17/10, migration 20261017100000) Une demande attend l'ordinateur 24 h (30 min avant).
  const attendOrdi = fr ? 'En attente de ton ordinateur (Chrome ouvert, extension active), 24 h au plus : rien n’est fait avant. Passé 24 h, rien n’est fait et le bouton revient ici.' : 'Waiting for your computer (Chrome open, extension on), 24 h at most: nothing is done before. After 24 h, nothing is done and the button comes back here.';
  // Garde-fou du geste : l'extension relit la commande juste avant (decisionGeneration).
  const relitAvant = fr ? `Juste avant, il relit la commande sur ${pf} : annulée ou déjà traitée entre-temps, rien n’est fait.` : `Right before, it reads the order again on ${pf}: cancelled or already handled in the meantime, nothing is done.`;
  // (24/10 soir, décision 1 de Nico) Bordereau AUTOMATIQUE dès la vente (choix.auto, migration 20261024235000) :
  // un état simple et court tant qu'il se prépare — jamais un paragraphe. Un échec dit son motif réel, et le bouton
  // manuel revient (la demande close ne retient plus rien).
  const preparation = { ton: 'neutre', attente: true, texte: fr ? 'Bordereau en préparation' : 'Label being prepared' };
  // (29/10, point 6) Une demande AUTOMATIQUE close parce que le vendeur a coupé le bordereau automatique (motif
  // « auto_desactive », bordereau_demande_a_traiter) : rien n'a été fait, rien à dire — le bouton manuel revient.
  if (d?.choix?.auto === true && d.statut === 'expiree' && d.motif === 'auto_desactive') return null;
  if (d?.choix?.auto === true && (d.statut === 'demandee' || d.statut === 'en_cours'
    || (d.action === 'generer' && d.statut === 'generee' && d.motif !== 'fichier_sur_beebs' && Number(d.essais_fichier) < 15))) {
    return preparation;
  }
  if (d?.action === 'generer') {
    switch (d.statut) {
      case 'demandee': return { ton: 'neutre', attente: true, texte: fr ? `Génération demandée. ${attendOrdi} ${relitAvant}` : `Generation requested. ${attendOrdi} ${relitAvant}` };
      case 'en_cours': return { ton: 'neutre', attente: true, texte: fr ? `Génération en cours sur ${pf}…` : `Generating on ${pf}…` };
      case 'generee': {
        if (d.motif === 'fichier_sur_beebs') return { ton: 'ambre', attente: false, texte: fr ? 'Bordereau généré sur Beebs, mais le site de Beebs ne donne pas encore le fichier : FillSell le cherche à chaque passage de ton ordinateur.' : 'Label generated on Beebs, but the Beebs site does not give the file yet: FillSell looks for it on each pass of your computer.' };
        if (Number(d.essais_fichier) >= 15) return { ton: 'ambre', attente: false, texte: fr ? `Bordereau généré sur ${pf}, mais le fichier reste introuvable après 15 essais : en dernier recours, ouvre la commande sur ${pf}.` : `Label generated on ${pf}, but the file is still missing after 15 tries: as a last resort, open the order on ${pf}.` };
        // (18/10) Le geste est parti, la plateforme crée l'étiquette : jamais « généré » avant qu'elle le dise.
        return { ton: 'ok', attente: true, texte: fr ? `Demande faite sur ${pf} : ${pf} crée l’étiquette, FillSell récupère le fichier…` : `Request made on ${pf}: ${pf} is creating the label, FillSell is fetching the file…` };
      }
      case 'prete': return { ton: 'ok', attente: false, texte: fr ? 'Bordereau généré et récupéré.' : 'Label generated and fetched.' };
      case 'incertaine': return { ton: 'rouge', attente: false, texte: fr ? `On ne sait pas si ${pf} a reçu la demande (coupure pendant l’envoi). Vérifie la commande sur ${pf} avant tout autre geste : FillSell ne la refera jamais.` : `We do not know whether ${pf} received the request (cut during sending). Check the order on ${pf} before anything else: FillSell will never redo it.` };
      case 'expiree': return { ton: 'ambre', attente: false, texte: fr ? 'Ton ordinateur n’a pas pris la demande dans les 24 h (éteint, ou Chrome fermé) : rien n’a été fait. Le bouton est de nouveau là : réessaie quand il est allumé.' : 'Your computer did not take the request within 24 h (off, or Chrome closed): nothing was done. The button is back: try again when it is on.' };
      case 'echec': return { ton: 'ambre', attente: false, texte: motifGenerationEnClair(d.motif, pf, fr) };
      default: return null;
    }
  }
  switch (d?.statut) {
    case 'demandee': return { ton: 'neutre', attente: true, texte: fr ? `Demande envoyée. ${attendOrdi}` : `Request sent. ${attendOrdi}` };
    case 'en_cours': return { ton: 'neutre', attente: true, texte: fr ? 'Récupération du bordereau en cours…' : 'Fetching the label…' };
    case 'prete': return { ton: 'ok', attente: false, texte: fr ? 'Bordereau récupéré.' : 'Label fetched.' };
    case 'expiree': return { ton: 'ambre', attente: false, texte: fr ? 'Ton ordinateur n’a pas pris la demande dans les 24 h (éteint, ou Chrome fermé) : rien n’a été fait. Réessaie ici quand il est allumé.' : 'Your computer did not take the request within 24 h (off, or Chrome closed): nothing was done. Try again here when it is on.' };
    case 'echec': {
      const m = String(d.motif ?? '');
      if (m === 'fichier_sur_beebs') return { ton: 'ambre', attente: false, texte: fr ? 'Le site de Beebs ne donne pas encore le fichier de ce bordereau : FillSell réessaie à chaque demande. En dernier recours, ouvre la commande sur Beebs.' : 'The Beebs site does not give this label file yet: FillSell retries on each request. As a last resort, open the order on Beebs.' };
      if (/a_obtenir|disponibilite|pas_pret|statut/.test(m)) return { ton: 'ambre', attente: false, texte: fr ? 'Le bordereau n’est plus prêt chez la plateforme : FillSell relit la commande au prochain passage.' : 'The label is no longer ready on the platform: FillSell reads the order again on the next pass.' };
      if (/http_40[13]|http_429|captcha|pause/.test(m)) return { ton: 'rouge', attente: false, texte: fr ? 'La plateforme a refusé la lecture : rien n’a été fait, pause de sécurité. Réessaie plus tard ici.' : 'The platform refused the read: nothing was done, safety pause. Try again later here.' };
      return { ton: 'rouge', attente: false, texte: fr ? 'Le bordereau n’a pas pu être récupéré (rien n’a été fait chez la plateforme). Réessaie ici.' : 'The label could not be fetched (nothing was done on the platform). Try again here.' };
    }
    default: return null;
  }
}

/** Le refus de bordereau_demander / bordereau_generer, en clair. */
export function refusDemandeBordereau(refuse, lang = 'fr') {
  const fr = lang !== 'en';
  switch (refuse) {
    case 'pas_a_generer': return fr ? 'Cette commande n’attend plus ce geste : FillSell la relit au prochain passage.' : 'This order no longer waits for that step: FillSell reads it again on the next pass.';
    case 'engagement':
    case 'choix': return fr ? 'Demande incomplète : rouvre l’écran de confirmation et réessaie.' : 'Incomplete request: reopen the confirmation screen and retry.';
    case 'ferme': return fr ? 'La génération des bordereaux est fermée pour le moment (bêta) : rien n’a été fait.' : 'Label generation is closed for now (beta): nothing was done.';
    case 'pas_pret': return fr ? 'Le bordereau n’est pas (ou plus) prêt chez la plateforme.' : 'The label is not (or no longer) ready on the platform.';
    case 'plafond_jour': return fr ? '20 demandes par jour au plus pendant la bêta.' : '20 requests a day at most during the beta.';
    case 'plateforme': return fr ? 'Cette plateforme ne permet pas de récupérer le bordereau depuis FillSell.' : 'This platform does not let FillSell fetch the label.';
    case 'beta': return fr ? 'Réservé à la bêta.' : 'Beta only.';
    default: return fr ? 'Demande impossible pour le moment.' : 'Request not possible right now.';
  }
}

/**
 * Le MUR d'un relevé (messagerie_releves.dernier_motif / pause_jusqu_au) :
 * ce qui empêche FillSell de lire une plateforme, dit en clair, avec le geste
 * à faire. null = rien à dire (relevé normal, ou incident passager).
 */
export function murReleve(r, lang = 'fr', maintenant = Date.now()) {
  if (!r?.platform) return null;
  const fr = lang !== 'en';
  const pf = nomPlateforme(r.platform);
  const motif = String(r.dernier_motif ?? '');
  const pause = Date.parse(r.pause_jusqu_au ?? '');
  if (Number.isFinite(pause) && pause > maintenant) {
    return { cle: 'pause', ton: 'ambre', titre: fr ? `${pf} : pause de sécurité` : `${pf}: safety pause`,
      texte: fr ? `${pf} a freiné nos lectures : FillSell a mis en pause ses lectures sur ${pf}, pour protéger ton compte. Rien n’a été fait ; elles reprendront seules.` : `${pf} slowed our reads down: FillSell paused its reads on ${pf} to protect your account. Nothing was done; they will resume on their own.`,
      action: null };
  }
  if (!motif) return null;
  if (r.platform === 'beebs' && motif === 'telephone_non_verifie') {
    return { cle: 'telephone', ton: 'ambre', titre: fr ? 'Vérifie ton numéro sur Beebs' : 'Verify your phone number on Beebs',
      texte: fr ? 'Beebs ne montre ses messages et ses bordereaux qu’aux comptes dont le numéro de téléphone est vérifié. Vérifie-le sur Beebs : tes messages arriveront ici au relevé suivant.' : 'Beebs only shows messages and labels to accounts with a verified phone number. Verify it on Beebs: your messages will show up here on the next read.',
      action: { libelle: fr ? 'Vérifier sur Beebs' : 'Verify on Beebs', url: 'https://www.beebs.app/fr/account/phone-verification' } };
  }
  if (r.platform === 'ebay' && /^jeton_/.test(motif)) {
    return { cle: 'connexion', ton: 'ambre', titre: fr ? 'Reconnecte ton compte eBay' : 'Reconnect your eBay account',
      texte: fr ? 'FillSell n’a plus accès à ton compte eBay : reconnecte-le dans Réglages › Plateformes.' : 'FillSell lost access to your eBay account: reconnect it in Settings › Platforms.', action: null };
  }
  if (motif === 'depop_acces') {
    return { cle: 'acces', ton: 'neutre', titre: fr ? 'Autorise Depop dans ton extension' : 'Allow Depop in your extension',
      texte: fr ? 'Depop n’est pas encore autorisé dans ton extension FillSell : ouvre l’extension sur ton ordinateur et autorise Depop.' : 'Depop is not allowed yet in your FillSell extension: open the extension on your computer and allow Depop.', action: null };
  }
  // Un 401 seul n'est PAS un mur : le jeton d'accès Vinted vit 1 h et la page le
  // renouvelle (vu le 16/10 à 19:02, reparti seul au passage suivant).
  if (/^(session_absente|session|jeton_absent)$/.test(motif)) {
    const accueil = { vinted: 'https://www.vinted.fr/', leboncoin: 'https://www.leboncoin.fr/', beebs: 'https://www.beebs.app/fr', depop: 'https://www.depop.com/' }[r.platform] ?? null;
    return { cle: 'connexion', ton: 'ambre', titre: fr ? `Connecte-toi à ${pf} dans Chrome` : `Sign in to ${pf} in Chrome`,
      texte: fr ? `Ton extension ne voit plus ta session ${pf} sur ton ordinateur : ouvre ${pf} dans Chrome et connecte-toi. Rien n’est perdu.` : `Your extension no longer sees your ${pf} session on your computer: open ${pf} in Chrome and sign in. Nothing is lost.`,
      action: accueil ? { libelle: fr ? `Ouvrir ${pf}` : `Open ${pf}`, url: accueil } : null };
  }
  return null;
}
