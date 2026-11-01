// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « RECONNECTE-TOI » DU CLOUD (01/11/2026, demande de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Quand le Cloud exécute les tâches du compte (profiles.cloud_voie) et qu'une connexion de plateforme tombe (coffre :
// une ligne qui ne se dit plus connectée), l'app le DEMANDE : un bandeau, la plateforme nommée, un seul geste
// (« Me reconnecter » ouvre l'écran « Me connecter »). Les tâches de cette plateforme attendent : ni le Cloud ni
// l'ordinateur ne les prennent.
// Monté par App derrière cloudConnexionVisible() : aucun témoin = jamais rendu, jamais une requête. Relu à l'ouverture,
// au retour sur l'app (focus, onglet visible) et à la fermeture de « Me connecter » — jamais en boucle.
// (01/11, 23:10, demande de Nico) Et L'EXÉCUTANT ARRÊTÉ se dit aussi (22:57 → 23:05 : arrêté sans que l'app le sache) :
// cloud_executant_moi, executantArrete (éteint, arrêt de l'essai, ou muet depuis plus de 25 min) — avant les plateformes.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { plateformesAReconnecter, executantArrete, quandParis } from './executant';
import { textesConnexion } from './textesConnexion';
import { C, BLANC, DEGRADE_TEAL, POLICE } from './theme';

/**
 * @param {{ userId: string, lang?: string, ouvert: boolean, onReconnecter: () => void, plateformesFermees?: string[] }} p
 *   ouvert : l'écran « Me connecter » est ouvert (le bandeau se tait, et relit à sa fermeture).
 */
export default function BandeauCloudReconnexion({ userId, lang = 'fr', ouvert, onReconnecter, plateformesFermees = [] }) {
  const T = textesConnexion(lang);
  const [aRefaire, setARefaire] = useState([]);
  const [arret, setArret] = useState(null);
  const [masque, setMasque] = useState(false);
  // Une clé stable : un tableau neuf à chaque rendu d'App ne doit jamais relancer une lecture.
  const fermeesCle = (plateformesFermees ?? []).join(',');

  const relire = useCallback(async () => {
    if (!userId) return;
    try {
      const [{ data: p }, { data: etats, error }, { data: executant, error: errExec }] = await Promise.all([
        supabase.from('profiles').select('cloud_voie').eq('id', userId).maybeSingle(),
        supabase.rpc('cloud_coffre_etat_moi'),
        supabase.rpc('cloud_executant_moi'),
      ]);
      const a = errExec ? null : executantArrete({ cloudVoie: p?.cloud_voie === true, executant });
      // L'heure se met en mots à la LECTURE (jamais pendant le rendu).
      setArret(a ? { ...a, depuisTexte: a.depuis ? quandParis(a.depuis, Date.now(), lang) : null } : null);
      if (error) return;
      setARefaire(plateformesAReconnecter({ cloudVoie: p?.cloud_voie === true, etats, fermees: fermeesCle ? fermeesCle.split(',') : [],
        plateformes: CLOUD_PLATEFORMES_CONNEXION }));
    } catch { /* illisible : rien d'affiché, jamais un état deviné */ }
  }, [userId, fermeesCle, lang]);

  useEffect(() => {
    if (ouvert) return undefined;
    const t = setTimeout(relire, 0);   // la lecture part hors du rendu de l'effet
    return () => clearTimeout(t);
  }, [ouvert, relire]);
  useEffect(() => {
    const auRetour = () => { if (document.visibilityState === 'visible') { setMasque(false); relire(); } };
    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auRetour);
    return () => { window.removeEventListener('focus', auRetour); document.removeEventListener('visibilitychange', auRetour); };
  }, [relire]);

  if (ouvert || masque || (!aRefaire.length && !arret)) return null;
  const noms = aRefaire.map((p) => p.nom);
  if (arret) {
    return (
      <div role="status" aria-live="polite" data-cloud-executant-arrete="" style={{
        position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 84px)', zIndex: 1050,
        maxWidth: 540, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: BLANC,
        border: `1px solid ${C.amber}`, boxShadow: '0 6px 24px rgba(16,32,27,.14)', fontFamily: POLICE,
      }}>
        <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{T.executantArreteTitre(arret.depuisTexte)}</div>
        <div style={{ fontSize: 13, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{T.executantArreteTexte(arret.cause)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" onClick={() => setMasque(true)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 11, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600, fontSize: 14 }}>{T.plusTard}</button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 84px)', zIndex: 1050,
      maxWidth: 540, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: BLANC,
      border: `1px solid ${C.amber}`, boxShadow: '0 6px 24px rgba(16,32,27,.14)', fontFamily: POLICE,
    }}>
      <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{T.bandeauTitre(noms)}</div>
      <div style={{ fontSize: 13, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{T.bandeauTexte(noms)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onReconnecter} style={{ flex: 1, minHeight: 40, borderRadius: 11, border: 'none', background: DEGRADE_TEAL, color: BLANC, fontWeight: 700, fontSize: 14 }}>{T.reconnecter}</button>
        <button type="button" onClick={() => setMasque(true)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 11, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600, fontSize: 14 }}>{T.plusTard}</button>
      </div>
    </div>
  );
}
