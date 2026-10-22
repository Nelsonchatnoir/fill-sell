// ═══════════════════════════════════════════════════════════════════════════
// LE CHARGEMENT A UNE FIN (22/10, Sébastien — logo qui tourne sans fin)
// ═══════════════════════════════════════════════════════════════════════════
// Posé SOUS le logo de l'écran de chargement de l'app (App.jsx). Rien pendant
// les 15 premières secondes (un chargement normal ne le voit jamais). Ensuite :
//   · une phrase qui dit ce qui se passe, « Réessayer » et « Recharger la page » ;
//   · la reprise SEULE, sans boucle :
//       – une version plus récente est en ligne (/build.json) → un rechargement,
//         une fois par version distante et par onglet (fs_recharge_build) ;
//       – premier chargement sans données (lecture sans réponse au bout de 30 s) →
//         nouvel essai à 5 s, 15 s, 30 s, puis toutes les 60 s (6 au plus) ;
//       – toujours là au bout de 45 s → UN rechargement de la page par version et
//         par onglet (fs_recharge_chargement) : il rouvre des connexions neuves.
//         Ensuite, seulement les boutons.
// Aucune saisie n'existe sur cet écran : rien ne peut s'y perdre.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { UI } from './ui';
import { uneFoisPar, noterEtape } from '../utils/chargementBorne';

const ATTENTE_AVANT_MESSAGE_MS = 15_000;
const ATTENTE_AVANT_RECHARGEMENT_MS = 45_000;
const ESSAIS_MS = [5_000, 15_000, 30_000, 60_000, 60_000, 60_000];

function langue() {
  try {
    return (localStorage.getItem('fs_lang') || ((navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en')) === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export default function EcranChargementLong({ echec = false, buildCourant = null, natif = false, reessayer = null }) {
  const [visible, setVisible] = useState(false);
  const [essai, setEssai] = useState(0);
  const reessayerRef = useRef(reessayer);
  useEffect(() => { reessayerRef.current = reessayer; }, [reessayer]);
  const fr = langue() === 'fr';

  // Le message, puis la version en ligne, puis un rechargement par onglet.
  useEffect(() => {
    let fini = false;
    const tMessage = setTimeout(async () => {
      if (fini) return;
      setVisible(true);
      noterEtape('chargement_long');
      if (natif || !buildCourant) return;
      try {
        const res = await fetch('/build.json', { cache: 'no-store' });
        const distant = String((await res.json().catch(() => null))?.build ?? '');
        if (!fini && distant && distant !== buildCourant && uneFoisPar('fs_recharge_build', distant)) {
          console.warn('[chargement] version plus récente en ligne — rechargement');
          window.location.reload();
        }
      } catch { /* hors ligne : les essais et le rechargement plus bas prennent le relais */ }
    }, ATTENTE_AVANT_MESSAGE_MS);
    const tRecharge = setTimeout(() => {
      if (fini) return;
      if (uneFoisPar('fs_recharge_chargement', buildCourant ?? 'sans-build')) {
        console.warn('[chargement] toujours en cours après 45 s — un rechargement (une fois par onglet)');
        window.location.reload();
      }
    }, ATTENTE_AVANT_RECHARGEMENT_MS);
    return () => { fini = true; clearTimeout(tMessage); clearTimeout(tRecharge); };
  }, [buildCourant, natif]);

  // Premier chargement sans données : nouveaux essais espacés, bornés.
  useEffect(() => {
    if (!echec) return undefined;
    if (essai >= ESSAIS_MS.length) return undefined;
    const t = setTimeout(() => {
      setEssai((n) => n + 1);
      reessayerRef.current?.();
    }, ESSAIS_MS[essai]);
    return () => clearTimeout(t);
  }, [echec, essai]);

  if (!visible && !echec) return null;
  const phrase = echec
    ? (fr ? 'Tes données ne sont pas encore arrivées : la connexion semble lente ou coupée. Nouvel essai automatique…'
          : 'Your data has not arrived yet: the connection seems slow or down. Retrying automatically…')
    : (fr ? 'Le chargement prend plus de temps que prévu.' : 'Loading is taking longer than expected.');
  const bouton = { padding: '10px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `1px solid ${UI.teal}`, fontFamily: 'inherit' };
  return (
    <div role="status" style={{ maxWidth: 320, padding: '0 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: UI.ink }}>{phrase}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {reessayer && (
          <button type="button" style={{ ...bouton, background: UI.teal, color: '#fff' }}
            onClick={() => { noterEtape('reessayer_manuel'); reessayerRef.current?.(); }}>
            {fr ? 'Réessayer' : 'Try again'}
          </button>
        )}
        <button type="button" style={{ ...bouton, background: 'transparent', color: UI.teal }}
          onClick={() => window.location.reload()}>
          {fr ? 'Recharger la page' : 'Reload the page'}
        </button>
      </div>
    </div>
  );
}
