// L'AVANCEMENT DES CONNEXIONS D'UN COMPTE FILLSELL CLOUD (08/11/2026, urgent U1-U5 de Nico) — règles : connexionsCloud.js.
// Une lecture quand le compte est Cloud (cloud_coffre_etat_moi + platform_settings : plateformes choisies, connexions
// isolées), relue au RETOUR au premier plan (au plus toutes les 2 min, comme useCompteCloud) et à la fermeture de
// l'écran de connexion (relire). Jamais de setInterval qui relit la base (règle utils/relectureBornee.js).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { connectesIsoles } from './executant';
import { plateformesCloudChoisies, avancementConnexions, abonnerConnexionsCloud, lireConnexionsCloud } from './connexionsCloud';

const RELECTURE_MIN_MS = 2 * 60_000;
const VIDE = Object.freeze({ lu: false, echec: false, plateformes: [], avancement: null, etats: null, isoles: [] });

// `echec` : la lecture n'a pas abouti (réseau, droits) — l'appelant ne reste pas suspendu à une lecture qui ne vient pas.
export function useConnexionsCloud(userId, clientCloud, plateformesFermees = []) {
  const [etat, setEtat] = useState(VIDE);
  const luLe = useRef(0);
  const enVol = useRef(false);
  const fermees = plateformesFermees.join(',');
  const relire = useCallback(async () => {
    if (!userId || !clientCloud || enVol.current) return;
    enVol.current = true;
    try {
      const [coffre, profil] = await Promise.all([
        supabase.rpc('cloud_coffre_etat_moi'),
        supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle(),
      ]);
      if (coffre.error || profil.error) { setEtat((e) => (e.echec ? e : { ...e, echec: true })); return; }   // illisible : l'état d'avant reste, rien n'est affirmé
      const plateformes = plateformesCloudChoisies(profil.data?.platform_settings ?? null, fermees ? fermees.split(',') : []);
      const etats = coffre.data ?? {};
      const isoles = connectesIsoles(profil.data?.platform_settings ?? null);
      const avancement = avancementConnexions({ plateformes, etats, isoles });
      luLe.current = Date.now();
      setEtat({ lu: true, echec: false, plateformes, avancement, etats, isoles });
    } catch { setEtat((e) => (e.echec ? e : { ...e, echec: true })); /* réseau : on garde l'état d'avant */ } finally { enVol.current = false; }
  }, [userId, clientCloud, fermees]);
  useEffect(() => {
    if (!clientCloud) { setEtat(VIDE); return undefined; }
    relire();
    const auRetour = () => { if (document.visibilityState === 'visible' && Date.now() - luLe.current >= RELECTURE_MIN_MS) relire(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [clientCloud, relire]);
  return { ...etat, relire };
}

// L'état publié par l'app (connexionsCloud.publierConnexionsCloud), suivi par un écran du Stock sans requête de plus.
export function useConnexionsCloudPartage() {
  return useSyncExternalStore(abonnerConnexionsCloud, lireConnexionsCloud, lireConnexionsCloud);
}
