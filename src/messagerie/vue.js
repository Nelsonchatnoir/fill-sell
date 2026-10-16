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
 */
export function phraseEngagement(platform, lang = 'fr') {
  const fr = lang !== 'en';
  switch (platform) {
    case 'vinted': return fr ? 'Commander l’étiquette engage l’envoi : Vinted attend ton colis au point relais avant la date limite qu’il fixe.' : 'Ordering the label commits you to ship: Vinted expects your parcel at the drop-off point before the deadline it sets.';
    case 'leboncoin': return fr ? 'Confirmer la disponibilité valide la vente : Leboncoin crée le bordereau et attend ton colis dans le délai qu’il fixe.' : 'Confirming availability validates the sale: Leboncoin creates the label and expects your parcel within the time it sets.';
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

/** Pourquoi une génération n'est pas faisable depuis FillSell (options relevées). */
function raisonNonGenerable(c, fr) {
  const o = c?.options_bordereau ?? {};
  const pf = nomPlateforme(c?.platform);
  if (c?.platform === 'vinted') {
    if (o.domicile_seul) return fr ? 'Cette commande demande un enlèvement à domicile (date à choisir) : commande l’étiquette sur Vinted.' : 'This order needs a home pickup (date to choose): order the label on Vinted.';
    if (o.telephone_manquant) return fr ? 'Vinted demande ton numéro de téléphone pour ce transporteur : commande l’étiquette sur Vinted.' : 'Vinted needs your phone number for this carrier: order the label on Vinted.';
  }
  if (c?.platform === 'leboncoin') return fr ? 'Ce mode d’envoi demande ton adresse et ton mode de dépôt : confirme sur Leboncoin.' : 'This shipping method needs your address and drop-off choice: confirm on Leboncoin.';
  if (c?.platform === 'beebs') return fr ? 'Remise en main propre : elle se gère dans l’app Beebs.' : 'Hand delivery: it is handled in the Beebs app.';
  return fr ? `À faire sur ${pf}.` : `To do on ${pf}.`;
}

/**
 * L'action d'une commande dans « À expédier ».
 *   type 'bordereau' : le bouton actif (bordereau prêt chez la plateforme) ;
 *   type 'generer'   : (16/10 nuit) « Générer le bordereau » — un appui, PUIS
 *                      l'écran de confirmation (phrase d'engagement) ; seul
 *                      le second appui dépose la demande (bordereau_generer) ;
 *   type 'lien'      : ouvrir la bonne page de la plateforme, avec ce que la
 *                      personne y fait elle-même.
 * `generation` : la génération est ouverte (messagerie_compteurs).
 */
export function actionCommande(c, lang = 'fr', generation = false) {
  const fr = lang !== 'en';
  const pf = nomPlateforme(c?.platform);
  const url = lienCommande(c);
  const lien = (libelle, aide, ton = 'neutre') => ({ type: 'lien', libelle, aide, url, ton });
  if (PLATEFORMES_BORDEREAU.includes(c?.platform) && c?.etat === 'a_expedier' && c?.bordereau === 'pret') {
    return { type: 'bordereau', libelle: fr ? 'Récupérer le bordereau' : 'Fetch the label', ton: 'ok', url,
      aide: fr ? `Bordereau prêt sur ${pf} : FillSell le récupère par ton ordinateur et l’affiche ici, gardé 5 jours.` : `Label ready on ${pf}: FillSell fetches it through your computer and shows it here, kept 5 days.` };
  }
  if (generation && attendGeneration(c)) {
    const o = c.options_bordereau;
    if (o && o.generable === true) {
      const types = c.platform === 'vinted' && Array.isArray(o.types_etiquette) ? o.types_etiquette.map(Number).filter((t) => [1, 2, 3].includes(t)) : [];
      return { type: 'generer', libelle: fr ? 'Générer le bordereau' : 'Generate the label', ton: 'ambre', url,
        phrase: phraseEngagement(c.platform, lang), types,
        aide: fr ? `FillSell fait le geste sur ${pf} par ton ordinateur, après ta confirmation, puis affiche le bordereau ici.` : `FillSell does it on ${pf} through your computer, after you confirm, then shows the label here.` };
    }
    if (o && o.generable === false) return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, raisonNonGenerable(c, fr), 'ambre');
    return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, fr ? `FillSell lit les options de cette commande au prochain passage de ton ordinateur. En attendant, tu peux le faire sur ${pf}.` : `FillSell reads this order’s options on your computer’s next pass. Meanwhile, you can do it on ${pf}.`, 'ambre');
  }
  switch (c?.platform) {
    case 'vinted':
      if (c.bordereau === 'a_obtenir') return lien(fr ? 'Commander sur Vinted' : 'Order on Vinted', fr ? 'Vinted attend que tu commandes l’étiquette (dépôt, point relais…) : c’est toi qui le fais, sur Vinted. Le bordereau arrive ensuite ici.' : 'Vinted is waiting for you to order the label (drop-off, relay point…): you do it on Vinted. The label then shows up here.', 'ambre');
      if (c.bordereau === 'indisponible') return lien(fr ? 'Voir sur Vinted' : 'See on Vinted', fr ? 'Vinted n’a pas pu créer le bordereau : vois la commande sur Vinted.' : 'Vinted could not create the label: check the order on Vinted.', 'rouge');
      break;
    case 'leboncoin':
      if (c.etat === 'a_confirmer') return lien(fr ? 'Confirmer sur Leboncoin' : 'Confirm on Leboncoin', fr ? 'Confirme la disponibilité sur Leboncoin : c’est ce geste qui crée le bordereau. FillSell ne le fait jamais à ta place.' : 'Confirm availability on Leboncoin: that creates the label. FillSell never does it for you.', 'ambre');
      if (c.bordereau === 'a_obtenir') return lien(fr ? 'Voir sur Leboncoin' : 'See on Leboncoin', fr ? 'Leboncoin prépare le bordereau : il apparaîtra ici dès qu’il est prêt.' : 'Leboncoin is preparing the label: it will show up here once ready.');
      break;
    case 'beebs':
      if (c.etat === 'a_confirmer') return lien(fr ? 'Accepter sur Beebs' : 'Accept on Beebs', fr ? 'Sur Beebs, générer le bordereau = accepter la commande (l’acheteur est débité) ; Beebs laisse 48 h pour le faire. C’est toi qui le fais, sur Beebs.' : 'On Beebs, generating the label = accepting the order (the buyer is charged); Beebs gives 48 h to do it. You do it on Beebs.', 'ambre'); // estimation-ok: délai IMPOSÉ par Beebs (centre d'aide 360018436119)
      if (c.bordereau === 'pret') return lien(fr ? 'Télécharger sur Beebs' : 'Download on Beebs', fr ? 'Bordereau prêt sur Beebs : télécharge-le sur Beebs (téléphone vérifié), puis dépose le colis avant la date limite.' : 'Label ready on Beebs: download it on Beebs (verified phone), then drop the parcel before the deadline.');
      if (c.bordereau === 'a_obtenir') return lien(fr ? 'Voir sur Beebs' : 'See on Beebs', fr ? 'Beebs prépare le bordereau.' : 'Beebs is preparing the label.');
      break;
    case 'ebay':
      // (16/10 nuit) Étude : l'achat d'étiquette eBay n'a pas d'API en France et les conditions d'eBay
      // interdisent de le faire par un procédé automatique — FillSell ne l'achète jamais (rapport § 10).
      if (c.etat === 'a_expedier') return lien(fr ? 'Étiquette sur eBay' : 'Label on eBay', fr ? 'eBay vend l’étiquette (Mondial Relay, Colissimo, Lettre suivie) dans la page de la commande : achète-la sur eBay — ses conditions interdisent de le faire par un outil automatique. Déjà achetée ? Elle est dans « Bordereaux d’envoi » sur eBay : n’en rachète pas une seconde.' : 'eBay sells the label (Mondial Relay, Colissimo, tracked letter) on the order page: buy it on eBay — its terms forbid doing it with an automated tool. Already bought? It is under “Shipping labels” on eBay: do not buy a second one.');
      break;
    case 'depop':
      if (c.etat === 'a_expedier') return lien(fr ? 'Voir sur Depop' : 'See on Depop', fr ? 'Depop ne fournit pas de bordereau en France : expédie avec le transporteur de ton choix, puis indique l’envoi sur Depop.' : 'Depop provides no label in France: ship with the carrier of your choice, then mark it shipped on Depop.');
      break;
    default: break;
  }
  if (c?.etat === 'inconnu') return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, fr ? `État à vérifier sur ${pf}.` : `Check the status on ${pf}.`);
  return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, fr ? `Vois la commande sur ${pf}.` : `See the order on ${pf}.`);
}

/** (16/10 nuit) Les refus d'une génération, en clair : RIEN n'a été fait chez la plateforme. */
function motifGenerationEnClair(motif, pf, fr) {
  const m = String(motif ?? '');
  const table = {
    adresse_vinted_incomplete: fr ? 'Ton adresse d’expédition Vinted est incomplète : complète-la sur Vinted, puis réessaie.' : 'Your Vinted shipping address is incomplete: complete it on Vinted, then retry.',
    adresse_vinted_absente: fr ? 'Vinted n’a pas d’adresse d’expédition pour toi : ajoute-la sur Vinted, puis réessaie.' : 'Vinted has no shipping address for you: add it on Vinted, then retry.',
    telephone_vinted_requis: fr ? 'Vinted demande ton numéro de téléphone pour ce transporteur : commande l’étiquette sur Vinted.' : 'Vinted needs your phone number for this carrier: order the label on Vinted.',
    enlevement_domicile_sur_vinted: fr ? 'Enlèvement à domicile : la date se choisit sur Vinted.' : 'Home pickup: the date is chosen on Vinted.',
    date_a_choisir_sur_vinted: fr ? 'Ce transporteur demande une date : commande l’étiquette sur Vinted.' : 'This carrier needs a date: order the label on Vinted.',
    type_etiquette_a_choisir: fr ? 'Vinted propose plusieurs types d’étiquette : choisis-en un, puis réessaie.' : 'Vinted offers several label types: pick one, then retry.',
    etiquette_echouee_chez_vinted: fr ? 'Vinted n’a pas pu créer l’étiquette : vois la commande sur Vinted.' : 'Vinted could not create the label: check the order on Vinted.',
    confirmation_sur_leboncoin: fr ? 'Ce mode d’envoi demande ton adresse et ton mode de dépôt : confirme sur Leboncoin.' : 'This shipping method needs your address and drop-off choice: confirm on Leboncoin.',
    remise_en_main_propre_sur_beebs: fr ? 'Remise en main propre : elle se gère dans l’app Beebs.' : 'Hand delivery: it is handled in the Beebs app.',
    telephone_beebs_non_verifie: fr ? 'Beebs exige un numéro de téléphone vérifié pour générer le bordereau : vérifie-le sur Beebs.' : 'Beebs requires a verified phone number to generate the label: verify it on Beebs.',
    action_beebs_introuvable: fr ? 'Le bouton de Beebs a changé : FillSell ne l’a pas trouvé. Fais-le sur Beebs (rien n’a été fait).' : 'Beebs changed its button: FillSell could not find it. Do it on Beebs (nothing was done).',
    beebs_refus: fr ? 'Beebs a refusé (vérification de paiement ou de téléphone ?) : fais-le sur Beebs.' : 'Beebs refused (payment or phone check?): do it on Beebs.',
    commande_annulee: fr ? 'La commande est annulée.' : 'The order is cancelled.',
    deja_expediee: fr ? 'La commande est déjà expédiée.' : 'The order is already shipped.',
    plateforme_en_pause: fr ? `${pf} a freiné nos lectures : pause de sécurité. Fais-le sur ${pf}.` : `${pf} slowed our reads down: safety pause. Do it on ${pf}.`,
  };
  if (table[m]) return table[m];
  if (/^http_(403|429)$|captcha|blocage/.test(m)) return fr ? `${pf} a refusé : rien n’a été fait, pause de sécurité. Fais-le sur ${pf}.` : `${pf} refused: nothing was done, safety pause. Do it on ${pf}.`;
  return fr ? `Le bordereau n’a pas pu être généré (rien n’a été fait sur ${pf}). Réessaie, ou fais-le sur ${pf}.` : `The label could not be generated (nothing was done on ${pf}). Retry, or do it on ${pf}.`;
}

/** Ce que l'app dit d'une demande de bordereau (table bordereaux_demandes). */
export function etatDemandeBordereau(d, lang = 'fr', platform = null) {
  const fr = lang !== 'en';
  const pf = nomPlateforme(platform ?? d?.platform);
  if (d?.action === 'generer') {
    switch (d.statut) {
      case 'demandee': return { ton: 'neutre', attente: true, texte: fr ? `Génération demandée : ton ordinateur la fait sur ${pf} à son prochain passage (Chrome ouvert, extension active).` : `Generation requested: your computer does it on ${pf} on its next pass (Chrome open, extension on).` };
      case 'en_cours': return { ton: 'neutre', attente: true, texte: fr ? `Génération en cours sur ${pf}…` : `Generating on ${pf}…` };
      case 'generee': {
        if (d.motif === 'fichier_sur_beebs') return { ton: 'ambre', attente: false, texte: fr ? 'Bordereau généré sur Beebs : télécharge-le sur Beebs (FillSell ne trouve pas encore le fichier).' : 'Label generated on Beebs: download it on Beebs (FillSell cannot find the file yet).' };
        if (Number(d.essais_fichier) >= 15) return { ton: 'ambre', attente: false, texte: fr ? `Bordereau généré sur ${pf}, fichier pas encore récupéré : récupère-le sur ${pf}.` : `Label generated on ${pf}, file not fetched yet: get it on ${pf}.` };
        return { ton: 'ok', attente: true, texte: fr ? `Bordereau généré sur ${pf} : récupération du fichier…` : `Label generated on ${pf}: fetching the file…` };
      }
      case 'prete': return { ton: 'ok', attente: false, texte: fr ? 'Bordereau généré et récupéré.' : 'Label generated and fetched.' };
      case 'incertaine': return { ton: 'rouge', attente: false, texte: fr ? `On ne sait pas si ${pf} a reçu la demande (coupure pendant l’envoi). Vérifie la commande sur ${pf} avant tout autre geste : FillSell ne la refera jamais.` : `We do not know whether ${pf} received the request (cut during sending). Check the order on ${pf} before anything else: FillSell will never redo it.` };
      case 'expiree': return { ton: 'ambre', attente: false, texte: fr ? 'Ton ordinateur n’a pas répondu (éteint, ou Chrome fermé) : rien n’a été fait. Réessaie quand il est allumé.' : 'Your computer did not answer (off, or Chrome closed): nothing was done. Try again when it is on.' };
      case 'echec': return { ton: 'ambre', attente: false, texte: motifGenerationEnClair(d.motif, pf, fr) };
      default: return null;
    }
  }
  switch (d?.statut) {
    case 'demandee': return { ton: 'neutre', attente: true, texte: fr ? 'Demande envoyée : ton ordinateur récupère le bordereau à son prochain passage (Chrome ouvert, extension active).' : 'Request sent: your computer fetches the label on its next pass (Chrome open, extension on).' };
    case 'en_cours': return { ton: 'neutre', attente: true, texte: fr ? 'Récupération du bordereau en cours…' : 'Fetching the label…' };
    case 'prete': return { ton: 'ok', attente: false, texte: fr ? 'Bordereau récupéré.' : 'Label fetched.' };
    case 'expiree': return { ton: 'ambre', attente: false, texte: fr ? 'Ton ordinateur n’a pas répondu (éteint, ou Chrome fermé) : la demande est abandonnée, rien n’a été fait. Réessaie quand il est allumé.' : 'Your computer did not answer (off, or Chrome closed): the request was dropped, nothing was done. Try again when it is on.' };
    case 'echec': {
      const m = String(d.motif ?? '');
      if (m === 'fichier_sur_beebs') return { ton: 'ambre', attente: false, texte: fr ? 'Beebs ne laisse pas encore FillSell lire ce fichier : télécharge le bordereau sur Beebs.' : 'Beebs does not let FillSell read this file yet: download the label on Beebs.' };
      if (/a_obtenir|disponibilite|pas_pret|statut/.test(m)) return { ton: 'ambre', attente: false, texte: fr ? 'Le bordereau n’est plus prêt chez la plateforme : vois la commande sur la plateforme.' : 'The label is no longer ready on the platform: check the order there.' };
      if (/http_40[13]|http_429|captcha|pause/.test(m)) return { ton: 'rouge', attente: false, texte: fr ? 'La plateforme a refusé la lecture : rien n’a été fait, pause de sécurité. Récupère le bordereau sur la plateforme.' : 'The platform refused the read: nothing was done, safety pause. Get the label on the platform.' };
      return { ton: 'rouge', attente: false, texte: fr ? 'Le bordereau n’a pas pu être récupéré (rien n’a été fait chez la plateforme). Réessaie, ou récupère-le sur la plateforme.' : 'The label could not be fetched (nothing was done on the platform). Try again, or get it on the platform.' };
    }
    default: return null;
  }
}

/** Le refus de bordereau_demander / bordereau_generer, en clair. */
export function refusDemandeBordereau(refuse, lang = 'fr') {
  const fr = lang !== 'en';
  switch (refuse) {
    case 'pas_a_generer': return fr ? 'Cette commande n’attend plus ce geste : vois-la sur la plateforme.' : 'This order no longer waits for that step: check it on the platform.';
    case 'engagement':
    case 'choix': return fr ? 'Demande incomplète : rouvre l’écran de confirmation et réessaie.' : 'Incomplete request: reopen the confirmation screen and retry.';
    case 'ferme': return fr ? 'La récupération des bordereaux est fermée pour le moment.' : 'Label fetching is closed for now.';
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
