// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — LA PAGE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// La roue crantée ouvrait une pop-up qui empilait tout à la suite, sans
// hiérarchie : compte, forfait, pseudo, adresse Leboncoin, eBay, encart Apple,
// support, mentions légales, langue, devise, déconnexion, suppression de
// compte, réinitialisation, bug. Tout au même niveau, tout à faire défiler.
//
// C'est désormais UNE PAGE plein écran : un hub qui ne contient QUE des lignes
// cliquables portant chacune sa valeur à droite, plus UNE carte de contenu (la
// consommation du mois, la seule chose qu'on veut voir sans entrer). Le reste
// vit dans des sous-pages, chacune avec son retour.
//
// ── CE QUE CE FICHIER FAIT, ET RIEN D'AUTRE ────────────────────────────────
//   1. il monte LE contexte `c` : tout ce que la page sait, en un objet ;
//   2. il déroule le PLAN (plan.js) — il n'énumère aucun réglage lui-même ;
//   3. il tient la PILE de navigation (hub → sous-page → retour).
// Ajouter un réglage ne se fait donc pas ici : cf. l'encadré de plan.js.
//
// ⛔ AUCUN RÉGLAGE NE CHANGE DE COMPORTEMENT. Les fonctions appelées sont
//    celles d'App.jsx, passées telles quelles (résiliation, restauration,
//    réinitialisation, suppression, déconnexion, devise) ; les écritures
//    directes (pseudo, adresse Leboncoin) sont recopiées au geste près dans
//    leurs sous-pages. Ce lot DÉPLACE et REGROUPE, il ne décide rien.
import { useMemo, useState } from 'react';
import { track } from '../analytics/analytics';
import PlanBadge from '../components/PlanBadge';
import {
  RepublicationPlanifieeReglages, RepublicationPlanifieeHistorique,
} from '../components/RepublicationPlanifiee';
import { useRepublicationPlanifiee, republicationPlanifieeExposee } from '../hooks/useRepublicationPlanifiee';
import { plateformesDuCompte } from '../utils/stockFiltres';
import { txt } from './textes';
import { GROUPES, entreesVisibles } from './plan';
import { useSessionsPlateformes } from './useSessionsPlateformes';
import { consommationVisible, dateRemiseAZero } from './quotas';
import {
  EcranReglages, Groupe, Carte, Ligne, Jauge, JaugeRepublication, CarteIdentite, PiedPage,
} from './ReglagesUI';
import SousPageAbonnement from './SousPageAbonnement';
import SousPagePlateformes from './SousPagePlateformes';
import SousPageExpedition from './SousPageExpedition';
import SousPageTransporteurs from './SousPageTransporteurs';
import SousPagePreferences from './SousPagePreferences';
import SousPageCompte from './SousPageCompte';

// ┌─ LES SOUS-PAGES ─────────────────────────────────────────────────────────┐
// │ UNE ligne par sous-page : son titre (dans le vocabulaire de textes.js)   │
// │ et son composant. Une sous-page de plus = une ligne de plus ici, et      │
// │ `ouvre:'<son id>'` sur l'entrée qui l'ouvre (plan.js).                   │
// └──────────────────────────────────────────────────────────────────────────┘
const SOUS_PAGES = {
  abonnement:    { titre: (T) => T.gAbonnement,    Composant: SousPageAbonnement },
  plateformes:   { titre: (T) => T.gPlateformes,   Composant: SousPagePlateformes },
  expedition:    { titre: (T) => T.adresseRemise,  Composant: SousPageExpedition },
  transporteurs: { titre: (T) => T.transporteurs,  Composant: SousPageTransporteurs },
  preferences:   { titre: (T) => T.gPreferences,   Composant: SousPagePreferences },
  compte:        { titre: (T) => T.gCompte,        Composant: SousPageCompte },
};

export default function ReglagesPage({
  onClose, lang, setLang, user,
  isPremium, isPro, isBusiness,
  natif, plateforme, extensionInstallable, extensionVersion, extensionStatus,
  quotas, username, setUsername,
  currency, saveCurrency, devises,
  adresseLbc, setAdresseLbc,
  plateformesOuvertes,
  onToast, ouvrirOffres, ouvrirSignalementBug,
  resiliation, restauration, reset, suppression, deconnexion,
}) {
  const T = txt(lang);
  const [pile, setPile] = useState([]);
  // Écran tiers monté PAR-DESSUS la page (portail à z-index supérieur) : tant
  // qu'il est là, la page n'écoute plus Échap — sinon une touche fermerait
  // les deux couches d'un coup.
  const [ecranRepub, setEcranRepub] = useState(null); // null | 'reglages' | 'historique'

  const planifiee = useRepublicationPlanifiee({ userId: user?.id });
  const planifieeExposee = republicationPlanifieeExposee(planifiee);
  // UNE SEULE RÉPONSE À « QUELLES PLATEFORMES ? » : celle du Stock
  // (utils/stockFiltres.plateformesDuCompte), jamais une liste recopiée ici —
  // c'est exactement la divergence corrigée le 17/09 (Opla absente des cartes).
  const plateformesSession = useMemo(() => plateformesDuCompte(plateformesOuvertes), [plateformesOuvertes]);
  const sessions = useSessionsPlateformes({ userId: user?.id, plateformes: plateformesSession });

  const courante = pile.length ? pile[pile.length - 1] : null;

  const ouvrir = (idSousPage, idEntree) => {
    track('reglages_ouvrir', { entree: idEntree ?? idSousPage });
    setPile((p) => [...p, idSousPage]);
  };

  const retour = () => {
    if (pile.length) { setPile((p) => p.slice(0, -1)); return; }
    onClose?.();
  };

  const toast = (message) => { onToast?.(message); };

  // ── Republication automatique : MÊME PORTE QU'AU PIED DU STOCK ───────────
  // Un compte non autorisé (module réservé au Pro) tombe sur la modale de
  // conversion, exactement comme avant ; un compte autorisé ouvre l'écran de
  // réglages existant. Rien d'autre n'a bougé : ni le hook, ni l'écran, ni
  // les écritures.
  const repubAutorisee = planifiee.etat?.autorise === true;
  const ouvrirRepublication = () => {
    if (!repubAutorisee) {
      track('premium_click', { source: 'reglages_republication_planifiee' });
      ouvrirOffres?.('reglages_republication_planifiee');
      return;
    }
    track('republication_planifiee', { action: 'ouvrir_reglages', depuis: 'reglages' });
    setEcranRepub('reglages');
  };

  const remiseAZero = useMemo(() => dateRemiseAZero(quotas?.cycle_debut, lang), [quotas?.cycle_debut, lang]);
  const deviseLabel = useMemo(
    () => devises?.find((d) => d.code === currency)?.label ?? currency,
    [devises, currency],
  );
  const nomFormule = isBusiness ? 'Business' : isPro ? 'Pro' : isPremium ? 'Premium' : null;

  // ── LE CONTEXTE ─────────────────────────────────────────────────────────
  // Tout ce que la page sait, en un objet. Les entrées du plan le LISENT ;
  // elles ne calculent rien.
  // ⚠️ PAS de useMemo ici, et c'est délibéré : App reconstruit à chaque rendu
  // les objets qu'il passe (adresseLbc, resiliation, reset, …), donc une
  // mémoïsation serait invalidée à tous les coups — elle coûterait un tableau
  // de dépendances à tenir à jour pour zéro gain. Le contenu de la page est
  // une poignée de lignes : le rendre est moins cher que le mémoriser.
  const c = {
    user, lang, setLang,
    isPremium, isPro, isBusiness, nomFormule,
    natif, plateforme, extensionInstallable, extensionVersion,
    quotas, remiseAZero,
    username, setUsername,
    currency, deviseLabel, saveCurrency, devises,
    adresseLbc: {
      ...adresseLbc,
      renseignee: Boolean(String(adresseLbc?.rue ?? '').trim() && String(adresseLbc?.ville ?? '').trim()),
      resume: [adresseLbc?.cp, adresseLbc?.ville].filter(Boolean).join(' ').trim(),
    },
    setAdresseLbc,
    sessions, plateformesSession,
    republication: {
      exposee: planifieeExposee,
      actif: planifiee.etat?.actif === true,
      // Le créneau tel que le serveur le rend (`reglage.de` / `reglage.a`) —
      // jamais recalculé, jamais deviné : sans réglage, pas de créneau.
      creneau: planifiee.etat?.reglage?.de && planifiee.etat?.reglage?.a
        ? `${String(planifiee.etat.reglage.de).slice(0, 5)}–${String(planifiee.etat.reglage.a).slice(0, 5)}`
        : null,
    },
    ouvrirRepublication, ouvrirOffres, ouvrirSignalementBug, toast, ouvrir,
    resiliation, restauration, reset, suppression, deconnexion,
  };

  const SousPage = courante ? SOUS_PAGES[courante]?.Composant : null;
  const titre = courante ? (SOUS_PAGES[courante]?.titre(T) ?? T.titre) : T.titre;

  return (
    <>
      <EcranReglages titre={titre} onRetour={retour} actif={!ecranRepub} pile={Boolean(courante)} cle={courante ?? 'hub'}>
        {SousPage ? <SousPage c={c} T={T} /> : <Hub c={c} T={T} />}
      </EcranReglages>

      {/* ── Republication automatique : les deux écrans existants, montés
          tels quels (portails, z-index au-dessus de la page). */}
      {ecranRepub === 'reglages' && (
        <RepublicationPlanifieeReglages
          lang={lang}
          etat={planifiee.etat}
          interrupteur={planifiee.interrupteur}
          extensionStatus={extensionStatus}
          busy={planifiee.busy}
          erreur={planifiee.erreur}
          regler={planifiee.regler}
          onClose={() => setEcranRepub(null)}
          onOuvrirHistorique={() => setEcranRepub('historique')}
        />
      )}
      {ecranRepub === 'historique' && (
        <RepublicationPlanifieeHistorique
          lang={lang}
          userId={user?.id}
          etat={planifiee.etat}
          onClose={() => setEcranRepub('reglages')}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LE HUB — la carte d'identité, puis le plan, déroulé.
// ═══════════════════════════════════════════════════════════════════════════
function Hub({ c, T }) {
  return (
    <>
      <CarteIdentite
        nom={c.username}
        email={c.user?.email}
        badge={c.isPremium ? <PlanBadge isPremium={c.isPremium} isPro={c.isPro} isBusiness={c.isBusiness} /> : null}
      />

      {GROUPES.map((g) => {
        const entrees = entreesVisibles(g, c);
        // La carte n'existe que s'il y a un compteur à montrer : sinon la date
        // de remise à zéro coifferait un cadre vide.
        const carte = g.carte === 'consommation' && consommationVisible(c.quotas)
          ? <CarteConsommation c={c} T={T} />
          : null;
        // ⛔ Un groupe sans contenu ne s'affiche pas — sa structure reste
        //    déclarée dans plan.js, prête pour l'entrée suivante.
        if (!entrees.length && !carte) return null;
        return (
          <Groupe
            key={g.id}
            intitule={g.intitule(T)}
            appoint={carte && c.remiseAZero ? T.remiseAZeroLe(c.remiseAZero) : null}
          >
            {carte}
            {entrees.length > 0 && (
              <Carte>
                {entrees.map((e) => <LigneEntree key={e.id} e={e} c={c} T={T} />)}
              </Carte>
            )}
          </Groupe>
        );
      })}

      {c.extensionVersion && <PiedPage>{T.extensionVersion(c.extensionVersion)}</PiedPage>}
    </>
  );
}

// Une entrée du plan, rendue. Trois destinations possibles et pas une de
// plus : une sous-page, un lien, une action.
function LigneEntree({ e, c, T }) {
  const brut = typeof e.valeur === 'function' ? e.valeur(c, T) : null;
  const valeur = brut && typeof brut === 'object' ? brut.texte : brut;
  const alerte = Boolean(brut && typeof brut === 'object' && brut.alerte);
  const geste = e.ouvre
    ? { onClick: () => c.ouvrir(e.ouvre, e.id) }
    : e.href
      ? { href: e.href(c), cible: e.cible }
      : e.action
        ? { onClick: () => e.action(c) }
        : {};
  return <Ligne icone={e.icone} libelle={e.libelle(T)} valeur={valeur} alerte={alerte} {...geste} />;
}

// La SEULE carte de contenu du hub : la consommation du mois. Les mêmes
// compteurs que la pop-up (quotas_etat), avec le reste en clair.
function CarteConsommation({ c, T }) {
  const q = c.quotas;
  if (!q || q.error) return null;
  const lignes = [];
  if (q.annonces?.plafond != null) {
    lignes.push(
      <Jauge
        key="annonces"
        libelle={T.annoncesCreees}
        consomme={q.annonces.consommes}
        plafond={q.annonces.plafond}
        reste={q.annonces.restantes}
        sous={q.annonces.restantes != null ? T.restantes(q.annonces.restantes, T.motAnnonces) : null}
      />,
    );
  }
  if (q.retouches?.plafond != null && q.retouches.plafond > 0) {
    lignes.push(
      <Jauge
        key="retouches"
        libelle={T.retouchesIA}
        consomme={q.retouches.consommes}
        plafond={q.retouches.plafond}
        reste={q.retouches.restantes}
        sous={q.retouches.restantes != null ? T.restantes(q.retouches.restantes, T.motRetouches) : null}
      />,
    );
  }
  const repub = <JaugeRepublication key="repub" repub={q.republication} T={T} />;
  if (!lignes.length && !q.republication) return null;
  return (
    <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {lignes}
      {repub}
    </Carte>
  );
}
