// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION AUTOMATIQUE PAR CRÉNEAUX — état, écriture, exposition, nombre
// (lot app du 2026-09-13, multiplateforme le 2026-09-18). Les composants
// vivent dans components/RepublicationPlanifiee.jsx ; ici tout ce qui n'est
// pas un composant (règle react-refresh : un fichier de composants n'exporte
// que des composants).
//
// UN SEUL CONTRAT, désormais par plateforme :
//   · `republish_planifiee_etat_multi()` rend les QUATRE plateformes (Vinted,
//     Leboncoin, Beebs, Opla) plus l'enveloppe de compte, en un appel ;
//   · `republish_planifiee_etat(pf)` rend une seule plateforme ;
//   · `republish_planifiee_regler(p)` écrit un PATCH validé côté serveur — la
//     plateforme voyage DANS le patch (`platform`, défaut 'vinted') ;
//   · `republish_planifiee_pause_generale(reprendre)` coupe (ou relance)
//     d'un geste les plateformes actives, en mémorisant lesquelles.
// L'app FORMATE, elle ne recalcule rien (doctrine du 04/09) — sauf pour faire
// BAISSER un nombre.
//
// ⚠️ DEUX MODES, ET C'EST VOULU. `multi: false` (défaut) garde EXACTEMENT
// l'appel d'avant (un `republish_planifiee_etat()`, Vinted) : le Stock, qui
// n'a besoin que de savoir si le module est exposé, ne paie pas quatre scans
// de candidats toutes les deux minutes. Seul l'écran des Réglages demande
// `multi: true`.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// L'ordre d'affichage, et la seule liste : eBay n'y est pas et n'y sera pas
// (voie API, on ne republie pas — garde-fou du 17/09).
export const PLATEFORMES_PLANIFIEES = ['vinted', 'leboncoin', 'beebs', 'opla'];

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
// `attendu` (serveur) = min(plafond de la plateforme, enveloppe de compte,
// éligibles, capacité PARTAGÉE du créneau) — la capacité est partagée parce
// qu'il n'y a qu'UN Chrome pour quatre files. L'app n'ajoute que des bornes à
// la BAISSE : quota mensuel restant (le RPC refuse au-delà), extension jamais
// vue / muette 7 j (le RPC refuse aussi), interrupteur global à 0 (branche
// inerte). Une borne inconnue → n = null, affiché « — », jamais un chiffre
// optimiste.
// Rend null si le module est inactif ; sinon { n, borne } avec borne ∈
// 'plafond' | 'plafond_compte' | 'creneau' | 'eligibles' | 'plateforme_fermee'
// (serveur) | 'mois' | 'extension' | 'hors_service' | 'inconnu' (app).
export function nombreAttendu(etat, { enService, extensionStatus } = {}) {
  if (!etat?.actif) return null;
  if (enService === false) return { n: null, borne: 'hors_service' };
  if (etat.ouverte === false) return { n: 0, borne: 'plateforme_fermee' };
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
// réglage déjà posé sur AU MOINS UNE plateforme (compte de test, par SQL).
// Inconnu = non : l'écran garde l'ancien bloc, rien ne change par accident.
export function republicationPlanifieeExposee({ etat, parPlateforme, interrupteur }) {
  if (interrupteur === 1) return true;
  if (parPlateforme && PLATEFORMES_PLANIFIEES.some((pf) => parPlateforme[pf]?.configure === true)) return true;
  return etat?.reglage != null && typeof etat.reglage === 'object';
}

// ── LE HOOK — une lecture, un poll de 2 min onglet visible, une écriture. ───
export function useRepublicationPlanifiee({ userId, poll = true, multi = false }) {
  const [etatMulti, setEtatMulti] = useState(null);       // republish_planifiee_etat_multi() | null
  const [etat, setEtat] = useState(null);                 // la plateforme Vinted (compat)
  const [interrupteur, setInterrupteur] = useState(null); // coin_config.republish_planifiee_actif | null
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const lire = useCallback(async () => {
    if (!userId) return;
    try {
      const [{ data, error }, cfg] = await Promise.all([
        supabase.rpc(multi ? 'republish_planifiee_etat_multi' : 'republish_planifiee_etat'),
        supabase.from('coin_config').select('value').eq('key', 'republish_planifiee_actif').maybeSingle(),
      ]);
      if (error || !data || data.error) {
        setEtatMulti(null); setEtat(null);
      } else if (multi) {
        setEtatMulti(data);
        setEtat((Array.isArray(data.plateformes) ? data.plateformes : []).find((p) => p?.platform === 'vinted') ?? null);
      } else {
        setEtatMulti(null); setEtat(data);
      }
      // Clé illisible → null : « inconnu » ne vaut jamais « allumé ».
      setInterrupteur(cfg?.error || cfg?.data == null ? null : Number(cfg.data.value));
    } catch {
      setEtatMulti(null); setEtat(null); setInterrupteur(null);
    } finally {
      setChargement(false);
    }
  }, [userId, multi]);

  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    setChargement(true);
    lire();
    if (!poll) return () => { annule = true; };
    const t = setInterval(() => { if (!annule && document.visibilityState === 'visible') lire(); }, 120000);
    return () => { annule = true; clearInterval(t); };
  }, [userId, poll, lire]);

  // { vinted: {...}, leboncoin: {...}, … } — toujours les quatre clés en mode
  // multi, pour que l'écran n'ait jamais à deviner une absence.
  const parPlateforme = useMemo(() => {
    const liste = Array.isArray(etatMulti?.plateformes) ? etatMulti.plateformes : [];
    const out = {};
    for (const pf of PLATEFORMES_PLANIFIEES) out[pf] = liste.find((p) => p?.platform === pf) ?? null;
    return out;
  }, [etatMulti]);

  // `p` est un PATCH : {actif:true} suffit, le serveur pose les défauts et rend
  // l'état complet DE CETTE PLATEFORME — c'est lui qu'on affiche, jamais un
  // état local.
  const regler = useCallback(async (patch, platform = 'vinted') => {
    setBusy(true); setErreur(null);
    try {
      const { data, error } = await supabase.rpc('republish_planifiee_regler', {
        p: { platform, fuseau: fuseauLocal(), ...patch },
      });
      if (error) { setErreur('reseau'); return { ok: false, reason: 'reseau' }; }
      if (!data?.ok) { setErreur(data?.reason ?? 'inconnu'); return data ?? { ok: false, reason: 'inconnu' }; }
      const { ok: _ok, ...reste } = data;
      if (platform === 'vinted') setEtat(reste);
      setEtatMulti((m) => {
        if (!m || !Array.isArray(m.plateformes)) return m;
        return { ...m, plateformes: m.plateformes.map((p) => (p?.platform === platform ? reste : p)) };
      });
      return data;
    } catch {
      setErreur('reseau');
      return { ok: false, reason: 'reseau' };
    } finally {
      setBusy(false);
    }
  }, []);

  // « Tout mettre en pause » / « Tout relancer » : le serveur mémorise quelles
  // plateformes étaient actives et ne relance QUE celles-là.
  const pauseGenerale = useCallback(async (reprendre = false) => {
    setBusy(true); setErreur(null);
    try {
      const { data, error } = await supabase.rpc('republish_planifiee_pause_generale', { p_reprendre: reprendre });
      if (error) { setErreur('reseau'); return { ok: false, reason: 'reseau' }; }
      if (!data?.ok) { setErreur(data?.reason ?? 'inconnu'); return data ?? { ok: false, reason: 'inconnu' }; }
      const { ok: _ok, plateformes: _n, ...reste } = data;
      setEtatMulti(reste);
      setEtat((Array.isArray(reste.plateformes) ? reste.plateformes : []).find((p) => p?.platform === 'vinted') ?? null);
      return data;
    } catch {
      setErreur('reseau');
      return { ok: false, reason: 'reseau' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { etat, etatMulti, parPlateforme, interrupteur, chargement, busy, erreur, recharger: lire, regler, pauseGenerale };
}
