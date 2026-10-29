// ═══════════════════════════════════════════════════════════════════════════
// LA PUBLICATION EN LOT — L'ÉCRAN (nuit du 02 au 03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Trois écrans, téléphone d'abord :
//   1. « Où les publier ? »  — les plateformes du lot entier, ce qui partira,
//      le quota du mois, la durée. Rien ne part encore.
//   2. « Avant l'envoi »     — la préparation (une barre), puis, au même
//      endroit, les seules réponses qui manquent et le compte exact.
//   3. « C'est parti »       — ce qui est en file, ce qui reste de côté et
//      pourquoi ; le suivi vit ensuite en haut du Stock.
//
// ⛔ LE MOTEUR N'EST PAS RÉÉCRIT. Chaque article est préparé par le VRAI moteur
//    du stepper (ListingPreviewScreen, `pilote`), monté sans rien afficher :
//    même rédaction, mêmes rayons, mêmes champs exigés, mêmes gardes, même RPC
//    (spend_coins_and_publish, un appel par article — un article bloqué ne
//    bloque que lui). Les questions sont posées par le MÊME bloc que le stepper
//    (BlocQuestions), branché sur le moteur de l'article.
// ⛔ Ce n'est jamais « on publie pour toi » : l'extension dépose, depuis
//    l'ordinateur, une annonce après l'autre — et le suivi vit dans l'app.
// (03/10, décisions de Nico)
//   · LE TEXTE DU VENDEUR FAIT FOI, quelle que soit la plateforme : avant
//     d'ouvrir le moteur d'un article sans description, le lot la reprend là
//     où il est en ligne — le MÊME chemin que le stepper à l'unité
//     (publication/texteDuVendeur.js), une lecture à la fois, au rythme des
//     dépôts ;
//   · LE MUR DE CONVERSION : quota insuffisant pour tout le lot → passer au
//     palier au-dessus (parcours d'achat existant, là où l'abonnement a été
//     pris) ou continuer avec ce que le quota permet. Chaque affichage et
//     chaque choix sont tracés dans usage_logs.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import "../stepper.css";
import "./lot.css";
import ListingPreviewScreen from "../../components/ListingPreviewScreen";
import BlocQuestions from "../BlocQuestions";
import CarteRayon from "../../components/CarteRayon";
import { CartePortDepop } from "../../components/PortDepop";
import ExclusDepop from "./ExclusDepop";
import BoutonMeConnecter from "../../components/BoutonMeConnecter";
// (29/10, lot B 1.3) La dictée sur chaque champ de texte libre du lot.
import BoutonDictee from "../../components/BoutonDictee";
import { MOTIFS } from "../../utils/connexionPlateformes";
// (11/10) Les postes du compte disent si Depop est autorisée (trace écrite par get-pending-jobs).
import { etatAccesDepop } from "../../../supabase/functions/_shared/acces-depop.js";
import BarreProgression from "../../components/BarreProgression";
import { Carte, Puce, Logo, Bouton } from "../composants";
import { NOM } from "../texte";
import { bilanPlateformes } from "../plateformes";
import { urlPhoto, urlsPhotos } from "../../utils/photos";
import { lireVeritePlateformes, sessionsDepuisVerite } from "../../utils/veritePlateformes";
import { ebayCompteUtilisable } from "../../utils/ebayCompte";
import { resumeEbay } from "../../utils/ebayParcours";
import { ebaySiteHorsFrance, texteEbayHorsFrance } from "../../../supabase/functions/_shared/ebay-hors-france.js";
import { lireProchaineRemiseAZero } from "../../reglages/quotas";
import { agirEbay } from "../../utils/ebayCompte";
import { businessOfferVisible } from "../../config/businessOffer";
import { COIN_CONFIG_FALLBACK } from "../../components/ConversionModal";
import { completerTexteDuVendeur, aCompleter as texteACompleter, RYTHME_LECTURE_VINTED_MS, RYTHME_LECTURE_EBAY_MS } from "../texteDuVendeur";
// (22/10 soir, point 8 — Louis) Une fiche importée ne se prépare pas avant la lecture de son annonce d'origine.
// (26/10 nuit, point 9 — patrick giry) … sauf sans lecteur : la vérité, puis les trois issues du stepper.
import {
  attenteLectureOrigine, demanderLectureOrigine, messageLectureOrigine,
  lireLecteurVinted, ecrireDescriptionSansLecteur, noterChoixSansLecteur, tracerChoixSansLecteur,
} from "../lectureOrigine";
import {
  issuesSansLecteur, phraseSansLecteur, libellesSansLecteur, texteAttenteSansLecteur, urlAnnonceVinted, descriptionEcriteSuffisante,
  lecteurEnRetard, versionAuMoins, LECTEUR_VERSION_MIN,
} from "../attenteLectureRegles";
// (25/10 — Louis) Le pont de la page vers l'extension : mort après une mise à jour, la page le dit.
import { ecouterEtatPont } from "../../utils/vintedSync";
import { plateformeOrigine } from "../../../supabase/functions/_shared/contenu-fiche.js";
import { demarrerRelecture } from "../../utils/relectureBornee";
import { propsStepperArticle } from "./propsArticle";
import {
  PLATEFORMES_LOT, PLATEFORMES_LOT_DEFAUT, PREPARATIONS_SIMULTANEES, REPOS_AVANT_LECTURE_MS,
  plateformesLibres, resumeParPlateforme, choixInitial, ficheCouvre, partagerQuota,
  dureeEstimeeMin, libelleDuree, bilanArticle, jumeauxQuiRetiennent, marqueLot, groupesReponseCommune,
  palierCourant, palierSuivant, canalAppareil, canalAbonnement, monteePossibleIci, CLE_REPRISE_LOT,
  lirePoidsSaisi,
} from "./regles";
import { posesMemoireVisibles } from "../moteur/memoireCategorie";
// (26/10 nuit, design B validé par Nico) L'étape 2 rangée par question.
import { questionsDeLArticle } from "./sujetsDuLot";
// (26/10, refonte C validée par Nico) Une ligne par article, une pop-up par article.
import FicheArticle, { PoidsDeLArticle } from "./FicheArticle";
import { usePhotoVide } from "./photoVide";
import { plateformesDeLArticle, poidsAffiche, poidsIncoherent, textePoids, phraseEcartees, ecarteesAutomatiques } from "./ficheLue";
import LivraisonDuLot from "./LivraisonDuLot";
import { parLots } from "../../utils/parLots.js";
import BarriereErreur from "../../components/BarriereErreur";
import { transporteursPourPoids } from "../../utils/leboncoinColis";
import { fusionnerReglages } from "../../utils/reglagesPlateformes";
import { noterGeste } from "../../utils/dernierGeste";
import { useChoixPoidsLeboncoin } from "../../utils/useChoixPoidsLeboncoin";
import { usePublicationProgrammee } from "../../utils/usePublicationProgrammee";
import {
  cleColisRetenu, grilleColisVinted, chargerGrilleColisRelevee, colisRetenusDuProfil, colisRetenuDuRayon,
  colisVintedDeLaFiche, semerColisRetenus, colisRetenusEnCache, retenirColisVinted,
} from "../../utils/vintedColis";

const CLE_CHOIX = "fs_lot_plateformes";
const lireChoixMemorise = () => { try { const v = JSON.parse(localStorage.getItem(CLE_CHOIX) ?? "null"); return Array.isArray(v) ? v : null; } catch { return null; } };
const ecrireChoixMemorise = (v) => { try { localStorage.setItem(CLE_CHOIX, JSON.stringify(v)); } catch { /* navigation privée : rien */ } };

// Les phases d'un article : où il en est, dans les mots de l'écran.
// `lecture` : sa description est lue là où il est en ligne (aucun moteur
// monté) ; les trois suivantes occupent une place de moteur.
const PHASES_MOTEUR = new Set(["montage", "redaction", "verification"]);
const PHASES_EN_PREPARATION = new Set(["lecture", ...PHASES_MOTEUR]);
const LIBELLE_PHASE = {
  fr: { origine: "Lecture de ton annonce d'origine", attente: "En attente", lecture: "Ta description…", montage: "Lecture…", redaction: "Rédaction…", verification: "Vérification…", pret: "Prêt", questions: "À toi de jouer", quota: "Reste au stock", rien: "Ne part pas", erreur: "Pas préparé", retire: "Retiré du lot", envoi: "Envoi…", envoye: "En file", refuse: "À toi de jouer" },
  en: { origine: "Reading your original listing", attente: "Waiting", lecture: "Your description…", montage: "Reading…", redaction: "Writing…", verification: "Checking…", pret: "Ready", questions: "Your move", quota: "Stays in stock", rien: "Not going", erreur: "Not prepared", retire: "Removed", envoi: "Sending…", envoye: "Queued", refuse: "Your move" },
};
const NOM_PALIER = { premium: "Premium", pro: "Pro", business: "Business" };
// Un abonnement se change là où il a été pris : payé ailleurs qu'ici, on dit
// où, et on ne lance JAMAIS un second abonnement.
const RENVOI_BOUTIQUE = {
  fr: {
    apple: "Ton abonnement est payé sur l'App Store : change de formule depuis l'app FillSell sur ton iPhone.",
    google: "Ton abonnement est payé sur Google Play : change de formule depuis l'app FillSell sur ton téléphone Android.",
    stripe: "Ton abonnement est payé par carte : change de formule sur fillsell.app, depuis un navigateur.",
  },
  en: {
    apple: "Your subscription is billed by the App Store: change your plan from the FillSell app on your iPhone.",
    google: "Your subscription is billed by Google Play: change your plan from the FillSell app on your Android phone.",
    stripe: "Your subscription is billed by card: change your plan on fillsell.app, from a browser.",
  },
};
// Ce que fait la lecture en cours, dans la ligne de l'article.
const TEXTE_LECTURE = {
  fr: { vinted: "Lecture de ta description sur Vinted, au rythme de tes dépôts…", ebay: "Lecture de ta description sur eBay…", null: "Recherche de ta description là où l'article est en ligne…" },
  en: { vinted: "Reading your description on Vinted, at your posting pace…", ebay: "Reading your description on eBay…", null: "Looking for your description where the item is online…" },
};
const TON_PHASE = { pret: "ok", envoye: "ok", questions: "geste", quota: "geste", rien: "mute", erreur: "refus", refuse: "refus", retire: "mute" };

// ── UN ARTICLE QUI CASSE N'EMPORTE JAMAIS LE LOT (10/10/2026) ──────────────
// Du 09/10 22:13 (2.9.70) au 10/10, tout lot finissait en PAGE BLANCHE à la
// fin de la préparation, au bloc Livraison (« userId is not defined », puis
// « exclusDepop » : deux variables de l'écran parent lues dans EcranAvant,
// qui ne les recevait pas). Une exception de rendu sans barrière démonte
// TOUT : écran blanc, puis retour au Stock au rechargement. Désormais :
//   · chaque MOTEUR d'article, chaque article à compléter et chaque ligne a
//     sa barrière : l'article qui casse est MIS DE CÔTÉ (phase « erreur »,
//     la phrase ci-dessous), les autres continuent et partent ;
//   · chaque bloc commun (Livraison, exclus Depop, réponses communes) a la
//     sienne : il est remplacé par une phrase, le reste du lot continue ;
//   · les gestes du pilote sur un moteur sont protégés article par article ;
//   · en dernier recours, l'écran entier : une phrase et « Revenir au
//     stock », jamais une page blanche.
// Chaque cas laisse une ligne usage_logs (`lot_article_mis_de_cote`,
// `lot_bloc_en_erreur`, `lot_ecran_en_erreur`) : le message, jamais à l'écran.
// Le contrôle qui empêche la cause de revenir : `selftest:variables-definies`
// (aucune variable non définie dans src/, joué par chaque build).
const RAISON_MIS_DE_COTE = {
  fr: "Mis de côté : cet article n'a pas pu être préparé ici. Rien n'est parti pour lui — publie-le seul depuis ton Stock.",
  en: "Set aside: this item couldn't be prepared here. Nothing was sent for it — publish it on its own from your Stock.",
};
const RAISON_MIS_DE_COTE_ENVOI = {
  fr: "Un problème d'affichage pendant son envoi : regarde cet article dans ton Stock avant de le republier.",
  en: "A display problem while it was being sent: check this item in your Stock before publishing it again.",
};
const messageErreur = (e) => String(e?.message ?? e ?? "").slice(0, 300);
function journaliserErreurLot(supabase, userId, feature, metadata) {
  if (!supabase || !userId) return;
  try {
    supabase.from("usage_logs").insert({ user_id: userId, feature, metadata })
      .then(({ error }) => { if (error) console.warn(`[lot] ${feature} non journalisé :`, error.message); }, () => {});
  } catch { /* journal best-effort */ }
}

const titreDe = (item) => String(item?.title ?? item?.titre ?? "").trim();
const dateCourte = (iso, en) => {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long" });
};

function Vignette({ item, taille = null }) {
  const url = urlsPhotos(item?.photos)[0] ?? null;
  return (
    <div className="fsn-thumb" style={taille ? { width: taille, height: taille } : undefined} aria-hidden="true">
      {url ? <img src={urlPhoto(url)} alt="" loading="lazy" /> : "📦"}
    </div>
  );
}

// (25/10) Aucune plateforme fermée : UNE référence, jamais un tableau neuf à chaque rendu (le moteur est mémoïsé).
const AUCUNE_FERMEE = Object.freeze([]);
// Le moteur d'UN article, monté sans rien afficher. Mémoïsé : l'écran du lot
// se redessine souvent, le moteur seulement quand SES entrées changent.
const HoteMoteur = memo(function HoteMoteur({
  item, jobs, prixVinted, surMoteur, marque, onJobsQueued,
  userId, supabase, lang, ebayCompte, plateformesVisibles, plateformesOuvertes, oplaMotifGrise, oplaExtensionMin,
  isPremium, isPro, isBusiness, extensionNeverSeen, extensionLastSeenAt,
  // (25/10) Leboncoin d'une adresse de remise hors de France : jamais au moteur du lot (App.jsx → StockTab).
  plateformesFermees = AUCUNE_FERMEE,
}) {
  const entrees = useMemo(() => propsStepperArticle(item, jobs, { prixVinted }), [item, jobs, prixVinted]);
  const pilote = useMemo(() => ({ surMoteur, marqueJobs: marque }), [surMoteur, marque]);
  return (
    <ListingPreviewScreen
      variante="nouvelle"
      pilote={pilote}
      inventaireId={item.id}
      userId={userId}
      supabase={supabase}
      lang={lang}
      ebayCompte={ebayCompte}
      plateformesVisibles={plateformesVisibles}
      plateformesOuvertes={plateformesOuvertes}
      plateformesFermees={plateformesFermees}
      oplaMotifGrise={oplaMotifGrise}
      oplaExtensionMin={oplaExtensionMin}
      {...entrees}
      onClose={() => {}}
      onJobsQueued={onJobsQueued}
      isPremium={isPremium}
      isPro={isPro}
      isBusiness={isBusiness}
      extensionNeverSeen={extensionNeverSeen}
      extensionLastSeenAt={extensionLastSeenAt}
    />
  );
});

/**
 * @param articles      les articles choisis, dans l'ordre du choix (forme mapItem)
 * @param jobsByInventaire  { [id]: jobs } — la lecture du Stock
 * @param prixVinted    (item) => prix demandé sur Vinted, ou null
 * @param ctx           { userId, supabase, lang, ebayCompte, plateformesVisibles, plateformesOuvertes,
 *                        oplaMotifGrise, oplaExtensionMin, isPremium, isPro, isBusiness,
 *                        extensionNeverSeen, extensionLastSeenAt, plateformesCompte }
 * @param onJobsQueued  patch optimiste du Stock (invId, plateformes)
 * @param onFermer      () => void
 * @param onEnvoye      (lot) => void — le lot est parti (au moins un article)
 * @param onMonterDePalier (palier, origine) => void — le parcours d'achat existant (openUpgradeModal)
 * @param onOuvrirArticle (item) => void — le stepper à l'unité, pour un article laissé de côté
 * @param extensionVinted l'extension de CET appareil sait lire le détail d'un article Vinted
 * @param versionExtensionIci (26/10 nuit) la version qu'elle annonce (null : aucune) — un lecteur de la description Vinted ?
 */
export default function LotPublication(props) {
  // Le dernier recours : l'écran du lot entier. Jamais une page blanche — une
  // phrase, et le retour au Stock ; ce qui est déjà en file continue.
  const { ctx, onFermer } = props;
  const en = ctx?.lang === "en";
  return (
    <BarriereErreur nom="lot"
      onErreur={(e) => journaliserErreurLot(ctx?.supabase, ctx?.userId, "lot_ecran_en_erreur", { message: messageErreur(e) })}
      secours={(
        <CoqueLot en={en} ecran="lot-erreur" titre={en ? "Publish several items" : "Publier plusieurs articles"} numeroEcran={2}
          retour={null} quitter={null} cta={en ? "Back to stock" : "Revenir au stock"} onCta={() => onFermer?.()}
          sous={[en ? "Nothing else goes out from this screen." : "Rien d'autre ne part depuis cet écran."]}>
          <Carte gravite="refus" titre={en ? "The batch stopped on a display problem" : "Le lot s'est arrêté sur un problème d'affichage"}>
            <div className="fsn-card-p">{en
              ? "Listings already queued keep going: you follow them at the top of your Stock. The others weren't sent — you can start the batch again."
              : "Les annonces déjà mises en file continuent : tu les suis en haut de ton Stock. Les autres ne sont pas parties — tu peux relancer le lot."}</div>
          </Carte>
        </CoqueLot>
      )}>
      <EcranDuLot {...props} />
    </BarriereErreur>
  );
}

function EcranDuLot({
  articles, jobsByInventaire, prixVinted, ctx, onJobsQueued, onFermer, onEnvoye, onMonterDePalier = null, onOuvrirArticle, choixPrefere = null, boutiqueVinted = null,
  extensionVinted = false, versionExtensionIci = null,
}) {
  const { userId, supabase, lang } = ctx;
  const en = lang === "en";
  const L = LIBELLE_PHASE[en ? "en" : "fr"];
  // (11/10 soir, Nico) Le poids Leboncoin : « Laisser Leboncoin estimer » (par
  // défaut) ou « Saisir le poids », retenu pour le compte. Le bilan de chaque
  // article le lit (m.poidsLbcChoix) : seul « Saisir » sans poids le retient.
  const poidsLbc = useChoixPoidsLeboncoin(userId);
  // (26/10, D4) Publications programmées (réglage) : le lot les PROGRAMME — sauf « Envoyer tout de suite » pour ce lot.
  const programmation = usePublicationProgrammee(userId);
  const [maintenantLot, setMaintenantLot] = useState(false);
  const programme = Boolean(programmation.reglage) && !maintenantLot;
  const poidsLbcChoixRef = useRef(poidsLbc.choix); poidsLbcChoixRef.current = poidsLbc.choix;
  const plateformesCompte = (ctx.plateformesCompte ?? PLATEFORMES_LOT_DEFAUT).filter((p) => PLATEFORMES_LOT.includes(p));
  const fermer = (r) => {
    try { localStorage.removeItem(CLE_REPRISE_LOT(userId)); } catch { /* rien */ }
    onFermer?.(r);
  };

  // ── Écran 1 : ce qui est sûr AVANT de préparer quoi que ce soit ─────────
  const donnees = useMemo(() => (articles ?? []).map((item) => ({
    id: String(item.id), item, jobs: jobsByInventaire?.[item.id] ?? [],
  })), [articles, jobsByInventaire]);
  const resume = useMemo(() => resumeParPlateforme(donnees, plateformesCompte), [donnees, plateformesCompte]);
  // (09/10 soir) La quantité de la fiche : à plus d'un exemplaire, une
  // ressemblance ne retient jamais l'article (regles.js, jumeauxQuiRetiennent).
  const quantiteDe = (id) => donnees.find((d) => d.id === String(id))?.item?.quantite;
  const [verite, setVerite] = useState(null);
  const [pauses, setPauses] = useState({});
  const [quotas, setQuotas] = useState(null);
  const [remise, setRemise] = useState(null);
  const [fiches, setFiches] = useState(null);
  const [profil, setProfil] = useState(null);
  const [quotasPaliers, setQuotasPaliers] = useState(() => ({
    premium: COIN_CONFIG_FALLBACK.quota_annonces_premium, pro: COIN_CONFIG_FALLBACK.quota_annonces_pro, business: COIN_CONFIG_FALLBACK.quota_annonces_business,
  }));
  // Le quota se relit quand le palier change : un achat fait depuis le mur
  // (App Store, Google Play) rend la main ici, et le compte doit suivre.
  const palier = palierCourant(ctx);
  useEffect(() => {
    let vivant = true;
    supabase.rpc("quotas_etat").then(({ data }) => { if (vivant && data && !data.error) setQuotas(data); }, () => {});
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palier]);
  useEffect(() => {
    let vivant = true;
    lireVeritePlateformes().then((v) => { if (vivant) setVerite(v); }).catch(() => {});
    supabase.from("platform_health").select("platform, paused, message_fr, message_en")
      .then(({ data }) => {
        if (!vivant || !Array.isArray(data)) return;
        setPauses(Object.fromEntries(data.filter((r) => r.paused).map((r) => [r.platform, (en ? r.message_en || r.message_fr : r.message_fr) || ""])));
      }, () => {});
    lireProchaineRemiseAZero(userId).then((d) => { if (vivant) setRemise(d); }, () => {});
    // Le mur de conversion : où l'abonnement a été pris, et le quota de
    // chaque palier (coin_config fait foi, le repli de la modale sinon).
    supabase.from("profiles").select("is_comped, apple_original_transaction_id, google_purchase_token, stripe_customer_id, platform_settings, extension_postes")
      .eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivant) return;
        setProfil(data ?? {});
        // (05/10) Les formats de colis Vinted retenus par rayon : déjà lus
        // ici, ils servent aussi au clic Publier des moteurs (aucune relecture).
        if (!error && data) semerColisRetenus(userId, colisRetenusDuProfil(data.platform_settings));
      }, () => { if (vivant) setProfil({}); });
    supabase.from("coin_config").select("key, value").in("key", ["quota_annonces_premium", "quota_annonces_pro", "quota_annonces_business"])
      .then(({ data }) => {
        if (!vivant || !Array.isArray(data)) return;
        setQuotasPaliers((prev) => ({ ...prev, ...Object.fromEntries(data.map((r) => [String(r.key).replace("quota_annonces_", ""), Number(r.value)]).filter(([, v]) => Number.isFinite(v))) }));
      }, () => {});
    const ids = (articles ?? []).map((a) => a.id);
    if (ids.length) {
      // (12/10, A1) Par lots de 400 (utils/parLots.js) : un lot de centaines
      // d'articles ne tient pas dans une seule adresse. Tout ou rien.
      Promise.all(parLots(ids).map((lotIds) => supabase.from("fiches_annonce").select("inventaire_id, fiche").eq("user_id", userId).in("inventaire_id", lotIds)))
        .then((reps) => {
          if (!vivant) return;
          if (reps.some((r) => r.error)) { setFiches({}); return; }
          setFiches(Object.fromEntries(reps.flatMap((r) => r.data ?? []).map((r) => [String(r.inventaire_id), r.fiche])));
        }, () => { if (vivant) setFiches({}); });
    } else setFiches({});
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sessions = sessionsDepuisVerite(verite);
  // (11/10) Aucun poste du compte n'a l'autorisation Depop (48 h) : la ligne
  // Depop cochée le dit, avec LE bouton — ses annonces attendront le geste.
  // Profil pas encore lu, ou illisible : rien n'est dit (jamais un faux mur).
  const depopAAutoriser = profil && profil.extension_postes !== undefined && !etatAccesDepop(profil.extension_postes).avecAcces;
  // (25/10, audit N10) Un compte eBay inscrit hors d'eBay France : eBay grisé, la phrase vraie, jamais « relance-la »
  // (_shared/ebay-hors-france.js ; site lu par ebay-account, null = jamais lu → rien de grisé).
  const ebayEtranger = Boolean(ctx.ebayCompte?.voieApi) && Boolean(ctx.ebayCompte?.lu) && ebaySiteHorsFrance(ctx.ebayCompte?.etat?.ebay_site).horsFrance;
  const ebayBloque = ebayEtranger || (Boolean(ctx.ebayCompte?.voieApi) && Boolean(ctx.ebayCompte?.lu) && ebayCompteUtilisable(ctx.ebayCompte?.etat) === false);
  const ebayParServeur = Boolean(ctx.ebayCompte?.voieApiReelle);
  // Venu d'un filtre « Pas encore sur X » : X seule, cochée d'office ; sinon
  // le dernier choix, sinon tout ce qui peut partir.
  const [choix, setChoix] = useState(() => choixInitial(resume, { memorise: Array.isArray(choixPrefere) && choixPrefere.length ? choixPrefere : lireChoixMemorise(), enPause: [], ebayBloque }));
  const basculer = (p) => setChoix((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : PLATEFORMES_LOT.filter((x) => x === p || prev.includes(x))));

  // Ce que chaque article recevrait avec ce choix (avant toute préparation).
  const ciblesAvant = useMemo(() => Object.fromEntries(donnees.map((d) => [d.id,
    plateformesLibres(d.item, d.jobs, plateformesCompte).filter((p) => choix.includes(p) && !pauses[p])])), [donnees, plateformesCompte, choix, pauses]);
  const articlesAvecCible = donnees.filter((d) => ciblesAvant[d.id].length);
  // Essai en développement SEULEMENT (jamais dans un build servi) : simuler un
  // quota presque vide (localStorage fs_lot_quota_simule = n) pour éprouver le
  // partage « maintenant / le mois prochain » sur un compte qui a de la marge.
  // Le serveur, lui, garde sa propre limite (generate-listing, 402).
  const [quotaSimule] = useState(() => {
    if (!import.meta.env?.DEV) return null;
    try { const v = localStorage.getItem("fs_lot_quota_simule"); return v != null && Number.isFinite(Number(v)) ? Number(v) : null; } catch { return null; }
  });
  const restantes = quotaSimule ?? quotas?.annonces?.restantes ?? null;
  const partage = useMemo(() => partagerQuota(articlesAvecCible, {
    restantes: Number.isFinite(restantes) ? restantes : null,
    consomme: (d) => !ficheCouvre(fiches?.[d.id], ciblesAvant[d.id]),
  }), [articlesAvecCible, restantes, fiches, ciblesAvant]);
  const annoncesPrevues = partage.maintenant.reduce((n, d) => n + ciblesAvant[d.id].length, 0);
  const parPlateformePrevu = {};
  for (const d of partage.maintenant) for (const p of ciblesAvant[d.id]) parPlateformePrevu[p] = (parPlateformePrevu[p] ?? 0) + 1;
  const duree = libelleDuree(dureeEstimeeMin(parPlateformePrevu, { ebayParServeur }), lang);

  // ── LE MUR DE CONVERSION (03/10, décision de Nico) ──────────────────────
  // Visible dès que le quota ne couvre pas tout le lot. Deux choix : monter
  // d'un palier (parcours d'achat existant), ou continuer avec ce que le
  // quota permet — c'est le bouton du bas. Chaque affichage et chaque choix
  // laissent une ligne usage_logs (lot_mur_quota_affiche / _choix).
  const murActif = fiches != null && quotas != null && partage.plusTard.length > 0;
  const palierVise = palierSuivant(palier, { businessVisible: businessOfferVisible(userId) });
  const canalIci = canalAppareil(Capacitor.getPlatform());
  const canalAbo = canalAbonnement({
    payant: palier !== "gratuit" && !profil?.is_comped,
    apple: profil?.apple_original_transaction_id, google: profil?.google_purchase_token, stripe: profil?.stripe_customer_id,
  }, canalIci);
  const [renvoiBoutique, setRenvoiBoutique] = useState(null); // canal où changer de formule, quand ce n'est pas ici
  const journaliser = useCallback((feature, metadata) => {
    if (!userId) return;
    supabase.from("usage_logs").insert({ user_id: userId, feature, metadata })
      .then(({ error }) => { if (error) console.warn(`[lot] ${feature} non journalisé :`, error.message); }, () => {});
  }, [supabase, userId]);
  const metaMur = () => ({
    palier, palier_propose: palierVise, articles_lot: articlesAvecCible.length,
    articles_retenus: partage.maintenant.length, articles_reportes: partage.plusTard.length,
    restantes: Number.isFinite(restantes) ? restantes : null, canal_appareil: canalIci, canal_abonnement: canalAbo,
    ...(quotaSimule != null ? { simule: true } : {}),
  });
  // Essai en développement (quota simulé) : le clic « Passer à… » est tracé
  // mais n'ouvre JAMAIS le parcours d'achat — un compte réel ne doit ni
  // payer, ni voir son abonnement basculer, ni recevoir un client Stripe
  // pour un essai. Jamais dans un build servi (quotaSimule y vaut null).
  const [essaiAchat, setEssaiAchat] = useState(false);
  const murJournalise = useRef(false);
  useEffect(() => {
    if (!murActif || murJournalise.current) return;
    murJournalise.current = true;
    noterGeste("mur_lot");
    journaliser("lot_mur_quota_affiche", metaMur());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [murActif]);
  function monterDePalier() {
    if (!palierVise) return;
    const ici = monteePossibleIci(canalAbo, canalIci);
    journaliser("lot_mur_quota_choix", { ...metaMur(), choix: "monter", renvoye_boutique: !ici });
    if (!ici) { setRenvoiBoutique(canalAbo); return; }
    if (quotaSimule != null) { setEssaiAchat(true); return; }
    // Stripe quitte la page : le lot se retrouvera au retour (StockTab).
    try { localStorage.setItem(CLE_REPRISE_LOT(userId), JSON.stringify({ ids: donnees.map((d) => d.id), plateformes: choix, le: new Date().toISOString() })); } catch { /* rien */ }
    onMonterDePalier?.(palierVise, "lot_publication_mur");
  }

  // ── Le lot lui-même : un identifiant, les articles préparés, leurs états ─
  const [etape, setEtape] = useState("plateformes"); // plateformes | avant | envoi | fin
  const [lot, setLot] = useState(null); // { id, le, ids: [], plateformes: [] }
  const [etats, setEtats] = useState({}); // id → { phase, raison?, envoyees?, exclusions? }
  const envoiEnCoursRef = useRef(false);
  const [decisions, setDecisions] = useState({}); // id → { texteValide, jumeauxTranches: Set }
  const [actifs, setActifs] = useState(() => new Set()); // moteurs montés
  const moteursRef = useRef(new Map());
  const etatsRef = useRef(etats); etatsRef.current = etats;
  const decisionsRef = useRef(decisions); decisionsRef.current = decisions;
  const pilotage = useRef({}); // id → { selection, suivant2, suivant3, reposDepuis, entreeVerif }
  const [tick, setTick] = useState(0);
  const tickPlanifie = useRef(null);
  const planifierTick = useCallback((ms = 250) => {
    if (tickPlanifie.current) return;
    tickPlanifie.current = setTimeout(() => { tickPlanifie.current = null; setTick((t) => t + 1); }, ms);
  }, []);
  useEffect(() => () => { if (tickPlanifie.current) clearTimeout(tickPlanifie.current); }, []);
  const surMoteur = useCallback((id, m) => {
    if (id == null) return;
    moteursRef.current.set(String(id), m);
    planifierTick();
  }, [planifierTick]);
  const marque = useMemo(() => (lot ? marqueLot(lot.id, lot.le) : null), [lot]);
  // Relecture en développement seulement (jamais servi en prod) : les moteurs
  // et les états du lot, lisibles depuis la console.
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    window.__lot = { moteurs: moteursRef.current, etats, decisions, lot };
  });
  const majEtat = (id, patch) => setEtats((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  // Un article qui casse (moteur, carte, geste du pilote) : MIS DE CÔTÉ, les
  // autres continuent. Déjà en file : il le reste, rien n'est réécrit.
  const lotRef = useRef(lot); lotRef.current = lot;
  const misDeCoteRef = useRef(new Set());
  const mettreDeCote = useCallback((id, erreur, ou) => {
    const k = String(id);
    moteursRef.current.delete(k);
    setEtats((prev) => {
      const ph = prev[k]?.phase;
      if (ph === "envoye" || ph === "erreur") return prev;
      const raison = (ph === "envoi" ? RAISON_MIS_DE_COTE_ENVOI : RAISON_MIS_DE_COTE)[en ? "en" : "fr"];
      return { ...prev, [k]: { ...(prev[k] ?? {}), phase: "erreur", raison } };
    });
    if (misDeCoteRef.current.has(k)) return;
    misDeCoteRef.current.add(k);
    journaliserErreurLot(supabase, userId, "lot_article_mis_de_cote", { ou, inventaire_id: k, lot: lotRef.current?.id ?? null, message: messageErreur(erreur) });
  }, [en, supabase, userId]);
  const signalerErreurBloc = useCallback((bloc, erreur) => {
    journaliserErreurLot(supabase, userId, "lot_bloc_en_erreur", { bloc, lot: lotRef.current?.id ?? null, message: messageErreur(erreur) });
  }, [supabase, userId]);

  function preparer() {
    const ids = partage.maintenant.map((d) => d.id);
    if (!ids.length) return;
    // Continuer malgré le mur : c'est le second choix, tracé comme le premier.
    if (murActif) journaliser("lot_mur_quota_choix", { ...metaMur(), choix: "continuer" });
    try { localStorage.removeItem(CLE_REPRISE_LOT(userId)); } catch { /* rien */ }
    ecrireChoixMemorise(choix);
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nouveauLot = { id, le: new Date().toISOString(), ids, plateformes: [...choix] };
    // (15/10, P17) Les articles au-delà du quota ne sont ni préparés ni
    // décomptés : ils RESTENT DANS LE STOCK, rien ne les « garde » pour plus
    // tard (la liste écrite ici avant le 15/10 n'était relue nulle part).
    setLot(nouveauLot);
    // Les articles qui ont leur description (et, du dressing, leur catégorie)
    // vont droit au moteur ; les autres passent d'abord par la lecture.
    lusRef.current = new Set(ids.filter((x) => !texteACompleter(donnees.find((d) => d.id === x)?.item)));
    setEtats(Object.fromEntries([
      ...ids.map((x) => [x, { phase: "attente" }]),
      ...partage.plusTard.map((d) => [d.id, { phase: "quota" }]),
      ...donnees.filter((d) => !ciblesAvant[d.id].length).map((d) => [d.id, { phase: "rien", raison: raisonRienAvant(d) }]),
    ]));
    setEtape("avant");
  }
  function raisonRienAvant(d) {
    const libres = plateformesLibres(d.item, d.jobs, plateformesCompte);
    if (!libres.length) return en ? "Already online everywhere you sell." : "Déjà en ligne partout où tu vends.";
    const enPause = libres.filter((p) => pauses[p]);
    if (enPause.length && enPause.length === libres.filter((p) => choix.includes(p)).length) return en ? `${enPause.map(NOM).join(", ")} paused on our side.` : `${enPause.map(NOM).join(", ")} en pause de notre côté.`;
    return en ? `Already on ${choix.map(NOM).join(", ")}.` : `Déjà sur ${choix.map(NOM).join(", ")}.`;
  }

  // ── LA LECTURE DU TEXTE DU VENDEUR (03/10, décision de Nico) ────────────
  // Un article sans description la reprend là où il est en ligne, AVANT que
  // son moteur ne s'ouvre — le même chemin que le stepper à l'unité
  // (publication/texteDuVendeur.js). Pendant ce temps les autres articles se préparent.
  // ⛔ (26/10, urgence lenteur — règle de Nico : « les lectures des articles sélectionnés se font en parallèle »)
  // AVANT : UNE lecture à la fois, puis 8 à 20 s d'attente avant la suivante — 10 articles d'un nouvel utilisateur
  // attendaient 1 min 30 à 3 min 20 rien que pour leurs textes (mesuré le 26/10 sur le compte de Nico). La page
  // PUBLIQUE d'une annonce Vinted (extension ≥ 0.6.144) est une page vue comme un visiteur : toutes les lectures
  // partent ensemble, et l'extension les fait l'une après l'autre sous son verrou de flux (~1 s chacune, jamais en
  // même temps qu'un dépôt). Gardent leur espacement : eBay (API au budget partagé, 1,5 à 3 s) et l'ancien lecteur
  // Vinted par le formulaire d'édition (extension < 0.6.144, « jamais en boucle ») — un créneau réservé par plateforme.
  // ⛔ (28/10, Cédric GRIZSTYLE) … mais jamais en rafale chez Vinted : 15 pages en 17 s → 429 de Vinted, toute lecture
  // du poste coupée 6 h. Les lectures partent ensemble, et la page publique attend son créneau (texteDuVendeur,
  // prochainDepartLectureVinted : 3 d'affilée, puis une toutes les 8 à 20 s).
  const lusRef = useRef(new Set());
  const [complets, setComplets] = useState({}); // id → l'article complété (description reprise)
  const [lectures, setLectures] = useState({}); // id → { source, note }
  const LECTURES_SIMULTANEES = 10;
  const enLectureRef = useRef(new Set());   // les articles dont la lecture est partie
  const prochainCreneau = useRef({});       // plateforme → heure du prochain départ autorisé (lecteurs espacés)
  const lecturePubliqueVinted = versionAuMoins(versionExtensionIci, LECTEUR_VERSION_MIN);
  useEffect(() => {
    if (!lot) return;
    const libres = LECTURES_SIMULTANEES - enLectureRef.current.size;
    if (libres <= 0) return;
    const aLancer = lot.ids.filter((id) => !lusRef.current.has(id) && !enLectureRef.current.has(id) && etats[id]?.phase === "attente").slice(0, libres);
    for (const suivant of aLancer) {
    const d = donnees.find((x) => x.id === suivant);
    if (!d) { lusRef.current.add(suivant); continue; }
    enLectureRef.current.add(suivant);
    majEtat(suivant, { phase: "lecture", lecture: null });
    (async () => {
      let r = null;
      try {
        r = await completerTexteDuVendeur(d.item, {
          supabase, userId, extensionVinted,
          lireEbay: (id) => agirEbay("lire_description", { inventaire_id: id }),
          // Une lecture de lot n'est pas pressée : le délai de l'unité (12 s)
          // est doublé, l'extension pouvant finir un dépôt avant de répondre.
          delaiDetailMs: 25000,
          avantLecture: async (pf) => {
            majEtat(suivant, { lecture: pf });
            // (26/10) La page publique Vinted réserve son créneau dans lireDetailVintedParExtension (28/10) ; les autres lecteurs
            // réservent leur créneau, espacé comme avant.
            if (pf === "vinted" && lecturePubliqueVinted) return;
            const [min, max] = pf === "vinted" ? RYTHME_LECTURE_VINTED_MS : RYTHME_LECTURE_EBAY_MS;
            const maintenant = Date.now();
            const depart = Math.max(maintenant, prochainCreneau.current[pf] ?? 0);
            prochainCreneau.current[pf] = depart + min + Math.random() * (max - min);
            if (depart > maintenant) await new Promise((ok) => setTimeout(ok, depart - maintenant));
          },
        });
      } catch { r = null; }
      // (22/10 soir, point 8) L'annonce d'origine pas encore lue : l'article ne se prépare pas — le moteur
      // remplirait ses cases vides à la place du vendeur. La lecture est demandée ; il repart tout seul
      // dès qu'elle est faite (relecture plus bas). Jamais une erreur.
      let attenteOrigine = null;
      if (plateformeOrigine(d.item)) {
        try { attenteOrigine = await attenteLectureOrigine(supabase, userId, d.item?.id ?? suivant); } catch { attenteOrigine = null; }
        if (attenteOrigine) demanderLectureOrigine(supabase, d.item?.id ?? suivant);
      }
      if (r?.item) setComplets((prev) => ({ ...prev, [suivant]: r.item }));
      setLectures((prev) => ({ ...prev, [suivant]: { source: r?.source ?? null, note: r?.note ?? null } }));
      lusRef.current.add(suivant);
      enLectureRef.current.delete(suivant);
      // Retiré du lot pendant la lecture : il le reste.
      setEtats((prev) => (prev[suivant]?.phase === "lecture"
        ? { ...prev, [suivant]: attenteOrigine
          ? { ...prev[suivant], phase: "origine", lecture: null, origineDepuis: prev[suivant]?.origineDepuis ?? Date.now(), raison: messageLectureOrigine(attenteOrigine, en ? "en" : "fr", "preparation") }
          : { ...prev[suivant], phase: "attente", lecture: null } }
        : prev));
    })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot, etats]);

  // ── Les moteurs montés : trois préparations à la fois, puis on garde ceux
  //    qu'il faudra encore lire (prêts, à compléter) jusqu'à l'envoi ────────
  useEffect(() => {
    if (!lot) return;
    const enPrep = lot.ids.filter((id) => PHASES_MOTEUR.has(etats[id]?.phase)).length;
    const places = PREPARATIONS_SIMULTANEES - enPrep;
    const aMonter = places > 0 ? lot.ids.filter((id) => etats[id]?.phase === "attente" && lusRef.current.has(id)).slice(0, places) : [];
    // (12/10, A1) « envoye » aussi : un article parti n'a plus besoin de son
    // moteur (le suivi lit la base) — avec des centaines d'articles, seuls les
    // moteurs utiles restent montés.
    const garder = (id) => !["quota", "rien", "erreur", "retire", "refuse", "envoye"].includes(etats[id]?.phase);
    const suivant = new Set([...actifs].filter(garder));
    for (const id of aMonter) suivant.add(id);
    if (aMonter.length) setEtats((prev) => {
      const n = { ...prev };
      for (const id of aMonter) n[id] = { ...n[id], phase: "montage", depuis: Date.now() };
      return n;
    });
    const change = suivant.size !== actifs.size || [...suivant].some((id) => !actifs.has(id));
    if (change) {
      for (const id of actifs) if (!suivant.has(id)) moteursRef.current.delete(id);
      setActifs(suivant);
    }
  }, [lot, etats, actifs]);

  // ── LE PILOTE : faire avancer chaque moteur, sans jamais le devancer ────
  useEffect(() => {
    if (!lot) return;
    const maintenant = Date.now();
    const patchs = {};
    const casses = []; // un geste du pilote qui lève : cet article seul est mis de côté
    for (const id of lot.ids) {
      try {
        const st = etats[id];
        if (!st || !actifs.has(id)) continue;
        const m = moteursRef.current.get(id);
        if (!m) continue;
        const pil = pilotage.current[id] ?? (pilotage.current[id] = {});
        const phase = st.phase;
        if (phase === "montage") {
          if (m.initializing || !m.publishedStateLoaded) continue;
          if (m.step >= 2) { patchs[id] = { phase: "redaction" }; continue; }
          const bilan = bilanPlateformes(m);
          const cible = lot.plateformes.filter((p) => bilan.cochables.includes(p));
          if (!cible.length) { patchs[id] = { phase: "rien", raison: raisonRien(bilan, lot.plateformes) }; continue; }
          const memeSelection = m.selected.size === cible.length && cible.every((p) => m.selected.has(p));
          if (!memeSelection) {
            if (!pil.selection || maintenant - pil.selection > 3000) { pil.selection = maintenant; m.setSelected(new Set(cible)); if (m.photoOption !== "original") m.setPhotoOption("original"); }
            continue;
          }
          if (!pil.suivant2 || maintenant - pil.suivant2 > 4000) { pil.suivant2 = maintenant; m.suivant(); }
          continue;
        }
        if (phase === "redaction") {
          if (m.step === 3) { patchs[id] = { phase: "verification", depuis: maintenant }; pil.entreeVerif = maintenant; continue; }
          if (m.step <= 1) { patchs[id] = { phase: "montage" }; continue; } // le moteur a renvoyé à « Où publier ? »
          if (m.generatingPlatforms) continue;
          if (!m.platformListings && m.platformError) {
            patchs[id] = m.platformErrorCode === "quota_annonces"
              ? { phase: "quota", raison: m.platformError }
              : { phase: "erreur", raison: m.platformError };
            continue;
          }
          if (m.platformListings && (!pil.suivant3 || maintenant - pil.suivant3 > 4000)) { pil.suivant3 = maintenant; m.suivant(); }
          continue;
        }
        if (phase === "verification" || phase === "pret" || phase === "questions") {
          if (m.step !== 3) { if (m.step === 2) patchs[id] = { phase: "redaction" }; continue; }
          // Au repos depuis assez longtemps — ou, filet, 45 s après l'arrivée :
          // un marqueur qui ne viendrait jamais ne bloque pas le lot (le clic
          // Publier du moteur garde ses propres gardes, qui excluent et disent).
          if (m.preparationAuRepos) pil.reposDepuis = pil.reposDepuis ?? maintenant;
          else pil.reposDepuis = null;
          const assezRepose = pil.reposDepuis != null && maintenant - pil.reposDepuis >= REPOS_AVANT_LECTURE_MS;
          const filet = pil.entreeVerif != null && maintenant - pil.entreeVerif > 45_000;
          if (!assezRepose && !filet) {
            if (pil.reposDepuis != null) planifierTick(REPOS_AVANT_LECTURE_MS);
            else if (phase !== "verification") patchs[id] = { phase: "verification" };
            else planifierTick(1500);
            continue;
          }
          // (26/10, C9) Beebs ou Depop sans AUCUN rayon pour l'article (ou un objet que Depop interdit) : écartée d'office,
          // sans question — la ligne le dit, « Annuler » la remet. Jamais la dernière plateforme de l'article : il ne
          // partirait nulle part, il est dit « ne part pas » avec la raison.
          const remises = decisions[id]?.remises ?? [];
          const aEcarter = ecarteesAutomatiques(m, remises).filter((e) => m.selected?.has?.(e.p));
          if (aEcarter.length) {
            const restantes = [...(m.selected ?? [])].filter((p) => !aEcarter.some((e) => e.p === p));
            const deja = decisions[id]?.ecartees ?? {};
            if (!restantes.length) {
              // Il ne partirait nulle part : « ne part pas », avec la raison — et « Annuler » sous sa ligne le remet.
              patchs[id] = { phase: "rien", raison: phraseEcartees(aEcarter, NOM, lang), ecartement: true };
              decider(id, { ecartees: { ...deja, ...Object.fromEntries(aEcarter.map((e) => [e.p, e.motif])) } });
              continue;
            }
            if (!pil.ecartement || maintenant - pil.ecartement > 3000) {
              pil.ecartement = maintenant;
              decider(id, { ecartees: { ...deja, ...Object.fromEntries(aEcarter.map((e) => [e.p, e.motif])) } });
              m.setSelected((prev) => { const s = new Set(prev); for (const e of aEcarter) s.delete(e.p); return s; });
            }
            planifierTick(800);
            continue;
          }
          const b = bilanArticle({ ...m, preparationAuRepos: true, quantiteFiche: quantiteDe(id), poidsLbcChoix: poidsLbcChoixRef.current }, decisions[id], lang);
          const nouvelle = b.pret ? "pret" : "questions";
          if (nouvelle !== phase || JSON.stringify(st.motifs ?? []) !== JSON.stringify(b.motifs)) patchs[id] = { phase: nouvelle, motifs: b.motifs };
        }
      } catch (e) { casses.push([id, e]); delete patchs[id]; }
    }
    for (const [id, e] of casses) mettreDeCote(id, e, "pilote");
    if (Object.keys(patchs).length) setEtats((prev) => {
      const n = { ...prev };
      for (const [id, p] of Object.entries(patchs)) n[id] = { ...n[id], ...p };
      return n;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, lot, etats, actifs, decisions, poidsLbc.choix]);

  function raisonRien(bilan, plateformes) {
    const lignes = [];
    for (const p of plateformes) {
      const e = bilan.etats.find((x) => x.p === p);
      if (!e) continue;
      if (e.dejaEnLigne) lignes.push(en ? `already on ${NOM(p)}` : `déjà sur ${NOM(p)}`);
      else if (e.enCours) lignes.push(en ? `already being published on ${NOM(p)}` : `déjà en cours sur ${NOM(p)}`);
      else if (e.enAttente) lignes.push(en ? `${NOM(p)} is waiting for you` : `${NOM(p)} attend un geste de ta part`);
      else if (e.compteAbsent) lignes.push(en ? "eBay account to finish" : "compte eBay à finir");
      else if (e.enPause) lignes.push(en ? `${NOM(p)} paused on our side` : `${NOM(p)} en pause de notre côté`);
      else if (e.support === "prohibited") lignes.push(en ? `${NOM(p)} refuses this item` : `${NOM(p)} refuse cet article`);
      else if (e.fermeeCategorie) lignes.push(en ? `no ${NOM(p)} category for it` : `pas de rayon ${NOM(p)} pour lui`);
    }
    const t = lignes.join(" · ");
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : (en ? "Nothing to publish." : "Rien à publier.");
  }

  // ── Les gestes de la personne sur un article ─────────────────────────────
  const decider = (id, patch) => setDecisions((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  const trancherJumeau = (id, platform, memeArticle) => {
    const m = moteursRef.current.get(id);
    if (memeArticle && m) m.setSelected((prev) => { const s = new Set(prev); s.delete(platform); return s; });
    const avant = decisionsRef.current[id]?.jumeauxTranches ?? new Set();
    decider(id, { jumeauxTranches: new Set([...avant, platform]) });
  };
  const sansPlateforme = (id, platform) => {
    const m = moteursRef.current.get(id);
    if (m) m.setSelected((prev) => { const s = new Set(prev); s.delete(platform); return s; });
  };
  // (26/10, C9) « Annuler » sur une plateforme écartée d'office : elle revient, et sa question de rayon avec elle
  // (jamais réécartée d'office pour cet article).
  const remettrePlateforme = (id, platform) => {
    const avant = decisionsRef.current[id]?.remises ?? [];
    decider(id, { remises: [...new Set([...avant, platform])] });
    const m = moteursRef.current.get(id);
    if (m) m.setSelected((prev) => { const s = new Set(prev); s.add(platform); return s; });
    // Un article « ne part pas » parce que sa seule plateforme a été écartée d'office : il revient à la vérification.
    setEtats((prev) => (prev[id]?.phase === "rien" && prev[id]?.ecartement
      ? { ...prev, [id]: { ...prev[id], phase: "verification", raison: null, ecartement: false } } : prev));
  };
  const retirerDuLot = (id) => { majEtat(id, { phase: "retire" }); };

  // ── (25/10 — Louis) JAMAIS RETENU SANS ISSUE PAR LA LECTURE DE L'ANNONCE D'ORIGINE ──────────────────────────────
  // Chez Louis, les 5 articles du lot sont restés « Lecture de ton annonce d'origine » de 10:29 à 10:50, bouton
  // d'envoi grisé, sans un mot de plus : le pont de sa page vers l'extension était mort (onglet resté ouvert pendant
  // une mise à jour) et le lecteur de secours de l'extension muet. Désormais :
  //   · pont mort constaté (sonde de 1,5 s, ou l'extension ≥ 0.6.144 qui le dit) → la page le dit et propose de se
  //     recharger, le lot gardé (même reprise qu'un passage au paiement) ;
  //   · l'attente se compte (affichée), et passé 60 s chaque article offre ses issues : écrire sa description
  //     soi-même (c'est le texte du vendeur), ou le retirer du lot — la relecture continue en arrière-plan.
  const [pontMort, setPontMort] = useState(false);
  useEffect(() => ecouterEtatPont(setPontMort), []);
  const attendOrigine = lot ? lot.ids.some((id) => etats[id]?.phase === "origine") : false;
  // Une horloge d'AFFICHAGE seulement (jamais une lecture de base), tant qu'un article attend.
  const [horloge, setHorloge] = useState(() => Date.now());
  useEffect(() => {
    if (!attendOrigine) return undefined;
    setHorloge(Date.now());
    const t = setInterval(() => setHorloge(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [attendOrigine]);
  const rechargerPourLePont = () => {
    try {
      if (lot) localStorage.setItem(CLE_REPRISE_LOT(userId), JSON.stringify({ ids: lot.ids, plateformes: lot.plateformes, le: new Date().toISOString() }));
    } catch { /* navigation privée : le lot se relance à la main */ }
    try { window.location.reload(); } catch { /* sans conséquence */ }
  };

  // ── (26/10 nuit, point 9 — patrick giry) SANS LECTEUR, PAS D'ATTENTE : LA VÉRITÉ, PUIS LES TROIS ISSUES ─────────
  // La règle du stepper (attenteLectureRegles.lecteurDisponible) : un article Vinted en « origine » n'attend que s'il
  // existe un lecteur MAINTENANT (extension ≥ 0.6.144 sur cet appareil, ou un poste du compte en ≥ 0.6.144 vu il y a
  // moins de 15 min). Sinon SA ligne dit pourquoi (heure et version réelles) et propose, chacune en un geste :
  //   · écrire sa description — écrite sur la fiche, marquée manuelle ; l'article se prépare avec elle ;
  //   · la faire rédiger par FillSell — le choix sur la fiche, jamais le texte ; l'article se prépare et son texte
  //     passe par « Relis le texte qui part » (« C'est bon » / « Tout valider ») avant l'envoi ;
  //   · attendre son ordinateur — la relecture d'origine continue, le lecteur s'y relit (un poste à jour revient :
  //     l'attente d'avant, sans « Écrire »).
  // Avec un lecteur (ou profil illisible), rien ne change. Chaque cas est tracé (usage_logs « lecture_origine_sans_lecteur »).
  const [lecteur, setLecteur] = useState(null);
  const lecteurRef = useRef(lecteur); lecteurRef.current = lecteur;
  const ficheDuLot = (id) => donnees.find((x) => x.id === id)?.item ?? null;
  const nOrigineVinted = lot ? lot.ids.filter((id) => etats[id]?.phase === "origine" && plateformeOrigine(ficheDuLot(id)) === "vinted").length : 0;
  const origineVinted = nOrigineVinted > 0;
  useEffect(() => {
    if (!origineVinted || !userId) return undefined;
    let vivant = true;
    lireLecteurVinted(supabase, userId, { versionIci: versionExtensionIci }).then((l) => {
      if (!vivant) return;
      setLecteur(l);
      if (l && !l.disponible) tracerChoixSansLecteur(supabase, userId, { evenement: "propose", lot: lotRef.current?.id ?? null, lecteur: l, details: { articles: nOrigineVinted } });
    }, () => {});
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origineVinted, userId, supabase, versionExtensionIci]);
  // Le choix fait : l'article quitte l'attente et se prépare (avec SA description, ou pour un texte rédigé à relire).
  const reprendreApresChoix = (id, item, note) => {
    if (item) setComplets((prev) => ({ ...prev, [id]: item }));
    setLectures((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), note } }));
    lusRef.current.add(id);
    setEtats((prev) => (prev[id]?.phase === "origine" ? { ...prev, [id]: { ...prev[id], phase: "attente", raison: null, sansLecture: null } } : prev));
  };
  const sansLecteur = {
    lecteur,
    ecrire: async (id, texte) => {
      const item = ficheDuLot(id);
      const r = await ecrireDescriptionSansLecteur(supabase, userId, item?.id ?? id, texte);
      const trace = { fiche: item?.id ?? id, lot: lotRef.current?.id ?? null, lecteur: lecteurRef.current };
      if (!r.ok) { tracerChoixSansLecteur(supabase, userId, { ...trace, evenement: "echec", choix: "ecrite", details: { cause: r.motif } }); return r; }
      tracerChoixSansLecteur(supabase, userId, { ...trace, choix: "ecrite" });
      reprendreApresChoix(id, { ...(complets[id] ?? item ?? {}), description: r.description }, null);
      return r;
    },
    rediger: async (id) => {
      const item = ficheDuLot(id);
      const r = await noterChoixSansLecteur(supabase, userId, item?.id ?? id);
      const trace = { fiche: item?.id ?? id, lot: lotRef.current?.id ?? null, lecteur: lecteurRef.current };
      if (!r.ok) { tracerChoixSansLecteur(supabase, userId, { ...trace, evenement: "echec", choix: "redigee", details: { cause: r.motif } }); return r; }
      tracerChoixSansLecteur(supabase, userId, { ...trace, choix: "redigee" });
      reprendreApresChoix(id, null, "redigee_sans_lecteur");
      return r;
    },
    attendre: (id) => {
      const item = ficheDuLot(id);
      tracerChoixSansLecteur(supabase, userId, { choix: "attendre", fiche: item?.id ?? id, lot: lotRef.current?.id ?? null, lecteur: lecteurRef.current });
      majEtat(id, { sansLecture: "attendre" });
    },
  };
  // ── LA LIVRAISON DU LOT (04/10, Louis) : poids, transporteurs, format ────
  // Le poids est celui de l'ARTICLE : écrit sur la fiche (inventaire.poids_g,
  // le seul champ Poids — Beebs le lit là au service du job) et sur la copie
  // Leboncoin. Les transporteurs : ceux que la personne garde, retenus dans
  // platform_settings.leboncoin.transporteurs (gpj les applique aussi aux
  // publications suivantes) ; par article, ceux que son poids autorise.
  const [livraison, setLivraison] = useState({ transporteurs: undefined, format: "" });
  const livraisonRef = useRef(livraison); livraisonRef.current = livraison;
  const transporteursRetenus = Array.isArray(profil?.platform_settings?.leboncoin?.transporteurs)
    ? profil.platform_settings.leboncoin.transporteurs : null;
  const transporteursDuLot = livraison.transporteurs === undefined ? transporteursRetenus : livraison.transporteurs;
  // (26/10, règle 7 de Nico) Le poids d'un article : celui de la fiche ou du choix de la personne — jamais une estimation.
  const poidsDe = (id) => poidsAffiche(moteursRef.current.get(id), decisionsRef.current[id], parId.get(id)?.item ?? null, poidsLbc.colisDefaut?.poids_g ?? null);
  const appliquerLivraison = (id, g = poidsDe(id)) => {
    const m = moteursRef.current.get(id);
    if (!m?.edited?.leboncoin || !m.poserLivraisonLbc) return;
    const permis = transporteursPourPoids(g);
    const voulus = transporteursDuLot ? transporteursDuLot.filter((n) => permis.includes(n)) : null;
    m.poserLivraisonLbc({
      ...(g != null ? { lbcPoidsGrammes: g } : {}),
      lbcTransporteurs: voulus && voulus.length ? voulus : null,
      format_colis: livraisonRef.current.format || "",
    });
  };
  const poserPoids = (id, g) => {
    if (!g) return;
    decider(id, { poids: g });
    appliquerLivraison(id, g);
    const inv = parId.get(id)?.item?.id;
    if (inv != null) {
      supabase.from("inventaire").update({ poids_g: g }).eq("id", inv).eq("user_id", userId)
        .then(({ error }) => { if (error) console.warn("[lot] poids non gardé sur la fiche :", error.message); }, () => {});
    }
  };
  const poserPoidsDuLot = (ids, g) => { for (const id of ids) poserPoids(id, g); };
  const poserTransporteurs = (liste) => {
    setLivraison((l) => ({ ...l, transporteurs: liste }));
    (liste ? fusionnerReglages(["leboncoin"], { transporteurs: liste }) : fusionnerReglages(["leboncoin"], null, ["transporteurs"]))
      .then(({ error }) => { if (error) console.warn("[lot] transporteurs non retenus :", error.message); }, () => {});
  };
  const poserFormat = (f) => setLivraison((l) => ({ ...l, format: f }));

  // ── L'ENVOI : une RPC par article, l'un après l'autre ────────────────────
  const [envoi, setEnvoi] = useState(null); // { fait, total }

  // ── (22/10 soir, point 8) L'ARTICLE QUI ATTEND SON ANNONCE D'ORIGINE REPART TOUT SEUL ──
  // Relecture bornée (60 s, onglet visible) des seuls articles en phase « origine » : lue → il revient
  // « En attente », sa description est reprise comme les autres, puis il se prépare. Jamais après l'envoi.
  const idsOrigine = lot ? lot.ids.filter((id) => etats[id]?.phase === "origine").join("|") : "";
  useEffect(() => {
    if (!idsOrigine || envoi) return undefined;
    const ids = idsOrigine.split("|");
    const r = demarrerRelecture(async () => {
      // (26/10 nuit, point 9) Sans lecteur, il se relit au même rythme : un poste à jour qui revient, et l'attente
      // redevient celle d'avant (les issues disparaissent).
      if (lecteurRef.current?.disponible === false) {
        const l = await lireLecteurVinted(supabase, userId, { versionIci: versionExtensionIci }).catch(() => null);
        if (l) setLecteur(l);
      }
      const lus = [];
      for (const id of ids) {
        const d = donnees.find((x) => x.id === id);
        const a = await attenteLectureOrigine(supabase, userId, d?.item?.id ?? id);
        if (!a) lus.push(id);
      }
      if (lus.length) {
        for (const id of lus) lusRef.current.delete(id);
        setEtats((prev) => {
          const n = { ...prev };
          for (const id of lus) if (n[id]?.phase === "origine") n[id] = { ...n[id], phase: "attente", raison: null };
          return n;
        });
      }
      return true;
    }, { intervalleMs: 60_000, maxMs: 15 * 60_000, immediat: false });
    return () => r.arreter();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsOrigine, envoi]);
  const attendre = (pred, ms) => new Promise((resolve) => {
    const fin = Date.now() + ms;
    const boucle = () => { if (pred() || Date.now() > fin) resolve(pred()); else setTimeout(boucle, 150); };
    boucle();
  });
  async function envoyer() {
    if (!lot) return;
    // (12/10, A1) Un seul envoi à la fois : un double appui ne relance jamais
    // la boucle (l'index unique du serveur refuserait le doublon, mais rien
    // ne doit même le tenter).
    if (envoiEnCoursRef.current) return;
    const ids = lot.ids.filter((id) => etatsRef.current[id]?.phase === "pret");
    if (!ids.length) return;
    envoiEnCoursRef.current = true;
    try { await envoyerUnParUn(ids); } finally { envoiEnCoursRef.current = false; }
  }
  async function envoyerUnParUn(ids) {
    setEtape("envoi");
    setEnvoi({ fait: 0, total: ids.length });
    let parti = 0;
    for (const id of ids) {
      // Mis de côté entre-temps (moteur cassé) : rien ne part pour lui.
      if (etatsRef.current[id]?.phase === "erreur") { setEnvoi((e) => ({ ...e, fait: e.fait + 1 })); continue; }
      const m = moteursRef.current.get(id);
      let b = null;
      try { b = m ? bilanArticle({ ...m, preparationAuRepos: true, quantiteFiche: quantiteDe(id), poidsLbcChoix: poidsLbcChoixRef.current }, decisionsRef.current[id], lang) : null; }
      catch (e) { mettreDeCote(id, e, "envoi_bilan"); setEnvoi((x) => ({ ...x, fait: x.fait + 1 })); continue; }
      if (!m || !b?.pret) { majEtat(id, { phase: "questions", motifs: b?.motifs ?? [] }); setEnvoi((e) => ({ ...e, fait: e.fait + 1 })); continue; }
      majEtat(id, { phase: "envoi" });
      try { m.envoyerMaintenant?.(maintenantLot); } catch { /* moteur d'avant : la règle du réglage vaut */ }
      try { await m.publier(); } catch { /* le moteur pose publishError */ }
      await attendre(() => { const mm = moteursRef.current.get(id); return etatsRef.current[id]?.phase === "erreur" || Boolean(mm && (mm.done || (!mm.publishing && mm.publishError))); }, 10_000);
      const mm = moteursRef.current.get(id);
      // Son moteur a cassé pendant l'envoi : la phrase de mise de côté reste
      // (« regarde-le dans ton Stock »), jamais un « rien n'a été créé » non prouvé.
      if (!mm && etatsRef.current[id]?.phase === "erreur") { setEnvoi((e) => ({ ...e, fait: e.fait + 1 })); continue; }
      if (mm?.done) {
        parti++;
        majEtat(id, {
          phase: "envoye",
          envoyees: mm.fournee?.plateformes ?? [...(mm.selected ?? [])],
          exclusions: mm.exclusionsDuClic ?? [],
        });
        // bulk_batch_id après coup, comme la republication en lot : la RPC ne
        // le prend pas. Le marqueur platform_fields.lot_publication, lui, est
        // posé à la création ; l'estampille n'est qu'un raccourci de lecture.
        supabase.from("cross_post_jobs").update({ bulk_batch_id: lot.id })
          .eq("user_id", userId).eq("inventaire_id", Number(id)).eq("action", "publish")
          .filter("platform_fields->lot_publication->>id", "eq", lot.id)
          .select("id")
          .then(({ error }) => { if (error) console.warn("[lot] estampille du lot :", error.message); }, () => {});
      } else {
        majEtat(id, { phase: "refuse", raison: mm?.publishError || (en ? "The server didn't confirm — nothing was created for this item." : "Le serveur n'a pas confirmé — rien n'a été créé pour cet article.") });
      }
      setEnvoi((e) => ({ ...e, fait: e.fait + 1 }));
    }
    setEtape("fin");
    if (parti) onEnvoye?.({ id: lot.id, le: lot.le });
  }

  // ── Ce que l'écran 2 montre ──────────────────────────────────────────────
  const lignes = lot ? [...lot.ids, ...Object.keys(etats).filter((id) => !lot.ids.includes(id))] : [];
  const parId = useMemo(() => new Map(donnees.map((d) => [d.id, d])), [donnees]);
  const enPrep = lot ? lot.ids.filter((id) => ["attente", ...PHASES_EN_PREPARATION].includes(etats[id]?.phase)) : [];
  const prepares = lot ? lot.ids.length - enPrep.length : 0;
  const prets = lot ? lot.ids.filter((id) => etats[id]?.phase === "pret") : [];
  const aCompleter = lot ? lot.ids.filter((id) => etats[id]?.phase === "questions") : [];
  const annoncesPretes = prets.reduce((n, id) => n + [...(moteursRef.current.get(id)?.plateformesPubliables ?? [])].length, 0);
  const preparationFinie = Boolean(lot) && enPrep.length === 0;
  // (09/10 soir) Les articles d'une catégorie que DEPOP INTERDIT : exclus de
  // Depop seulement (la case de leur moteur est grisée), comptés et dits AVANT
  // l'envoi — le reste du lot part normalement, jamais un lot bloqué pour ça.
  const exclusDepop = lot && lot.plateformes.includes("depop")
    ? lot.ids.filter((id) => !["retire", "envoye"].includes(etats[id]?.phase) && moteursRef.current.get(id)?.depopInterdit)
      .map((id) => ({ id, message: moteursRef.current.get(id).depopInterdit.message, quoi: moteursRef.current.get(id).depopInterdit.quoi }))
    : [];
  // La livraison du lot atteint chaque copie Leboncoin dès la préparation
  // finie (transporteurs retenus compris), puis à chaque changement.
  useEffect(() => {
    if (!lot || !preparationFinie || envoi) return;
    for (const id of lot.ids) {
      try { appliquerLivraison(id); } catch (e) { mettreDeCote(id, e, "livraison"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot, preparationFinie, livraison, (transporteursRetenus ?? []).join("|")]);

  // ── LE FORMAT DU COLIS VINTED DU LOT (05/10, point 3, décision de Nico) ──
  // « Ajoute-la au bloc Livraison et à l'envoi. Même principe que pour
  // Leboncoin : rien de deviné ; le choix de la personne est retenu pour les
  // publications suivantes. » Avant, la carte Vinted du lot n'avait qu'une
  // phrase : aucun format ne se choisissait. Désormais, un bloc par RAYON
  // Vinted du lot (la grille de CE rayon, relevée sur le formulaire d'abord) :
  // « Recommandé par Vinted » par défaut (aucun choix), le retenu du rayon
  // pré-sélectionné. Un choix fait ici part sur les copies Vinted du rayon —
  // le même geste que la carte du stepper (packageSizeId, moteur.
  // poserColisVinted) — et se RETIENT (platform_settings.vinted.colis_retenus,
  // par la RPC de fusion, jamais l'objet entier). Un rayon sans grille connue :
  // on le dit, aucun choix inventé.
  const [colisLot, setColisLot] = useState({}); // clé du rayon → id choisi ici (0 = « Recommandé par Vinted »)
  const [retenusColisLocaux, setRetenusColisLocaux] = useState(null);
  const retenusColis = retenusColisLocaux ?? colisRetenusEnCache(userId) ?? colisRetenusDuProfil(profil?.platform_settings);
  const colisPosesRef = useRef(new Map()); // id → valeur posée par le lot sur la copie Vinted
  const grillesDemandees = useRef(new Set());
  const cheminVintedDe = (m) => m?.rayonsParPf?.vinted?.chemin ?? m?.edited?.vinted?.platform_fields?.categoryPath ?? null;
  const rayonsVinted = (() => {
    if (!lot) return [];
    const parCle = new Map();
    for (const id of lot.ids) {
      if (["retire", "envoye"].includes(etats[id]?.phase)) continue;
      const m = moteursRef.current.get(id);
      if (!m || ![...(m.plateformesPubliables ?? [])].includes("vinted")) continue;
      const chemin = cheminVintedDe(m);
      const cle = cleColisRetenu(chemin);
      // Un rayon pas encore connu (sa question est posée plus bas) : son
      // format se choisira quand il le sera.
      if (!cle) continue;
      if (!parCle.has(cle)) parCle.set(cle, { cle, chemin, ids: [] });
      parCle.get(cle).ids.push(id);
    }
    return [...parCle.values()];
  })();
  const sigRayonsVinted = rayonsVinted.map((r) => `${r.cle}=${r.ids.join(",")}`).join("|");
  // La grille RELEVÉE de chaque rayon : une lecture par rayon et par session.
  useEffect(() => {
    for (const r of rayonsVinted) {
      if (grillesDemandees.current.has(r.cle)) continue;
      grillesDemandees.current.add(r.cle);
      chargerGrilleColisRelevee(supabase, r.chemin).then(() => planifierTick(), () => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigRayonsVinted]);
  // Le choix du lot atteint chaque copie Vinted de son rayon. Un article qui
  // change de rayon perd le choix de l'ancien : sa fiche, puis le retenu de
  // son nouveau rayon, reprennent la main au clic Publier.
  useEffect(() => {
    if (!lot || !preparationFinie || envoi) return;
    for (const id of lot.ids) {
      try {
        const m = moteursRef.current.get(id);
        if (!m?.poserColisVinted || !m.edited?.vinted) continue;
        const cle = cleColisRetenu(cheminVintedDe(m));
        const voulu = cle && colisLot[cle] !== undefined ? colisLot[cle] : undefined;
        if (voulu === colisPosesRef.current.get(id)) continue;
        m.poserColisVinted(voulu === undefined ? null : voulu);
        if (voulu === undefined) colisPosesRef.current.delete(id); else colisPosesRef.current.set(id, voulu);
      } catch (e) { mettreDeCote(id, e, "colis_vinted"); }
    }
  }, [lot, preparationFinie, colisLot, sigRayonsVinted, envoi, mettreDeCote]);
  const choisirColisVinted = (cle, chemin, id) => {
    setColisLot((prev) => ({ ...prev, [cle]: id }));
    const ecriture = retenirColisVinted({ userId, chemin, id, fusionner: fusionnerReglages });
    setRetenusColisLocaux(colisRetenusEnCache(userId));
    ecriture?.then(({ error } = {}) => {
      if (error) console.warn("[lot] format de colis Vinted non retenu :", error.message);
      setRetenusColisLocaux(colisRetenusEnCache(userId));
    }, () => {});
  };
  const colisVinted = rayonsVinted.map((r) => {
    const grille = grilleColisVinted(r.chemin);
    const retenu = colisRetenuDuRayon(retenusColis, r.chemin);
    const touche = colisLot[r.cle] !== undefined;
    const choisi = touche ? colisLot[r.cle] : (retenu?.id ?? 0);
    // Sans geste ici, le choix rangé sur la fiche d'un article passe avant le
    // retenu du rayon (utils/vintedColis.js) : on dit combien le gardent.
    const parFiche = touche || !grille ? 0 : r.ids.filter((id) => {
      const m = moteursRef.current.get(id);
      const f = colisVintedDeLaFiche(m?.initialListing?.attributs ?? parId.get(id)?.item?.attributs ?? null);
      if (f === 0) return choisi !== 0;
      return Boolean(f) && grille.some((g) => g.id === f) && f !== choisi;
    }).length;
    return { cle: r.cle, chemin: r.chemin, nb: r.ids.length, grille, choisi, retenu: !touche && Boolean(retenu), parFiche };
  });

  // Réponses communes : un même champ fermé, même liste, sur plusieurs articles.
  const communes = useMemo(() => {
    if (!preparationFinie) return [];
    const entrees = [];
    for (const id of aCompleter) {
      const m = moteursRef.current.get(id);
      for (const [gp, liste] of Object.entries(m?.genericRequiredStatus ?? {})) {
        for (const a of liste ?? []) {
          if ((a.state === "missing" || a.state === "invalid") && Array.isArray(a.allowedValues) && a.allowedValues.length && !a.neufSeulement && !a.rayonEnCause) {
            entrees.push({ id, gp, key: a.key, label: a.label ?? a.key, allowedValues: a.allowedValues, a });
          }
        }
      }
    }
    return groupesReponseCommune(entrees).map((g) => ({ ...g, entrees: entrees.filter((e) => g.ids.includes(e.id) && e.gp === g.gp && e.key === g.key) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparationFinie, aCompleter.join(","), tick]);
  const repondreCommune = (g, valeur) => {
    for (const e of g.entrees) {
      const m = moteursRef.current.get(e.id);
      if (!m) continue;
      // (18/10 nuit) La réponse commune est une réponse de la personne : un
      // champ du RAYON est retenu au clic Publier de chaque article.
      m.noterReponseQuestion?.(e.gp, e.a, valeur);
      if (e.a.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(e.gp, e.a.dedicatedTarget, valeur);
      else m.setPlatformAspect?.(e.gp, e.a.key, valeur);
    }
  };

  // ── LA MÉMOIRE « COMPTE × CATÉGORIE » DANS LE LOT (18/10 nuit, point 1) ──
  // Ce que la mémoire a posé, regroupé par (plateforme, champ, rayon, valeur) :
  // dit avant l'envoi, et modifiable pour tous les articles du groupe d'un
  // geste (la nouvelle valeur devient la réponse de la personne, retenue).
  const posesDuLot = (() => {
    if (!lot || !preparationFinie || envoi) return [];
    const groupes = new Map();
    for (const id of lot.ids) {
      if (["retire", "envoye"].includes(etats[id]?.phase)) continue;
      const m = moteursRef.current.get(id);
      for (const { pose, valeur } of posesMemoireVisibles(m)) {
        const cle = [pose.plateforme, pose.champ, pose.categorie, valeur].join("␟");
        if (!groupes.has(cle)) groupes.set(cle, { cle, pose, valeur, ids: [] });
        groupes.get(cle).ids.push(id);
      }
    }
    return [...groupes.values()];
  })();
  const changerPosesDuLot = (g, valeur) => {
    for (const id of g.ids) {
      const m = moteursRef.current.get(id);
      if (!m) continue;
      const ligne = { key: g.pose.champ, name: g.pose.champ, allowedValues: g.pose.allowedValues, dedicatedTarget: g.pose.dedicatedTarget };
      m.noterReponseQuestion?.(g.pose.plateforme, ligne, valeur);
      if (g.pose.plateforme === "ebay") { m.setEbayAspect?.(g.pose.champ, valeur); continue; }
      if (g.pose.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(g.pose.plateforme, g.pose.dedicatedTarget, valeur);
      else m.setPlatformAspect?.(g.pose.plateforme, g.pose.champ, valeur);
    }
  };

  // ── La coque ─────────────────────────────────────────────────────────────
  const numeroEcran = etape === "plateformes" ? 1 : etape === "fin" ? 3 : 2;
  const titre = etape === "fin"
    ? (en ? "It's under way" : "C'est parti")
    : (en ? `Publish ${donnees.length} item${donnees.length > 1 ? "s" : ""}` : `Publier ${donnees.length} article${donnees.length > 1 ? "s" : ""}`);
  const [quitterArme, setQuitterArme] = useState(false);
  const quitter = () => {
    // Rien n'est encore parti mais des articles sont préparés : un second tap
    // confirme. Les fiches rédigées restent sur les articles (rien de perdu).
    if (etape === "avant" && prepares > 0 && !quitterArme) { setQuitterArme(true); setTimeout(() => setQuitterArme(false), 4000); return; }
    fermer();
  };

  let cta = null, disabled = false, onCta = null, sous = [], secondaire = null;
  if (etape === "plateformes") {
    const n = partage.maintenant.length;
    disabled = !n || fiches == null || quotas == null;
    cta = fiches == null || quotas == null ? (en ? "Reading your items…" : "Lecture de tes articles…")
      : !n ? (!choix.length ? (en ? "Tick at least one platform" : "Coche au moins une plateforme")
          : partage.plusTard.length ? (en ? "This month's free items are used" : "Ton quota du mois est utilisé")
          : (en ? "Nothing to publish with this choice" : "Rien à publier avec ce choix"))
      : murActif
        // Le second choix du mur : continuer avec ce que le quota permet.
        ? (en ? `Continue with ${n} item${n > 1 ? "s" : ""}` : `Continuer avec ${n} article${n > 1 ? "s" : ""}`)
        : (en ? `Prepare ${annoncesPrevues} listing${annoncesPrevues > 1 ? "s" : ""}` : `Préparer ${annoncesPrevues} annonce${annoncesPrevues > 1 ? "s" : ""}`);
    onCta = preparer;
    sous = [murActif && n
      ? (en ? `The other ${partage.plusTard.length} stay in your stock: you can publish them from your new month${dateCourte(remise, en) ? ` (${dateCourte(remise, en)})` : ""}. Nothing goes out yet.` : `${partage.plusTard.length > 1 ? `Les ${partage.plusTard.length} autres restent` : "L'autre reste"} dans ton stock : tu pourras ${partage.plusTard.length > 1 ? "les" : "le"} publier dès ton nouveau mois${dateCourte(remise, en) ? ` (le ${dateCourte(remise, en)})` : ""}. Rien ne part encore.`)
      : (en ? "Nothing goes out yet: we prepare, you check." : "Rien ne part encore : on prépare, tu vérifies.")];
  } else if (etape === "avant") {
    if (!preparationFinie) {
      cta = en ? `Preparing… ${prepares} of ${lot.ids.length}` : `Préparation… ${prepares} sur ${lot.ids.length}`;
      disabled = true;
      sous = [en ? "You can answer below as soon as a question shows up." : "Tu peux déjà répondre ci-dessous dès qu'une question apparaît."];
    } else {
      disabled = !prets.length;
      // (25/10 — Louis) Rien de prêt parce que des articles attendent leur annonce d'origine : on le dit, pas « réponds ».
      const enOrigine = lot.ids.filter((id) => etats[id]?.phase === "origine").length;
      // (26/10 nuit, point 9) Sans lecteur, rien ne se lit : ce n'est pas « Lecture… », c'est à la personne de choisir.
      const sansLecteurIci = enOrigine > 0 && nOrigineVinted === enOrigine && issuesSansLecteur(lecteur).length > 0;
      cta = !prets.length
        ? (enOrigine && !aCompleter.length
          ? (sansLecteurIci
            ? (en ? "Choose for each item below" : "Choisis pour chaque article ci-dessous")
            : (en ? "Reading your original listings…" : "Lecture de tes annonces d'origine…"))
          : (en ? "Answer the questions to send" : "Réponds aux questions pour envoyer"))
        : aCompleter.length
          ? (en
              ? `Send ${prets.length > 1 ? `the ${prets.length} ready items` : "the ready item"} (${annoncesPretes} listing${annoncesPretes > 1 ? "s" : ""})`
              : `Envoyer ${prets.length > 1 ? `les ${prets.length} prêts` : "l'article prêt"} (${annoncesPretes} annonce${annoncesPretes > 1 ? "s" : ""})`)
          : (en ? `Send ${annoncesPretes} listing${annoncesPretes > 1 ? "s" : ""}` : `Envoyer ${annoncesPretes} annonce${annoncesPretes > 1 ? "s" : ""}`);
      // (26/10, D4) Programmées : le geste dit ce qu'il fait.
      if (prets.length && programme) cta = cta.replace(/^Envoyer/, "Programmer").replace(/^Send/, "Schedule");
      onCta = envoyer;
      if (aCompleter.length && prets.length) sous = [en ? `The ${aCompleter.length} others stay in your stock, prepared: nothing is lost.` : `${aCompleter.length > 1 ? `Les ${aCompleter.length} autres restent` : "L'autre reste"} dans ton stock, préparé${aCompleter.length > 1 ? "s" : ""} : rien n'est perdu.`];
      else if (prets.length) sous = [en ? "The FillSell extension then posts them from your computer, one after the other." : "L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre."];
      if (prets.length && programme) {
        const nom = { matin: en ? "morning " : "du matin", midi: en ? "midday " : "de midi", soir: en ? "evening " : "du soir" }[programmation.reglage.creneau] ?? "";
        const plafond = programmation.reglage.plafond_jour;
        sous = [en
          ? `Scheduled: they go out one at a time in your ${nom}slot${plafond ? `, ${plafond} a day at most` : ""}. Anything over the limit waits for the next slot.`
          : `Programmées : elles partiront une à une dans ton créneau${nom ? ` ${nom}` : ""}${plafond ? `, ${plafond} par jour au plus` : ""}. Ce qui dépasse attend le créneau suivant.`];
      }
      if (!prets.length && enOrigine && !aCompleter.length) {
        sous = [sansLecteurIci
          ? (en ? "For each item: write your description, have FillSell write it, or wait for your computer." : "Pour chaque article : écris ta description, fais-la rédiger par FillSell, ou attends ton ordinateur.")
          : pontMort
            ? (en ? "Reload the page (above): your batch is kept." : "Recharge la page (plus haut) : ton lot est gardé.")
            : (en ? "Each item is ready with YOUR text as soon as its listing is read. If reading drags on, each item lets you write the description yourself or remove it from the batch." : "Chaque article est prêt avec TON texte dès que son annonce est lue. Si la lecture traîne, chaque article te propose d'écrire la description toi-même ou de le retirer du lot.")];
      }
    }
  } else if (etape === "envoi") {
    cta = en ? `Queuing… ${envoi?.fait ?? 0} of ${envoi?.total ?? 0}` : `Mise en file… ${envoi?.fait ?? 0} sur ${envoi?.total ?? 0}`;
    disabled = true;
    sous = [en ? "Keep this screen open for a few seconds." : "Garde cet écran ouvert quelques secondes."];
  } else {
    cta = en ? "Back to stock" : "Retour au stock";
    onCta = () => fermer({ envoye: true });
    sous = [en ? "You'll follow the batch at the top of your Stock." : "Tu suis le lot en haut de ton Stock."];
  }

  return (
    <CoqueLot
      en={en} ecran={`lot-${etape}`} titre={titre} numeroEcran={numeroEcran}
      retour={etape === "fin" ? null : { desactive: etape === "envoi", onClick: () => (etape === "avant" && !prepares ? setEtape("plateformes") : quitter()) }}
      quitter={etape === "fin" ? null : { arme: quitterArme, desactive: etape === "envoi", onClick: quitter }}
      cta={cta} ctaDesactive={disabled} onCta={() => onCta?.()} secondaire={secondaire} sous={sous}
      apres={(
        /* Les moteurs du lot : un par article en préparation ou à envoyer. */
        <div className="fsl-moteurs" aria-hidden="true">
          {lot && [...actifs].map((id) => {
            const d = parId.get(id);
            if (!d) return null;
            // Un moteur qui casse ne casse que SON article (mis de côté).
            return (
              <BarriereErreur key={id} nom={`moteur ${id}`} onErreur={(e) => mettreDeCote(id, e, "moteur")}>
              <HoteMoteur
                item={complets[id] ?? d.item}
                jobs={d.jobs}
                prixVinted={prixVinted ? prixVinted(d.item) : null}
                surMoteur={surMoteur}
                marque={marque}
                onJobsQueued={onJobsQueued}
                userId={userId} supabase={supabase} lang={lang}
                ebayCompte={ctx.ebayCompte} plateformesVisibles={ctx.plateformesVisibles} plateformesOuvertes={ctx.plateformesOuvertes}
                plateformesFermees={ctx.plateformesFermees ?? AUCUNE_FERMEE}
                oplaMotifGrise={ctx.oplaMotifGrise} oplaExtensionMin={ctx.oplaExtensionMin}
                isPremium={ctx.isPremium} isPro={ctx.isPro} isBusiness={ctx.isBusiness}
                extensionNeverSeen={ctx.extensionNeverSeen} extensionLastSeenAt={ctx.extensionLastSeenAt}
              />
              </BarriereErreur>
            );
          })}
        </div>
      )}>
          {etape === "plateformes" && (
            <EcranPlateformes
              en={en} lang={lang} userId={userId} donnees={donnees} resume={resume} choix={choix} basculer={basculer}
              sessions={sessions} pauses={pauses} ebayBloque={ebayBloque} ebayParServeur={ebayParServeur} ebayEtat={ctx.ebayCompte?.etat ?? null}
              quotas={quotas} restantes={restantes} remise={remise} partage={partage} annoncesPrevues={annoncesPrevues} duree={duree}
              extensionNeverSeen={ctx.extensionNeverSeen} extensionLastSeenAt={ctx.extensionLastSeenAt}
              fichesLues={fiches != null} boutiqueVinted={boutiqueVinted} depopAAutoriser={depopAAutoriser}
              mur={murActif ? {
                palierVise, quotaVise: palierVise ? quotasPaliers[palierVise] ?? null : null,
                onMonter: onMonterDePalier && palierVise ? monterDePalier : null, renvoiBoutique, essaiAchat,
              } : null}
            />
          )}
          {(etape === "avant" || etape === "envoi") && lot && (
            <EcranAvant
              en={en} lang={lang} L={L} lot={lot} etats={etats} lignes={lignes} parId={parId}
              moteurs={moteursRef.current} decisions={decisions} prepares={prepares} preparationFinie={preparationFinie}
              prets={prets} aCompleter={aCompleter} annoncesPretes={annoncesPretes} communes={communes}
              repondreCommune={repondreCommune} decider={decider} trancherJumeau={trancherJumeau}
              posesDuLot={posesDuLot} changerPosesDuLot={changerPosesDuLot}
              sansPlateforme={sansPlateforme} remettrePlateforme={remettrePlateforme} retirerDuLot={retirerDuLot} envoi={envoi} supabase={supabase}
              lectures={lectures}
              livraison={{ transporteurs: transporteursDuLot, format: livraison.format }} poidsDe={poidsDe} poserPoids={poserPoids}
              poserPoidsDuLot={poserPoidsDuLot} poserTransporteurs={poserTransporteurs} poserFormat={poserFormat}
              colisVinted={colisVinted} choisirColisVinted={choisirColisVinted}
              userId={userId} exclusDepop={exclusDepop} mettreDeCote={mettreDeCote} signalerErreurBloc={signalerErreurBloc}
              choixPoidsLbc={poidsLbc.choix} choisirPoidsLbc={poidsLbc.choisir} poidsExigeLbc={poidsLbc.exige}
              programmation={programmation.reglage} maintenantLot={maintenantLot} setMaintenantLot={setMaintenantLot}
              poidsDefaut={poidsLbc.colisDefaut?.poids_g ?? null}
              pontMort={pontMort} horloge={horloge} rechargerPourLePont={rechargerPourLePont}
              sansLecteur={sansLecteur}
            />
          )}
          {etape === "fin" && lot && (
            <EcranFin en={en} L={L} lot={lot} etats={etats} lignes={lignes} parId={parId}
              extensionNeverSeen={ctx.extensionNeverSeen} ebayParServeur={ebayParServeur} onOuvrirArticle={onOuvrirArticle} remise={remise} />
          )}
    </CoqueLot>
  );
}

// ═══ LA COQUE DU LOT — en-tête, progression 1/3 · 2/3 · 3/3, pied ═══════════
// La même que celle du stepper (classes de stepper.css) ; exportée pour que
// l'aperçu (scripts/apercu/lot-publication.jsx) dessine EXACTEMENT cet écran.
export function CoqueLot({ en, ecran, titre, numeroEcran, retour = null, quitter = null, cta, ctaDesactive = false, onCta, secondaire = null, sous = [], apres = null, children }) {
  return createPortal((
    <div className="fsn" data-ecran={ecran}>
      <div className="fsn-top">
        <div className="fsn-col">
          {retour ? (
            <button type="button" className="fsn-back" disabled={retour.desactive} onClick={retour.onClick} aria-label={en ? "Back" : "Retour"}>‹</button>
          ) : <span style={{ width: 38 }} />}
          <div className="fsn-top-title">{titre}</div>
          <div className="fsn-top-step num">{numeroEcran} / 3</div>
          {quitter && (
            <button type="button" className={`fsn-quit${quitter.arme ? " fsn-quit--arme" : ""}`} onClick={quitter.onClick} disabled={quitter.desactive}>
              {quitter.arme ? (en ? "Leave? Prepared texts are kept" : "Quitter ? Les textes préparés sont gardés") : (en ? "Leave" : "Quitter")}
            </button>
          )}
        </div>
      </div>
      <div className="fsn-progress"><div className="fsn-col">
        {[1, 2, 3].map((i) => <span key={i} className={i <= numeroEcran ? "done" : ""} />)}
      </div></div>
      <div className="fsn-scroll">
        <div className="fsn-col">{children}</div>
      </div>
      <div className="fsn-foot">
        <div className="fsn-col">
          <Bouton disabled={ctaDesactive} onClick={onCta}>{cta}</Bouton>
          {secondaire}
          {(sous ?? []).map((l, i) => <p key={i} className="fsn-hint">{l}</p>)}
        </div>
      </div>
      {apres}
    </div>
  ), document.body);
}

// ═══ ÉCRAN 1 — « OÙ LES PUBLIER ? » ═════════════════════════════════════════
export function EcranPlateformes({
  en, lang, userId, donnees, resume, choix, basculer, sessions, pauses, ebayBloque, ebayParServeur, ebayEtat = null,
  quotas, restantes, remise, partage, annoncesPrevues, duree, extensionNeverSeen, extensionLastSeenAt, fichesLues, boutiqueVinted = null,
  mur = null, depopAAutoriser = false,
}) {
  const n = donnees.length;
  const vus = donnees.slice(0, 6);
  const ann = quotas?.annonces ?? null;
  const dateRemise = dateCourte(remise, en);
  const extVue = Date.parse(extensionLastSeenAt ?? "");
  const [ouvertLe] = useState(() => Date.now());
  const extEndormie = Number.isFinite(extVue) && ouvertLe - extVue > 60 * 60 * 1000;
  const plateformes = PLATEFORMES_LOT.filter((p) => resume[p]);
  return (
    <>
      <div className="fsn-card" style={{ gap: 10 }}>
        <div className="fsl-vignettes">
          {vus.map((d) => <Vignette key={d.id} item={d.item} />)}
          {n > vus.length && <div className="fsl-plus">+{n - vus.length}</div>}
        </div>
        <div>
          <div className="fsn-card-t">{en ? `${n} item${n > 1 ? "s" : ""}` : `${n} article${n > 1 ? "s" : ""}`}</div>
          <p className="fsn-small">{en
            ? "Each one goes where it isn't yet. Your titles, prices and descriptions go out as you wrote them."
            : "Chacun part là où il n'est pas encore. Tes titres, prix et descriptions partent tels que tu les as écrits."}</p>
        </div>
      </div>

      {/* LE MUR : le quota ne couvre pas tout le lot. Deux choix clairs —
          monter d'un palier (ici), ou continuer avec ce qui passe (le bouton
          du bas). Jamais au-delà du quota. */}
      {mur && partage.plusTard.length > 0 && (
        <Carte gravite="geste" titre={en ? "Your monthly listings don't cover the whole batch" : "Ton quota ne suffit pas pour tout le lot"}>
          <div className="fsn-card-p">
            {partage.maintenant.length
              ? (en
                  ? `${partage.maintenant.length} item${partage.maintenant.length > 1 ? "s" : ""} can go now; the other ${partage.plusTard.length} stay in your stock, to publish from your new month${dateRemise ? ` (${dateRemise})` : ""}.`
                  : `${partage.maintenant.length > 1 ? `${partage.maintenant.length} articles peuvent` : "1 article peut"} partir maintenant ; ${partage.plusTard.length > 1 ? `les ${partage.plusTard.length} autres restent` : "l'autre reste"} dans ton stock, à publier dès ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)
              : (en
                  ? `Your ${partage.plusTard.length} item${partage.plusTard.length > 1 ? "s" : ""} stay in your stock, to publish from your new month${dateRemise ? ` (${dateRemise})` : ""}.`
                  : `${partage.plusTard.length > 1 ? `Tes ${partage.plusTard.length} articles restent` : "Ton article reste"} dans ton stock, à publier dès ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)}
          </div>
          {mur.onMonter && !mur.renvoiBoutique && (
            <Bouton onClick={mur.onMonter}>
              {en
                ? `Switch to ${NOM_PALIER[mur.palierVise]}${mur.quotaVise ? ` — ${mur.quotaVise} items a month, on all your platforms` : ""}`
                : `Passer à ${NOM_PALIER[mur.palierVise]}${mur.quotaVise ? ` — ${mur.quotaVise} articles par mois, sur toutes tes plateformes` : ""}`}
            </Bouton>
          )}
          {mur.renvoiBoutique && (
            <div className="fsn-card-p">{RENVOI_BOUTIQUE[en ? "en" : "fr"][mur.renvoiBoutique]}</div>
          )}
          {mur.essaiAchat && (
            <div className="fsn-small">Essai (développement) : le parcours d'achat s'ouvrirait ici. Rien n'est lancé pendant un essai.</div>
          )}
          {partage.maintenant.length > 0 && (
            <div className="fsn-small">{en
              ? `Or continue with ${partage.maintenant.length} item${partage.maintenant.length > 1 ? "s" : ""}: the button below. Nothing is lost.`
              : `Ou continue avec ${partage.maintenant.length > 1 ? `les ${partage.maintenant.length} articles` : "l'article"} que ton quota permet : le bouton du bas. Rien n'est perdu.`}</div>
          )}
        </Carte>
      )}

      <div>
        <p className="fsn-eyebrow" style={{ marginBottom: 8 }}>{en ? "Where to publish them?" : "Où les publier ?"}</p>
        <div className="fsn-stack">
          {plateformes.map((p) => {
            const r = resume[p];
            const pause = pauses[p];
            const eb = p === "ebay" && ebayBloque;
            const indispo = r.possibles === 0 || Boolean(pause) || eb;
            const on = choix.includes(p) && !indispo;
            const sessionFermee = sessions?.[p] === false && !(p === "ebay" && ebayParServeur);
            let sousTexte;
            if (r.possibles === 0) sousTexte = en ? "Already there for all of them" : "Déjà en ligne pour tous";
            else if (pause) sousTexte = pause || (en ? "Paused on our side for now" : "En pause de notre côté pour l'instant");
            else if (eb) sousTexte = ebaySiteHorsFrance(ebayEtat?.ebay_site).horsFrance
              ? texteEbayHorsFrance(ebayEtat.ebay_site, en ? "en" : "fr") // (25/10) compte inscrit hors d'eBay France
              : resumeEbay(ebayEtat, en ? "en" : "fr").phrase; // (17/10) la règle unique : plafond eBay à zéro ou étape qui reste, nommés
            else {
              const a = en ? `${r.possibles} item${r.possibles > 1 ? "s" : ""}` : `${r.possibles} article${r.possibles > 1 ? "s" : ""}`;
              const d = r.dejaLa ? (en ? ` · ${r.dejaLa} already there` : ` · ${r.dejaLa} y ${r.dejaLa > 1 ? "sont" : "est"} déjà`) : "";
              const v = p === "ebay" && ebayParServeur ? (en ? " · sent from our servers" : " · part de nos serveurs")
                : p === "vinted" && boutiqueVinted ? (en ? ` · on your shop ${boutiqueVinted}` : ` · sur ta boutique ${boutiqueVinted}`) : "";
              sousTexte = a + d + v;
            }
            return (
              <div key={p}>
                <button type="button" className={`fsn-pf${on ? " fsn-pf--on" : ""}${indispo ? " fsn-pf--dis" : ""}`} disabled={indispo}
                  onClick={() => basculer(p)} aria-pressed={on}>
                  <span className={`fsn-check${on ? " fsn-check--on" : ""}${indispo ? " fsn-check--dis" : ""}`}>{on ? "✓" : ""}</span>
                  <Logo platform={p} size={26} desature={indispo} />
                  <span className="fsn-pf-t"><b>{NOM(p)}</b><small>{sousTexte}</small></span>
                </button>
                {on && p === "depop" && depopAAutoriser && (
                  <div className="fsn-pf-sous" style={{ marginTop: 6 }}>
                    <span>{en ? "Depop needs your permission on your computer, once: its listings will wait for it, then go out on their own." : "Depop demande ton autorisation sur ton ordinateur, une seule fois : ses annonces l'attendront, puis partiront toutes seules."}</span>
                    <div className="fsn-pf-geste"><BoutonMeConnecter userId={userId} platform="depop" motif={MOTIFS.AUTORISER_DEPOP} lang={lang} variante="bouton" /></div>
                  </div>
                )}
                {on && sessionFermee && !(p === "depop" && depopAAutoriser) && (
                  <div className="fsn-pf-sous" style={{ marginTop: 6 }}>
                    <span>{en ? `You're signed out of ${NOM(p)} on your computer: its listings will wait for you.` : `Tu n'es pas connecté à ${NOM(p)} sur ton ordinateur : ses annonces t'attendront.`}</span>
                    <div className="fsn-pf-geste"><BoutonMeConnecter userId={userId} platform={p} lang={lang} variante="bouton" /></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Le compte exact, avant tout geste. */}
      <Carte gravite={null} titre={fichesLues
        ? (en ? `${annoncesPrevues} listing${annoncesPrevues > 1 ? "s" : ""} to create` : `${annoncesPrevues} annonce${annoncesPrevues > 1 ? "s" : ""} à créer`)
        : (en ? "Counting…" : "On compte…")}>
        {ann?.plafond != null && (
          <div className="fsn-card-p">
            {partage.aConsommer === 0
              ? (partage.plusTard.length
                  ? (en ? "You've used all your listings for this month." : "Tu as utilisé toutes tes annonces de ce mois-ci.")
                  : (en ? "Your texts are already written: this batch doesn't use your monthly listings." : "Tes textes sont déjà rédigés : ce lot ne prend rien sur tes annonces du mois."))
              : (en
                  ? `Uses ${partage.aConsommer} item${partage.aConsommer > 1 ? "s" : ""} of your monthly quota (${Math.max(0, (restantes ?? ann.restantes ?? 0) - partage.aConsommer)} left after) — an item published on several platforms counts once.`
                  : `Compte ${partage.aConsommer} article${partage.aConsommer > 1 ? "s" : ""} sur ton quota du mois (il t'en restera ${Math.max(0, (restantes ?? ann.restantes ?? 0) - partage.aConsommer)}) — un article publié sur plusieurs plateformes compte pour un.`)}
          </div>
        )}
        {duree && annoncesPrevues > 0 && (
          <div className="fsn-card-p">{en ? `With your computer on: ${duree}, one listing after the other.` : `Avec ton ordinateur allumé : ${duree}, une annonce après l'autre.`}</div>
        )}
      </Carte>

      {extensionNeverSeen === true && (
        <Carte gravite="geste" titre={en ? "The FillSell extension isn't installed yet" : "L'extension FillSell n'est pas encore installée"}>
          <div className="fsn-card-p">{en
            ? "It's what posts your listings, from Chrome on your computer. Your listings will wait for it: nothing is lost."
            : "C'est elle qui dépose tes annonces, depuis Chrome sur ton ordinateur. Tes annonces l'attendront : rien n'est perdu."}</div>
        </Carte>
      )}
      {extensionNeverSeen !== true && extEndormie && (
        <Carte gravite="info">
          <div className="fsn-card-p">{en
            ? "Your computer seems off: the listings will go out next time Chrome opens."
            : "Ton ordinateur semble éteint : les annonces partiront à la prochaine ouverture de Chrome."}</div>
        </Carte>
      )}
    </>
  );
}

// ═══ ÉCRAN 2 — « AVANT L'ENVOI » ═════════════════════════════════════════════
export function EcranAvant({
  en, lang, L, lot, etats, lignes, parId, moteurs, decisions, prepares, preparationFinie,
  prets, aCompleter, annoncesPretes, communes, repondreCommune, decider, trancherJumeau, sansPlateforme, retirerDuLot, envoi,
  lectures = {},
  // (26/10, C9) Une plateforme écartée d'office, remise par « Annuler » (sa question de rayon reparaît).
  remettrePlateforme = () => {},
  livraison = { transporteurs: null, format: "" }, poidsDe = () => null, poserPoids = () => {}, poserPoidsDuLot = () => {},
  poserTransporteurs = () => {}, poserFormat = () => {},
  colisVinted = [], choisirColisVinted = () => {},
  // (10/10) Ce que l'écran parent sait et que ce composant lisait SANS le
  // recevoir (page blanche du 09/10 22:13 au 10/10) : passé, jamais supposé.
  userId = null, exclusDepop = [], mettreDeCote = () => {}, signalerErreurBloc = () => {},
  // (11/10 soir) Le choix du poids Leboncoin du lot — reçu, jamais supposé.
  choixPoidsLbc = "estimer", choisirPoidsLbc = () => {}, poidsExigeLbc = false,
  // (26/10, D2) Le poids par défaut des Réglages (Colis Leboncoin par défaut) — reçu, jamais supposé.
  poidsDefaut = null,
  // (26/10, D4) La programmation (réglage, null : éteinte) et l'exception « Envoyer tout de suite » de ce lot — reçues.
  programmation = null, maintenantLot = false, setMaintenantLot = () => {},
  // (18/10 nuit) Ce que la mémoire « compte × catégorie » a posé — reçu, jamais supposé.
  posesDuLot = [], changerPosesDuLot = () => {},
  // (25/10 — Louis) Le pont vers l'extension, l'horloge d'affichage et les issues d'une attente d'origine — reçus.
  pontMort = false, horloge = 0, rechargerPourLePont = null,
  // (26/10 nuit, point 9) Le lecteur et les trois issues quand il n'y en a pas — reçus, jamais supposés.
  sansLecteur = null,
}) {
  const total = lot.ids.length;
  // Un bloc commun qui casse est remplacé par une phrase ; le lot continue.
  const blocProtege = (nom, enfant) => (
    <BarriereErreur nom={`lot ${nom}`} onErreur={(e) => signalerErreurBloc(nom, e)}
      secours={(
        <Carte gravite="info">
          <div className="fsn-card-p">{en
            ? "This part couldn't be shown. The rest of the batch carries on: each item keeps its own answers below."
            : "Cette partie n'a pas pu s'afficher. Le reste du lot continue : chaque article garde ses réponses ci-dessous."}</div>
        </Carte>
      )}>
      {enfant}
    </BarriereErreur>
  );
  const enCours = lot.ids.find((id) => PHASES_EN_PREPARATION.has(etats[id]?.phase));
  const itemEnCours = enCours ? parId.get(enCours)?.item : null;
  const autres = lignes.filter((id) => !lot.ids.includes(id));
  return (
    <>
      {pontMort && !envoi ? <BandeauPontMort en={en} recharger={rechargerPourLePont} /> : null}
      {envoi ? (
        <BarreProgression
          titre={en ? "Queuing your listings" : "Mise en file de tes annonces"}
          fraction={envoi.total ? envoi.fait / envoi.total : 0}
          pas={envoi.total ? 1 / envoi.total : 1}
          etat="en_cours"
          lang={lang}
          phrase={en ? `${envoi.fait} of ${envoi.total} items` : `${envoi.fait} sur ${envoi.total} articles`}
        />
      ) : null /* (26/10, C2) pendant la préparation, l'en-tête du lot EST la progression : plus bas, une case par article */}
      {!envoi && !preparationFinie && itemEnCours ? (
        <p className="fsv-prep" aria-live="polite">
          <span className="fsn-spin" aria-hidden="true" />
          {en ? `Preparing “${titreDe(itemEnCours)}”… You can already answer below.` : `Préparation de « ${titreDe(itemEnCours)} »… Tu peux déjà répondre plus bas.`}
        </p>
      ) : null}

      {/* (26/10, refonte C validée par Nico) Hors de l'envoi : UNE ligne par article — l'en-tête gardé, né dès la
          préparation (C2), les questions sous leur ligne en un geste (C4), la pop-up de l'article au toucher (C3),
          les plateformes écartées d'office dites en une ligne (C9), puis les réglages du lot. */}
      {!envoi && preparationFinie && programmation && (
        <div className="fsv-lot">
          <div className="fsv-lot-l">
            <span>{maintenantLot
              ? (en ? "This batch goes out now, outside your schedule." : "Ce lot part tout de suite, hors programmation.")
              : (en ? "Scheduled: one at a time, in your time slot." : "Programmé : une à la fois, dans ton créneau.")}</span>
            <button type="button" className="fsn-lien" onClick={() => setMaintenantLot(!maintenantLot)}>
              {maintenantLot ? (en ? "Schedule it" : "Le programmer") : (en ? "Send now" : "Envoyer tout de suite")}
            </button>
          </div>
        </div>
      )}
      {!envoi && blocProtege("liste", (
        <VueListe en={en} L={L} lot={lot} etats={etats} lignes={lignes} parId={parId} moteurs={moteurs} decisions={decisions}
          prets={prets} aCompleter={aCompleter} annoncesPretes={annoncesPretes} communes={communes} repondreCommune={repondreCommune}
          decider={decider} trancherJumeau={trancherJumeau} sansPlateforme={sansPlateforme} remettrePlateforme={remettrePlateforme} retirerDuLot={retirerDuLot}
          lectures={lectures} poserPoids={poserPoids} poserPoidsDuLot={poserPoidsDuLot} mettreDeCote={mettreDeCote} horloge={horloge} pontMort={pontMort}
          sansLecteur={sansLecteur} preparation={preparationFinie ? null : { faits: prepares, total }} poidsDefaut={poidsDefaut}
          blocsDuLot={(
            <>
              {/* (04/10) Poids, transporteurs et format : AVANT l'envoi, pour le lot — repliés, ouverts d'office
                  quand le lot attend un poids saisi. */}
              {preparationFinie && blocProtege("livraison", (
                <PliDuLot en={en} titre={en ? "Shipping for the batch" : "Livraison du lot"} ouvertDOffice={choixPoidsLbc === "saisir"}
                  resume={en ? "Weight, carriers and parcel size — kept for your next listings." : "Poids, transporteurs et format du colis — gardés pour tes prochaines annonces."}>
                  <LivraisonDuLot en={en} ids={lot.ids.filter((id) => !["retire", "envoye", "erreur"].includes(etats[id]?.phase))} parId={parId} moteurs={moteurs}
                    poidsDe={poidsDe} poserPoids={poserPoids} poserPoidsDuLot={poserPoidsDuLot}
                    livraison={livraison} poserTransporteurs={poserTransporteurs} poserFormat={poserFormat}
                    colisVinted={colisVinted} choisirColisVinted={choisirColisVinted} userId={userId}
                    choixPoidsLbc={choixPoidsLbc} choisirPoidsLbc={choisirPoidsLbc} poidsExigeLbc={poidsExigeLbc} />
                </PliDuLot>
              ))}
              {/* (09/10 soir) Ce que Depop refuse : combien d'articles, et pourquoi. */}
              {preparationFinie && blocProtege("exclus_depop", <ExclusDepop en={en} exclus={exclusDepop} />)}
              {/* (18/10 nuit) Ce que la mémoire a repris de tes dernières réponses. */}
              {posesDuLot.length > 0 && blocProtege("poses_memoire", posesDuLot.map((g) => (
                <Carte key={g.cle} gravite="info" titre={`${g.pose.label} · ${NOM(g.pose.plateforme)}`}>
                  <div className="fsn-card-p">{en
                    ? `“${g.valeur}” on ${g.ids.length} item${g.ids.length > 1 ? "s" : ""}: taken from your last answer for “${g.pose.categorie}”. Tap another value to change it for all of them.`
                    : `« ${g.valeur} » sur ${g.ids.length} article${g.ids.length > 1 ? "s" : ""} : repris de ta dernière réponse pour « ${g.pose.categorie} ». Touche une autre valeur pour la changer sur tous.`}</div>
                  <div className="fsn-choices fsq-puces">
                    {(g.pose.allowedValues ?? []).slice(0, 12).map((v) => (
                      <button key={v} type="button" className={`fsn-choice${v === g.valeur ? " fsn-choice--on" : ""}`} onClick={() => { if (v !== g.valeur) changerPosesDuLot(g, v); }}>{v === g.valeur ? "✓ " : ""}{v}</button>
                    ))}
                  </div>
                </Carte>
              )))}
            </>
          )} />
      ))}

      {/* (18/10 nuit) Pendant l'envoi : ce que la mémoire a repris, comme avant. */}
      {envoi && posesDuLot.length > 0 && blocProtege("poses_memoire", posesDuLot.map((g) => (
        <Carte key={g.cle} gravite="info" titre={`${g.pose.label} · ${NOM(g.pose.plateforme)}`}>
          <div className="fsn-card-p">{en
            ? `“${g.valeur}” on ${g.ids.length} item${g.ids.length > 1 ? "s" : ""}: taken from your last answer for “${g.pose.categorie}”. Tap another value to change it for all of them.`
            : `« ${g.valeur} » sur ${g.ids.length} article${g.ids.length > 1 ? "s" : ""} : repris de ta dernière réponse pour « ${g.pose.categorie} ». Touche une autre valeur pour la changer sur tous.`}</div>
          <div className="fsn-choices">
            {(g.pose.allowedValues ?? []).slice(0, 12).map((v) => (
              <button key={v} type="button" className={`fsn-choice${v === g.valeur ? " fsn-choice--on" : ""}`} onClick={() => { if (v !== g.valeur) changerPosesDuLot(g, v); }}>{v === g.valeur ? "✓ " : ""}{v}</button>
            ))}
          </div>
        </Carte>
      )))}

      {/* Pendant l'envoi : les lignes, comme avant. Chacune a sa barrière. */}
      {envoi && aCompleter.map((id) => (
        <BarriereErreur key={id} nom={`article ${id}`} onErreur={(e) => mettreDeCote(id, e, "questions")}
          secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} />}>
          <ArticleAQuestions id={id} en={en} L={L} item={parId.get(id)?.item} m={moteurs.get(id)} st={etats[id]}
            decision={decisions[id] ?? {}} decider={decider} trancherJumeau={trancherJumeau} sansPlateforme={sansPlateforme} retirerDuLot={retirerDuLot}
            lecture={lectures[id] ?? null} poserPoids={poserPoids} />
        </BarriereErreur>
      ))}

      {envoi && (
        <div className="fsn-card" style={{ gap: 0 }}>
          {lot.ids.filter((id) => !aCompleter.includes(id)).concat(autres).map((id) => (
            <BarriereErreur key={id} nom={`ligne ${id}`} onErreur={(e) => mettreDeCote(id, e, "ligne")}
              secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} ligne />}>
              <LigneArticle id={id} en={en} L={L} item={parId.get(id)?.item} st={etats[id] ?? { phase: "attente" }} m={moteurs.get(id)}
                envoi={envoi} retirerDuLot={retirerDuLot} horloge={horloge} pontMort={pontMort} sansLecteur={sansLecteur} />
            </BarriereErreur>
          ))}
        </div>
      )}
    </>
  );
}

/** (25/10 — Louis) Le pont de cette page vers l'extension est mort : on le dit, et on propose la seule issue utile. */
function BandeauPontMort({ en, recharger }) {
  return (
    <Carte gravite="geste" titre={en ? "Reload this page" : "Recharge cette page"}>
      <div className="fsn-card-p">{en
        ? "Your FillSell extension has just been updated: this page can no longer talk to it, so it cannot read your Vinted listings from here. Reload the page — your batch is kept, and the reading resumes on its own."
        : "Ton extension FillSell vient d'être mise à jour : cette page ne lui parle plus, elle ne peut donc plus lire tes annonces Vinted d'ici. Recharge la page — ton lot est gardé, et la lecture reprend toute seule."}</div>
      {recharger ? (
        <div className="fsn-btn-row">
          <Bouton onClick={recharger}>{en ? "Reload the page" : "Recharger la page"}</Bouton>
        </div>
      ) : null}
    </Carte>
  );
}

/** Depuis combien de temps (mots de l'écran). */
function depuisMots(ms, en) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return en ? `${s} s` : `${s} s`;
  const m = Math.floor(s / 60);
  return en ? `${m} min` : `${m} min`;
}

/** L'attente d'une annonce d'origine : ce qui se passe, depuis quand, et — passé 60 s — les issues. */
function AttenteOrigine({ id, en, st, horloge, pontMort, retirerDuLot, item = null, sansLecteur = null }) {
  // (25/10, méthode de Nico) Jamais « Écrire ma description » pendant l'attente : l'annonce d'origine n'est pas encore
  // lue, son texte existe peut-être. Lue sans texte, l'article quitte cette attente tout seul (préparé, texte rédigé à
  // relire). Après 60 s, la seule issue est de le sortir du lot — rien n'est écrit à la place du vendeur.
  // L'horloge vient du parent (rafraîchie toutes les 15 s pendant l'attente) : jamais Date.now() pendant le rendu.
  const ecoule = st.origineDepuis && horloge ? Math.max(0, horloge - st.origineDepuis) : 0;
  const issues = pontMort || ecoule >= 60_000;
  // (26/10 nuit, point 9 — patrick giry) … SAUF SANS LECTEUR (règle de Nico du 26/10) : une fiche Vinted qu'aucun
  // ordinateur ne peut lire n'attend pas — la phrase vraie, puis les trois issues du stepper, chacune en un geste.
  const [ecrire, setEcrire] = useState(false);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(null);
  // (28/10) Avec un lecteur, 3 min sans lecture : la lecture est en retard — mêmes issues que sans lecteur.
  const lecteur = plateformeOrigine(item) === "vinted" ? lecteurEnRetard(sansLecteur?.lecteur ?? null, ecoule) : null;
  if (issuesSansLecteur(lecteur).length) {
    const lang = en ? "en" : "fr";
    const M = libellesSansLecteur(lang);
    const attend = st.sansLecture === "attendre";
    const url = urlAnnonceVinted(item);
    const assez = descriptionEcriteSuffisante(texte);
    const geste = async (faire) => {
      if (envoi) return;
      setEnvoi(true);
      setEchec(null);
      const r = await faire().catch(() => ({ ok: false }));
      setEnvoi(false);
      if (!r?.ok) setEchec(M.echec);
    };
    const tactile = { minHeight: 44 };
    return (
      <div className="fsl-origine">
        <small>{phraseSansLecteur(lecteur, { lang, maintenant: horloge || undefined })}</small>
        {attend && !ecrire ? <small>{texteAttenteSansLecteur(lecteur, { lang, contexte: "lot" })}</small> : null}
        {ecrire ? (
          <div className="fsl-origine-ecrire">
            {url ? <small><a href={url} target="_blank" rel="noopener noreferrer">{M.ouvrirVinted}</a> {M.pourCopier}</small> : null}
            <textarea className="fsn-textarea" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={M.placeholder} aria-label={M.ecrireTitre} />
            <BoutonDictee valeur={texte} onChange={setTexte} lang={lang} separateur={"\n"} disabled={envoi} />
            {texte.trim() && !assez ? <small>{M.tropCourt}</small> : null}
            <div className="fsn-btn-row">
              <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" style={tactile} disabled={!assez || envoi}
                onClick={() => geste(() => sansLecteur.ecrire(id, texte))}>
                {envoi ? M.enregistrement : M.continuer}
              </button>
              <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" style={tactile} disabled={envoi} onClick={() => { setEchec(null); setEcrire(false); }}>
                {M.retour}
              </button>
            </div>
          </div>
        ) : (
          <div className="fsn-btn-row">
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" style={tactile} disabled={envoi} onClick={() => setEcrire(true)}>{M.ecrire}</button>
            <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" style={tactile} disabled={envoi} onClick={() => geste(() => sansLecteur.rediger(id))}>{M.rediger}</button>
            {!attend ? (
              <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" style={tactile} disabled={envoi} onClick={() => sansLecteur.attendre(id)}>{M.attendre}</button>
            ) : null}
            {issues ? (
              <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" style={tactile} onClick={() => retirerDuLot(id)}>{en ? "Remove from this batch" : "Retirer du lot"}</button>
            ) : null}
          </div>
        )}
        {echec ? <small role="alert">{echec}</small> : null}
      </div>
    );
  }
  return (
    <div className="fsl-origine">
      <small>
        {pontMort
          ? (en ? "Your extension can't be reached from this page (it was just updated): reload the page above."
            : "L'extension ne répond plus à cette page (elle vient d'être mise à jour) : recharge la page, plus haut.")
          : (en ? `Reading in progress for ${depuisMots(ecoule, en)} — FillSell keeps trying on its own.`
            : `Lecture en cours depuis ${depuisMots(ecoule, en)} — FillSell réessaie tout seul.`)}
      </small>
      {issues ? (
        <div className="fsn-btn-row">
          <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => retirerDuLot(id)}>
            {en ? "Remove from this batch" : "Retirer du lot"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Un article mis de côté parce que sa carte n'a pas pu s'afficher : son
// titre, et la phrase — jamais le message technique.
function ArticleMisDeCote({ en, item, ligne = false }) {
  const titre = (() => { try { return titreDe(item); } catch { return ""; } })();
  const phrase = RAISON_MIS_DE_COTE[en ? "en" : "fr"];
  if (ligne) {
    return (
      <div className="fsl-art">
        <div className="fsl-art-t"><b>{titre || (en ? "Untitled item" : "Article sans titre")}</b><small>{phrase}</small></div>
        <Puce ton="refus">{en ? "Set aside" : "Mis de côté"}</Puce>
      </div>
    );
  }
  return (
    <Carte gravite="info" titre={titre || (en ? "Untitled item" : "Article sans titre")}>
      <div className="fsn-card-p">{phrase}</div>
    </Carte>
  );
}

// Une ligne d'article (préparé, en file, laissé de côté…).
function LigneArticle({ id, en, L, item, st, m, envoi, retirerDuLot, horloge = 0, pontMort = false, sansLecteur = null }) {
  const pfs = st.envoyees ?? (m ? [...(m.plateformesPubliables ?? [])] : []);
  // (26/10 nuit, point 9) Sans lecteur, la phrase « lecture… » serait une promesse fausse : la ligne dit la vérité
  // (AttenteOrigine) et sa pastille demande le geste — ou « En attente » quand la personne attend son ordinateur.
  const ecouleOrigine = st.origineDepuis && horloge ? Math.max(0, horloge - st.origineDepuis) : 0;
  const lecteurLigne = lecteurEnRetard(sansLecteur?.lecteur ?? null, ecouleOrigine);
  const origineSansLecteur = st.phase === "origine" && plateformeOrigine(item) === "vinted" && issuesSansLecteur(lecteurLigne).length > 0;
  return (
    <div className="fsl-art">
      <Vignette item={item} />
      <div className="fsl-art-t">
        <b>{titreDe(item) || (en ? "Untitled item" : "Article sans titre")}</b>
        <small>
          {origineSansLecteur ? (envoi ? phraseSansLecteur(lecteurLigne, { lang: en ? "en" : "fr", maintenant: horloge || undefined }) : null)
            : st.raison ? st.raison
            : st.phase === "lecture" ? TEXTE_LECTURE[en ? "en" : "fr"][st.lecture ?? "null"]
            : pfs.length && ["pret", "envoi", "envoye"].includes(st.phase) ? pfs.map(NOM).join(" · ")
            : null}
        </small>
        {st.phase === "origine" && !envoi ? (
          <AttenteOrigine id={id} en={en} st={st} horloge={horloge} pontMort={pontMort} retirerDuLot={retirerDuLot} item={item} sansLecteur={sansLecteur} />
        ) : null}
      </div>
      {PHASES_EN_PREPARATION.has(st.phase) ? <span className="fsn-spin" aria-hidden="true" /> : null}
      {origineSansLecteur
        ? <Puce ton={st.sansLecture === "attendre" ? "mute" : "geste"}>{st.sansLecture === "attendre" ? L.attente : L.questions}</Puce>
        : <Puce ton={TON_PHASE[st.phase] ?? "mute"}>{L[st.phase] ?? st.phase}</Puce>}
      {st.phase === "pret" && !envoi && (
        <button type="button" className="fsl-retirer" onClick={() => retirerDuLot(id)} aria-label={en ? "Remove from batch" : "Retirer du lot"}>✕</button>
      )}
    </div>
  );
}

// Un article qui attend une réponse : SES questions, posées par le même bloc
// que le stepper, plus ce que le lot ajoute (texte à relire, prix, jumeau).
export function ArticleAQuestions({ id, en, item, m, st, decision, decider, trancherJumeau, sansPlateforme, retirerDuLot, lecture = null, poserPoids = null }) {
  if (!m) return null;
  const motifs = st?.motifs ?? [];
  const aPoids = motifs.some((x) => x.cle === "poids");
  const aTexte = motifs.some((x) => x.cle === "texte");
  const aPrix = motifs.some((x) => x.cle === "prix");
  const plateformes = [...(m.plateformesPubliables ?? [])];
  const tranches = decision.jumeauxTranches ?? new Set();
  const jumeaux = jumeauxQuiRetiennent({ ...m, quantiteFiche: item?.quantite }, plateformes, tranches);
  const general = m.generales ?? {};
  const premiere = plateformes[0] ?? [...(m.selected ?? [])][0];
  const titreQuiPart = String(general.titre || m.edited?.[premiere]?.title || titreDe(item) || "");
  const descriptionQuiPart = String(general.description || m.edited?.[premiere]?.description || "");
  return (
    <Carte className="fsl-article" gravite={null}>
      {/* Le titre garde toute la largeur ; ce qui manque se lit dessous. */}
      <div className="fsl-article-tete" style={{ alignItems: "flex-start" }}>
        <Vignette item={item} />
        <div className="fsn-grow">
          <div className="fsn-article-t">{titreDe(item) || (en ? "Untitled item" : "Article sans titre")}</div>
          <div className="fsn-article-s">{plateformes.map(NOM).join(" · ")}</div>
          <div style={{ marginTop: 6 }}><Puce ton="geste">{motifs.map((x) => x.libelle).join(" · ") || (en ? "To complete" : "À compléter")}</Puce></div>
        </div>
      </div>

      {aPrix && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Selling price" : "Prix de vente"}</div>
          <div className="fsn-q-why">{en ? "No price on this item yet. At least €1." : "Cet article n'a pas encore de prix. 1 € au moins."}</div>
          <input className="fsn-input" type="number" inputMode="decimal" min="1" step="0.5" defaultValue={m.price ?? ""}
            onBlur={(ev) => m.poserPrixGeneral?.(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }}
            placeholder={en ? "Price in €" : "Prix en €"} />
        </div>
      )}

      {/* (11/10) Le poids Leboncoin de CET article — ou une fois pour tout le
          lot, dans le bloc Livraison plus haut. */}
      {aPoids && poserPoids && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Parcel weight" : "Poids du colis"}</div>
          <div className="fsn-q-why">{en
            ? "You chose to enter the weight. Or one weight for the whole batch — or \"Let Leboncoin estimate\" — in Shipping, above. Saved on the item."
            : "Tu as choisi de saisir le poids. Ou un poids pour tout le lot — ou « Laisser Leboncoin estimer » — dans Livraison, plus haut. Gardé sur la fiche."}</div>
          <input className="fsn-input" type="text" inputMode="decimal" placeholder={en ? "e.g. 650 g or 1.2 kg" : "ex. 650 g ou 1,2 kg"}
            aria-label={en ? "Parcel weight" : "Poids du colis"}
            onBlur={(ev) => { const g = lirePoidsSaisi(ev.target.value); if (g) poserPoids(id, g); }}
            onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} />
        </div>
      )}

      {aTexte && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Check the text that goes out" : "Relis le texte qui part"}</div>
          <div className="fsn-q-why">{!String(m.texteVendeur?.description ?? "").trim()
            ? (String(m.initialListing?.description ?? "").trim()
                ? (en ? "This text was written by FillSell (from your photos), not by you: check it before it goes out." : "Ce texte a été écrit par FillSell (d'après tes photos), pas par toi : relis-le avant qu'il parte.")
                // (26/10 nuit, point 9) Sans lecteur, la personne a choisi « La faire rédiger par FillSell ».
                : lecture?.note === "redigee_sans_lecteur"
                  ? (en ? "You chose to have FillSell write it, from your photos and your title: check it before it goes out. It isn't saved on your item." : "Tu as choisi de la faire rédiger par FillSell, d'après tes photos et ton titre : relis-la avant qu'elle parte. Elle n'est pas enregistrée sur ta fiche.")
                // Ta description vit sur Vinted, et CET appareil ne peut pas la
                // lire (pas d'extension : un téléphone) — on dit où elle se lit.
                : lecture?.note === "vinted_sans_extension"
                  ? (en ? "Your description is on Vinted and is read from your computer, where the FillSell extension runs. This one was written from your photos and your title: check it, or prepare this batch from your computer." : "Ta description est sur Vinted et se lit depuis ton ordinateur, là où tourne l'extension FillSell. Celle-ci a été écrite d'après tes photos et ton titre : relis-la, ou prépare ce lot depuis ton ordinateur.")
                  : lecture?.note === "pont_mort"
                    ? (en ? "Your FillSell extension was just updated and this page can no longer reach it, so your Vinted description couldn't be read from here. This one was written from your photos and your title: check it — or reload the page to read yours." : "Ton extension FillSell vient d'être mise à jour et cette page ne la joint plus : ta description Vinted n'a pas pu être lue d'ici. Celle-ci a été écrite d'après tes photos et ton titre : relis-la — ou recharge la page pour lire la tienne.")
                  : lecture?.note === "sans_description"
                    ? (en ? "Your Vinted listing has no description. This one was written from your photos and your title: check it before it goes out." : "Ton annonce Vinted n'a pas de description. Celle-ci a été écrite d'après tes photos et ton titre : relis-la avant qu'elle parte.")
                  : lecture?.note === "vinted_echec"
                    ? (en ? "Your Vinted description couldn't be read this time. This one was written from your photos and your title: check it before it goes out." : "Ta description Vinted n'a pas pu être lue cette fois. Celle-ci a été écrite d'après tes photos et ton titre : relis-la avant qu'elle parte.")
                    : (en ? "Your description isn't in FillSell: this one was written from your photos and your title." : "Ta description n'est pas dans FillSell : celle-ci a été écrite d'après tes photos et ton titre."))
            : (en ? "This title was written by FillSell." : "Ce titre a été écrit par FillSell.")}</div>
          {/* (26/10 nuit, point 1) Le titre se lit ENTIER (« Téléphone intelligent noir écran 6 pc… » coupé dans un
              champ d'une ligne) : deux lignes, jamais de retour à la ligne dans la valeur. */}
          <textarea className="fsn-textarea" rows={2} style={{ minHeight: 0, resize: "none" }} defaultValue={titreQuiPart}
            aria-label={en ? "Title" : "Titre"}
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.currentTarget.blur(); } }}
            onBlur={(ev) => { const v = ev.target.value.replace(/\s*\n+\s*/g, " "); if (v !== titreQuiPart) m.poserValeurGenerale?.("titre", v); }} />
          {/* (29/10, lot B 1.3) Champs non contrôlés : la dictée pose le texte dans le champ et enregistre
              ce que son blur aurait enregistré — une dictée vaut une saisie. */}
          <BoutonDictee lang={en ? "en" : "fr"}
            onChange={(texte) => { const v = texte.replace(/\s*\n+\s*/g, " "); if (v !== titreQuiPart) m.poserValeurGenerale?.("titre", v); }} />
          <textarea className="fsn-textarea" defaultValue={descriptionQuiPart}
            onBlur={(ev) => { if (ev.target.value !== descriptionQuiPart) m.poserValeurGenerale?.("description", ev.target.value); }} />
          <BoutonDictee lang={en ? "en" : "fr"} separateur={"\n"}
            onChange={(texte) => { if (texte !== descriptionQuiPart) m.poserValeurGenerale?.("description", texte); }} />
          <div className="fsn-btn-row">
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => decider(id, { texteValide: true })}>
              {en ? "That's right" : "C'est bon"}
            </button>
          </div>
        </div>
      )}

      {jumeaux.map((j) => (
        <div key={`${j.platform}:${j.url ?? j.titre}`} className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? `Same item as on ${NOM(j.platform)}?` : `Le même article que sur ${NOM(j.platform)} ?`}</div>
          <div className="fsn-q-why">
            {en ? "A similar listing is already online: " : "Une annonce qui ressemble est déjà en ligne : "}
            <b>{j.titre}</b>{j.prix != null ? ` — ${j.prix} €` : ""}
            {j.url ? <> · <a href={j.url} target="_blank" rel="noopener noreferrer">{en ? "see it ↗" : "voir ↗"}</a></> : null}
          </div>
          <div className="fsn-btn-row">
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => trancherJumeau(id, j.platform, false)}>
              {en ? "No, another one: publish" : "Non, un autre : publier"}
            </button>
            <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={() => trancherJumeau(id, j.platform, true)}>
              {en ? `Yes: not on ${NOM(j.platform)}` : `Oui : pas sur ${NOM(j.platform)}`}
            </button>
          </div>
        </div>
      ))}

      {/* Les questions du moteur : le MÊME bloc que le stepper. */}
      <BlocQuestions m={m} />

      {/* (09/10 soir) Les frais de port Depop de CET article, quand ni le
          prix par défaut ni celui du lot ne l'ont rempli. */}
      {m.portDepop?.manquant && <CartePortDepop m={m} id={`port-depop-${id}`} />}

      {motifs.some((x) => x.cle === "cta") && (m.motifsCtaGris ?? []).length > 0 && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Before it can go out" : "Avant qu'il puisse partir"}</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{m.motifsCtaGris.map((x, i) => <li key={i} className="fsn-q-why">{x}</li>)}</ul>
        </div>
      )}

      {Object.entries(m.rayonsAChoisir ?? {}).map(([p, q]) => (
        <CarteRayon key={`rayon-${p}`} platform={p} lang={m.lang} rayon={null} question={q}
          suggestions={m.suggestionsParPf?.[p] ?? []} champs={{}} configLocale={[]} supabase={m.supabase}
          onChoisirRayon={(choixRayon) => m.choisirRayon?.(p, choixRayon)} regle="nouvelle"
          // (26/10 nuit, point 1 — le robot de Nico) « Pas sur Beebs » en un geste, même pour un article qui n'a que
          // cette plateforme : il sort alors du lot (rien ne part pour lui), comme « Le garder pour plus tard ».
          onPasSurPlateforme={() => (plateformes.length > 1 ? sansPlateforme(id, p) : retirerDuLot(id))} />
      ))}

      {/* Une question qu'on ne veut pas trancher pour UNE plateforme : on la
          laisse de côté pour cet article, les autres partent. */}
      <div className="fsn-row fsn-row--wrap" style={{ gap: 12 }}>
        {plateformes.length > 1 && plateformes.filter((p) => (m.questionsParPlateforme?.[p] ?? []).length || (m.plateformesRetirables ?? []).includes(p)).map((p) => (
          <button key={p} type="button" className="fsl-retirer" onClick={() => sansPlateforme(id, p)}>{en ? `Not on ${NOM(p)}` : `Pas sur ${NOM(p)}`}</button>
        ))}
        <button type="button" className="fsl-retirer" onClick={() => retirerDuLot(id)}>{en ? "Leave it for later" : "Le garder pour plus tard"}</button>
      </div>
    </Carte>
  );
}

// ═══ ÉCRAN 2, UNE LIGNE PAR ARTICLE (26/10 — refonte C validée par Nico) ═══════════════════════════════════════════
// C1 : la liste du lot, UNE ligne par article (photo, titre, prix, logos des plateformes, statut). C2 : l'en-tête
// gardé (« prêts · à régler · annonces », une case par article), né dès la préparation, qui se remplit case par case.
// C4 : une question se répond SOUS SA LIGNE, en un geste (le MÊME bloc que le stepper, BlocQuestions `seulement`, en
// puces ; une longue liste se cherche). C3 : toucher la ligne ouvre LA pop-up de l'article (FicheArticle), prêts
// compris. C9 : une plateforme sans aucun rayon est écartée d'office, une ligne discrète le dit, « Annuler » la remet.
// C10 : « X articles sans poids » et « un poids pour les X » — jamais un poids posé sur un article qui en a un.
// ⛔ Une ligne ne SAUTE pas sous le doigt : un article garde sa place une fois rangé (« À régler » ou « Prêts »).
// ⛔ Aucune règle n'est réécrite ici : seul l'agencement change (même pilote, même bilan, mêmes gestes).
function BilanDuLot({ en, lot, etats, prets, aCompleter, annoncesPretes, ouvrir, preparation = null }) {
  const nPrets = prets.length, nRevoir = aCompleter.length;
  return (
    <section className="fsq-bilan" aria-label={en ? "Where the batch stands" : "Où en est le lot"}>
      <div className="fsq-nombres">
        <div className="fsq-nombre fsq-nombre--ok"><b className="num">{nPrets}</b><small>{en ? "ready" : nPrets > 1 ? "prêts" : "prêt"}</small></div>
        <div className={`fsq-nombre ${nRevoir ? "fsq-nombre--revoir" : "fsq-nombre--zero"}`}><b className="num">{nRevoir}</b><small>{en ? "to settle" : "à régler"}</small></div>
        {preparation
          ? <div className="fsq-nombre"><b className="num">{preparation.faits}<span className="fsq-sur"> / {preparation.total}</span></b><small>{en ? "prepared" : "préparés"}</small></div>
          : <div className="fsq-nombre"><b className="num">{annoncesPretes}</b><small>{en ? (annoncesPretes > 1 ? "listings" : "listing") : (annoncesPretes > 1 ? "annonces" : "annonce")}</small></div>}
      </div>
      <div className="fsq-cases" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(lot.ids.length, 1), 20)}, 1fr)` }}>
        {lot.ids.map((id) => {
          const ph = etats[id]?.phase ?? "attente";
          const ton = prets.includes(id) ? "ok" : aCompleter.includes(id) ? "revoir" : ["retire", "rien", "erreur", "quota"].includes(ph) ? "hors" : "attente";
          return <button key={id} type="button" className={`fsq-case fsq-case--${ton}`} onClick={() => ouvrir(id)} aria-label={en ? "Open this item" : "Ouvrir cet article"} />;
        })}
      </div>
    </section>
  );
}

// La vignette de la ligne : la première photo, et « Sans photo » quand il n'y en a pas de vraie (photoVide.js).
function VignetteLot({ item, photos = null, onVide = null, en = false }) {
  const url = (photos && photos.length ? (typeof photos[0] === "string" ? photos[0] : photos[0]?.url) : null) ?? urlsPhotos(item?.photos)[0] ?? null;
  const lu = usePhotoVide(url ? urlPhoto(url) : null);
  const vide = !url || lu === true;
  useEffect(() => { if (onVide && (lu !== null || !url)) onVide(vide); }, [vide, lu, url, onVide]);
  return (
    <div className="fsn-thumb fsv-thumb" aria-hidden="true">
      {url ? <img src={urlPhoto(url)} alt="" loading="lazy" /> : "📦"}
      {vide ? <span className="fsv-sans">{en ? "No photo" : "Sans photo"}</span> : null}
    </div>
  );
}

export function VueListe({
  en, L, lot, etats, lignes, parId, moteurs, decisions, prets, aCompleter, annoncesPretes, communes, repondreCommune,
  decider, trancherJumeau, sansPlateforme, remettrePlateforme = () => {}, retirerDuLot, lectures = {}, poserPoids, poserPoidsDuLot = () => {},
  mettreDeCote, horloge = 0, pontMort = false, preparation = null, poidsDefaut = null,
  // Les réglages du lot (livraison, refus de Depop, réponses reprises) : rendus APRÈS la liste.
  blocsDuLot = null,
  // (26/10 nuit, point 9) Le lecteur et les trois issues quand il n'y en a pas (lignes en attente d'origine).
  sansLecteur = null,
}) {
  const lang = en ? "en" : "fr";
  const [ouvert, setOuvert] = useState(null);
  const [textesValides, setTextesValides] = useState([]); // validés par « Tout valider » : « Annuler » les rend
  const [poidsTousOuvert, setPoidsTousOuvert] = useState(false);
  // Une place par article, gardée : « haut » (rangé avec quelque chose à régler) ou « bas » (rangé prêt).
  const places = useRef(new Map());
  for (const id of lot.ids) {
    if (places.current.has(id)) continue;
    if (aCompleter.includes(id)) places.current.set(id, "haut");
    else if (prets.includes(id)) places.current.set(id, "bas");
  }
  // Les questions de chaque article à régler. Un moteur qui lève en les lisant ne casse pas l'écran : l'article est
  // rendu sous SA barrière, qui le met de côté comme avant (mettreDeCote « questions »).
  const casses = [];
  const questions = new Map();
  for (const id of aCompleter) {
    try {
      const m = moteurs.get(id);
      const st = etats[id] ?? {};
      const tranches = decisions[id]?.jumeauxTranches ?? new Set();
      const plateformes = [...(m?.plateformesPubliables ?? [])];
      const jumeaux = m ? jumeauxQuiRetiennent({ ...m, quantiteFiche: parId.get(id)?.item?.quantite }, plateformes, tranches) : [];
      questions.set(id, questionsDeLArticle(m, st.motifs ?? [], { jumeaux, lang }));
    } catch (erreur) {
      casses.push({ id, erreur });
    }
  }
  const aTexte = aCompleter.filter((id) => (etats[id]?.motifs ?? []).some((x) => x.cle === "texte"));
  const validerTextes = () => { for (const id of aTexte) decider(id, { texteValide: true }); setTextesValides(aTexte); };
  const annulerTextes = () => { for (const id of textesValides) decider(id, { texteValide: false }); setTextesValides([]); };
  // (C10, règle 7) Les articles SANS poids (fiche ou choix de la personne) qui partent sur une plateforme au poids.
  // Un moteur qui lève ici n'emporte pas la liste : son article est seulement compté à part (sa ligne le dit).
  const sansPoids = [...prets, ...aCompleter].filter((id) => {
    try {
      const m = moteurs.get(id);
      const pfs = [...(m?.plateformesPubliables ?? [])];
      return (pfs.includes("leboncoin") || pfs.includes("beebs")) && poidsAffiche(m, decisions[id], parId.get(id)?.item, poidsDefaut) == null;
    } catch { return false; }
  });
  const signalerVide = useCallback((id, vide) => {
    if (Boolean(decisions[id]?.photoVide) !== Boolean(vide)) decider(id, { photoVide: Boolean(vide) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions]);
  const ligneMoteur = (id, q) => {
    const m = moteurs.get(id);
    if (!m) return null;
    if (q.type === "moteur") return <BlocQuestions m={m} seulement={q.cles ?? [q.cle]} puces onChangerRayon={() => setOuvert(id)} />;
    if (q.type === "rayon") {
      const p = q.plateformes[0];
      const plateformes = [...(m.plateformesPubliables ?? [])];
      return (
        <CarteRayon platform={p} lang={m.lang} rayon={null} question={m.rayonsAChoisir?.[p]}
          suggestions={m.suggestionsParPf?.[p] ?? []} champs={{}} configLocale={[]} supabase={m.supabase}
          onChoisirRayon={(choixRayon) => m.choisirRayon?.(p, choixRayon)} regle="nouvelle"
          onPasSurPlateforme={() => (plateformes.length > 1 ? sansPlateforme(id, p) : retirerDuLot(id))} />
      );
    }
    if (q.type === "prix") return (
      <div className="fsf-saisie">
        <input className="fsn-input" type="number" inputMode="decimal" min="1" step="0.5" defaultValue={m.price ?? ""} key={`prix-${m.price ?? ""}`}
          aria-label={en ? "Selling price" : "Prix de vente"} placeholder={en ? "Price in €" : "Prix en €"}
          onBlur={(ev) => m.poserPrixGeneral?.(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} />
        {/* (26/10, D3) « À la demande » : le prix que FillSell propose, en un geste. */}
        {m.redactionALaDemande && m.genererChamp ? (
          <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.genererChamp("prix")}>{en ? "Generate" : "Générer"}</button>
        ) : null}
      </div>
    );
    if (q.type === "poids") return <PoidsDeLArticle en={en} poids={null} poserPoids={(g) => poserPoids(id, g)} />;
    if (q.type === "jumeau") {
      const j = q.jumeau;
      return (
        <>
          <p className="fsq-note">{en ? "A similar listing is already online: " : "Une annonce qui ressemble est déjà en ligne : "}<b>{j.titre}</b>{j.prix != null ? ` — ${j.prix} €` : ""}
            {j.url ? <> · <a href={j.url} target="_blank" rel="noopener noreferrer">{en ? "see it ↗" : "voir ↗"}</a></> : null}</p>
          <div className="fsn-choices fsq-puces">
            <button type="button" className="fsn-choice" onClick={() => trancherJumeau(id, j.platform, false)}>{en ? "No, another one: publish" : "Non, un autre : publier"}</button>
            <button type="button" className="fsn-choice" onClick={() => trancherJumeau(id, j.platform, true)}>{en ? `Yes: not on ${NOM(j.platform)}` : `Oui : pas sur ${NOM(j.platform)}`}</button>
          </div>
        </>
      );
    }
    if (q.type === "port_depop") return <CartePortDepop m={m} id={`port-depop-q-${id}`} />;
    if (q.type === "description") return (
      <div className="fsf-choix">
        <textarea className="fsn-textarea" rows={3} defaultValue="" aria-label="Description"
          placeholder={en ? "Condition, size, what's included…" : "État, taille, ce qui est inclus…"}
          onBlur={(ev) => { const v = ev.target.value.trim(); if (v) m.poserValeurGenerale?.("description", v); }} />
        {/* (29/10, lot B 1.3) Non contrôlé : la dictée enregistre ce que le blur aurait enregistré. */}
        <BoutonDictee lang={en ? "en" : "fr"} separateur={"\n"}
          onChange={(texte) => { const v = texte.trim(); if (v) m.poserValeurGenerale?.("description", v); }} />
        {m.genererChamp ? (
          <div className="fsn-choices fsq-puces">
            <button type="button" className="fsn-choice" onClick={() => m.genererChamp("description")}>{en ? "Generate" : "Générer"}</button>
          </div>
        ) : null}
      </div>
    );
    return (
      <div className="fsn-choices fsq-puces">
        {m.motifsCtaGris?.[0] ? <span className="fsq-note">{String(m.motifsCtaGris[0])}</span> : null}
        <button type="button" className="fsn-choice" onClick={() => setOuvert(id)}>{en ? "Open" : "Ouvrir"}</button>
      </div>
    );
  };
  const ligne = (id) => {
    const item = parId.get(id)?.item;
    const m = moteurs.get(id);
    const st = etats[id] ?? {};
    const d = decisions[id] ?? {};
    const pret = prets.includes(id);
    const qs = questions.get(id) ?? [];
    const ecartees = Object.entries(d.ecartees ?? {}).filter(([p]) => !(d.remises ?? []).includes(p)).map(([p, motif]) => ({ p, motif }));
    const pfs = m ? plateformesDeLArticle(m).filter((p) => [...(m.plateformesPubliables ?? [])].includes(p)) : [];
    const prix = m?.price ?? item?.sell ?? null;
    const poids = m ? poidsAffiche(m, d, item, poidsDefaut) : null;
    const incoherent = poids && m ? poidsIncoherent(`${titreDe(item)} ${m.edited?.[pfs[0]]?.platform_fields?.categorie_objet_ia ?? ""}`, poids, lang) : null;
    const motifs = st.motifs ?? [];
    const premier = d.photoVide ? (en ? "Photo" : "Photo")
      : qs[0]?.libelle ?? (motifs.some((x) => x.cle === "texte") ? (en ? "To re-read" : "À relire") : motifs[0]?.libelle ?? (en ? "To settle" : "À régler"));
    return (
      <div key={id} className="fsv-art">
        <button type="button" className="fsv-ligne" onClick={() => setOuvert(id)}>
          <VignetteLot en={en} item={item} photos={m ? ((m.processedPhotos?.length ? m.processedPhotos : m.photos) ?? null) : null} onVide={(v) => signalerVide(id, v)} />
          <span className="fsv-tx">
            <b>{titreDe(item) || (en ? "Untitled item" : "Article sans titre")}</b>
            <span className="fsv-meta">
              {pfs.map((p) => <Logo key={p} platform={p} size={18} />)}
              {ecartees.map((e) => <span key={`x-${e.p}`} className="fsv-barre"><Logo platform={e.p} size={18} desature /></span>)}
              {prix != null && prix !== "" ? <span className="fsv-px num">{String(prix).replace(".", ",")} €</span> : null}
            </span>
          </span>
          <Puce ton={pret ? "ok" : d.photoVide ? "refus" : "geste"}>{pret ? (en ? "Ready" : "Prêt") : premier}</Puce>
          <span className="fsq-chevron" aria-hidden="true">›</span>
        </button>
        {!pret && d.photoVide && (
          <div className="fsv-q">
            <p className="fsq-note"><b>{en ? "No real photo:" : "Aucune vraie photo :"}</b> {en ? "the picture is a placeholder." : "l'image vient de Beebs (image par défaut)."}</p>
            <div className="fsn-choices fsq-puces"><button type="button" className="fsn-choice fsn-choice--on" onClick={() => setOuvert(id)}>{en ? "Add photos" : "Ajouter des photos"}</button></div>
          </div>
        )}
        {!pret && qs.slice(0, 3).map((q) => (
          <BarriereErreur key={`${id}:${q.cle}`} nom={`question ${id}`} onErreur={(e) => mettreDeCote(id, e, "question")}
            secours={<ArticleMisDeCote en={en} item={item} ligne />}>
            <div className="fsv-q">
              <div className="fsv-q-t">{(q.plateformes ?? []).map((p) => <Logo key={p} platform={p} size={16} />)}<b>{q.libelle}</b></div>
              {ligneMoteur(id, q)}
            </div>
          </BarriereErreur>
        ))}
        {!pret && qs.length > 3 && (
          <div className="fsv-q"><button type="button" className="fsn-lien" onClick={() => setOuvert(id)}>{en ? `${qs.length - 3} more in the item sheet` : `${qs.length - 3} autre${qs.length - 3 > 1 ? "s" : ""} dans la fiche de l'article`}</button></div>
        )}
        {!pret && !qs.length && motifs.some((x) => x.cle === "texte") && !d.photoVide && (
          <div className="fsv-q">
            <p className="fsq-note">{en ? "Text written by FillSell." : "Texte écrit par FillSell."}</p>
            <div className="fsn-choices fsq-puces">
              <button type="button" className="fsn-choice" onClick={() => setOuvert(id)}>{en ? "Re-read it" : "Le relire"}</button>
              <button type="button" className="fsn-choice" onClick={() => decider(id, { texteValide: true })}>{en ? "It's right" : "C'est bon"}</button>
            </div>
          </div>
        )}
        {incoherent && !d.poidsConfirme && (
          <div className="fsv-q">
            <div className="fsv-q-t"><b>{en ? `${textePoids(poids, lang)} for ${incoherent.nom}?` : `${textePoids(poids)} pour ${incoherent.nom} ?`}</b></div>
            <div className="fsn-choices fsq-puces">
              {incoherent.propositions.map((g) => <button key={g} type="button" className="fsn-choice" onClick={() => poserPoids(id, g)}>{textePoids(g, lang)}</button>)}
              <button type="button" className="fsn-choice" onClick={() => decider(id, { poidsConfirme: true })}>{en ? `Keep ${textePoids(poids, lang)}` : `Garder ${textePoids(poids)}`}</button>
            </div>
          </div>
        )}
        {places.current.get(id) === "haut" && pret && (
          <div className="fsv-fait"><span className="fsv-ok" aria-hidden="true">✓</span><span>{en ? "Settled — tap the line to review." : "Réglé — touche la ligne pour revoir."}</span></div>
        )}
        {ecartees.length > 0 && (
          <div className="fsv-ecart">
            <span>{phraseEcartees(ecartees, NOM, lang)}</span>
            <button type="button" className="fsn-lien" onClick={() => { for (const e of ecartees) remettrePlateforme(id, e.p); }}>{en ? "Undo" : "Annuler"}</button>
          </div>
        )}
      </div>
    );
  };
  // Un article dont le moteur a levé en lisant ses questions n'a qu'UNE place : sa carte « mis de côté », plus bas.
  const haut = lot.ids.filter((id) => places.current.get(id) === "haut" && (aCompleter.includes(id) || prets.includes(id)) && !casses.some((c) => c.id === id));
  const bas = lot.ids.filter((id) => places.current.get(id) === "bas" && (aCompleter.includes(id) || prets.includes(id)));
  const autres = lot.ids.filter((id) => !aCompleter.includes(id) && !prets.includes(id)).concat(lignes.filter((id) => !lot.ids.includes(id)));
  const communeDuLot = (communes ?? []).filter((g) => g.ids.length >= 3);
  const mOuvert = ouvert ? moteurs.get(ouvert) : null;
  return (
    <>
      <BilanDuLot en={en} lot={lot} etats={etats} prets={prets} aCompleter={aCompleter} annoncesPretes={annoncesPretes} ouvrir={setOuvert} preparation={preparation} />

      {sansPoids.length > 0 && (
        <div className="fsv-lot">
          <div className="fsv-lot-l">
            <span><b>{en ? "Parcel" : "Colis"}</b> · {en ? `${sansPoids.length} item${sansPoids.length > 1 ? "s" : ""} without weight` : `${sansPoids.length} article${sansPoids.length > 1 ? "s" : ""} sans poids`}</span>
            <button type="button" className="fsn-lien" onClick={() => setPoidsTousOuvert((o) => !o)}>
              {poidsTousOuvert ? (en ? "Close" : "Fermer") : (en ? `One weight for the ${sansPoids.length}` : sansPoids.length > 1 ? `Un poids pour les ${sansPoids.length}` : "Son poids")} ›
            </button>
          </div>
          {poidsTousOuvert && <PoidsPourTous en={en} ids={sansPoids} poserPoidsDuLot={(ids, g) => { poserPoidsDuLot(ids, g); setPoidsTousOuvert(false); }} />}
        </div>
      )}

      {aTexte.length > 1 ? (
        <div className="fsq-textes">
          <div className="fsq-textes-ligne">
            <div className="fsq-textes-t">
              <b>{en ? `${aTexte.length} texts written by FillSell` : `${aTexte.length} textes écrits par FillSell`}</b>
              <small>{en ? "Tap an item to re-read its own." : "Touche un article pour relire le sien."}</small>
            </div>
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm fsq-btn" onClick={validerTextes}>{en ? "Approve all" : "Tout valider"}</button>
          </div>
        </div>
      ) : textesValides.length > 0 ? (
        <div className="fsq-textes fsq-textes--fait">
          <div className="fsq-textes-ligne">
            <div className="fsq-textes-t"><b>{en ? `✓ ${textesValides.length} texts approved` : `✓ ${textesValides.length} texte${textesValides.length > 1 ? "s" : ""} validé${textesValides.length > 1 ? "s" : ""}`}</b></div>
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm fsq-btn" onClick={annulerTextes}>{en ? "Undo" : "Annuler"}</button>
          </div>
        </div>
      ) : null}

      {/* Une même réponse pour plusieurs articles (même champ, même liste) : un geste pour tous. */}
      {communeDuLot.map((g) => (
        <div key={g.signature} className="fsv-lot">
          <div className="fsv-lot-l"><span><b>{g.label}</b> · {NOM(g.gp)} — {en ? `the same for the ${g.ids.length}` : `la même pour les ${g.ids.length}`}</span></div>
          <div className="fsn-choices fsq-puces">
            {g.allowedValues.slice(0, 12).map((v) => <button key={v} type="button" className="fsn-choice" onClick={() => repondreCommune(g, v)}>{v}</button>)}
          </div>
        </div>
      ))}

      {haut.length > 0 && (
        <section className="fsv-liste" aria-label={en ? "To settle" : "À régler"}>
          <div className="fsv-liste-t"><span>{en ? `To settle · ${haut.filter((id) => aCompleter.includes(id)).length}` : `À régler · ${haut.filter((id) => aCompleter.includes(id)).length}`}</span><span>{en ? "tap to see everything" : "touche pour tout voir"}</span></div>
          {haut.map((id) => (
            <BarriereErreur key={id} nom={`ligne ${id}`} onErreur={(e) => mettreDeCote(id, e, "ligne")}
              secours={<div className="fsv-secours"><ArticleMisDeCote en={en} item={parId.get(id)?.item} ligne /></div>}>
              <Rendu f={() => ligne(id)} />
            </BarriereErreur>
          ))}
        </section>
      )}

      {/* Un article dont le moteur lève : mis de côté par SA barrière, les autres restent. */}
      {casses.map(({ id, erreur }) => (
        <BarriereErreur key={`casse-${id}`} nom={`article ${id}`} onErreur={(e) => mettreDeCote(id, e, "questions")}
          secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} />}>
          <Relancer erreur={erreur} />
        </BarriereErreur>
      ))}

      {bas.length > 0 && (
        <section className="fsv-liste" aria-label={en ? "Ready" : "Prêts"}>
          <div className="fsv-liste-t"><span>{en ? `Ready · ${prets.length}` : `Prêts · ${prets.length}`}</span><span>{en ? "tap to see everything" : "touche pour tout voir"}</span></div>
          {bas.map((id) => (
            <BarriereErreur key={id} nom={`ligne ${id}`} onErreur={(e) => mettreDeCote(id, e, "ligne")}
              secours={<div className="fsv-secours"><ArticleMisDeCote en={en} item={parId.get(id)?.item} ligne /></div>}>
              <Rendu f={() => ligne(id)} />
            </BarriereErreur>
          ))}
        </section>
      )}

      {autres.length > 0 && (
        <div className="fsn-card" style={{ gap: 0 }}>
          {autres.map((id) => (
            <BarriereErreur key={id} nom={`ligne ${id}`} onErreur={(e) => mettreDeCote(id, e, "ligne")}
              secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} ligne />}>
              <LigneArticle id={id} en={en} L={L} item={parId.get(id)?.item} st={etats[id] ?? { phase: "attente" }} m={moteurs.get(id)}
                envoi={null} retirerDuLot={retirerDuLot} horloge={horloge} pontMort={pontMort} sansLecteur={sansLecteur} />
              {etats[id]?.phase === "rien" && etats[id]?.ecartement && Object.keys(decisions[id]?.ecartees ?? {}).length > 0 && (
                <div className="fsv-ecart fsv-ecart--rien">
                  <span />
                  <button type="button" className="fsn-lien" onClick={() => { for (const p of Object.keys(decisions[id]?.ecartees ?? {})) remettrePlateforme(id, p); }}>
                    {en ? "Undo" : "Annuler"}
                  </button>
                </div>
              )}
            </BarriereErreur>
          ))}
        </div>
      )}

      {blocsDuLot}

      {ouvert && createPortal((
        <div className="fsn fsq-feuille-hote" data-ecran="lot-feuille">
          <div className="fsq-voile" onClick={() => setOuvert(null)} />
          <div className="fsq-feuille" role="dialog" aria-modal="true" aria-label={titreDe(parId.get(ouvert)?.item) || (en ? "Item" : "Article")}>
            <div className="fsq-feuille-tete fsv-feuille-tete">
              <span className="fsq-poignee" aria-hidden="true" />
              <BarriereErreur nom={`tete ${ouvert}`} onErreur={(e) => mettreDeCote(ouvert, e, "questions")}
                secours={<b className="fsv-ligne fsv-ligne--tete">{titreDe(parId.get(ouvert)?.item)}</b>}>
                <Rendu f={() => (
                  <div className="fsv-ligne fsv-ligne--tete">
                    <VignetteLot en={en} item={parId.get(ouvert)?.item} photos={mOuvert ? ((mOuvert.processedPhotos?.length ? mOuvert.processedPhotos : mOuvert.photos) ?? null) : null} />
                    <span className="fsv-tx">
                      <b>{titreDe(parId.get(ouvert)?.item) || (en ? "Untitled item" : "Article sans titre")}</b>
                      <span className="fsv-meta">
                        {mOuvert ? plateformesDeLArticle(mOuvert).map((p) => <Logo key={p} platform={p} size={18} />) : null}
                        {mOuvert?.price != null ? <span className="fsv-px num">{String(mOuvert.price).replace(".", ",")} €</span> : null}
                      </span>
                    </span>
                  </div>
                )} />
              </BarriereErreur>
              <button type="button" className="fsq-fermer" onClick={() => setOuvert(null)} aria-label={en ? "Close" : "Fermer"}>✕</button>
            </div>
            <div className="fsq-feuille-corps">
              <BarriereErreur nom={`feuille ${ouvert}`} onErreur={(e) => mettreDeCote(ouvert, e, "questions")}
                secours={<ArticleMisDeCote en={en} item={parId.get(ouvert)?.item} />}>
                {mOuvert ? (
                  <FicheArticle m={mOuvert} item={parId.get(ouvert)?.item} decision={decisions[ouvert] ?? {}} en={en} lecture={lectures[ouvert] ?? null} poidsDefaut={poidsDefaut}
                    photoVide={Boolean(decisions[ouvert]?.photoVide)}
                    ecartees={Object.entries(decisions[ouvert]?.ecartees ?? {}).filter(([p]) => !(decisions[ouvert]?.remises ?? []).includes(p)).map(([p, motif]) => ({ p, motif }))}
                    actions={{
                      poserPoids: (g) => poserPoids(ouvert, g),
                      retirerPlateforme: (p) => sansPlateforme(ouvert, p),
                      remettrePlateforme: (p) => remettrePlateforme(ouvert, p),
                      validerTexte: () => decider(ouvert, { texteValide: true }),
                    }} />
                ) : (
                  <ArticleMisDeCote en={en} item={parId.get(ouvert)?.item} />
                )}
              </BarriereErreur>
            </div>
            <div className="fsq-feuille-pied fsv-pied">
              {/* « Plus tard » ferme sans rien décider (l'article reste à régler, dans le lot) ; « C'est bon » vaut relecture. */}
              <button type="button" className="fsn-btn fsn-btn--secondary" onClick={() => setOuvert(null)}>{en ? "Later" : "Plus tard"}</button>
              <button type="button" className="fsn-btn fsn-btn--primary" onClick={() => {
                // « C'est bon » vaut relecture du texte écrit par FillSell (c'est la personne qui vient de le lire).
                if ((etats[ouvert]?.motifs ?? []).some((x) => x.cle === "texte")) decider(ouvert, { texteValide: true });
                setOuvert(null);
              }}>{en ? "Done" : "C'est bon"}</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}

// Rend ce que `f` construit, DANS son propre rendu : une ligne qui lève est arrêtée par la barrière qui l'entoure
// (appelée dans le rendu du parent, elle emporterait toute la liste — vu le 26/10 sur l'aperçu « casse »).
function Rendu({ f }) {
  return f();
}

// Rend, sous une barrière, l'erreur qu'un calcul du parent a attrapée : la barrière met l'article de côté.
function Relancer({ erreur }) {
  throw erreur;
}

// « La même pour les N » d'un sujet « Poids du colis » : un poids écrit une fois, posé sur chacun.
function PoidsPourTous({ en, ids, poserPoidsDuLot }) {
  const [valeur, setValeur] = useState("");
  const [faux, setFaux] = useState(false);
  const appliquer = () => {
    const g = lirePoidsSaisi(valeur);
    if (!g) { setFaux(true); return; }
    setFaux(false);
    poserPoidsDuLot(ids, g);
  };
  return (
    <div className="fsq-commune">
      <p>{en ? `The same weight for all ${ids.length}:` : `Le même poids pour les ${ids.length} :`}</p>
      <div className="fsq-poids-tous">
        <input className="fsn-input" type="text" inputMode="decimal" value={valeur} placeholder={en ? "e.g. 650 g or 1.2 kg" : "ex. 650 g ou 1,2 kg"}
          aria-label={en ? "Weight for all these items" : "Poids pour tous ces articles"} aria-invalid={faux || undefined}
          onChange={(ev) => { setValeur(ev.target.value); setFaux(false); }} onKeyDown={(ev) => { if (ev.key === "Enter") appliquer(); }} />
        <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm fsq-btn" onClick={appliquer}>
          {en ? `Apply to ${ids.length}` : `Appliquer aux ${ids.length}`}
        </button>
      </div>
      {faux ? <p className="fsq-faux" role="alert">{en ? "Write a weight, e.g. 650 g or 1.2 kg." : "Écris un poids, par exemple 650 g ou 1,2 kg."}</p> : null}
    </div>
  );
}

// Un réglage du lot, replié : son titre et une phrase ; ouvert d'office quand le lot l'attend (un poids à saisir).
function PliDuLot({ en, titre, resume, ouvertDOffice = false, children }) {
  const [ouvert, setOuvert] = useState(null);
  const visible = ouvert ?? ouvertDOffice;
  return (
    <section className="fsq-pli">
      <button type="button" className="fsq-pli-tete" aria-expanded={visible} onClick={() => setOuvert(!visible)}>
        <span className="fsq-pli-t"><b>{titre}</b>{!visible && resume ? <small>{resume}</small> : null}</span>
        <span className="fsq-voir">{visible ? (en ? "Hide" : "Replier") : (en ? "Open" : "Ouvrir")}</span>
      </button>
      {visible ? <div className="fsq-pli-corps">{children}</div> : null}
    </section>
  );
}

// ═══ ÉCRAN 3 — « C'EST PARTI » ═══════════════════════════════════════════════
export function EcranFin({ en, L, lot, etats, lignes, parId, extensionNeverSeen, ebayParServeur, onOuvrirArticle, remise }) {
  const envoyes = lot.ids.filter((id) => etats[id]?.phase === "envoye");
  const annonces = envoyes.reduce((n, id) => n + (etats[id]?.envoyees?.length ?? 0), 0);
  const deCote = lignes.filter((id) => etats[id]?.phase !== "envoye");
  const dateRemise = dateCourte(remise, en);
  return (
    <>
      <div className="fsn-centre fsn-stack" style={{ gap: 10, padding: "8px 0" }}>
        <div className="fsn-ok-rond">✓</div>
        <h2 className="fsn-h">{annonces
          ? (en ? `${annonces} listing${annonces > 1 ? "s" : ""} queued` : `${annonces} annonce${annonces > 1 ? "s" : ""} en file`)
          : (en ? "Nothing was sent" : "Rien n'est parti")}</h2>
        {annonces > 0 && (
          <p className="fsn-lead">{extensionNeverSeen === true
            ? (en ? "They'll go out as soon as the FillSell extension is installed on your computer." : "Elles partiront dès que l'extension FillSell sera installée sur ton ordinateur.")
            : ebayParServeur && envoyes.every((id) => (etats[id]?.envoyees ?? []).every((p) => p === "ebay"))
              ? (en ? "eBay listings go out from our servers, even with your computer off." : "Les annonces eBay partent de nos serveurs, même ordinateur éteint.")
              // (03/10, Nico) Jamais « tu peux fermer l'app » : l'app n'est pas
              // accessoire — c'est là que chaque annonce se suit.
              : (en ? "The FillSell extension posts them from your computer, one after the other — you follow each listing here, in FillSell." : "L'extension FillSell les dépose depuis ton ordinateur, une après l'autre, et tu suis chaque annonce ici, dans FillSell.")}</p>
        )}
      </div>

      {deCote.length > 0 && (
        <div>
          <p className="fsn-eyebrow" style={{ marginBottom: 8 }}>{en ? "Left aside — nothing is lost" : "Laissés de côté — rien n'est perdu"}</p>
          <div className="fsn-card" style={{ gap: 0 }}>
            {deCote.map((id) => {
              const d = parId.get(id);
              const st = etats[id] ?? {};
              const raison = st.raison
                || (st.phase === "quota" ? (en ? `Stays in your stock, to publish from your new month${dateRemise ? ` (${dateRemise})` : ""}.` : `Reste dans ton stock, à publier dès ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)
                : st.phase === "questions" ? (en ? "An answer was missing: it's prepared, finish it from its card." : "Il manquait une réponse : il est préparé, termine-le depuis sa carte.")
                : st.phase === "retire" ? (en ? "You kept it for later." : "Tu l'as gardé pour plus tard.")
                : null);
              return (
                <div key={id} className="fsl-art">
                  <Vignette item={d?.item} />
                  <div className="fsl-art-t"><b>{titreDe(d?.item)}</b>{raison ? <small>{raison}</small> : null}</div>
                  <Puce ton={TON_PHASE[st.phase] ?? "mute"}>{L[st.phase] ?? st.phase}</Puce>
                  {onOuvrirArticle && d?.item && ["questions", "retire", "refuse", "erreur"].includes(st.phase) && (
                    <button type="button" className="fsl-retirer" onClick={() => onOuvrirArticle(d.item)}>{en ? "Open" : "Ouvrir"}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
