// ═══════════════════════════════════════════════════════════════════════════
// LES DOUBLONS POSSIBLES — lire les questions, rendre la réponse (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Côté base : table inventaire_doublons + RPC inventaire_doublon_decider
// (migration 20260925151000). Une paire PROBABLE (deux fiches qui désignent
// peut-être le même objet) devient une question ; la personne répond en un
// geste : « Oui, c'est le même » (fusion, réversible depuis la fiche) ou
// « Non » (la paire n'est plus jamais reproposée).
// ⛔ Ce qui est CERTAIN ne passe jamais par ici : le balayage l'a déjà fait.
import { supabase } from '../lib/supabase';

/** Les questions ouvertes du compte — [] si la table n'existe pas encore ou en cas d'erreur. */
export async function lireDoublonsProposes(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('inventaire_doublons')
    .select('id, garde, absorbe, niveau, motif, preuves, created_at')
    .eq('user_id', userId).eq('statut', 'proposee')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return data ?? [];
}

/** « oui » | « non ». Rend { ok, reason?, fusion_id? }. */
export async function deciderDoublon(id, decision) {
  const { data, error } = await supabase.rpc('inventaire_doublon_decider', { p_id: id, p_decision: decision });
  if (error) return { ok: false, reason: 'erreur', message: error.message };
  return data ?? { ok: false, reason: 'erreur' };
}

/**
 * Les paires à montrer : seulement celles dont les DEUX fiches sont dans le
 * stock chargé par l'app (une fiche absorbée, vendue ou supprimée entre-temps
 * rend la question sans objet — le balayage la déclare caduque de son côté).
 */
export function pairesAffichables(doublons, items) {
  const parId = new Map((Array.isArray(items) ? items : []).map((i) => [String(i.id), i]));
  return (Array.isArray(doublons) ? doublons : [])
    .map((d) => ({ ...d, a: parId.get(String(d.garde)), b: parId.get(String(d.absorbe)) }))
    .filter((d) => d.a && d.b && d.a.statut !== 'vendu' && d.b.statut !== 'vendu');
}

/** Ce qui rapproche les deux fiches, en mots simples (les preuves du serveur). */
export function raisonsDoublon(preuves, fr = true) {
  const s = preuves?.signaux ?? {};
  const out = [];
  const photo = s.photo?.verdict;
  if (photo === 'identique') out.push(fr ? 'la même photo' : 'the same photo');
  else if (photo === 'proche') out.push(fr ? 'des photos très proches' : 'very similar photos');
  if (s.exact) out.push(fr ? 'le même titre' : 'the same title');
  else if (Number(s.ov) >= 0.8) out.push(fr ? 'presque le même titre' : 'almost the same title');
  else if (Number(s.ov) >= 0.5) out.push(fr ? 'un titre proche' : 'a similar title');
  if (s.prix === 'egal') out.push(fr ? 'le même prix' : 'the same price');
  if (s.marque === 'egale') out.push(fr ? 'la même marque' : 'the same brand');
  return out;
}

/** D'où vient une fiche, en une étiquette courte. */
export function origineFiche(item, fr = true) {
  const o = String(item?.origine ?? '');
  const pf = { vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', opla: 'Opla' };
  if (o === 'vinted_sync') return fr ? 'Dressing Vinted' : 'Vinted wardrobe';
  if (o.startsWith('releve_')) {
    const p = pf[o.slice(7)] ?? o.slice(7);
    return fr ? `Relevé ${p}` : `${p} scan`;
  }
  return fr ? "Créée dans l'app" : 'Created in the app';
}
