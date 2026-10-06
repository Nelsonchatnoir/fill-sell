// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › NOTIFICATIONS DE VENTES — activer ou couper (06/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// N'EXISTE PAS sans le module natif (binaire d'avant 2.9.62, web) : le
// composant ne rend rien, aucun groupe vide, aucun texte.
// Couper vaut pour CET appareil : le serveur l'oublie (push_oublier_appareil).
// Refusé au niveau du système : on dit où le rouvrir, on ne redemande pas.
import { useCallback, useEffect, useId, useState } from 'react';
import { activerPush, couperPush, etatInterrupteur } from './pushVentes';
import { R } from '../reglages/theme';
import { Groupe, Carte, Note } from '../reglages/ReglagesUI';

const TEXTES = {
  fr: {
    groupe: 'Notifications',
    libelle: 'Notifications de ventes',
    detail: 'Sois prévenu dès qu’un article se vend, sur toutes tes plateformes.',
    refuse: 'Les notifications de FillSell sont coupées dans les réglages de ton téléphone. Réactive-les là-bas pour les recevoir.',
  },
  en: {
    groupe: 'Notifications',
    libelle: 'Sale notifications',
    detail: 'Get notified the moment an item sells, on all your platforms.',
    refuse: 'FillSell notifications are turned off in your phone settings. Turn them back on there to receive them.',
  },
};

export default function ReglageNotifications({ lang }) {
  const T = TEXTES[lang === 'en' ? 'en' : 'fr'];
  const idLibelle = useId();
  const [etat, setEtat] = useState(null); // null = pas d'interrupteur
  const [enCours, setEnCours] = useState(false);

  const relire = useCallback(() => etatInterrupteur().then(setEtat).catch(() => setEtat(null)), []);
  useEffect(() => { relire(); }, [relire]);

  if (!etat) return null;

  const basculer = async () => {
    setEnCours(true);
    try {
      if (etat.actif) await couperPush();
      else await activerPush();
    } catch { /* l'état relu ci-dessous dit la vérité */ }
    await relire();
    setEnCours(false);
  };

  return (
    <Groupe intitule={T.groupe}>
      <Carte>
        <div className="rg-ligne" style={{ minHeight: 60, alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span id={idLibelle} style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{T.libelle}</span>
            <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.detail}</span>
          </span>
          <button
            type="button" role="switch" aria-checked={etat.actif} aria-labelledby={idLibelle}
            disabled={enCours} onClick={basculer}
            style={{
              flexShrink: 0, width: 52, height: 32, borderRadius: 16, border: 'none', padding: 3,
              background: etat.actif ? '#2F9E90' : 'rgba(16, 32, 27, 0.18)', cursor: 'pointer',
              transition: 'background 0.2s', opacity: enCours ? 0.6 : 1, display: 'flex',
              justifyContent: etat.actif ? 'flex-end' : 'flex-start',
            }}
          >
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 13, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </Carte>
      {etat.refuseParLeSysteme && <Note>{T.refuse}</Note>}
    </Groupe>
  );
}
