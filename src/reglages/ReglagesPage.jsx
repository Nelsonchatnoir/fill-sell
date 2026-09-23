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
import { useEffect, useMemo, useState } from 'react';
import { track } from '../analytics/analytics';
import PlanBadge from '../components/PlanBadge';
import {
  RepublicationPlanifieePlateformes, RepublicationPlanifieeReglages, RepublicationPlanifieeHistorique,
} from '../components/RepublicationPlanifiee';
import { useRepublicationPlanifiee, republicationPlanifieeExposee, PLATEFORMES_PLANIFIEES } from '../hooks/useRepublicationPlanifiee';
import { plateformesDuCompte } from '../utils/stockFiltres';
import { txt } from './textes';
import { GROUPES, entreesVisibles } from './plan';
import { useSessionsPlateformes } from './useSessionsPlateformes';
import { useVeritePlateformes } from './useVeritePlateformes';
import { consommationVisible, lireProchaineRemiseAZero, formaterRemiseAZero, formaterDatePleine } from './quotas';
import {
  EcranReglages, Groupe, Carte, Ligne, Jauge, JaugeRepublication, CarteIdentite, PiedPage,
} from './ReglagesUI';
import SousPageAbonnement from './SousPageAbonnement';
import SousPagePlateformes from './SousPagePlateformes';
import SousPageExpedition from './SousPageExpedition';
import SousPageTransporteurs from './SousPageTransporteurs';
import SousPagePreferences from './SousPagePreferences';
import SousPageCompte from './SousPageCompte';
import SousPageCatalogueQuarantaine from './SousPageCatalogueQuarantaine';

// ┌─ LES SOUS-PAGES ─────────────────────────────────────────────────────────┐
// │ UNE ligne par sous-page : son titre (dans le vocabulaire de textes.js)   │
// │ et son composant. Une sous-page de plus = une ligne de plus ici, et      │
// │ `ouvre:'<son id>'` sur l'entrée qui l'ouvre (plan.js).                   │
// └──────────────────────────────────────────────────────────────────────────┘
// Noms propres : ils ne se traduisent pas (même table que SousPagePlateformes
// et que le module de republication).
const NOMS_PF_REPUB = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla' };

const SOUS_PAGES = {
  abonnement:    { titre: (T) => T.gAbonnement,    Composant: SousPageAbonnement },
  plateformes:   { titre: (T) => T.gPlateformes,   Composant: SousPagePlateformes },
  expedition:    { titre: (T) => T.adresseRemise,  Composant: SousPageExpedition },
  transporteurs: { titre: (T) => T.transporteurs,  Composant: SousPageTransporteurs },
  preferences:   { titre: (T) => T.gPreferences,   Composant: SousPagePreferences },
  compte:        { titre: (T) => T.gCompte,        Composant: SousPageCompte },
  'catalogue-quarantaine': { titre: (T) => T.champsPlateformes, Composant: SousPageCatalogueQuarantaine },
};

export default function ReglagesPage({
  onClose, lang, setLang, user,
  isPremium, isPro, isBusiness,
  natif, plateforme, extensionInstallable, extensionVersion, extensionStatus, appBuild,
  quotas, username, setUsername,
  currency, saveCurrency, devises,
  adresseLbc, setAdresseLbc,
  plateformesOuvertes,
  onToast, ouvrirOffres, ouvrirSignalementBug,
  // Écran ouvert D'EMBLÉE à l'arrivée (20/09) : le module de republication
  // automatique, en pied du Stock, mène ICI plutôt que de remonter une
  // deuxième copie des trois écrans dans l'onglet Stock. Lu une seule fois,
  // au montage — la page est montée à neuf à chaque ouverture des Réglages.
  ecranInitial = null,
  resiliation, restauration, reset, suppression, deconnexion,
}) {
  const T = txt(lang);
  const [pile, setPile] = useState([]);
  // Écran tiers monté PAR-DESSUS la page (portail à z-index supérieur) : tant
  // qu'il est là, la page n'écoute plus Échap — sinon une touche fermerait
  // les deux couches d'un coup.
  // null | 'liste' | 'historique' | une plateforme ('vinted', 'leboncoin', …)
  const [ecranRepub, setEcranRepub] = useState(ecranInitial === 'republication' ? 'liste' : null);

  // `multi: true` — c'est le SEUL écran qui a besoin des quatre plateformes.
  // Le Stock, lui, garde l'appel d'avant (cf. l'encadré du hook).
  const planifiee = useRepublicationPlanifiee({ userId: user?.id, multi: true });
  const planifieeExposee = republicationPlanifieeExposee(planifiee);
  // UNE SEULE RÉPONSE À « QUELLES PLATEFORMES ? » : celle du Stock
  // (utils/stockFiltres.plateformesDuCompte), jamais une liste recopiée ici —
  // c'est exactement la divergence corrigée le 17/09 (Opla absente des cartes).
  const plateformesSession = useMemo(() => plateformesDuCompte(plateformesOuvertes), [plateformesOuvertes]);
  const sessionsLocales = useSessionsPlateformes({ userId: user?.id, plateformes: plateformesSession });
  // La vérité serveur (2026-09-23) : c'est elle que l'écran Plateformes et le
  // compteur du hub affichent. Le calcul local reste le repli.
  const verite = useVeritePlateformes({ userId: user?.id, plateformes: plateformesSession });
  const sessions = useMemo(
    () => (verite.verite ? { ...sessionsLocales, connectes: verite.connectes } : sessionsLocales),
    [sessionsLocales, verite.verite, verite.connectes],
  );

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
  // conversion, exactement comme avant — même origine, même geste, rien
  // n'écrit. Un compte autorisé ouvre désormais la LISTE DES PLATEFORMES
  // (18/09), qui ouvre elle-même l'écran de réglages de celle qu'on choisit.
  const repubAutorisee = planifiee.etatMulti?.autorise === true || planifiee.etat?.autorise === true;
  const ouvrirRepublication = () => {
    if (!repubAutorisee) {
      track('premium_click', { source: 'reglages_republication_planifiee' });
      ouvrirOffres?.('reglages_republication_planifiee');
      return;
    }
    track('republication_planifiee', { action: 'ouvrir_reglages', depuis: 'reglages' });
    setEcranRepub('liste');
  };
  // Les sessions par plateforme sont DÉJÀ lues par cette page (l'entrée
  // « Plateformes ») : on les sert au module plutôt que d'ouvrir une seconde
  // lecture qui pourrait dire autre chose.
  const sessionsRepub = useMemo(() => {
    const out = {};
    for (const pf of PLATEFORMES_PLANIFIEES) out[pf] = sessions?.etats?.[pf] ?? null;
    return out;
  }, [sessions]);
  // Les plateformes ACTIVES, dans l'ordre d'affichage. Sert la ligne du hub :
  // une seule → son nom et son créneau ; plusieurs → combien.
  const repubActives = useMemo(
    () => PLATEFORMES_PLANIFIEES
      .map((pf) => planifiee.parPlateforme?.[pf])
      .filter((e) => e?.actif === true),
    [planifiee.parPlateforme],
  );

  // ── LA DATE DE REMISE À ZÉRO EST LUE EN BASE, PAS DÉDUITE ──────────────
  // coin_wallets.next_grant_at : l'échéance que la fonction de grant lit
  // elle-même pour décider d'accorder ou non. Le renouvellement est à DATE
  // ANNIVERSAIRE par compte, jamais le 1er du mois (cf. quotas.js). Lecture
  // unique à l'ouverture de la page (une ligne, RLS « own wallet read ») ;
  // illisible → null → la page n'affiche AUCUNE date.
  const [prochainGrant, setProchainGrant] = useState(null);
  useEffect(() => {
    if (!user?.id) return undefined;
    let mort = false;
    lireProchaineRemiseAZero(user.id)
      .then((iso) => { if (!mort) setProchainGrant(iso); })
      .catch(() => { /* illisible : aucune date affichée, jamais une inventée */ });
    return () => { mort = true; };
  }, [user?.id]);
  const remiseAZero = useMemo(() => formaterRemiseAZero(prochainGrant, lang), [prochainGrant, lang]);
  // La MÊME échéance, en date pleine, pour la carte de formule. Chez un abonné
  // elle vient de la boutique : c'est la date du prochain prélèvement. Chez un
  // compte gratuit ou offert, elle est ancrée sur la date d'inscription — la
  // carte ne la nomme donc « prélèvement » que s'il y a un canal de paiement.
  const prochainPrelevement = useMemo(() => formaterDatePleine(prochainGrant, lang), [prochainGrant, lang]);
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
    // Forme courte de l empreinte de build : « 2026-09-18T11:39:26Z+99a9179-dirty »
    // devient « 99a9179 », qui se compare au git log en une seconde.
    appBuild: String(appBuild ?? '').split('+')[1]?.replace(/-dirty$/, '') || null,
    quotas, remiseAZero, prochainPrelevement,
    username, setUsername,
    currency, deviseLabel, saveCurrency, devises,
    adresseLbc: {
      ...adresseLbc,
      renseignee: Boolean(String(adresseLbc?.rue ?? '').trim() && String(adresseLbc?.ville ?? '').trim()),
      resume: [adresseLbc?.cp, adresseLbc?.ville].filter(Boolean).join(' ').trim(),
    },
    setAdresseLbc,
    sessions, plateformesSession, verite,
    republication: {
      exposee: planifieeExposee,
      // ⚠️ 18/09 : le module porte QUATRE plateformes. « actif » veut donc dire
      // « au moins une », et la valeur affichée dans le hub dit LAQUELLE quand
      // il n'y en a qu'une (avec son créneau), et COMBIEN au-delà. Tout est lu
      // sur le serveur : sans réglage, pas de créneau, et jamais deviné.
      actif: repubActives.length > 0,
      creneau: repubActives.length === 1
        ? [NOMS_PF_REPUB[repubActives[0].platform] ?? repubActives[0].platform,
           repubActives[0].reglage?.de && repubActives[0].reglage?.a
             ? `${String(repubActives[0].reglage.de).slice(0, 5)}–${String(repubActives[0].reglage.a).slice(0, 5)}`
             : null].filter(Boolean).join(' · ')
        : repubActives.length > 1
          ? `${repubActives.length} ${T.plateformesActives}`
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

      {/* ── Republication automatique : trois écrans, montés en portail
          au-dessus de la page (z-index supérieur). Le chemin est
          LISTE → une plateforme → retour à la liste ; l'historique, commun
          aux quatre, se referme sur la liste. */}
      {ecranRepub === 'liste' && (
        <RepublicationPlanifieePlateformes
          lang={lang}
          etatMulti={planifiee.etatMulti}
          parPlateforme={planifiee.parPlateforme}
          sessions={sessionsRepub}
          interrupteur={planifiee.interrupteur}
          extensionStatus={extensionStatus}
          busy={planifiee.busy}
          erreur={planifiee.erreur}
          onOuvrirPlateforme={(pf) => setEcranRepub(pf)}
          onOuvrirHistorique={() => setEcranRepub('historique')}
          onPauseGenerale={(reprendre) => planifiee.pauseGenerale(reprendre)}
          onClose={() => setEcranRepub(null)}
        />
      )}
      {PLATEFORMES_PLANIFIEES.includes(ecranRepub) && (
        <RepublicationPlanifieeReglages
          lang={lang}
          platform={ecranRepub}
          session={sessionsRepub[ecranRepub] ?? null}
          etat={planifiee.parPlateforme?.[ecranRepub] ?? null}
          interrupteur={planifiee.interrupteur}
          extensionStatus={extensionStatus}
          busy={planifiee.busy}
          erreur={planifiee.erreur}
          regler={planifiee.regler}
          onClose={() => setEcranRepub('liste')}
          onOuvrirHistorique={() => setEcranRepub('historique')}
        />
      )}
      {ecranRepub === 'historique' && (
        <RepublicationPlanifieeHistorique
          lang={lang}
          userId={user?.id}
          etat={planifiee.etat}
          onClose={() => setEcranRepub('liste')}
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

      {/* ── QUEL BUNDLE TOURNE ? (18/09/2026) ────────────────────────────
          Question posée à chaque correctif, et impossible à trancher depuis
          un téléphone : Safari garde les fichiers en cache, et l’ancien
          chunk répond encore 200 chez Vercel — du vieux code peut donc
          tourner sans le moindre signe, sans 404, sans rien. L’empreinte du
          build est ici, en clair : elle se compare au `git log` en une
          seconde, depuis le téléphone.
          ⛔ Ce n’est PAS un numéro de version — celui-là se lit sur le canal
          Capgo, jamais dans le source. C’est l’empreinte du bundle, posée à
          la compilation (__FILLSELL_APP_BUILD__, vite.config.js). */}
      {(c.extensionVersion || c.appBuild) && (
        <PiedPage>
          {[c.extensionVersion && T.extensionVersion(c.extensionVersion), c.appBuild && T.appBuild(c.appBuild)]
            .filter(Boolean).join(' · ')}
        </PiedPage>
      )}
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
