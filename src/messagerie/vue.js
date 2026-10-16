// ═══════════════════════════════════════════════════════════════════════════
// BÊTA MESSAGES + BORDEREAUX — CE QUE L'ÉCRAN AFFICHE (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES (testées : scripts/messagerie-app-selftest.mjs). Les écrans
// de src/messagerie/ ne décident de rien d'autre : libellés, tri, états des
// réponses et des commandes, action de chaque commande, murs des relevés.
// (16/10 soir, clôture du chantier) Le bouton « Bordereau » est ACTIF pour
// Vinted et Leboncoin quand le bordereau est prêt chez la plateforme : un clic
// dépose une demande (bordereau_demander), l'ordinateur de la personne le
// récupère. Tout geste qui ENGAGE (commander l'étiquette, confirmer la
// disponibilité, accepter la commande, acheter l'étiquette) reste sur la
// plateforme : l'app ouvre la bonne page, jamais plus.

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
      return { ton: 'ambre', texte: fr ? 'Enregistrée, non envoyée : l’envoi est verrouillé pendant la bêta (conversation hors liste blanche).' : 'Saved, not sent: sending is locked during the beta (conversation not whitelisted).' };
    case 'en_attente': return { ton: 'neutre', texte: fr ? 'En attente : ton extension l’enverra à son prochain passage, ordinateur allumé.' : 'Waiting: your extension will send it on its next pass, computer on.' };
    case 'en_cours': return { ton: 'neutre', texte: fr ? 'Envoi en cours…' : 'Sending…' };
    case 'envoyee': return { ton: 'ok', texte: fr ? 'Envoyée.' : 'Sent.' };
    case 'echec': return { ton: 'rouge', texte: fr ? 'Non envoyée (rien n’est parti). Réécris-la depuis la plateforme si besoin.' : 'Not sent (nothing went out). Write it on the platform if needed.' };
    case 'annulee': return { ton: 'neutre', texte: fr ? 'Annulée.' : 'Cancelled.' };
    default: return { ton: 'neutre', texte: '' };
  }
}

/** L'état de la zone de réponse d'une conversation (verrou de la bêta compris). */
export function etatZoneReponse(conv, enListeBlanche, lang = 'fr') {
  const fr = lang !== 'en';
  if (conv?.systeme) return { possible: false, ton: 'neutre', texte: fr ? 'Message de la plateforme : pas de réponse possible.' : 'Message from the platform: no reply possible.' };
  if (conv?.reponse_possible === false) return { possible: false, ton: 'neutre', texte: fr ? `${nomPlateforme(conv.platform)} ne permet pas de répondre à cette conversation.` : `${nomPlateforme(conv?.platform)} does not allow replies here.` };
  if (!enListeBlanche) return { possible: true, verrouillee: true, ton: 'ambre', texte: fr ? 'Envoi verrouillé pendant la bêta : ta réponse est enregistrée, elle ne part que si cette conversation est dans la liste blanche.' : 'Sending is locked during the beta: your reply is saved and only goes out if this conversation is whitelisted.' };
  return { possible: true, verrouillee: false, ton: 'ok', texte: fr ? `Envoi actif : ta réponse part par ton extension, sur ${nomPlateforme(conv?.platform)}, une seule fois.` : `Sending on: your reply goes out through your extension, on ${nomPlateforme(conv?.platform)}, once.` };
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
export const PLATEFORMES_BORDEREAU = Object.freeze(['vinted', 'leboncoin']);

/**
 * L'action d'une commande dans « À expédier ».
 *   type 'bordereau' : le bouton actif (Vinted, Leboncoin, bordereau prêt) ;
 *   type 'lien'      : ouvrir la bonne page de la plateforme, avec ce que la
 *                      personne y fait elle-même (FillSell ne le fait jamais).
 */
export function actionCommande(c, lang = 'fr') {
  const fr = lang !== 'en';
  const pf = nomPlateforme(c?.platform);
  const url = lienCommande(c);
  const lien = (libelle, aide, ton = 'neutre') => ({ type: 'lien', libelle, aide, url, ton });
  if (PLATEFORMES_BORDEREAU.includes(c?.platform) && c?.etat === 'a_expedier' && c?.bordereau === 'pret') {
    return { type: 'bordereau', libelle: fr ? 'Bordereau' : 'Label', ton: 'ok', url,
      aide: fr ? `Bordereau prêt sur ${pf} : FillSell le récupère par ton ordinateur et l’affiche ici, gardé 5 jours.` : `Label ready on ${pf}: FillSell fetches it through your computer and shows it here, kept 5 days.` };
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
      if (c.etat === 'a_expedier') return lien(fr ? 'Étiquette sur eBay' : 'Label on eBay', fr ? 'En France, l’étiquette eBay s’achète dans eBay (aucune app ne peut le faire) : fais-le sur eBay.' : 'In France, eBay labels are bought in eBay (no app can do it): do it on eBay.');
      break;
    case 'depop':
      if (c.etat === 'a_expedier') return lien(fr ? 'Voir sur Depop' : 'See on Depop', fr ? 'Depop ne fournit pas de bordereau en France : expédie avec le transporteur de ton choix, puis indique l’envoi sur Depop.' : 'Depop provides no label in France: ship with the carrier of your choice, then mark it shipped on Depop.');
      break;
    default: break;
  }
  if (c?.etat === 'inconnu') return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, fr ? `État à vérifier sur ${pf}.` : `Check the status on ${pf}.`);
  return lien(fr ? `Voir sur ${pf}` : `See on ${pf}`, fr ? `Vois la commande sur ${pf}.` : `See the order on ${pf}.`);
}

/** Ce que l'app dit d'une demande de bordereau (table bordereaux_demandes). */
export function etatDemandeBordereau(d, lang = 'fr') {
  const fr = lang !== 'en';
  switch (d?.statut) {
    case 'demandee': return { ton: 'neutre', attente: true, texte: fr ? 'Demande envoyée : ton ordinateur récupère le bordereau à son prochain passage (Chrome ouvert, extension active).' : 'Request sent: your computer fetches the label on its next pass (Chrome open, extension on).' };
    case 'en_cours': return { ton: 'neutre', attente: true, texte: fr ? 'Récupération du bordereau en cours…' : 'Fetching the label…' };
    case 'prete': return { ton: 'ok', attente: false, texte: fr ? 'Bordereau récupéré.' : 'Label fetched.' };
    case 'expiree': return { ton: 'ambre', attente: false, texte: fr ? 'Ton ordinateur n’a pas répondu (éteint, ou Chrome fermé) : la demande est abandonnée, rien n’a été fait. Réessaie quand il est allumé.' : 'Your computer did not answer (off, or Chrome closed): the request was dropped, nothing was done. Try again when it is on.' };
    case 'echec': {
      const m = String(d.motif ?? '');
      if (/a_obtenir|disponibilite|pas_pret|statut/.test(m)) return { ton: 'ambre', attente: false, texte: fr ? 'Le bordereau n’est plus prêt chez la plateforme : vois la commande sur la plateforme.' : 'The label is no longer ready on the platform: check the order there.' };
      if (/http_40[13]|http_429|captcha|pause/.test(m)) return { ton: 'rouge', attente: false, texte: fr ? 'La plateforme a refusé la lecture : rien n’a été fait, pause de sécurité. Récupère le bordereau sur la plateforme.' : 'The platform refused the read: nothing was done, safety pause. Get the label on the platform.' };
      return { ton: 'rouge', attente: false, texte: fr ? 'Le bordereau n’a pas pu être récupéré (rien n’a été fait chez la plateforme). Réessaie, ou récupère-le sur la plateforme.' : 'The label could not be fetched (nothing was done on the platform). Try again, or get it on the platform.' };
    }
    default: return null;
  }
}

/** Le refus de bordereau_demander, en clair. */
export function refusDemandeBordereau(refuse, lang = 'fr') {
  const fr = lang !== 'en';
  switch (refuse) {
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
