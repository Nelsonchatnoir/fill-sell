// ═══════════════════════════════════════════════════════════════════════════
// OPLA — L'AUTORISATION EST-ELLE ACCORDÉE ? (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Opla est ouverte à tout le monde, comme les quatre autres. Ce qui reste,
// c'est une PERMISSION D'HÔTE Chrome (opla.co), optionnelle, que l'extension
// seule peut demander. Ce module répond à une seule question — est-elle
// accordée ? — et sert les trois points de contact (stepper, relevé,
// republication) avec LA MÊME réponse.
//
// ⚠️ L'APP NE PEUT PAS INTERROGER L'EXTENSION : le manifeste n'a pas
// d'`externally_connectable`, une page web ne peut pas lui parler. La réponse
// vient donc de `profiles.extension_sessions`, écrit par l'extension.
//
// TROIS PREUVES, dans cet ordre :
//   1. `opla_acces` — dit explicitement par l'extension quand elle le sait ;
//   2. une valeur de sonde `true` / `false` sur opla — `sonderSessionOpla`
//      rend son verdict AVANT tout réseau si la permission manque, donc une
//      valeur booléenne ne peut exister QUE permission accordée ;
//   3. un code HTTP relevé sur opla.co — même raisonnement.
// C'est ce qui rend la détection juste DÈS AUJOURD'HUI, sans attendre un
// paquet Chrome Web Store.
//
// TROIS RÉPONSES, jamais deux :
//   true   accordée
//   false  pas accordée
//   null   on ne sait rien (aucun relevé d'extension) — on ne demande rien.
// ⛔ On ne pose la question à l'écran que sur `false`. « Je ne sais pas » ne
//    déclenche aucune modale : mieux vaut laisser passer que harceler.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function oplaAutoriseeDepuisSessions(sessions) {
  if (!sessions || typeof sessions !== 'object') return null;
  if (sessions.opla_acces === true) return true;
  if (sessions.opla === true || sessions.opla === false) return true;
  // ⚠️ Number(null) vaut 0, qui est FINI : un http.opla absent passerait pour
  // un code relevé et on conclurait « accordée » à tort.
  const http = sessions.http?.opla;
  if (http != null && http !== '' && Number.isFinite(Number(http))) return true;
  return false;
}

// Lecture unique (et relecture au retour d'onglet) de l'état d'autorisation.
// `actif` permet de ne rien lire tant que l'écran qui s'en sert n'est pas là.
export function useOplaAcces({ userId, actif = true }) {
  const [acces, setAcces] = useState(null);

  const lire = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles').select('extension_sessions').eq('id', userId).maybeSingle();
    if (error) return;               // illisible : on n'affirme rien
    setAcces(oplaAutoriseeDepuisSessions(data?.extension_sessions ?? null));
  }, [userId]);

  useEffect(() => {
    if (!actif || !userId) return undefined;
    let mort = false;
    const tick = () => { if (!mort) lire().catch(() => {}); };
    tick();
    // Au retour d'onglet : la personne vient peut-être d'accorder l'accès dans
    // l'extension — l'écran doit le voir sans qu'elle ait à recharger.
    const surVisibilite = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => { mort = true; document.removeEventListener('visibilitychange', surVisibilite); };
  }, [actif, userId, lire]);

  return { acces, manquante: acces === false, relire: lire };
}
