// ═══════════════════════════════════════════════════════════════════════════
// LES BARRES DES JOBS — ce que la barre sait VRAIMENT d'un job (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Traduit un job de cross_post_jobs en piste de BarreProgression : ses étapes
// RÉELLES, l'étape où il est, son état, et des phrases qui ne disent que ce
// qu'on sait. Calcul PUR (aucun DOM, aucune requête).
//
// Ce que la base sait (et rien de plus) :
//   · publication et retrait : en file (pending) → l'ordinateur ou nos
//     serveurs y travaillent (processing, depuis processing_since) → fini.
//     Les sous-étapes de l'extension ne remontent pas : l'étape « dépôt »
//     avance sur sa durée MESURÉE, la phrase ne promet rien de plus ;
//   · republication : republish_step a_capturer → captured → deleted →
//     recreated, avec processing_since, deleted_at et next_action_after.
// Durées attendues : médianes de la prod sur 14 jours (01/10/2026).
//   dépôt par l'extension (processing → published) : Vinted 62 s, Leboncoin
//   67 s, Beebs 68 s, eBay 238 s, Opla 10 s ; eBay par nos serveurs (création
//   → en ligne) 78 s ; republication Vinted : retrait 51 s puis remise en
//   ligne 17 s ; Leboncoin et Beebs : remise en ligne ~6 min (attente voulue
//   de 2 à 5 min).
// Une étape d'ATTENTE (en file, copie faite en attente de son tour) ne déborde
// jamais sur la suite : un job qui n'a pas commencé ne remplit pas la barre.
// ⛔ AFFICHAGE PUR : aucune logique de job ne change ici.

import { situationJob, nomPlateforme, etapeRepublication, parNosServeurs, heureConnue, libelleAction } from "./fileDesJobs.js";
import { urlsPhotos } from "./photos.js";

// depop (09/10) : dépôt par l'API depuis la page (photos + création + relecture),
// mesuré sur le parcours réel du 09/10.
const DEPOT_EXTENSION = { vinted: 62, leboncoin: 67, beebs: 68, ebay: 238, opla: 10, depop: 20 };
const DEPOT_SERVEURS = { ebay: 78 };
// Vinted fait retrait et recréation EN UNE PASSE : le « retrait » (formulaire
// rempli puis ancienne annonce supprimée) dure 51 s médianes (p90 65 s),
// la remise en ligne qui suit 17 s (p90 23 s) — 3 500 republications, 14 j.
const RETRAIT_REPUBLICATION = { vinted: 51 };
const REMISE_EN_LIGNE = { vinted: 17 };
const REMISE_EN_LIGNE_DEFAUT = 330;
const PRISE_EN_CHARGE = 90;
const RETRAIT = 45;

const TEXTES = {
  fr: {
    fileOrdi: "Dans la file — ton ordinateur la prend à son tour…",
    fileServeurs: "Dans la file de nos serveurs…",
    fileRetrait: "Dans la file — ton ordinateur la retire à son tour…",
    fileRepub: "Dans la file — rien n'a encore été touché…",
    fileCourt: "En file…",
    fileLong: "D'autres annonces passent avant elle : elle partira à son tour.",
    depot: (p) => `Dépôt en cours sur ${p}, dans ton Chrome…`,
    depotServeurs: (p) => `Publication sur ${p} depuis nos serveurs…`,
    depotCourt: "Dépôt en cours…",
    retrait: (p) => `Retrait de l'annonce sur ${p}…`,
    retraitServeurs: (p) => `Retrait de l'annonce sur ${p} depuis nos serveurs…`,
    retraitCourt: "Retrait en cours…",
    releve: "Copie complète de ton annonce : photos, texte, prix…",
    releveCourt: "Copie en cours…",
    copieFaite: "Copie faite, rien n'a été retiré — en attente de son tour…",
    copieFaiteCourt: "Copie faite…",
    retraitAncienne: "Retrait de l'ancienne annonce — sa copie est en sécurité…",
    retraitAncienneCourt: "Retrait en cours…",
    remise: (p) => `Remise en ligne de ton annonce sur ${p}…`,
    remiseVers: (h) => `Hors ligne quelques minutes : remise en ligne vers ${h}…`,
    remiseCourt: "Remise en ligne…",
    finPublie: (p) => `En ligne sur ${p}.`,
    finRepublie: (p) => `De retour en tête sur ${p}.`,
    finRetire: (p) => `Retirée de ${p}.`,
    geste: "Un geste à faire.",
    pasPartie: "Elle n'est pas partie : à relancer.",
    annulee: "Annulée.",
    horsLigneArret: (p) => `Ton annonce n'est plus en ligne sur ${p} : republie-la depuis ta fiche.`,
  },
  en: {
    fileOrdi: "Queued — your computer takes it in turn…",
    fileServeurs: "Queued on our servers…",
    fileRetrait: "Queued — your computer removes it in turn…",
    fileRepub: "Queued — nothing has been touched yet…",
    fileCourt: "Queued…",
    fileLong: "Other listings go before it: it will go out in turn.",
    depot: (p) => `Posting on ${p}, in your Chrome…`,
    depotServeurs: (p) => `Listing on ${p} from our servers…`,
    depotCourt: "Posting…",
    retrait: (p) => `Removing the listing from ${p}…`,
    retraitServeurs: (p) => `Removing the listing from ${p} from our servers…`,
    retraitCourt: "Removing…",
    releve: "Full copy of your listing: photos, text, price…",
    releveCourt: "Copying…",
    copieFaite: "Copy done, nothing removed — waiting for its turn…",
    copieFaiteCourt: "Copy done…",
    retraitAncienne: "Removing the old listing — its copy is safe…",
    retraitAncienneCourt: "Removing…",
    remise: (p) => `Putting your listing back online on ${p}…`,
    remiseVers: (h) => `Offline for a few minutes: back online around ${h}…`,
    remiseCourt: "Going back online…",
    finPublie: (p) => `Online on ${p}.`,
    finRepublie: (p) => `Back at the top on ${p}.`,
    finRetire: (p) => `Removed from ${p}.`,
    geste: "Something to do.",
    pasPartie: "It didn't go out: to relaunch.",
    annulee: "Cancelled.",
    horsLigneArret: (p) => `Your listing is no longer online on ${p}: repost it from the item.`,
  },
};

const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {});

// Un horodatage n'est un départ d'étape que s'il est plausible : ni dans le
// futur (horloge du poste en avance), ni vieux de plus de 6 h.
function depuisPlausible(iso, maintenant) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t) || t > maintenant || maintenant - t > 6 * 3600000) return undefined;
  return t;
}

/** Les étapes réelles d'un job (cle, texte, court, duree, poids, debord). */
export function etapesJob(job, lang = "fr") {
  const T = TEXTES[lang === "en" ? "en" : "fr"];
  const p = job?.platform;
  const nom = nomPlateforme(p);
  if (job?.action === "republish") {
    const remise = REMISE_EN_LIGNE[p] ?? REMISE_EN_LIGNE_DEFAUT;
    return [
      { cle: "file", texte: T.fileRepub, court: T.fileCourt, duree: PRISE_EN_CHARGE, poids: 6, debord: false, texteLong: T.fileLong },
      { cle: "releve", texte: T.releve, court: T.releveCourt, duree: 35, poids: 22 },
      { cle: "attente", texte: T.copieFaite, court: T.copieFaiteCourt, duree: 120, poids: 6, debord: false, texteLong: T.fileLong },
      { cle: "retrait", texte: T.retraitAncienne, court: T.retraitAncienneCourt, duree: RETRAIT_REPUBLICATION[p] ?? 25, poids: 16 },
      { cle: "remise", texte: T.remise(nom), court: T.remiseCourt, duree: remise, poids: 50 },
    ];
  }
  const api = parNosServeurs(job);
  if (job?.action === "delete") {
    // Un retrait eBay part de nos serveurs (voie « api »), comme la publication.
    return [
      { cle: "file", texte: api ? T.fileServeurs : T.fileRetrait, court: T.fileCourt, duree: PRISE_EN_CHARGE, poids: 15, debord: false, texteLong: T.fileLong },
      { cle: "action", texte: api ? T.retraitServeurs(nom) : T.retrait(nom), court: T.retraitCourt, duree: api ? (DEPOT_SERVEURS[p] ?? 78) : RETRAIT, poids: 85 },
    ];
  }
  return [
    { cle: "file", texte: api ? T.fileServeurs : T.fileOrdi, court: T.fileCourt, duree: PRISE_EN_CHARGE, poids: 15, debord: false, texteLong: T.fileLong },
    {
      cle: "action",
      texte: api ? T.depotServeurs(nom) : T.depot(nom),
      court: T.depotCourt,
      duree: api ? (DEPOT_SERVEURS[p] ?? 78) : (DEPOT_EXTENSION[p] ?? 70),
      poids: 85,
    },
  ];
}

/**
 * La piste de BarreProgression d'un job.
 * ctx = contexte de situationJob (maintenant, lang, extension, plateformesEnPause,
 *       plafond, creneaux) + texteErreur(job) → phrase humaine de l'erreur (optionnel).
 */
export function pisteJob(job, ctx = {}) {
  const lang = ctx.lang === "en" ? "en" : "fr";
  const T = TEXTES[lang];
  const maintenant = ctx.maintenant ?? Date.now();
  const nom = nomPlateforme(job?.platform);
  const pf = pfDe(job);
  const etapes = etapesJob(job, lang);
  const erreur = (j) => {
    try { return (ctx.texteErreur?.(j) || "").trim() || null; } catch { return null; }
  };
  const base = {
    cle: String(job?.id ?? `${job?.platform}|${job?.action}`),
    libelle: nom,
    etapes,
    phraseFin: job?.action === "republish" ? T.finRepublie(nom) : job?.action === "delete" ? T.finRetire(nom) : T.finPublie(nom),
  };
  const step = job?.action === "republish" ? etapeRepublication(job) : null;
  const horsLigne = step === "deleted";

  // ── Fini ──
  const reussi = job?.action === "delete"
    ? job?.status === "deleted"
    : job?.action === "republish"
      ? step === "recreated"
      : ["published", "sold", "dry_run_completed"].includes(job?.status);
  if (reussi) return { ...base, etape: etapes.at(-1).cle, etat: "termine" };

  // ── Arrêté ── La barre s'arrête à l'étape ATTEINTE (ce qui est acquis
  // reste affiché), jamais plus loin.
  const etapeAtteinte = job?.action === "republish"
    ? ({ a_capturer: "releve", captured: "attente", deleted: "remise" }[step] ?? null)
    : "action";
  if (job?.status === "needs_user") {
    return { ...base, etape: etapeAtteinte, etat: "echec", ton: horsLigne ? "erreur" : "action", phraseEchec: erreur(job) ?? (horsLigne ? T.horsLigneArret(nom) : T.geste) };
  }
  if (job?.status === "failed") {
    return { ...base, etape: etapeAtteinte, etat: "echec", ton: horsLigne ? "erreur" : "action", phraseEchec: horsLigne ? T.horsLigneArret(nom) : (erreur(job) ?? T.pasPartie) };
  }
  if (job?.status === "cancelled" || job?.status === "deleted") {
    return { ...base, etape: horsLigne ? "remise" : null, etat: "echec", ton: horsLigne ? "erreur" : "neutre", phraseEchec: horsLigne ? T.horsLigneArret(nom) : (erreur(job) ?? T.annulee) };
  }

  // ── En travail ──
  if (job?.action === "republish") {
    if (horsLigne) {
      const h = heureConnue(pf.next_action_after, maintenant, lang);
      return { ...base, etape: "remise", etat: "en_cours", depuis: depuisPlausible(pf.deleted_at, maintenant), phrase: h ? T.remiseVers(h) : undefined };
    }
    if (job.status === "processing") {
      const etape = step === "captured" ? "retrait" : "releve";
      return { ...base, etape, etat: "en_cours", depuis: depuisPlausible(pf.processing_since, maintenant) };
    }
  } else if (job?.status === "processing") {
    return { ...base, etape: "action", etat: "en_cours", depuis: depuisPlausible(pf.processing_since, maintenant) };
  }

  // ── En attente (pending) : la raison vient de la file ──
  const s = situationJob(job, { ...ctx, lang, maintenant });
  if (s.groupe === "geste") return { ...base, etape: null, etat: "echec", ton: "action", phraseEchec: s.raison };
  if (s.groupe === "pause" || s.motif === "ordinateur") return { ...base, etape: step === "captured" ? "attente" : "file", etat: "pause", phrasePause: s.raison };
  const etape = step === "captured" ? "attente" : "file";
  return { ...base, etape, etat: "en_cours", depuis: depuisPlausible(job?.created_at, maintenant) };
}

// Prix lisible quand la fiche en porte un (jamais « 0 € » pour un prix vide).
function prixLisible(item, formaterPrix) {
  const n = Number(item?.sell ?? item?.prix_vente);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (formaterPrix) return formaterPrix(n);
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n); } catch { return `${n} €`; }
}

/** La carte d'identité d'un article pour une barre : photo, titre, prix · action. */
export function articleDeJob(job, item, { lang = "fr", formaterPrix = null, action = null } = {}) {
  const fr = lang !== "en";
  const titre = (item?.title ?? item?.titre ?? job?.title ?? "").trim() || (fr ? "Ton article" : "Your item");
  const prix = prixLisible(item, formaterPrix);
  const quoi = action ?? libelleAction(job, lang);
  return {
    photo: item ? (urlsPhotos(item.photos)[0] ?? null) : null,
    titre,
    sousTitre: [prix, quoi].filter(Boolean).join(" · "),
  };
}

