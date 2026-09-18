// ═══════════════════════════════════════════════════════════════════════════
// FUSIONNER DEUX ARTICLES — la lecture, l'aperçu, et les deux gestes
// (2026-09-18, point B). Côté base : inventaire_fusionner / inventaire_defusionner
// (migration 20260918102000).
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ L'APERÇU EST CALCULÉ SUR LES LIGNES DE LA BASE, jamais sur les objets en
//    mémoire de l'app : `mapItem` (App.jsx) est une liste BLANCHE de champs et
//    ne transporte PAS `attributs`. Annoncer une reprise d'attributs depuis un
//    objet qui ne les porte pas, c'est promettre au hasard. On relit les deux
//    lignes — deux lignes, une requête — et on applique EXACTEMENT les mêmes
//    règles que la RPC. Si les deux divergeaient, l'écran mentirait sur ce
//    qu'il s'apprête à faire.
import { supabase } from '../lib/supabase';

const CHAMPS = 'id, titre, prix_achat, prix_achat_inconnu, prix_vente, description, marque, photos, attributs, origine, plateforme, created_at, fusionne_dans';

/** Les deux articles, lus en base. [] si l'un des deux manque. */
export async function lireCouple(userId, idA, idB) {
  if (!userId || idA == null || idB == null) return [];
  const { data, error } = await supabase
    .from('inventaire').select(CHAMPS).eq('user_id', userId).in('id', [idA, idB]);
  if (error) return [];
  return data ?? [];
}

/**
 * Les fusions VIVANTES du compte (non défaites), indexées par l'article GARDÉ.
 * C'est ce qui permet d'offrir « défaire » là où l'utilisateur voit le
 * résultat — sur l'article conservé, le seul des deux qui soit encore visible.
 */
export async function lireFusionsActives(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('inventaire_fusions').select('id, garde, absorbe, created_at, deplacements, champs_repris')
    .eq('user_id', userId).is('defait_le', null)
    .order('created_at', { ascending: false }).limit(500);
  if (error) return {};
  const par = {};
  for (const f of data ?? []) (par[String(f.garde)] ??= []).push(f);
  return par;
}

const vide = (v) => v == null || String(v).trim() === '';
const listeVide = (v) => !Array.isArray(v) || v.length === 0;

/**
 * CE QUI SERA REPRIS, et ce qui ne bougera pas. Miroir exact de
 * inventaire_fusionner : un champ n'est repris que s'il est VIDE chez le gardé.
 * ⛔ PRIX D'ACHAT, règle du 03/08 (VIDE ≠ ZÉRO) : « connu » veut dire
 *    prix_achat non NULL — 0 COMPRIS, un article offert est un prix assumé —
 *    ou `prix_achat_inconnu` à true, parce que « je ne sais plus » est une
 *    réponse. On ne reprend que si le gardé ne sait rien du tout.
 * @returns {{repris: Array<{cle,libelle,valeur}>, conserves: Array<{cle,libelle}>}}
 */
export function apercuReprise(garde, absorbe, fr = true) {
  const repris = [];
  const conserves = [];
  const L = {
    prix_achat: fr ? "Prix d'achat" : 'Purchase price',
    description: fr ? 'Description' : 'Description',
    marque: fr ? 'Marque' : 'Brand',
    photos: fr ? 'Photos' : 'Photos',
    attributs: fr ? 'Taille, état, couleur…' : 'Size, condition, colour…',
  };
  if (!garde || !absorbe) return { repris, conserves };

  const gardeSaitPrix = garde.prix_achat != null || garde.prix_achat_inconnu === true;
  const absorbeSaitPrix = absorbe.prix_achat != null || absorbe.prix_achat_inconnu === true;
  if (!gardeSaitPrix && absorbeSaitPrix) {
    repris.push({ cle: 'prix_achat', libelle: L.prix_achat,
      valeur: absorbe.prix_achat != null ? `${absorbe.prix_achat} €` : (fr ? 'inconnu (assumé)' : 'unknown (declared)') });
  } else if (gardeSaitPrix) {
    conserves.push({ cle: 'prix_achat', libelle: L.prix_achat });
  }

  for (const cle of ['description', 'marque']) {
    if (vide(garde[cle]) && !vide(absorbe[cle])) {
      repris.push({ cle, libelle: L[cle], valeur: String(absorbe[cle]).slice(0, 60) });
    } else if (!vide(garde[cle])) {
      conserves.push({ cle, libelle: L[cle] });
    }
  }

  if (listeVide(garde.photos) && !listeVide(absorbe.photos)) {
    repris.push({ cle: 'photos', libelle: L.photos, valeur: `${absorbe.photos.length}` });
  } else if (!listeVide(garde.photos)) {
    conserves.push({ cle: 'photos', libelle: L.photos });
  }

  // Attributs : CLÉ PAR CLÉ. Un attribut connu du gardé n'est jamais remplacé.
  const ga = garde.attributs && typeof garde.attributs === 'object' ? garde.attributs : {};
  const aa = absorbe.attributs && typeof absorbe.attributs === 'object' ? absorbe.attributs : {};
  const nouvelles = Object.keys(aa).filter((k) => !(k in ga));
  if (nouvelles.length) repris.push({ cle: 'attributs', libelle: L.attributs, valeur: nouvelles.join(', ') });
  else if (Object.keys(ga).length) conserves.push({ cle: 'attributs', libelle: L.attributs });

  return { repris, conserves };
}

/** Un article né d'un relevé — c'est sur eux que les doublons apparaîtront. */
export function neDuReleve(item) {
  return typeof item?.origine === 'string' && item.origine.startsWith('releve_');
}

export async function fusionnerArticles(garde, absorbe) {
  const { data, error } = await supabase.rpc('inventaire_fusionner', { p_garde: garde, p_absorbe: absorbe });
  if (error) return { ok: false, reason: 'erreur', message: error.message };
  return data ?? { ok: false, reason: 'erreur' };
}

export async function defaireFusion(fusionId) {
  const { data, error } = await supabase.rpc('inventaire_defusionner', { p_fusion_id: fusionId });
  if (error) return { ok: false, reason: 'erreur', message: error.message };
  return data ?? { ok: false, reason: 'erreur' };
}
