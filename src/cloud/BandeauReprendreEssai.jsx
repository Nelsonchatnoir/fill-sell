// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « TON ESSAI N'A PAS DÉMARRÉ — REPRENDRE MON ESSAI » (16/11/2026, point 2d du lot de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par App. Règles pures : cloud/repriseEssai.js (marque posée au départ vers Stripe ou à la feuille de la boutique
// fermée ; visible au retour, 20 s à 24 h, tant que le Cloud ne tourne pas et que la formule se vend). Relu au montage,
// au retour au premier plan (visibilitychange, pageshow : la flèche « retour » depuis Stripe rend la page du cache) —
// jamais une relecture en boucle. Chaque geste laisse sa trace (`journal`) : vu, clic, fermé.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, BLANC, DEGRADE_TEAL, MENTHE, POLICE } from './theme';
import { useCloudProfil } from './useCloudProfil';
import { bandeauRepriseVisible, effacerEssaiAReprendre, lireEssaiAReprendre, texteBandeauReprise } from './repriseEssai';
import { EVENEMENT_VEILLE, veilleEnCours } from './veilleAchatBoutique';
import { achatFermeDeLecture } from './cloudOffert';

export default function BandeauReprendreEssai({ userId, lang = 'fr', vendable = () => false, onReprendre, journal = () => {} }) {
  const lecture = useCloudProfil(userId, { actif: Boolean(userId) });
  const [marque, setMarque] = useState(() => lireEssaiAReprendre());
  // (16/11/2026, validation bancaire) Un achat qui attend la banque (veille d'achat) : jamais « n'a pas démarré ».
  const [veille, setVeille] = useState(() => veilleEnCours({ userId }));
  const [horloge, setHorloge] = useState(() => Date.now());
  const vuRef = useRef(null);
  const relire = useCallback(() => { setMarque(lireEssaiAReprendre()); setVeille(veilleEnCours({ userId })); setHorloge(Date.now()); }, [userId]);
  const relireLecture = lecture.relire;

  useEffect(() => {
    const surVisible = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') { relire(); relireLecture?.(); } };
    // La veille notée, finie ou échue (cloud/veilleAchatBoutique.js) : relue tout de suite, sans attendre un retour.
    const surVeille = () => { relire(); relireLecture?.(); };
    window.addEventListener('pageshow', surVisible);
    window.addEventListener(EVENEMENT_VEILLE, surVeille);
    document.addEventListener('visibilitychange', surVisible);
    return () => { window.removeEventListener('pageshow', surVisible); window.removeEventListener(EVENEMENT_VEILLE, surVeille); document.removeEventListener('visibilitychange', surVisible); };
  }, [relire, relireLecture]);

  // Une marque trop jeune (on revient à peine) : une seule relecture quand elle aura l'âge, jamais une boucle.
  useEffect(() => {
    if (!marque) return undefined;
    const reste = Number(marque.at) + 20_000 - Date.now();
    if (!(reste > 0) || reste > 60_000) return undefined;
    const t = setTimeout(relire, reste + 200);
    return () => clearTimeout(t);
  }, [marque, relire]);

  const cloudActif = lecture.etat === 'ok' ? lecture.cloud?.actif === true : null;
  // Le Cloud tourne : l'essai a démarré (ou une formule est prise) — la marque n'a plus lieu d'être.
  // (le bandeau se cache seul : bandeauRepriseVisible exige un Cloud éteint ; seule la marque stockée s'efface ici)
  useEffect(() => { if (marque && cloudActif === true) effacerEssaiAReprendre(); }, [marque, cloudActif]);

  const visible = bandeauRepriseVisible({ marque, cloudActif, vendable: marque ? vendable(marque.formule) === true : false, maintenant: horloge, veilleEnCours: veille,
    achatFerme: achatFermeDeLecture(lecture) });
  useEffect(() => {
    if (!visible || vuRef.current === marque?.at) return;
    vuRef.current = marque?.at ?? null;
    journal('essai_reprise_vu', { formule: marque?.formule ?? null, canal: marque?.canal ?? null, origine: marque?.origine ?? null, raison: marque?.raison ?? null, depuis_s: Math.round((Date.now() - Number(marque?.at)) / 1000) });
  }, [visible, marque, journal]);
  if (!visible || typeof document === 'undefined') return null;

  const T = texteBandeauReprise(lang, marque.formule, { raison: marque.raison ?? null });
  const fermer = () => { journal('essai_reprise_ferme', { formule: marque.formule }); effacerEssaiAReprendre(); setMarque(null); };
  const reprendre = () => { journal('essai_reprise_clic', { formule: marque.formule }); effacerEssaiAReprendre(); setMarque(null); onReprendre?.(marque.formule); };
  return createPortal(
    <div data-bandeau-reprise-essai="" role="region" aria-label={T.titre} style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)', zIndex: 1040, maxWidth: 560,
      margin: '0 auto', background: BLANC, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: '0 10px 30px rgba(15,23,42,0.18)',
      padding: '14px 14px 12px', fontFamily: POLICE,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>{T.titre}</div>
          <div style={{ fontSize: 13.2, color: C.mute2, lineHeight: 1.45, marginTop: 4 }}>{T.corps}</div>
        </div>
        <button type="button" onClick={fermer} aria-label={T.fermer} style={{
          border: 'none', background: MENTHE, color: C.ink, width: 32, height: 32, borderRadius: 999, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
        }}>×</button>
      </div>
      <button type="button" onClick={reprendre} style={{
        marginTop: 10, width: '100%', minHeight: 46, border: 'none', borderRadius: 12, background: DEGRADE_TEAL, color: BLANC, fontWeight: 800, fontSize: 15, cursor: 'pointer',
      }}>{T.bouton}</button>
    </div>,
    document.body,
  );
}
