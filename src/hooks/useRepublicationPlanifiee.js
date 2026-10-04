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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { palierNormalise } from '../utils/palier';
import { demarrerRelecture } from '../utils/relectureBornee';

// L'ordre d'affichage, et la seule liste : eBay n'y est pas et n'y sera pas
// (voie API, on ne republie pas — garde-fou du 17/09).
export const PLATEFORMES_PLANIFIEES = ['vinted', 'leboncoin', 'beebs', 'opla'];

// (02/10, sortie d'Opla) Les plateformes à MONTRER : une plateforme que le
// serveur dit fermée (`ouverte: false`, coin_config republish_planifiee_pf_<pf>
// à 0) disparaît de l'écran. C'est ainsi qu'Opla en sort le 10/10 : à la
// bascule, handler-watch coupe sa clé, et la ligne s'efface d'elle-même.
export function plateformesPlanifieesVisibles(parPlateforme) {
  return PLATEFORMES_PLANIFIEES.filter((pf) => parPlateforme?.[pf]?.ouverte !== false);
}

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

// ── LE DROIT, TEL QUE L'ÉCRAN PEUT L'AFFIRMER (04/10/2026, Louis) ───────────
// `autorise` vient du serveur et fait foi — QUAND il est là. Sans état serveur
// (lecture en cours ou ratée), on ne sait pas : l'écran ne refuse rien, il dit
// qu'il lit. Le nom du palier vient du serveur, sinon du palier de l'app
// (utils/palier.js, le même calcul partout) : un Business n'est jamais
// présenté « Pro » faute de réponse.
//   etatServeur : republish_planifiee_etat_multi() ou l'état d'une plateforme.
//   → { connu, autorise (true|false|null), refuse, lecture, palier, nomPalier }
export function droitRepublication(etatServeur, { palierApp = null, lecture = 'ok' } = {}) {
  const serveur = etatServeur && typeof etatServeur === 'object' && !etatServeur.error ? etatServeur : null;
  const palier = palierNormalise(serveur?.palier) ?? palierNormalise(palierApp);
  const nomPalier = palier === 'business' ? 'Business' : 'Pro';
  if (!serveur) {
    return { connu: false, autorise: null, refuse: false, lecture: lecture === 'echec' ? 'echec' : 'en_cours', palier, nomPalier };
  }
  const autorise = serveur.autorise === true;
  return { connu: true, autorise, refuse: !autorise, lecture: 'ok', palier, nomPalier };
}

// ── LE DERNIER ÉTAT CONNU (04/10/2026, Louis) ─────────────────────────────
// Le Stock et les Réglages lisent le MÊME état, chacun par son hook. Les
// Réglages sont montés à neuf à chaque ouverture : sans mémoire, leur écran
// s'ouvrait VIDE le temps de la lecture (jusqu'à 75 s le 04/10, base
// saturée), et un état vide se lisait « Réservée au plan Pro » et « Non
// réglée » chez un compte Business réglé sur trois plateformes. Désormais :
//   · un hook monté à neuf part du dernier état LU pour ce compte (mémoire du
//     module, jamais un état inventé) et le relit aussitôt ;
//   · une lecture ratée GARDE le dernier état lu — elle ne l'efface plus ;
//   · `lecture` dit où on en est : 'en_cours' (rien de lu encore), 'ok',
//     'echec' (rien de lu, la lecture a échoué). Un écran sans état dit
//     « lecture » ou « illisible », JAMAIS « réservée » ni « non réglée ».
const dernierEtat = new Map(); // `${userId}:multi|un` → { etatMulti, etat, interrupteur, le }
// (04/10, incident CPU) Un état lu il y a moins d'une minute n'est pas relu au
// montage : passer du Stock aux Réglages et retour ne coûte plus deux appels à
// republish_planifiee_etat_multi (≈ 0,8 s de base chacun).
const FRAIS_MS = 60_000;

// ── LE HOOK — une lecture, un poll de 2 min onglet visible, une écriture. ───
// (04/10, incident CPU) `pollMs` : 2 min par défaut (Réglages, où l'on règle) ;
// le Stock passe 5 min. Attente doublée sur erreur ou lenteur (relectureBornee),
// jusqu'à 15 min ; onglet caché = aucune lecture.
export function useRepublicationPlanifiee({ userId, poll = true, multi = false, pollMs = 120000 }) {
  const cle = `${userId ?? ''}:${multi ? 'multi' : 'un'}`;
  const connu = userId ? (dernierEtat.get(cle) ?? null) : null;
  const [etatMulti, setEtatMulti] = useState(connu?.etatMulti ?? null);       // republish_planifiee_etat_multi() | null
  const [etat, setEtat] = useState(connu?.etat ?? null);                      // la plateforme Vinted (compat)
  const [interrupteur, setInterrupteur] = useState(connu?.interrupteur ?? null); // coin_config.republish_planifiee_actif | null
  const [chargement, setChargement] = useState(true);
  const [lecture, setLecture] = useState(connu ? 'ok' : 'en_cours');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const etatMultiRef = useRef(etatMulti); etatMultiRef.current = etatMulti;
  const etatRef = useRef(etat); etatRef.current = etat;
  const interrupteurRef = useRef(interrupteur); interrupteurRef.current = interrupteur;

  // Toute écriture d'état passe par ici : l'écran ET la mémoire du module.
  const retenir = useCallback((m, e, i) => {
    setEtatMulti(m); setEtat(e); setInterrupteur(i);
    if (userId) dernierEtat.set(cle, { etatMulti: m, etat: e, interrupteur: i, le: Date.now() });
  }, [userId, cle]);

  const lire = useCallback(async () => {
    if (!userId) return true;
    try {
      const [{ data, error }, cfg] = await Promise.all([
        supabase.rpc(multi ? 'republish_planifiee_etat_multi' : 'republish_planifiee_etat'),
        supabase.from('coin_config').select('value').eq('key', 'republish_planifiee_actif').maybeSingle(),
      ]);
      if (error || !data || data.error) {
        // Lecture ratée : le dernier état lu RESTE (un raté n'efface rien).
        setLecture((l) => (l === 'ok' ? 'ok' : 'echec'));
        return false;
      }
      // Clé illisible → null : « inconnu » ne vaut jamais « allumé ».
      const inter = cfg?.error || cfg?.data == null ? null : Number(cfg.data.value);
      if (multi) {
        retenir(data, (Array.isArray(data.plateformes) ? data.plateformes : []).find((p) => p?.platform === 'vinted') ?? null, inter);
      } else {
        retenir(null, data, inter);
      }
      setLecture('ok');
      return true;
    } catch {
      setLecture((l) => (l === 'ok' ? 'ok' : 'echec'));
      return false;
    } finally {
      setChargement(false);
    }
  }, [userId, multi, retenir]);

  useEffect(() => {
    if (!userId) return undefined;
    const memo = dernierEtat.get(cle);
    const frais = Boolean(memo?.le) && Date.now() - memo.le < FRAIS_MS;
    setChargement(!frais);
    if (!poll) {
      if (!frais) lire();
      return undefined;
    }
    const relecture = demarrerRelecture(lire, { intervalleMs: pollMs, maxMs: 15 * 60_000, lentMs: 4000, immediat: !frais });
    return () => relecture.arreter();
  }, [userId, poll, pollMs, cle, lire]);

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
      const m = etatMultiRef.current;
      const nouveauMulti = (!m || !Array.isArray(m.plateformes)) ? m
        : { ...m, plateformes: m.plateformes.map((p) => (p?.platform === platform ? reste : p)) };
      retenir(nouveauMulti, platform === 'vinted' ? reste : etatRef.current, interrupteurRef.current);
      return data;
    } catch {
      setErreur('reseau');
      return { ok: false, reason: 'reseau' };
    } finally {
      setBusy(false);
    }
  }, [retenir]);

  // « Tout mettre en pause » / « Tout relancer » : le serveur mémorise quelles
  // plateformes étaient actives et ne relance QUE celles-là.
  const pauseGenerale = useCallback(async (reprendre = false) => {
    setBusy(true); setErreur(null);
    try {
      const { data, error } = await supabase.rpc('republish_planifiee_pause_generale', { p_reprendre: reprendre });
      if (error) { setErreur('reseau'); return { ok: false, reason: 'reseau' }; }
      if (!data?.ok) { setErreur(data?.reason ?? 'inconnu'); return data ?? { ok: false, reason: 'inconnu' }; }
      const { ok: _ok, plateformes: _n, ...reste } = data;
      retenir(reste, (Array.isArray(reste.plateformes) ? reste.plateformes : []).find((p) => p?.platform === 'vinted') ?? null, interrupteurRef.current);
      return data;
    } catch {
      setErreur('reseau');
      return { ok: false, reason: 'reseau' };
    } finally {
      setBusy(false);
    }
  }, [retenir]);

  return { etat, etatMulti, parPlateforme, interrupteur, chargement, lecture, busy, erreur, recharger: lire, regler, pauseGenerale };
}
