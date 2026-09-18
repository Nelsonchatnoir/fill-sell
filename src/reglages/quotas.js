// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — CE QUE `quotas_etat()` PERMET D'AFFICHER (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Deux questions, deux réponses, un seul endroit — le hub et la sous-page
// Abonnement doivent dire LA MÊME CHOSE. Aucune règle métier ici : on ne fait
// que lire la forme rendue par la RPC.

// Y a-t-il seulement quelque chose à montrer ? Un geste sans plafond configuré
// ne s'affiche pas (doctrine de la bascule quotas du 02/09 : jamais un faux
// zéro), et un compteur vide ne doit pas produire une carte vide coiffée
// d'une date de remise à zéro.
export function consommationVisible(q) {
  if (!q || q.error) return false;
  if (q.annonces?.plafond != null) return true;
  if (q.retouches?.plafond != null && q.retouches.plafond > 0) return true;
  const r = q.republication;
  return Boolean(r && (r.mode === 'illimite' || r.plafond != null));
}

// ── LA REMISE À ZÉRO SE LIT, ELLE NE SE DÉDUIT PAS ─────────────────────────
// ⛔ CE QUI ÉTAIT FAUX (18/09, relevé Nico sur la page en prod) : cette
// fonction dérivait « le 1er du mois suivant » de `quotas_etat.cycle_debut`.
// Le renouvellement est à DATE ANNIVERSAIRE PAR COMPTE depuis la migration
// 20260728160000 (fin du crédit calendaire : un abonné du 28 touchait deux
// réserves en quatre jours). Mesuré : Nico 04/10, Lohan 18/10, Ornella 10/10,
// MeMini 13/10, nadegemarcelin78 28/09 — pas un seul 1er du mois. La page
// annonçait donc une date fausse à TOUT LE MONDE.
//
// LA SOURCE : `coin_wallets.next_grant_at`. C'est l'échéance que la fonction
// de grant elle-même LIT (`v_due := v_wallet.next_grant_at`) pour décider
// d'accorder ou non, et qu'elle RÉÉCRIT à chaque dotation, quelle qu'en soit
// la source. RLS : « own wallet read », l'utilisateur lit la sienne.
//
// ⚠️ POURQUOI PAS `coin_ledger.metadata->>'next_grant_at'` du dernier
// `grant_monthly` : les deux valeurs sont posées dans la MÊME transaction,
// mais seule celle du portefeuille suit les dotations de CHANGEMENT DE PALIER
// (`grant_upgrade`), qui n'écrivent pas de ligne `grant_monthly`. Mesuré sur
// le parc (2 460 comptes) : 25 divergences, toutes des comptes qui ont changé
// de palier. Deux cas relus en base le 18/09 —
//   meminiandmove     ledger 21/09 (grant du 21/08) · portefeuille 13/10
//                     (deux grant_upgrade payés les 13 et 15/09)
//   nadegemarcelin78  ledger 20/09 (grant du 21/08) · portefeuille 28/09
//                     (grant_upgrade payé le 28/08)
// Lire le ledger leur annoncerait une remise à zéro qui n'aura pas lieu ce
// jour-là. Le portefeuille est la seule valeur que le serveur honorera.
//
// ⛔ Illisible, absente, sans portefeuille → null, et la page N'AFFICHE RIEN.
//    Jamais une date inventée sur un écran qui parle d'argent — c'est le
//    garde-fou qui a manqué la première fois.
import { supabase } from '../lib/supabase';

export async function lireProchaineRemiseAZero(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('coin_wallets')
    .select('next_grant_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data?.next_grant_at ?? null;
}

export function formaterRemiseAZero(iso, lang) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit' });
}
