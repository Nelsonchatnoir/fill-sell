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
// (02/11, demande de Nico) UNE VÉRIFICATION ANTI-ROBOT du navigateur Cloud se dit à part, avec le bon geste
// (platform_settings.<plateforme>.cloud_verification, verificationsCloud) : soluble à la main → « Résoudre la
// vérification » ouvre ICI la page du Cloud où elle s'affiche (la vue de « Me connecter », mode 'resoudre') ; accès
// restreint sans vérification, ou vérification revenue → aucun bouton, on attend. Jamais « ouvre … dans ton navigateur ».
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { plateformesAReconnecter, executantArrete, quandParis, verificationsCloud } from './executant';
import { Vue } from './MeConnecterCloud';
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
  const [verifs, setVerifs] = useState([]);
  const [resolution, setResolution] = useState(null);   // la plateforme dont la page de vérification est ouverte
  const [masque, setMasque] = useState(false);
  // Une clé stable : un tableau neuf à chaque rendu d'App ne doit jamais relancer une lecture.
  const fermeesCle = (plateformesFermees ?? []).join(',');

  const relire = useCallback(async () => {
    if (!userId) return;
    try {
      const [{ data: p }, { data: etats, error }, { data: executant, error: errExec }] = await Promise.all([
        supabase.from('profiles').select('cloud_voie, platform_settings').eq('id', userId).maybeSingle(),
        supabase.rpc('cloud_coffre_etat_moi'),
        supabase.rpc('cloud_executant_moi'),
      ]);
      const a = errExec ? null : executantArrete({ cloudVoie: p?.cloud_voie === true, executant });
      // (05/11 soir, point 5) Le démarrage : depuis quand il est vu sur cet appareil (au-delà de 10 min : « plus long que
      // prévu, l'équipe est prévenue »). Une commodité locale : illisible ou effacé, on repart de maintenant.
      let long = false;
      try {
        const cle = `fs_cloud_demarrage_vu_${userId}`;
        if (a?.cause === 'demarrage') {
          const vu = Number(localStorage.getItem(cle)) || Date.now();
          localStorage.setItem(cle, String(vu));
          long = Date.now() - vu > 10 * 60_000;
        } else localStorage.removeItem(cle);
      } catch { /* mode privé */ }
      if (a) a.long = long;
      // L'heure se met en mots à la LECTURE (jamais pendant le rendu).
      setArret(a ? { ...a, depuisTexte: a.depuis ? quandParis(a.depuis, Date.now(), lang) : null } : null);
      const fermees = fermeesCle ? fermeesCle.split(',') : [];
      const v = verificationsCloud({ cloudVoie: p?.cloud_voie === true, platformSettings: p?.platform_settings ?? null, fermees, plateformes: CLOUD_PLATEFORMES_CONNEXION });
      // (02/11 soir) Une vérification EN COURS de confirmation (3 min) : ni bandeau ni « à reconnecter » — rien à faire.
      setVerifs(v.filter((x) => x.etat !== 'verification_en_cours'));
      if (error) return;
      // Une plateforme en vérification a SON bandeau (ci-dessous) : jamais aussi « déconnectée ».
      setARefaire(plateformesAReconnecter({ cloudVoie: p?.cloud_voie === true, etats, fermees: [...fermees, ...v.map((x) => x.id)],
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

  if (resolution) {
    const vue = <Vue userId={userId} plateforme={resolution.id} nom={resolution.nom} lang={lang} mode="resoudre"
      onFermer={() => { setResolution(null); relire(); }} />;
    return typeof document === 'undefined' ? vue : createPortal(vue, document.body);
  }
  if (ouvert || masque || (!aRefaire.length && !arret && !verifs.length)) return null;
  const noms = aRefaire.map((p) => p.nom);
  if (arret?.cause === 'demarrage') {
    return (
      <div role="status" aria-live="polite" data-cloud-demarrage={arret.long ? 'long' : ''} translate="no" className="notranslate" style={{
        position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 84px)', zIndex: 1050,
        maxWidth: 540, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: BLANC,
        border: `1px solid ${C.teal}`, boxShadow: '0 6px 24px rgba(16,32,27,.14)', fontFamily: POLICE,
      }}>
        <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{T.executantDemarreTitre}</div>
        <div style={{ fontSize: 13, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{T.executantDemarreTexte(arret.long)}</div>
      </div>
    );
  }
  if (arret) {
    return (
      <div role="status" aria-live="polite" data-cloud-executant-arrete="" translate="no" className="notranslate" style={{
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
  if (verifs.length) {
    // À résoudre d'abord (un geste possible) ; sinon ce qui attend sans geste.
    const aResoudre = verifs.filter((v) => v.etat === 'a_resoudre');
    const etat = aResoudre.length ? 'a_resoudre' : verifs[0].etat;
    const concernees = aResoudre.length ? aResoudre : verifs.filter((v) => v.etat === etat);
    const nomsV = concernees.map((v) => v.nom);
    return (
      <div role="status" aria-live="polite" data-cloud-verification={etat} translate="no" className="notranslate" style={{
        position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 84px)', zIndex: 1050,
        maxWidth: 540, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: BLANC,
        border: `1px solid ${C.amber}`, boxShadow: '0 6px 24px rgba(16,32,27,.14)', fontFamily: POLICE,
      }}>
        <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{T.bandeauVerifTitre(nomsV, etat)}</div>
        <div style={{ fontSize: 13, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{T.bandeauVerifTexte(nomsV, etat)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {etat === 'a_resoudre' && (
            <button type="button" data-cloud-bouton="resoudre" onClick={() => setResolution(concernees[0])} style={{ flex: 1, minHeight: 40, borderRadius: 11, border: 'none', background: DEGRADE_TEAL, color: BLANC, fontWeight: 700, fontSize: 14 }}>{T.resoudre}</button>
          )}
          <button type="button" onClick={() => setMasque(true)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 11, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600, fontSize: 14 }}>{T.plusTard}</button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" translate="no" className="notranslate" style={{
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
