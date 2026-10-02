// ═══════════════════════════════════════════════════════════════════════════
// DEMANDE D'AVIS — QUAND L'OUVRIR, CÔTÉ APP (02/10/2026, décision de Nico, lot B)
// ═══════════════════════════════════════════════════════════════════════════
// La RÈGLE vit au serveur (fonction avis-demande, _shared/avis-demande.js) :
// 10 actions réussies d'affilée sans échec, compte de 3 jours, entrée finie,
// pas de paiement dans les 24 h, 60 jours entre deux demandes, « Plus tard »
// 30 jours, « C'est déjà fait » plus jamais. Ce hook ne décide que du MOMENT
// où l'on pose la question au serveur :
//   · jamais à l'ouverture de l'app : premier essai 45 s après le lancement ;
//   · seulement sur le tableau de bord (aucune action en cours possible là),
//     app au premier plan ; puis au plus toutes les 10 min ;
//   · une seule demande par session.
// iOS / Android : la fenêtre OFFICIELLE du store (StoreKit requestReview,
// Play In-App Review), via @capgo/capacitor-in-app-review — rien devant, rien
// à la place. Plugin absent (binaire d'avant 2.9.38) : on ne demande rien.
// Web sur ordinateur : la carte (CarteAvis), qui mène à la page d'avis de
// l'extension. Web sur téléphone : rien (l'extension ne s'installe pas là).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CapgoInAppReview } from '@capgo/capacitor-in-app-review';
import { supabase } from '../lib/supabase';
import { plateformeAvis } from '../utils/plateformeAvis';

export { plateformeAvis };

const LANCEMENT = Date.now();
export const DELAI_APRES_LANCEMENT_MS = 45_000;
export const INTERVALLE_MS = 10 * 60_000;
let demandeeCetteSession = false;

async function appeler(body) {
  const { data, error } = await supabase.functions.invoke('avis-demande', { body });
  if (error) throw error;
  return data;
}

export function useDemandeAvis({ userId, actif }) {
  const [carte, setCarte] = useState(null); // { url } — web seulement
  const enCours = useRef(false);

  useEffect(() => {
    if (!userId || !actif || demandeeCetteSession) return undefined;
    const plateforme = plateformeAvis();
    if (!plateforme) return undefined;
    let vivant = true;
    let minuteur = null;
    const essayer = async () => {
      if (!vivant || demandeeCetteSession || enCours.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      enCours.current = true;
      try {
        const r = await appeler({ action: 'ouvrir', plateforme });
        if (!vivant || !r?.ouvrir) return;
        demandeeCetteSession = true;
        if (plateforme === 'web') {
          setCarte({ url: r.url });
        } else {
          // La fenêtre du store : Apple et Google décident seuls de l'afficher.
          await CapgoInAppReview.requestReview().catch((e) => console.warn('[avis] fenêtre du store :', e?.message ?? e));
        }
      } catch (e) {
        console.warn('[avis] demande non faite :', e?.message ?? e);
      } finally {
        enCours.current = false;
      }
    };
    const attente = Math.max(0, LANCEMENT + DELAI_APRES_LANCEMENT_MS - Date.now());
    const premier = setTimeout(() => {
      essayer();
      minuteur = setInterval(essayer, INTERVALLE_MS);
    }, attente);
    return () => { vivant = false; clearTimeout(premier); if (minuteur) clearInterval(minuteur); };
  }, [userId, actif]);

  const choisir = useCallback((evenement) => {
    setCarte(null);
    appeler({ action: 'noter', plateforme: 'web', evenement })
      .catch((e) => console.warn('[avis] choix non enregistré :', e?.message ?? e));
  }, []);

  return { carte, choisir };
}
