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
//     (04/11/2026, lot 3) Deux props FACULTATIVES s'y ajoutent : `palier`
//     (celui de l'app, pour « Ton plan » de la grille à 3 jauges) et
//     `essaiCloud(origine)` (l'achat de l'essai Cloud par le chemin existant,
//     achatCloud.acheter ; null = pas de voie Cloud). Absentes : le parcours d'avant.
//   · (04/11, lot 3) la télémétrie 'onboarding_choice' garde toutes ses
//     valeurs ; la voie Cloud en AJOUTE (voie_cloud, voie_extension, voie_info,
//     voie_retour, cloud_essai_*, cloud_ordinateur, cloud_connexion_ouverte…).
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
  ONBOARD_DONE_KEY, ONBOARD_STATE_KEY, ENTREE_ETAPE_KEY, ENTREE_RELEVE_KEY, ENTREE_VOIE_KEY,
} from './useContexteEntree';
import { etapesVisibles, indexDeReprise } from './plan';
import { textesEntree } from './textes';
// (13/11/2026, bloc B2) eBay se relie APRÈS le parcours, par le chemin existant (utils/ebayCompte).
import { demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { relierEbayApresEntree } from './ebayApres';
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
import EtapeVoie from './EtapeVoie';
import EtapeCloudConnexion from './EtapeCloudConnexion';
import EtapeFree from './EtapeFree';
// (11/11/2026) Les formules avec Cloud : « As-tu un ordinateur ? », la présentation, « Choisis ta formule », l'essai, la formule.
import { EtapeOrdinateur, EtapeCloudPresentation, EtapeCloudOffres, EtapeCloudOuFormule, EtapeFormule } from './EtapesFormules';
import { ENTREE_FORMULE_KEY } from './useFormulesEntree';

// Un id d'étape → un composant. C'est la SEULE table de correspondance.
// (13/11/2026) `ebay` et `free` ne sont plus dans le plan (plan.js) : leurs écrans restent ici, montables, pour qu'un
// retour arrière ne demande que la ligne du plan.
const ECRANS = {
  plateformes: EtapePlateformes,
  ebay: EtapeEbay,
  voie: EtapeVoie,
  cloud: EtapeCloudOuFormule,
  ordinateur: EtapeOrdinateur,
  cloud_presentation: EtapeCloudPresentation,
  cloud_offres: EtapeCloudOffres,
  formule: EtapeFormule,
  cloud_connexion: EtapeCloudConnexion,
  extension: EtapeExtension,
  releve: EtapeReleve,
  debut: EtapeDebut,
  republication: EtapeRepublication,
  free: EtapeFree,
  pseudo: EtapePseudo,
  fin: EtapeFin,
};

// (04/11, lot 3) PENDANT l'achat de l'essai Cloud seulement : le parcours passe SOUS la case des conditions
// d'utilisation du Cloud (ConditionsCloudModale, z-index 1250, montée par App avant toute carte) — sinon elle
// s'ouvrirait derrière lui et l'achat attendrait une case invisible. Au-dessus du reste de l'app (≤ 1050).
const Z_PARCOURS = 9980;
const Z_PENDANT_ACHAT_CLOUD = 1240;

const lireEtapeInitiale = () => {
  try { return localStorage.getItem(ENTREE_ETAPE_KEY) || null; }
  catch { return null; }
};

export { ONBOARD_DONE_KEY, ONBOARD_STATE_KEY };

export default function ParcoursEntree({ lang, user, onDone, demanderPseudo = false, onUsername = null, palier = 'gratuit', essaiCloud = null, essaiFormule = null }) {
  const T = useMemo(() => textesEntree(lang), [lang]);
  const c = useContexteEntree({ lang, user, demanderPseudo, palier, essaiCloud, essaiFormule });
  const [etapeId, setEtapeId] = useState(lireEtapeInitiale);
  const [pseudo, setPseudo] = useState('');
  const finiRef = useRef(false);

  const liste = etapesVisibles(c);
  // (13/11) Une position gardée sur une étape retirée (ebay, free) reprend à l'étape qui la suivait.
  const index = indexDeReprise(liste, etapeId);
  const etape = liste[index];
  const Ecran = ECRANS[etape.id];

  // (13/11/2026, bloc B2) CHAQUE ÉCRAN VU laisse une trace, une fois par écran et par ouverture du parcours. Avant, les
  // écrans sans choix (remontées, pseudo, récap) ne se voyaient nulle part : « arrivé au récap » se lisait « arrêté
  // après le plan Free ». rang / total : la place de l'écran dans la liste de CE compte.
  const vuesRef = useRef(new Set());
  const journaliser = c.journaliser;
  const rang = index + 1;
  const total = liste.length;
  useEffect(() => {
    if (vuesRef.current.has(etape.id)) return;
    vuesRef.current.add(etape.id);
    journaliser('etape_vue', { etape: etape.id, rang, total });
  }, [etape.id, rang, total, journaliser]);

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
  // (04/11, lot 3) Aller à une étape NOMMÉE : un choix (voie Cloud / extension) change la liste au rendu suivant,
  // `suivant` calculerait la prochaine sur l'ancienne. L'étape visée est visible dès ce rendu-là (plan.js).
  const aller = (id) => poser(id);

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
  // (13/11/2026) `ensuite` : ce que la sortie enchaîne (null, ou 'ebay'), journalisé avec la destination.
  const sortir = async (ensuite) => {
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
      localStorage.removeItem(ENTREE_VOIE_KEY);
      localStorage.removeItem(ENTREE_FORMULE_KEY);
      // ⚠️ ENTREE_RELEVE_KEY reste : la demande de relevé peut encore être en
      // attente de l'extension, et le Stock la reprendra. fs_extension_link_sent
      // reste aussi — elle appartient au mécanisme partagé (le Stock doit
      // savoir qu'un lien vient de partir).
      if (c.releve.etat === 'lance') localStorage.removeItem(ENTREE_RELEVE_KEY);
    } catch { /* la base fait foi de toute façon */ }
    // Destination : le Stock quand il y a quelque chose à y voir, l'écran de
    // création sinon. Même arbitrage que l'ancien parcours.
    const destination = c.choix.plateformes.length ? 'stock' : 'lens';
    c.journaliser('parcours_termine', { destination, ensuite });
    onDone?.(destination);
  };

  // (13/11/2026, bloc B2) « Relier eBay » du récap : l'adresse d'eBay est demandée, le parcours est MARQUÉ FINI
  // (attendu), puis la page eBay s'ouvre (entree/ebayApres.js) — sur le web elle remplace l'app : elle ne doit jamais
  // emporter un parcours pas fini. Rend { ok, erreur } au récap (eBay indisponible : on y reste, la phrase le dit).
  const terminer = async ({ ensuite = null } = {}) => {
    if (ensuite === 'ebay') {
      return relierEbayApresEntree({
        lang,
        demarrer: demarrerConnexionEbay,
        ouvrir: ouvrirConsentementEbay,
        terminer: () => sortir('ebay'),
        journaliser: c.journaliser,
      });
    }
    await sortir(null);
    return { ok: true };
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
        position: 'fixed', inset: 0, zIndex: c.cloud?.achat?.etat === 'en_cours' ? Z_PENDANT_ACHAT_CLOUD : Z_PARCOURS, background: E.page, color: E.ink,
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
          onAller={aller}
          onTerminer={terminer}
        />
      </div>
    </div>,
    document.body,
  );
}
