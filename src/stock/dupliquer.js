// ═══════════════════════════════════════════════════════════════════════════
// DUPLIQUER UN ARTICLE (03/10/2026, ajout de Nico à la refonte du Stock)
// ═══════════════════════════════════════════════════════════════════════════
// « Ça crée une NOUVELLE fiche en stock, copie de l'originale (photos, titre,
//   description, marque, catégorie, état, prix, poids, champs propres des
//   plateformes), sans aucune annonce ni lien vers les annonces de
//   l'original, puis ça ouvre la fiche en modification. Rien n'est publié
//   automatiquement. »
//
// CE QUI EST COPIÉ — vérifié en base le 03/10 sur toutes les fiches du parc :
//   · inventaire : titre, prix (achat — y compris « je ne sais plus » —,
//     vente, frais), marque, description, catégorie (type + catégorie Vinted),
//     emplacement, plateforme notée, photos ;
//   · inventaire.attributs : état, taille, couleur(s), matière, colis/poids,
//     catégorie Vinted, ISBN, genre, modèle, attributs visibles… — SAUF
//     `contenu_divergent`, qui décrit l'écart avec une annonce Leboncoin de
//     L'ORIGINAL (un lien vers ses annonces, donc) ;
//   · fiches_annonce.fiche : la fiche générée entière (titres, descriptions et
//     champs par plateforme) — aucune de ses clés ne désigne une annonce
//     (contrôlé : ni url, ni identifiant d'annonce, ni job).
// CE QUI NE L'EST PAS (les liens vers les annonces de l'original) :
//   vinted_item_id, listed_at_guess, first_seen_at, last_synced_at,
//   disparu_le, vinted_status, vinted_view_count, vinted_favourite_count,
//   vinted_account_id (boutique de l'annonce), origine (relevé), fusionne_*,
//   et AUCUNE ligne de cross_post_jobs, annonces_plateforme, snapshots,
//   captures, rapprochements ni ventes.
//
// ⛔ AUCUN TRIGGER NE S'EN MÊLE : les trois triggers d'insertion d'inventaire
//    ne touchent que les lignes `origine = 'vinted_sync'` ; la copie part avec
//    origine NULL, comme une saisie manuelle (App.addItem).
// ⛔ RIEN N'EST PUBLIÉ : aucune ligne de job n'est écrite ici. La fiche copiée
//    part avec brouillon = false — sinon elle disparaîtrait du stock pour la
//    liste « Brouillons » (qui retient les fiches brouillon sans job).
// ⛔ TOUT OU RIEN : si la fiche générée ne peut pas être copiée, l'article
//    neuf est retiré aussitôt — jamais une copie à moitié faite.
// La provenance est gardée DANS les attributs (`duplique_de`) : c'est un lien
//    vers l'ARTICLE d'origine, jamais vers ses annonces.

// Colonnes d'inventaire recopiées telles quelles.
export const COLONNES_COPIEES = [
  'titre', 'prix_achat', 'prix_achat_inconnu', 'prix_vente', 'marque', 'description', 'type',
  'purchase_costs', 'selling_fees', 'emplacement', 'plateforme', 'photos', 'vinted_catalog_id',
  'photos_a_rapatrier',
];

// Colonnes qui désignent les annonces de l'original — jamais recopiées.
export const COLONNES_LIEES_AUX_ANNONCES = [
  'vinted_item_id', 'listed_at_guess', 'first_seen_at', 'last_synced_at', 'disparu_le',
  'vinted_status', 'vinted_view_count', 'vinted_favourite_count', 'vinted_account_id',
  'origine', 'fusionne_dans', 'fusionne_le',
];

// Attributs qui parlent d'une annonce de l'original — jamais recopiés.
export const ATTRIBUTS_LIES_AUX_ANNONCES = ['contenu_divergent'];

const estObjet = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Les deux lignes à écrire, sans rien écrire.
 * @param {object} original  la ligne `inventaire` BRUTE (noms de colonnes)
 * @param {object|null} fiche  la ligne `fiches_annonce` de l'original, ou null
 * @param {{ id:number, maintenant?:Date }} opts  `id` = identifiant neuf
 * @returns {{ inventaire: object, fiche: object|null }}
 */
export function construireCopie(original, fiche, { id, maintenant = new Date() } = {}) {
  if (!original || original.id == null) throw new Error('article d’origine introuvable');
  if (id == null) throw new Error('identifiant neuf manquant');
  const inventaire = { id, user_id: original.user_id };
  for (const c of COLONNES_COPIEES) {
    if (original[c] !== undefined) inventaire[c] = original[c];
  }
  // Une copie est un article NEUF, en stock, à l'unité : ni vendu, ni lot
  // (on ajuste la quantité dans la fiche, qui s'ouvre juste après).
  inventaire.statut = 'stock';
  inventaire.quantite = 1;
  inventaire.date = maintenant.toISOString();
  inventaire.margin = null;
  inventaire.margin_pct = null;
  inventaire.origine = null;
  // Les frais de VENTE n'ont de sens qu'une fois vendu (addItem pose 0).
  inventaire.selling_fees = 0;
  if (inventaire.prix_achat_inconnu == null) inventaire.prix_achat_inconnu = false;
  if (inventaire.photos_a_rapatrier == null) delete inventaire.photos_a_rapatrier;

  const attributs = estObjet(original.attributs) ? { ...original.attributs } : {};
  for (const a of ATTRIBUTS_LIES_AUX_ANNONCES) delete attributs[a];
  attributs.duplique_de = { v: original.id, at: maintenant.toISOString(), source: 'duplication' };
  inventaire.attributs = attributs;

  const copieFiche = fiche && estObjet(fiche.fiche)
    ? {
      inventaire_id: id,
      user_id: original.user_id,
      fiche: JSON.parse(JSON.stringify(fiche.fiche)),
      source: 'duplication',
      brouillon: false,
    }
    : null;
  return { inventaire, fiche: copieFiche };
}

/**
 * Duplique un article du compte connecté. Lecture FRAÎCHE de l'original (pas
 * la copie mémoire de l'écran, renommée par mapItem), écriture des deux
 * lignes, et retour de la ligne d'inventaire neuve (pour mapItem + la fiche
 * de modification).
 * @returns {Promise<{ ok:true, ligne:object } | { ok:false, erreur:string }>}
 */
export async function dupliquerArticle(supabase, { userId, inventaireId, maintenant = new Date() }) {
  if (!supabase || !userId || inventaireId == null) return { ok: false, erreur: 'parametres' };
  const { data: original, error: e1 } = await supabase
    .from('inventaire').select('*').eq('id', inventaireId).eq('user_id', userId).maybeSingle();
  if (e1 || !original) return { ok: false, erreur: e1?.message ?? 'introuvable' };
  const { data: fiche, error: e2 } = await supabase
    .from('fiches_annonce').select('*').eq('inventaire_id', inventaireId).eq('user_id', userId).maybeSingle();
  if (e2) return { ok: false, erreur: e2.message };

  // Identifiant : la convention de l'app (App.addItem : Date.now()). Une
  // collision (deux créations dans la même milliseconde) se rejoue une fois.
  let ligne = null; let derniere = null;
  for (const decalage of [0, 1, 2]) {
    const { inventaire } = construireCopie(original, fiche, { id: Date.now() + decalage, maintenant });
    const { data, error } = await supabase.from('inventaire').insert([inventaire]).select().single();
    if (!error && data) { ligne = data; break; }
    derniere = error;
    if (error?.code !== '23505') break;
  }
  if (!ligne) return { ok: false, erreur: derniere?.message ?? 'insertion' };

  const { fiche: copieFiche } = construireCopie(original, fiche, { id: ligne.id, maintenant });
  if (copieFiche) {
    const { error: e3 } = await supabase.from('fiches_annonce').insert([copieFiche]);
    if (e3) {
      // Tout ou rien : l'article neuf n'a ni annonce ni job, sa suppression
      // n'arme aucun retrait (trigger avant suppression).
      await supabase.from('inventaire').delete().eq('id', ligne.id).eq('user_id', userId);
      return { ok: false, erreur: e3.message };
    }
  }
  return { ok: true, ligne };
}
