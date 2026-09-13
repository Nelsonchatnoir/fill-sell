// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION AUTOMATIQUE PAR CRÉNEAUX — état, écriture, exposition, nombre
// (lot app du 2026-09-13). Les composants vivent dans
// components/RepublicationPlanifiee.jsx ; ici tout ce qui n'est pas un
// composant (règle react-refresh : un fichier de composants n'exporte que
// des composants).
//
// UN SEUL CONTRAT : `republish_planifiee_etat()` (migration 20260912130200)
// rend tout ce que l'app affiche ; `republish_planifiee_regler(p)` écrit un
// PATCH validé côté serveur et rend l'état complet. L'app FORMATE, elle ne
// recalcule rien (doctrine du 04/09) — sauf pour faire BAISSER un nombre.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Fuseau de l'appareil : envoyé à chaque écriture, validé par le serveur. La
// voie planifiée compte à MINUIT LOCAL dans ce fuseau.
export function fuseauLocal() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
}

// Les deux seuils que le RPC spend_coins_and_republish applique AVANT toute
// republication (extension_required / extension_stale = 7 jours). Au-delà, le
// serveur REFUSE : rien ne part, le nombre vaut 0.
export function extensionRefuse(extensionStatus) {
  const t = Date.parse(extensionStatus?.lastSeenAt ?? '');
  if (!Number.isFinite(t)) return 'jamais';
  if (Date.now() - t > 7 * 86400000) return 'muette';
  return null;
}

// ── LE NOMBRE — honnête ou rien (décision Nico 12/09). ──────────────────────
// `attendu` (serveur) = min(plafond restant, éligibles, capacité du créneau),
// capacité sur l'espacement RÉEL mesuré (médiane du compte, repli parc 354 s,
// pause 50/120 min comprise : 2 h ≈ 20, 11 h ≈ 91 — relu en prod le 13/09).
// L'app n'ajoute que des bornes à la BAISSE : quota mensuel restant (le RPC
// refuse au-delà), extension jamais vue / muette 7 j (le RPC refuse aussi),
// interrupteur global à 0 (branche inerte). Une borne inconnue → n = null,
// affiché « — », jamais un chiffre optimiste.
// Rend null si le module est inactif ; sinon { n, borne } avec borne ∈
// 'plafond' | 'creneau' | 'eligibles' (serveur) | 'mois' | 'extension' |
// 'hors_service' | 'inconnu' (app).
export function nombreAttendu(etat, { enService, extensionStatus } = {}) {
  if (!etat?.actif) return null;
  if (enService === false) return { n: null, borne: 'hors_service' };
  if (extensionRefuse(extensionStatus)) return { n: 0, borne: 'extension' };
  let n = Number(etat.attendu);
  if (!Number.isFinite(n)) return { n: null, borne: 'inconnu' };
  let borne = etat.borne ?? 'eligibles';
  const quota = Number(etat.quota_mensuel);
  const faits = Number(etat.faits_mois);
  if (Number.isFinite(quota) && quota > 0 && Number.isFinite(faits)) {
    const reste = Math.max(0, quota - faits);
    if (reste < n) { n = reste; borne = 'mois'; }
  }
  return { n: Math.max(0, n), borne };
}

// Le module est-il EXPOSÉ pour ce compte ? Interrupteur global à 1, ou un
// réglage déjà posé (compte de test, par SQL). Inconnu = non : l'écran garde
// l'ancien bloc, rien ne change pour personne par accident.
export function republicationPlanifieeExposee({ etat, interrupteur }) {
  if (interrupteur === 1) return true;
  return etat?.reglage != null && typeof etat.reglage === 'object';
}

// ── LE HOOK — une lecture, un poll de 2 min onglet visible, une écriture. ───
export function useRepublicationPlanifiee({ userId, poll = true }) {
  const [etat, setEtat] = useState(null);                // republish_planifiee_etat() | null
  const [interrupteur, setInterrupteur] = useState(null); // coin_config.republish_planifiee_actif | null (illisible)
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const lire = useCallback(async () => {
    if (!userId) return;
    try {
      const [{ data, error }, cfg] = await Promise.all([
        supabase.rpc('republish_planifiee_etat'),
        supabase.from('coin_config').select('value').eq('key', 'republish_planifiee_actif').maybeSingle(),
      ]);
      setEtat(error || !data || data.error ? null : data);
      // Clé illisible → null : « inconnu » ne vaut jamais « allumé ».
      setInterrupteur(cfg?.error || cfg?.data == null ? null : Number(cfg.data.value));
    } catch {
      setEtat(null); setInterrupteur(null);
    } finally {
      setChargement(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    setChargement(true);
    lire();
    if (!poll) return () => { annule = true; };
    const t = setInterval(() => { if (!annule && document.visibilityState === 'visible') lire(); }, 120000);
    return () => { annule = true; clearInterval(t); };
  }, [userId, poll, lire]);

  // `p` est un PATCH : {actif:true} suffit, le serveur pose les défauts et
  // rend l'état complet — c'est lui qu'on affiche, jamais un état local.
  const regler = useCallback(async (patch) => {
    setBusy(true); setErreur(null);
    try {
      const { data, error } = await supabase.rpc('republish_planifiee_regler', { p: { fuseau: fuseauLocal(), ...patch } });
      if (error) { setErreur('reseau'); return { ok: false, reason: 'reseau' }; }
      if (!data?.ok) { setErreur(data?.reason ?? 'inconnu'); return data ?? { ok: false, reason: 'inconnu' }; }
      const { ok: _ok, ...reste } = data;
      setEtat(reste);
      return data;
    } catch {
      setErreur('reseau');
      return { ok: false, reason: 'reseau' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { etat, interrupteur, chargement, busy, erreur, recharger: lire, regler };
}
