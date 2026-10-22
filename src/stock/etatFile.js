// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT DE LA FILE : PAUSE, ET SYNCHRO QUI ATTEND UNE REMISE EN LIGNE (22/10 soir, points 5 et 6 — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Une lecture bornée (utils/relectureBornee.js : 60 s, onglet visible, ralentit si la base peine) de la RPC
// file_etat : { pause, depuis, en_pause, synchro_attend_republication: [{platform, republication}] }.
// `basculer(true|false)` appelle file_pause_basculer et relit aussitôt — la pause ne coupe jamais une tâche en
// cours (le serveur ne sert plus ce qui n'a pas commencé ; l'extension ≥ 0.6.130 s'arrête entre deux tâches),
// les retraits après une vente continuent toujours.
import { useCallback, useEffect, useRef, useState } from "react";
import { demarrerRelecture } from "../utils/relectureBornee";

export const ETAT_FILE_VIDE = Object.freeze({ pause: false, depuis: null, en_pause: 0, synchro_attend_republication: [] });

/** La forme sûre d'une réponse de file_etat (pur, testé). */
export function lireEtatFile(data) {
  if (!data || typeof data !== "object" || data.ok === false) return ETAT_FILE_VIDE;
  return {
    pause: data.pause === true,
    depuis: typeof data.depuis === "string" ? data.depuis : null,
    en_pause: Number.isFinite(Number(data.en_pause)) ? Number(data.en_pause) : 0,
    synchro_attend_republication: Array.isArray(data.synchro_attend_republication)
      ? data.synchro_attend_republication.filter((x) => x && typeof x.platform === "string")
      : [],
  };
}

export function useEtatFile({ supabase, userId, actif = true }) {
  const [etat, setEtat] = useState(ETAT_FILE_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const relecture = useRef(null);
  useEffect(() => {
    if (!actif || !supabase || !userId) return undefined;
    const r = demarrerRelecture(async () => {
      const { data, error } = await supabase.rpc("file_etat");
      if (error) return false;
      setEtat(lireEtatFile(data));
      return true;
    }, { intervalleMs: 60_000, maxMs: 10 * 60_000 });
    relecture.current = r;
    return () => { r.arreter(); relecture.current = null; };
  }, [actif, supabase, userId]);
  const basculer = useCallback(async (pause) => {
    if (!supabase || envoi) return { ok: false };
    setEnvoi(true);
    try {
      const { data, error } = await supabase.rpc("file_pause_basculer", { p_pause: Boolean(pause) });
      if (error) return { ok: false, erreur: error.message };
      setEtat(lireEtatFile(data));
      return { ok: true };
    } finally {
      setEnvoi(false);
    }
  }, [supabase, envoi]);
  return { ...etat, envoi, basculer, relire: () => relecture.current?.relireMaintenant?.() };
}
