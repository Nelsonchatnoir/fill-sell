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
import BarreProgression from "../../components/BarreProgression";
import { Carte, Puce, Logo, Bouton } from "../composants";
import { NOM } from "../texte";
import { bilanPlateformes } from "../plateformes";
import { urlPhoto, urlsPhotos } from "../../utils/photos";
import { lireVeritePlateformes, sessionsDepuisVerite } from "../../utils/veritePlateformes";
import { ebayCompteUtilisable } from "../../utils/ebayCompte";
import { lireProchaineRemiseAZero } from "../../reglages/quotas";
import { agirEbay } from "../../utils/ebayCompte";
import { businessOfferVisible } from "../../config/businessOffer";
import { COIN_CONFIG_FALLBACK } from "../../components/ConversionModal";
import { completerTexteDuVendeur, aCompleter as texteACompleter, RYTHME_LECTURE_VINTED_MS, RYTHME_LECTURE_EBAY_MS } from "../texteDuVendeur";
import { propsStepperArticle } from "./propsArticle";
import {
  PLATEFORMES_LOT, PLATEFORMES_LOT_DEFAUT, PREPARATIONS_SIMULTANEES, REPOS_AVANT_LECTURE_MS,
  plateformesLibres, resumeParPlateforme, choixInitial, ficheCouvre, partagerQuota,
  dureeEstimeeMin, libelleDuree, bilanArticle, jumeauxQuiRetiennent, marqueLot, groupesReponseCommune,
  palierCourant, palierSuivant, canalAppareil, canalAbonnement, monteePossibleIci, CLE_REPRISE_LOT,
  poidsConnu,
} from "./regles";
import LivraisonDuLot from "./LivraisonDuLot";
import BarriereErreur from "../../components/BarriereErreur";
import { transporteursPourPoids } from "../../utils/leboncoinColis";
import { fusionnerReglages } from "../../utils/reglagesPlateformes";
import {
  cleColisRetenu, grilleColisVinted, chargerGrilleColisRelevee, colisRetenusDuProfil, colisRetenuDuRayon,
  colisVintedDeLaFiche, semerColisRetenus, colisRetenusEnCache, retenirColisVinted,
} from "../../utils/vintedColis";

const CLE_CHOIX = "fs_lot_plateformes";
const lireChoixMemorise = () => { try { const v = JSON.parse(localStorage.getItem(CLE_CHOIX) ?? "null"); return Array.isArray(v) ? v : null; } catch { return null; } };
const ecrireChoixMemorise = (v) => { try { localStorage.setItem(CLE_CHOIX, JSON.stringify(v)); } catch { /* navigation privée : rien */ } };
const CLE_PLUS_TARD = (uid) => `fs_lot_plus_tard_${uid}`;

// Les phases d'un article : où il en est, dans les mots de l'écran.
// `lecture` : sa description est lue là où il est en ligne (aucun moteur
// monté) ; les trois suivantes occupent une place de moteur.
const PHASES_MOTEUR = new Set(["montage", "redaction", "verification"]);
const PHASES_EN_PREPARATION = new Set(["lecture", ...PHASES_MOTEUR]);
const LIBELLE_PHASE = {
  fr: { attente: "En attente", lecture: "Ta description…", montage: "Lecture…", redaction: "Rédaction…", verification: "Vérification…", pret: "Prêt", questions: "À compléter", quota: "Mois prochain", rien: "Ne part pas", erreur: "Pas préparé", retire: "Retiré du lot", envoi: "Envoi…", envoye: "En file", refuse: "Pas parti" },
  en: { attente: "Waiting", lecture: "Your description…", montage: "Reading…", redaction: "Writing…", verification: "Checking…", pret: "Ready", questions: "To complete", quota: "Next month", rien: "Not going", erreur: "Not prepared", retire: "Removed", envoi: "Sending…", envoye: "Queued", refuse: "Not sent" },
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

// Le moteur d'UN article, monté sans rien afficher. Mémoïsé : l'écran du lot
// se redessine souvent, le moteur seulement quand SES entrées changent.
const HoteMoteur = memo(function HoteMoteur({
  item, jobs, prixVinted, surMoteur, marque, onJobsQueued,
  userId, supabase, lang, ebayCompte, plateformesVisibles, plateformesOuvertes, oplaMotifGrise, oplaExtensionMin,
  isPremium, isPro, isBusiness, extensionNeverSeen, extensionLastSeenAt,
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
  extensionVinted = false,
}) {
  const { userId, supabase, lang } = ctx;
  const en = lang === "en";
  const L = LIBELLE_PHASE[en ? "en" : "fr"];
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
    supabase.from("profiles").select("is_comped, apple_original_transaction_id, google_purchase_token, stripe_customer_id, platform_settings")
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
      supabase.from("fiches_annonce").select("inventaire_id, fiche").eq("user_id", userId).in("inventaire_id", ids)
        .then(({ data }) => { if (vivant) setFiches(Object.fromEntries((data ?? []).map((r) => [String(r.inventaire_id), r.fiche]))); },
          () => { if (vivant) setFiches({}); });
    } else setFiches({});
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sessions = sessionsDepuisVerite(verite);
  const ebayBloque = Boolean(ctx.ebayCompte?.voieApi) && Boolean(ctx.ebayCompte?.lu) && ebayCompteUtilisable(ctx.ebayCompte?.etat) === false;
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
    // Les articles qui attendent le mois prochain : gardés sur cet appareil,
    // proposés au prochain lot (jamais préparés, donc jamais décomptés).
    if (partage.plusTard.length) {
      try { localStorage.setItem(CLE_PLUS_TARD(userId), JSON.stringify({ ids: partage.plusTard.map((d) => d.id), apres: remise ?? null })); } catch { /* rien */ }
    }
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
  // (publication/texteDuVendeur.js). UNE lecture à la fois ; deux lectures
  // d'une même plateforme sont espacées au rythme des dépôts (Vinted 8 à
  // 20 s, eBay 1,5 à 3 s) : jamais une rafale, aucun anti-robot. Pendant ce
  // temps les autres articles se préparent.
  const lusRef = useRef(new Set());
  const [complets, setComplets] = useState({}); // id → l'article complété (description reprise)
  const [lectures, setLectures] = useState({}); // id → { source, note }
  const lecteurOccupe = useRef(false);
  const derniereLecture = useRef({}); // plateforme → horodatage de la fin de la dernière lecture
  useEffect(() => {
    if (!lot || lecteurOccupe.current) return;
    const suivant = lot.ids.find((id) => !lusRef.current.has(id) && etats[id]?.phase === "attente");
    if (!suivant) return;
    const d = donnees.find((x) => x.id === suivant);
    if (!d) { lusRef.current.add(suivant); return; }
    lecteurOccupe.current = true;
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
            const [min, max] = pf === "vinted" ? RYTHME_LECTURE_VINTED_MS : RYTHME_LECTURE_EBAY_MS;
            const der = derniereLecture.current[pf];
            if (der) {
              const reste = der + min + Math.random() * (max - min) - Date.now();
              if (reste > 0) await new Promise((ok) => setTimeout(ok, reste));
            }
          },
        });
      } catch { r = null; }
      for (const pf of r?.lectures ?? []) derniereLecture.current[pf] = Date.now();
      if (r?.item) setComplets((prev) => ({ ...prev, [suivant]: r.item }));
      setLectures((prev) => ({ ...prev, [suivant]: { source: r?.source ?? null, note: r?.note ?? null } }));
      lusRef.current.add(suivant);
      lecteurOccupe.current = false;
      // Retiré du lot pendant la lecture : il le reste.
      setEtats((prev) => (prev[suivant]?.phase === "lecture" ? { ...prev, [suivant]: { ...prev[suivant], phase: "attente", lecture: null } } : prev));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot, etats]);

  // ── Les moteurs montés : trois préparations à la fois, puis on garde ceux
  //    qu'il faudra encore lire (prêts, à compléter) jusqu'à l'envoi ────────
  useEffect(() => {
    if (!lot) return;
    const enPrep = lot.ids.filter((id) => PHASES_MOTEUR.has(etats[id]?.phase)).length;
    const places = PREPARATIONS_SIMULTANEES - enPrep;
    const aMonter = places > 0 ? lot.ids.filter((id) => etats[id]?.phase === "attente" && lusRef.current.has(id)).slice(0, places) : [];
    const garder = (id) => !["quota", "rien", "erreur", "retire", "refuse"].includes(etats[id]?.phase);
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
          const b = bilanArticle({ ...m, preparationAuRepos: true, quantiteFiche: quantiteDe(id) }, decisions[id], lang);
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
  }, [tick, lot, etats, actifs, decisions]);

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
  const retirerDuLot = (id) => { majEtat(id, { phase: "retire" }); };

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
  const poidsDe = (id) => poidsConnu(moteursRef.current.get(id), decisionsRef.current[id]);
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
  const attendre = (pred, ms) => new Promise((resolve) => {
    const fin = Date.now() + ms;
    const boucle = () => { if (pred() || Date.now() > fin) resolve(pred()); else setTimeout(boucle, 150); };
    boucle();
  });
  async function envoyer() {
    if (!lot) return;
    const ids = lot.ids.filter((id) => etatsRef.current[id]?.phase === "pret");
    if (!ids.length) return;
    setEtape("envoi");
    setEnvoi({ fait: 0, total: ids.length });
    let parti = 0;
    for (const id of ids) {
      // Mis de côté entre-temps (moteur cassé) : rien ne part pour lui.
      if (etatsRef.current[id]?.phase === "erreur") { setEnvoi((e) => ({ ...e, fait: e.fait + 1 })); continue; }
      const m = moteursRef.current.get(id);
      let b = null;
      try { b = m ? bilanArticle({ ...m, preparationAuRepos: true, quantiteFiche: quantiteDe(id) }, decisionsRef.current[id], lang) : null; }
      catch (e) { mettreDeCote(id, e, "envoi_bilan"); setEnvoi((x) => ({ ...x, fait: x.fait + 1 })); continue; }
      if (!m || !b?.pret) { majEtat(id, { phase: "questions", motifs: b?.motifs ?? [] }); setEnvoi((e) => ({ ...e, fait: e.fait + 1 })); continue; }
      majEtat(id, { phase: "envoi" });
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
          if ((a.state === "missing" || a.state === "invalid") && Array.isArray(a.allowedValues) && a.allowedValues.length && !a.neufSeulement) {
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
      if (e.a.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(e.gp, e.a.dedicatedTarget, valeur);
      else m.setPlatformAspect?.(e.gp, e.a.key, valeur);
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
          : partage.plusTard.length ? (en ? "Everything waits for your new month" : "Tout attend ton nouveau mois")
          : (en ? "Nothing to publish with this choice" : "Rien à publier avec ce choix"))
      : murActif
        // Le second choix du mur : continuer avec ce que le quota permet.
        ? (en ? `Continue with ${n} item${n > 1 ? "s" : ""}` : `Continuer avec ${n} article${n > 1 ? "s" : ""}`)
        : (en ? `Prepare ${annoncesPrevues} listing${annoncesPrevues > 1 ? "s" : ""}` : `Préparer ${annoncesPrevues} annonce${annoncesPrevues > 1 ? "s" : ""}`);
    onCta = preparer;
    sous = [murActif && n
      ? (en ? `The other ${partage.plusTard.length} wait for your new month: nothing is lost. Nothing goes out yet.` : `${partage.plusTard.length > 1 ? `Les ${partage.plusTard.length} autres attendent` : "L'autre attend"} ton nouveau mois : rien n'est perdu. Rien ne part encore.`)
      : (en ? "Nothing goes out yet: we prepare, you check." : "Rien ne part encore : on prépare, tu vérifies.")];
  } else if (etape === "avant") {
    if (!preparationFinie) {
      cta = en ? `Preparing… ${prepares} of ${lot.ids.length}` : `Préparation… ${prepares} sur ${lot.ids.length}`;
      disabled = true;
      sous = [en ? "You can answer below as soon as a question shows up." : "Tu peux déjà répondre ci-dessous dès qu'une question apparaît."];
    } else {
      disabled = !prets.length;
      cta = !prets.length
        ? (en ? "Answer the questions to send" : "Réponds aux questions pour envoyer")
        : aCompleter.length
          ? (en
              ? `Send ${prets.length > 1 ? `the ${prets.length} ready items` : "the ready item"} (${annoncesPretes} listing${annoncesPretes > 1 ? "s" : ""})`
              : `Envoyer ${prets.length > 1 ? `les ${prets.length} prêts` : "l'article prêt"} (${annoncesPretes} annonce${annoncesPretes > 1 ? "s" : ""})`)
          : (en ? `Send ${annoncesPretes} listing${annoncesPretes > 1 ? "s" : ""}` : `Envoyer ${annoncesPretes} annonce${annoncesPretes > 1 ? "s" : ""}`);
      onCta = envoyer;
      if (aCompleter.length && prets.length) sous = [en ? `The ${aCompleter.length} others stay in your stock, prepared: nothing is lost.` : `${aCompleter.length > 1 ? `Les ${aCompleter.length} autres restent` : "L'autre reste"} dans ton stock, préparé${aCompleter.length > 1 ? "s" : ""} : rien n'est perdu.`];
      else if (prets.length) sous = [en ? "The FillSell extension then posts them from your computer, one after the other." : "L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre."];
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
              sessions={sessions} pauses={pauses} ebayBloque={ebayBloque} ebayParServeur={ebayParServeur}
              quotas={quotas} restantes={restantes} remise={remise} partage={partage} annoncesPrevues={annoncesPrevues} duree={duree}
              extensionNeverSeen={ctx.extensionNeverSeen} extensionLastSeenAt={ctx.extensionLastSeenAt}
              fichesLues={fiches != null} boutiqueVinted={boutiqueVinted}
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
              sansPlateforme={sansPlateforme} retirerDuLot={retirerDuLot} envoi={envoi} supabase={supabase}
              lectures={lectures}
              livraison={{ transporteurs: transporteursDuLot, format: livraison.format }} poidsDe={poidsDe} poserPoids={poserPoids}
              poserPoidsDuLot={poserPoidsDuLot} poserTransporteurs={poserTransporteurs} poserFormat={poserFormat}
              colisVinted={colisVinted} choisirColisVinted={choisirColisVinted}
              userId={userId} exclusDepop={exclusDepop} mettreDeCote={mettreDeCote} signalerErreurBloc={signalerErreurBloc}
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
  en, lang, userId, donnees, resume, choix, basculer, sessions, pauses, ebayBloque, ebayParServeur,
  quotas, restantes, remise, partage, annoncesPrevues, duree, extensionNeverSeen, extensionLastSeenAt, fichesLues, boutiqueVinted = null,
  mur = null,
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
                  ? `${partage.maintenant.length} item${partage.maintenant.length > 1 ? "s" : ""} can go now; ${partage.plusTard.length} will wait for your new month${dateRemise ? ` (${dateRemise})` : ""}.`
                  : `${partage.maintenant.length > 1 ? `${partage.maintenant.length} articles peuvent` : "1 article peut"} partir maintenant ; ${partage.plusTard.length > 1 ? `${partage.plusTard.length} attendront` : "1 attendra"} ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)
              : (en
                  ? `Your ${partage.plusTard.length} item${partage.plusTard.length > 1 ? "s" : ""} will wait for your new month${dateRemise ? ` (${dateRemise})` : ""}.`
                  : `${partage.plusTard.length > 1 ? `Tes ${partage.plusTard.length} articles attendront` : "Ton article attendra"} ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)}
          </div>
          {mur.onMonter && !mur.renvoiBoutique && (
            <Bouton onClick={mur.onMonter}>
              {en
                ? `Switch to ${NOM_PALIER[mur.palierVise]}${mur.quotaVise ? ` — ${mur.quotaVise} listings a month` : ""}`
                : `Passer à ${NOM_PALIER[mur.palierVise]}${mur.quotaVise ? ` — ${mur.quotaVise} annonces par mois` : ""}`}
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
            else if (eb) sousTexte = en ? "Your eBay account isn't ready to sell yet: finish it in Settings" : "Ton compte eBay n'est pas encore prêt à vendre : termine-le dans Réglages";
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
                {on && sessionFermee && (
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
                  ? `Uses ${partage.aConsommer} of your monthly listings (${Math.max(0, (restantes ?? ann.restantes ?? 0) - partage.aConsommer)} left after).`
                  : `Prend ${partage.aConsommer} de tes annonces du mois (il t'en restera ${Math.max(0, (restantes ?? ann.restantes ?? 0) - partage.aConsommer)}).`)}
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
  livraison = { transporteurs: null, format: "" }, poidsDe = () => null, poserPoids = () => {}, poserPoidsDuLot = () => {},
  poserTransporteurs = () => {}, poserFormat = () => {},
  colisVinted = [], choisirColisVinted = () => {},
  // (10/10) Ce que l'écran parent sait et que ce composant lisait SANS le
  // recevoir (page blanche du 09/10 22:13 au 10/10) : passé, jamais supposé.
  userId = null, exclusDepop = [], mettreDeCote = () => {}, signalerErreurBloc = () => {},
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
      {envoi ? (
        <BarreProgression
          titre={en ? "Queuing your listings" : "Mise en file de tes annonces"}
          fraction={envoi.total ? envoi.fait / envoi.total : 0}
          pas={envoi.total ? 1 / envoi.total : 1}
          etat="en_cours"
          lang={lang}
          phrase={en ? `${envoi.fait} of ${envoi.total} items` : `${envoi.fait} sur ${envoi.total} articles`}
        />
      ) : !preparationFinie ? (
        <BarreProgression
          titre={en ? "Preparing the listings" : "Préparation des annonces"}
          fraction={total ? prepares / total : 0}
          pas={total ? 1 / total : 1}
          dureePas={15}
          etat="en_cours"
          lang={lang}
          article={itemEnCours ? { photo: urlsPhotos(itemEnCours.photos)[0] ?? null, titre: titreDe(itemEnCours) } : undefined}
          phrase={en ? `${prepares} of ${total} ready to check` : `${prepares} sur ${total} préparés`}
        />
      ) : (
        <div className="fsl-tuiles">
          <div className="fsl-tuile fsl-tuile--ok"><b>{prets.length}</b><small>{en ? "ready" : prets.length > 1 ? "prêts" : "prêt"}</small></div>
          <div className={`fsl-tuile${aCompleter.length ? " fsl-tuile--geste" : " fsl-tuile--mute"}`}><b>{aCompleter.length}</b><small>{en ? "to complete" : "à compléter"}</small></div>
          <div className="fsl-tuile fsl-tuile--mute"><b>{annoncesPretes}</b><small>{en ? "listings" : annoncesPretes > 1 ? "annonces" : "annonce"}</small></div>
        </div>
      )}

      {/* (04/10) Poids, transporteurs et format : AVANT l'envoi, pour le lot. */}
      {preparationFinie && !envoi && blocProtege("livraison", (
        <LivraisonDuLot en={en} ids={lot.ids.filter((id) => !["retire", "envoye", "erreur"].includes(etats[id]?.phase))} parId={parId} moteurs={moteurs}
          poidsDe={poidsDe} poserPoids={poserPoids} poserPoidsDuLot={poserPoidsDuLot}
          livraison={livraison} poserTransporteurs={poserTransporteurs} poserFormat={poserFormat}
          colisVinted={colisVinted} choisirColisVinted={choisirColisVinted} userId={userId} />
      ))}

      {/* (09/10 soir) Ce que Depop refuse : combien d'articles, et pourquoi. */}
      {preparationFinie && !envoi && blocProtege("exclus_depop", <ExclusDepop en={en} exclus={exclusDepop} />)}

      {/* Une réponse pour plusieurs articles : même champ, même liste. */}
      {communes.length > 0 && blocProtege("reponses_communes", communes.map((g) => (
        <Carte key={g.signature} gravite="geste" titre={`${g.label} · ${NOM(g.gp)}`}>
          <div className="fsn-card-p">{en
            ? `Asked for ${g.ids.length} items: one answer fills them all (you can still change one below).`
            : `Demandé pour ${g.ids.length} articles : une réponse les remplit tous (tu peux encore en changer un plus bas).`}</div>
          <div className="fsn-choices">
            {g.allowedValues.slice(0, 12).map((v) => (
              <button key={v} type="button" className="fsn-choice" onClick={() => repondreCommune(g, v)}>{v}</button>
            ))}
          </div>
        </Carte>
      )))}

      {/* Les articles qui attendent une réponse, puis les autres. Chacun a sa
          barrière : celui qui casse est mis de côté, les autres continuent. */}
      {aCompleter.map((id) => (
        <BarriereErreur key={id} nom={`article ${id}`} onErreur={(e) => mettreDeCote(id, e, "questions")}
          secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} />}>
          <ArticleAQuestions id={id} en={en} L={L} item={parId.get(id)?.item} m={moteurs.get(id)} st={etats[id]}
            decision={decisions[id] ?? {}} decider={decider} trancherJumeau={trancherJumeau} sansPlateforme={sansPlateforme} retirerDuLot={retirerDuLot}
            lecture={lectures[id] ?? null} />
        </BarriereErreur>
      ))}

      <div className="fsn-card" style={{ gap: 0 }}>
        {lot.ids.filter((id) => !aCompleter.includes(id)).concat(autres).map((id) => (
          <BarriereErreur key={id} nom={`ligne ${id}`} onErreur={(e) => mettreDeCote(id, e, "ligne")}
            secours={<ArticleMisDeCote en={en} item={parId.get(id)?.item} ligne />}>
            <LigneArticle id={id} en={en} L={L} item={parId.get(id)?.item} st={etats[id] ?? { phase: "attente" }} m={moteurs.get(id)}
              envoi={envoi} retirerDuLot={retirerDuLot} />
          </BarriereErreur>
        ))}
      </div>
    </>
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
function LigneArticle({ id, en, L, item, st, m, envoi, retirerDuLot }) {
  const pfs = st.envoyees ?? (m ? [...(m.plateformesPubliables ?? [])] : []);
  return (
    <div className="fsl-art">
      <Vignette item={item} />
      <div className="fsl-art-t">
        <b>{titreDe(item) || (en ? "Untitled item" : "Article sans titre")}</b>
        <small>
          {st.raison ? st.raison
            : st.phase === "lecture" ? TEXTE_LECTURE[en ? "en" : "fr"][st.lecture ?? "null"]
            : pfs.length && ["pret", "envoi", "envoye"].includes(st.phase) ? pfs.map(NOM).join(" · ")
            : null}
        </small>
      </div>
      {PHASES_EN_PREPARATION.has(st.phase) ? <span className="fsn-spin" aria-hidden="true" /> : null}
      <Puce ton={TON_PHASE[st.phase] ?? "mute"}>{L[st.phase] ?? st.phase}</Puce>
      {st.phase === "pret" && !envoi && (
        <button type="button" className="fsl-retirer" onClick={() => retirerDuLot(id)} aria-label={en ? "Remove from batch" : "Retirer du lot"}>✕</button>
      )}
    </div>
  );
}

// Un article qui attend une réponse : SES questions, posées par le même bloc
// que le stepper, plus ce que le lot ajoute (texte à relire, prix, jumeau).
export function ArticleAQuestions({ id, en, item, m, st, decision, decider, trancherJumeau, sansPlateforme, retirerDuLot, lecture = null }) {
  if (!m) return null;
  const motifs = st?.motifs ?? [];
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

      {aTexte && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Check the text that goes out" : "Relis le texte qui part"}</div>
          <div className="fsn-q-why">{!String(m.texteVendeur?.description ?? "").trim()
            ? (String(m.initialListing?.description ?? "").trim()
                ? (en ? "This text was written by FillSell (from your photos), not by you: check it before it goes out." : "Ce texte a été écrit par FillSell (d'après tes photos), pas par toi : relis-le avant qu'il parte.")
                // Ta description vit sur Vinted, et CET appareil ne peut pas la
                // lire (pas d'extension : un téléphone) — on dit où elle se lit.
                : lecture?.note === "vinted_sans_extension"
                  ? (en ? "Your description is on Vinted and is read from your computer, where the FillSell extension runs. This one was written from your photos and your title: check it, or prepare this batch from your computer." : "Ta description est sur Vinted et se lit depuis ton ordinateur, là où tourne l'extension FillSell. Celle-ci a été écrite d'après tes photos et ton titre : relis-la, ou prépare ce lot depuis ton ordinateur.")
                  : lecture?.note === "vinted_echec"
                    ? (en ? "Your Vinted description couldn't be read this time. This one was written from your photos and your title: check it before it goes out." : "Ta description Vinted n'a pas pu être lue cette fois. Celle-ci a été écrite d'après tes photos et ton titre : relis-la avant qu'elle parte.")
                    : (en ? "Your description isn't in FillSell: this one was written from your photos and your title." : "Ta description n'est pas dans FillSell : celle-ci a été écrite d'après tes photos et ton titre."))
            : (en ? "This title was written by FillSell." : "Ce titre a été écrit par FillSell.")}</div>
          <input className="fsn-input" type="text" defaultValue={titreQuiPart}
            onBlur={(ev) => { if (ev.target.value !== titreQuiPart) m.poserValeurGenerale?.("titre", ev.target.value); }} />
          <textarea className="fsn-textarea" defaultValue={descriptionQuiPart}
            onBlur={(ev) => { if (ev.target.value !== descriptionQuiPart) m.poserValeurGenerale?.("description", ev.target.value); }} />
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
          onChoisirRayon={(choixRayon) => m.choisirRayon?.(p, choixRayon)} regle="nouvelle" />
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
                || (st.phase === "quota" ? (en ? `Waits for your new month${dateRemise ? ` (${dateRemise})` : ""}.` : `Attend ton nouveau mois${dateRemise ? ` (le ${dateRemise})` : ""}.`)
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
