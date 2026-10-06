// Le MOMENT de la proposition « Sois prévenu dès qu'un article se vend »
// (06/10/2026). Séparé du composant (react-refresh : un fichier de composants
// n'exporte que des composants). Voir PropositionNotifications.jsx.
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../lib/supabase';
import { activerPush, doitProposer, noterProposition, pushDisponible } from './pushVentes';

export const TEXTES_PROPOSITION = Object.freeze({
  fr: {
    titre: 'Sois prévenu dès qu’un article se vend',
    texte: 'Une notification à chaque vente, sur toutes tes plateformes. Rien d’autre.',
    activer: 'Activer',
    plusTard: 'Plus tard',
  },
  en: {
    titre: 'Get notified the moment an item sells',
    texte: 'One notification per sale, on all your platforms. Nothing else.',
    activer: 'Turn on',
    plusTard: 'Later',
  },
});

const DIX_MINUTES = 10 * 60 * 1000;

/**
 * Décide d'ouvrir la proposition. `actif` : l'app est au repos (données
 * chargées, aucune saisie en cours). `aVente` : une vente est déjà connue.
 * Une seule lecture (« une synchro a-t-elle déjà réussi ? »), à l'ouverture
 * puis au retour au premier plan, au plus toutes les 10 minutes — jamais en
 * boucle, et jamais si le binaire n'a pas le module.
 */
export function usePropositionPush({ userId, actif, aVente, versionApp }) {
  const [visible, setVisible] = useState(false);
  const derniereVerif = useRef(0);
  const [reveil, setReveil] = useState(0);

  useEffect(() => {
    if (!pushDisponible() || !Capacitor.isNativePlatform()) return undefined;
    let abo = null;
    let vivant = true;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) setReveil((n) => n + 1); })
      .then((h) => { if (vivant) abo = h; else h.remove(); })
      .catch(() => {});
    return () => { vivant = false; try { abo?.remove(); } catch { /* déjà parti */ } };
  }, []);

  useEffect(() => {
    if (!userId || !actif || visible || !pushDisponible()) return undefined;
    if (Date.now() - derniereVerif.current < DIX_MINUTES && !aVente) return undefined;
    let annule = false;
    (async () => {
      derniereVerif.current = Date.now();
      let aSynchroOuVente = Boolean(aVente);
      if (!aSynchroOuVente) {
        const { data } = await supabase.from('vinted_sync_runs').select('id')
          .eq('user_id', userId).eq('status', 'done').limit(1);
        aSynchroOuVente = (data?.length ?? 0) > 0;
      }
      if (annule || !(await doitProposer({ aSynchroOuVente }))) return;
      if (annule) return;
      noterProposition();
      setVisible(true);
    })().catch(() => {});
    return () => { annule = true; };
  }, [userId, actif, aVente, visible, reveil]);

  return {
    visible,
    activer: async () => { setVisible(false); await activerPush({ versionApp }).catch(() => {}); },
    plusTard: () => setVisible(false),
  };
}
