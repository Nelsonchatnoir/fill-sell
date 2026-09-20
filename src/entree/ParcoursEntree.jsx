// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LA COQUE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Refonte complète du post-inscription. Rien de l'ancien parcours n'est
// conservé côté écrans : ni la question « Tu vends déjà en ligne ? », ni la
// branche oui/non, ni l'écran d'attente et ses deux variantes. L'ancien
// fichier (components/OnboardingFlow.jsx) est SUPPRIMÉ, pas neutralisé.
//
// CE QUI EST CONSERVÉ — et qui ne se renégocie pas :
//   · la SOURCE DE VÉRITÉ de « cet utilisateur a fait son onboarding » reste
//     profiles.onboarded_at, un fait de COMPTE ; le localStorage n'est qu'un
//     cache anti-clignotement, écrit APRÈS la base ;
//   · ONBOARD_STATE_KEY = 'attente_extension' garde son nom ET son sens (elle
//     est lue hors d'ici) : posée dès qu'on atteint l'étape extension sans
//     extension détectée, retirée à la fin ;
//   · la télémétrie usage_logs 'onboarding_choice' garde ses valeurs
//     historiques 'continuer_telephone' et 'plus_tard' pour que les mesures
//     existantes continuent de se lire ;
//   · la signature du composant est INCHANGÉE (lang, user, onDone,
//     demanderPseudo, onUsername) → App.jsx ne change que son chemin d'import.
//
// LA RÈGLE DU PARCOURS : chaque étape est sautable, aucune ne conditionne
// l'entrée dans l'app. La seule non passable est le récap, qui EST la sortie.
//
// ⛔ LE DRAPEAU EST POSÉ DANS TOUS LES CAS DE SORTIE — parcours terminé,
//    « Passer » jusqu'au bout, ET fermeture de l'app en cours de route
//    (pagehide / onglet masqué). Personne ne revoit ce parcours deux fois.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  useContexteEntree, marquerEntreeFaite, marquerEntreeFaiteAuVol,
  ONBOARD_DONE_KEY, ONBOARD_STATE_KEY, ENTREE_ETAPE_KEY, ENTREE_RELEVE_KEY,
} from './useContexteEntree';
import { etapesVisibles } from './plan';
import { textesEntree } from './textes';
import { E, CSS_ENTREE } from './theme';
import { Progression, LienDiscret } from './EntreeUI';
import EtapePlateformes from './EtapePlateformes';
import EtapeEbay from './EtapeEbay';
import EtapeExtension from './EtapeExtension';
import EtapeReleve from './EtapeReleve';
import EtapeDebut from './EtapeDebut';
import EtapeRepublication from './EtapeRepublication';
import EtapePseudo from './EtapePseudo';
import EtapeFin from './EtapeFin';

// Un id d'étape → un composant. C'est la SEULE table de correspondance.
const ECRANS = {
  plateformes: EtapePlateformes,
  ebay: EtapeEbay,
  extension: EtapeExtension,
  releve: EtapeReleve,
  debut: EtapeDebut,
  republication: EtapeRepublication,
  pseudo: EtapePseudo,
  fin: EtapeFin,
};

const lireEtapeInitiale = () => {
  try { return localStorage.getItem(ENTREE_ETAPE_KEY) || null; }
  catch { return null; }
};

export { ONBOARD_DONE_KEY, ONBOARD_STATE_KEY };

export default function ParcoursEntree({ lang, user, onDone, demanderPseudo = false, onUsername = null }) {
  const T = useMemo(() => textesEntree(lang), [lang]);
  const c = useContexteEntree({ lang, user, demanderPseudo });
  const [etapeId, setEtapeId] = useState(lireEtapeInitiale);
  const [pseudo, setPseudo] = useState('');
  const finiRef = useRef(false);

  const liste = etapesVisibles(c);
  const indexBrut = liste.findIndex((e) => e.id === etapeId);
  const index = indexBrut < 0 ? 0 : indexBrut;
  const etape = liste[index];
  const Ecran = ECRANS[etape.id];

  const poser = (id) => {
    setEtapeId(id);
    try {
      localStorage.setItem(ENTREE_ETAPE_KEY, id);
      // Le drapeau historique : « cet appareil-ci attend l'extension ».
      if (id === 'extension' && !c.extensionVue) localStorage.setItem(ONBOARD_STATE_KEY, 'attente_extension');
    } catch { /* cache d'affichage seul */ }
  };

  const suivant = () => {
    const prochaine = liste[Math.min(liste.length - 1, index + 1)];
    poser(prochaine.id);
  };

  // ── SORTIE EN COURS DE ROUTE ───────────────────────────────────────────────
  // L'app se ferme, l'onglet part, le téléphone met l'app en fond : le drapeau
  // est posé quand même. Sans ça, quelqu'un qui referme à l'écran 2 revoit
  // tout le parcours au prochain lancement.
  // `pagehide` d'abord (c'est la vraie fin du document, et fetch(keepalive) y
  // survit) ; l'onglet masqué en second, par le client Supabase, qui a le
  // temps d'aboutir. Deux chemins, une seule écriture — sortieRef tranche.
  const sortieRef = useRef(false);
  useEffect(() => {
    if (!user?.id) return undefined;
    const surPagehide = () => {
      if (sortieRef.current) return;
      sortieRef.current = true;
      marquerEntreeFaiteAuVol(user.id, c.jetonRef.current);
    };
    const surMasquage = () => {
      if (document.visibilityState !== 'hidden' || sortieRef.current) return;
      sortieRef.current = true;
      marquerEntreeFaite(user.id);
    };
    window.addEventListener('pagehide', surPagehide);
    document.addEventListener('visibilitychange', surMasquage);
    return () => {
      window.removeEventListener('pagehide', surPagehide);
      document.removeEventListener('visibilitychange', surMasquage);
    };
  }, [user?.id, c.jetonRef]);

  // FIN DU PARCOURS. Écriture best-effort mais JOURNALISÉE : si elle échoue,
  // l'écran réapparaîtra au prochain chargement (fetchAll relit la base).
  // C'est le bon échec — bruyant et réparable — plutôt qu'un cache local qui
  // masque le problème en laissant la base fausse.
  const terminer = async () => {
    if (finiRef.current) return;
    finiRef.current = true;
    const nom = pseudo.trim().slice(0, 30);
    if (nom && user?.id) {
      const { error } = await supabase.rpc('set_profile_username', { p_username: nom });
      if (error) console.warn('[entree] pseudo non écrit :', error.message);
      else onUsername?.(nom);
    }
    sortieRef.current = true;
    await marquerEntreeFaite(user?.id);
    try {
      localStorage.setItem(ONBOARD_DONE_KEY, '1');
      localStorage.removeItem(ONBOARD_STATE_KEY);
      localStorage.removeItem(ENTREE_ETAPE_KEY);
      // ⚠️ ENTREE_RELEVE_KEY reste : la demande de relevé peut encore être en
      // attente de l'extension, et le Stock la reprendra. fs_extension_link_sent
      // reste aussi — elle appartient au mécanisme partagé (le Stock doit
      // savoir qu'un lien vient de partir).
      if (c.releve.etat === 'lance') localStorage.removeItem(ENTREE_RELEVE_KEY);
    } catch { /* la base fait foi de toute façon */ }
    // Destination : le Stock quand il y a quelque chose à y voir, l'écran de
    // création sinon. Même arbitrage que l'ancien parcours.
    onDone?.(c.choix.plateformes.length ? 'stock' : 'lens');
  };

  const passer = () => {
    c.journaliser(etape.id === 'extension' ? 'plus_tard' : `passe_${etape.id}`);
    suivant();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9980, background: E.page, color: E.ink,
        display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <style>{CSS_ENTREE}</style>

      {/* En-tête : la progression et la sortie de l'étape. Ne défile jamais. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        padding: 'calc(env(safe-area-inset-top,0px) + 18px) 20px 14px',
      }}>
        <Progression total={liste.length - 1} index={index} />
        {etape.passable !== false && (
          <LienDiscret onClick={passer} style={{ width: 'auto', fontSize: 13.5, padding: '8px 2px' }}>
            {T.passer}
          </LienDiscret>
        )}
      </div>

      {/* Corps : il DÉFILE, il ne comprime pas (cf. .rg-corps, même piège). */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '0 20px calc(env(safe-area-inset-bottom,0px) + 26px)',
        display: 'flex', flexDirection: 'column',
      }}>
        <Ecran
          c={c}
          T={T}
          pseudo={pseudo}
          setPseudo={setPseudo}
          onSuivant={suivant}
          onTerminer={terminer}
        />
      </div>
    </div>,
    document.body,
  );
}
