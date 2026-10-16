// ═══════════════════════════════════════════════════════════════════════════
// BÊTA MESSAGES + BORDEREAUX — CE QUE L'ÉCRAN AFFICHE (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES (testées : scripts/messagerie-app-selftest.mjs). Les écrans
// de src/messagerie/ ne décident de rien d'autre : libellés, tri, états des
// réponses et des commandes, état du bouton « Bordereau ».
// Pas de design final : écrans minimaux pour valider la donnée (Nico seul).

export const NOMS_PLATEFORMES = Object.freeze({
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay',
});

export function nomPlateforme(p) {
  return NOMS_PLATEFORMES[p] ?? (p ? String(p) : '—');
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
      return { ton: 'ambre', texte: fr ? 'Non envoyée : l’envoi est verrouillé pendant la bêta (conversation hors liste blanche).' : 'Not sent: sending is locked during the beta (conversation not whitelisted).' };
    case 'en_attente': return { ton: 'neutre', texte: fr ? 'En attente : ton extension l’enverra à son prochain passage.' : 'Waiting: your extension will send it on its next pass.' };
    case 'en_cours': return { ton: 'neutre', texte: fr ? 'Envoi en cours…' : 'Sending…' };
    case 'envoyee': return { ton: 'ok', texte: fr ? 'Envoyée.' : 'Sent.' };
    case 'echec': return { ton: 'rouge', texte: fr ? 'Non envoyée (rien n’est parti). Réécris-la depuis la plateforme si besoin.' : 'Not sent (nothing went out). Write it on the platform if needed.' };
    case 'annulee': return { ton: 'neutre', texte: fr ? 'Annulée.' : 'Cancelled.' };
    default: return { ton: 'neutre', texte: '' };
  }
}

const ETATS_COMMANDE = Object.freeze({
  a_confirmer: ['Disponibilité à confirmer', 'Availability to confirm'],
  a_expedier: ['À expédier', 'To ship'],
  expediee: ['Expédiée', 'Shipped'],
  livree: ['Livrée', 'Delivered'],
  terminee: ['Terminée', 'Completed'],
  annulee: ['Annulée', 'Cancelled'],
  retour: ['Retour', 'Return'],
  litige: ['Incident', 'Issue'],
  inconnu: ['État à vérifier', 'Status to check'],
});

export function libelleEtatCommande(etat, lang = 'fr') {
  const l = ETATS_COMMANDE[etat] ?? ETATS_COMMANDE.inconnu;
  return lang === 'en' ? l[1] : l[0];
}

/** Les commandes de la section « À expédier » : à confirmer d'abord, puis la plus ancienne vente. */
export function commandesAExpedier(liste) {
  return (liste ?? [])
    .filter((c) => c?.etat === 'a_confirmer' || c?.etat === 'a_expedier')
    .sort((a, b) => {
      const p = Number(b.etat === 'a_confirmer') - Number(a.etat === 'a_confirmer');
      if (p) return p;
      const da = Date.parse(a.a_expedier_avant ?? '') || Date.parse(a.vendue_le ?? '') || 0;
      const db = Date.parse(b.a_expedier_avant ?? '') || Date.parse(b.vendue_le ?? '') || 0;
      return da - db;
    });
}

/**
 * Le bouton « Bordereau » : INACTIF pendant la bêta, quel que soit l'état —
 * la dernière marche (le fichier) n'est pas ouverte tant que le parcours n'a
 * pas été validé sur une vraie commande. Le texte dit pourquoi, et ce que la
 * plateforme attend de la personne en attendant.
 */
export function boutonBordereau(c, lang = 'fr') {
  const fr = lang !== 'en';
  const pf = nomPlateforme(c?.platform);
  let aide;
  if (c?.platform === 'ebay') aide = fr ? 'Chez eBay, le bordereau s’achète dans eBay (pas d’API en France).' : 'On eBay, labels are bought in eBay (no API in France).';
  else if (c?.etat === 'a_confirmer') aide = fr ? `Confirme d’abord la disponibilité sur ${pf} : c’est ce geste qui fait naître le bordereau.` : `First confirm availability on ${pf}: that creates the label.`;
  else if (c?.bordereau === 'pret') aide = fr ? `Bordereau prêt sur ${pf}.` : `Label ready on ${pf}.`;
  else if (c?.bordereau === 'a_obtenir') aide = fr ? `Le bordereau se récupère sur ${pf}.` : `Get the label on ${pf}.`;
  else if (c?.bordereau === 'indisponible') aide = fr ? `${pf} n’a pas pu créer le bordereau : vois la commande sur ${pf}.` : `${pf} could not create the label: check the order on ${pf}.`;
  else aide = fr ? `État du bordereau à voir sur ${pf}.` : `Check the label on ${pf}.`;
  return {
    actif: false,
    libelle: fr ? 'Bordereau' : 'Label',
    titre: fr ? 'Bientôt : à valider sur une vraie commande' : 'Soon: to be validated on a real order',
    aide,
  };
}
