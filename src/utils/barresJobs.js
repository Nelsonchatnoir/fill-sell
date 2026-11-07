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

import { situationJob, nomPlateforme, etapeRepublication, parNosServeurs, libelleAction, sansEstimation, depuisQuand } from "./fileDesJobs.js";
import { urlsPhotos } from "./photos.js";
import { plagesDe, PLAFOND } from "./progression.js";
import { LOCALE_MONTANT_ANGLAIS } from "./montants.js";
// (02/11 soir, Nico) Compte Cloud : ses tâches sont faites par FillSell Cloud — les mots du Cloud, jamais « ton ordinateur ».
import { parLeCloud } from "../cloud/voieCloud.js";

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
    fileCloud: "Dans la file — FillSell Cloud la prend à son tour…",
    fileRetraitCloud: "Dans la file — FillSell Cloud la retire à son tour…",
    depotCloud: "FillSell Cloud la publie…",
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
    remiseCourt: "Remise en ligne…",
    finPublie: (p) => `En ligne sur ${p}.`,
    finRepublie: (p) => `De retour en tête sur ${p}.`,
    dejaEnLigne: (p) => `Déjà remise en ligne sur ${p} : rien retiré ni recréé.`,
    finRetire: (p) => `Retirée de ${p}.`,
    dejaRetireeParPlateforme: (p, m) => `Déjà retirée par ${p} : « ${m} » Plus rien à retirer.`,
    geste: "À toi de jouer.",
    pasPartie: "Elle n'est pas partie : à relancer.",
    annulee: "Arrêtée.",
    horsLigneArret: (p) => `Ton annonce n'est plus en ligne sur ${p} : republie-la depuis ta fiche.`,
  },
  en: {
    fileOrdi: "Queued — your computer takes it in turn…",
    fileServeurs: "Queued on our servers…",
    fileRetrait: "Queued — your computer removes it in turn…",
    fileCloud: "Queued — FillSell Cloud takes it in turn…",
    fileRetraitCloud: "Queued — FillSell Cloud removes it in turn…",
    depotCloud: "FillSell Cloud is listing it…",
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
    remiseCourt: "Going back online…",
    finPublie: (p) => `Online on ${p}.`,
    finRepublie: (p) => `Back at the top on ${p}.`,
    dejaEnLigne: (p) => `Already back online on ${p}: nothing removed or recreated.`,
    finRetire: (p) => `Removed from ${p}.`,
    dejaRetireeParPlateforme: (p, m) => `Already removed by ${p}: “${m}” Nothing left to remove.`,
    geste: "Your move.",
    pasPartie: "It didn't go out: to relaunch.",
    annulee: "Stopped.",
    horsLigneArret: (p) => `Your listing is no longer online on ${p}: repost it from the item.`,
  },
};

const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {});

// Un horodatage n'est un départ d'étape que s'il est plausible : ni dans le
// futur (horloge du poste en avance), ni vieux de plus de 6 h.
// (04/11, Nico) Un départ ANCIEN reste un départ : la barre se pose alors près du bout de sa portion (la glissade est
// asymptotique) au lieu de repartir de zéro à chaque affichage — c'était la règle « plus de 6 h = inconnu » qui
// renvoyait à 0 % les republications en file depuis le matin. Seul le futur (horloge du poste en avance) est ramené
// à maintenant.
function depuisPlausible(iso, maintenant) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return undefined;
  return Math.min(t, maintenant);
}

// ═══════════════════════════════════════════════════════════════════════════
// LA POSITION D'UN JOB DANS SA BARRE : UNE SEULE SOURCE, LA BASE (04/11, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat de Nico : la progression d'une republication n'était pas la même sur la carte du Stock et dans la file des
// jobs, et repartait à zéro au rafraîchissement. Cause : le moteur de la barre (BarreProgression) partait du moment
// où L'ÉCRAN voyait l'étape — départ à 0 au montage, débord d'une étape sur la suivante gardé en mémoire, départ jeté
// au-delà de 6 h. La carte, montée depuis longtemps, et la file qu'on vient d'ouvrir avaient deux histoires.
// La règle : la position est une fonction PURE du job tel qu'il est en base (republish_step, statut, horodatages
// écrits par le serveur et l'extension) et de l'heure. Même chiffre partout (carte, file, feuille, web, app), au
// premier affichage comme après un rafraîchissement ; jamais en recul.
// Chaque PHASE écrite en base a sa portion de barre, faite de ses étapes (poids de etapesJob) :
//   · republication : a_capturer = « file » + « relevé » ; captured = « attente » + « retrait » ; deleted = « remise » ;
//   · publication et retrait : « file » + « action ».
// Dans une phase :
//   · en file, jamais tentée : glisse sur l'étape d'attente, depuis le début de la phase ;
//   · premier essai (processing) : glisse du début de l'étape de travail vers CAP de sa plage, depuis processing_since ;
//   · retombée après un essai (en file, en pause, arrêtée — un essai est noté depuis le début de la phase) : posée
//     sur CAP, là où le premier essai ne pouvait pas aller ;
//   · nouvel essai après un essai : glisse de CAP vers la fin de l'étape de travail.
//   · deleted (« remise ») : une seule portion, ancrée sur deleted_at, quel que soit le statut ; un essai noté depuis
//     le retrait pose la barre sur CAP, un nouvel essai glisse de CAP à la fin.
// Une phase ne déborde jamais sur la suivante : en file ↔ en travail, une phase après l'autre, la barre ne recule pas.
// ⛔ LECTURE SEULE : ni l'ordre ni la logique des étapes ne changent ici — seulement leur lecture et leur affichage.
export const CAP_ESSAI = 0.6;

// Un essai de CETTE phase est-il noté en base ? (une erreur technique, ou un passage en travail archivé, depuis son début)
function essaiNoteDepuis(pf, debutMs) {
  if (!Number.isFinite(debutMs)) return false;
  const apres = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) && t >= debutMs; };
  if (apres(pf?.error_technique?.at)) return true;
  if (apres(pf?.recreation_reprise?.at)) return true;
  return Array.isArray(pf?.erreurs_archivees) && pf.erreurs_archivees.some((e) => e?.statut === "processing" && apres(e?.le));
}

/**
 * La position d'un job dans sa barre, pour BarreProgression en mode « fraction » (pure) :
 * { fraction, pas, dureePas, depuis } — fraction et pas en part de la barre (0 à 1), depuis en ms.
 * @param {object} job
 * @param {Array} etapes — etapesJob(job)
 * @param {{ maintenant?: number, arrete?: boolean }} [opts] — arrete : needs_user / failed (la barre se pose)
 */
export function positionJob(job, etapes, opts = {}) {
  const maintenant = opts.maintenant ?? Date.now();
  const pf = pfDe(job);
  const plages = plagesDe(etapes);
  const plage = (cle) => plages.find((x) => x.cle === cle) ?? null;
  const step = job?.action === "republish" ? etapeRepublication(job) : null;
  const cree = depuisPlausible(job?.created_at, maintenant);
  let attente; let travail; let debutPhase;
  if (step === "deleted") {
    attente = travail = plage("remise");
    debutPhase = depuisPlausible(pf.deleted_at, maintenant) ?? cree;
  } else if (job?.action === "republish" && step === "captured") {
    attente = plage("attente"); travail = plage("retrait");
    const capture = depuisPlausible(pf.republish_snapshot?.captured_at, maintenant);
    debutPhase = Number.isFinite(capture) && Number.isFinite(cree) ? Math.max(capture, cree) : (capture ?? cree);
  } else if (job?.action === "republish") {
    attente = plage("file"); travail = plage("releve");
    debutPhase = cree;
  } else {
    attente = plage("file"); travail = plage("action");
    debutPhase = cree;
  }
  if (!attente || !travail) return null;
  const versFraction = (debut, fin, duree, depuis) => ({
    fraction: debut / PLAFOND, pas: Math.max(0, fin - debut) / PLAFOND, dureePas: duree, depuis,
  });
  const cap = travail.debut + CAP_ESSAI * (travail.fin - travail.debut);
  const enTravail = job?.status === "processing";
  const essai = Boolean(opts.arrete) || essaiNoteDepuis(pf, debutPhase);
  const depuisTravail = depuisPlausible(pf.processing_since, maintenant) ?? debutPhase;
  if (step === "deleted") {
    if (!essai) return versFraction(travail.debut, cap, travail.duree, debutPhase);
    return enTravail ? versFraction(cap, travail.fin, travail.duree, depuisTravail) : versFraction(cap, cap, travail.duree, debutPhase);
  }
  if (enTravail) return essai ? versFraction(cap, travail.fin, travail.duree, depuisTravail) : versFraction(travail.debut, cap, travail.duree, depuisTravail);
  if (essai) return versFraction(cap, cap, travail.duree, debutPhase);
  return versFraction(attente.debut, attente.fin, attente.duree, debutPhase);
}

/** Les étapes réelles d'un job (cle, texte, court, duree, poids, debord). `opts.cloud` : le compte est servi par FillSell Cloud. */
export function etapesJob(job, lang = "fr", opts = {}) {
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
  const cloud = !api && parLeCloud(job, opts.cloud === true);
  if (job?.action === "delete") {
    // Un retrait eBay part de nos serveurs (voie « api »), comme la publication.
    return [
      { cle: "file", texte: api ? T.fileServeurs : cloud ? T.fileRetraitCloud : T.fileRetrait, court: T.fileCourt, duree: PRISE_EN_CHARGE, poids: 15, debord: false, texteLong: T.fileLong },
      { cle: "action", texte: api ? T.retraitServeurs(nom) : T.retrait(nom), court: T.retraitCourt, duree: api ? (DEPOT_SERVEURS[p] ?? 78) : RETRAIT, poids: 85 },
    ];
  }
  return [
    { cle: "file", texte: api ? T.fileServeurs : cloud ? T.fileCloud : T.fileOrdi, court: T.fileCourt, duree: PRISE_EN_CHARGE, poids: 15, debord: false, texteLong: T.fileLong },
    {
      cle: "action",
      texte: api ? T.depotServeurs(nom) : cloud ? T.depotCloud : T.depot(nom),
      court: T.depotCourt,
      duree: api ? (DEPOT_SERVEURS[p] ?? 78) : (DEPOT_EXTENSION[p] ?? 70),
      poids: 85,
    },
  ];
}

/** (03/11) Le motif donné par la PLATEFORME quand elle avait déjà retiré l'annonce d'un retrait fait
 *  (deja_absente.motif_plateforme, posé par le serveur), ou null. */
export function motifRetraitParPlateforme(job) {
  if (job?.action !== "delete" || job?.status !== "deleted") return null;
  const m = pfDe(job)?.deja_absente?.motif_plateforme;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

/**
 * La piste de BarreProgression d'un job.
 * ctx = contexte de situationJob (maintenant, lang, extension, plateformesEnPause,
 *       plafond, creneaux, cloud) + texteErreur(job) → phrase humaine de l'erreur (optionnel).
 * (04/11) L'étape et l'état disent les MOTS ; la position (positionJob) dit où est la barre, lue en base — `reprise`
 * demande au moteur de s'y poser dès le premier affichage, jamais de repartir de zéro.
 */
export function pisteJob(job, ctx = {}) {
  const p = pisteSansPosition(job, ctx);
  if (p.etat === "termine") return { ...p, reprise: true };
  if (p.etape == null) return p;
  const pos = positionJob(job, p.etapes, { maintenant: ctx.maintenant ?? Date.now(), arrete: p.etat === "echec" });
  return pos ? { ...p, ...pos, reprise: true } : p;
}

function pisteSansPosition(job, ctx = {}) {
  const lang = ctx.lang === "en" ? "en" : "fr";
  const T = TEXTES[lang];
  const maintenant = ctx.maintenant ?? Date.now();
  const nom = nomPlateforme(job?.platform);
  const pf = pfDe(job);
  const etapes = etapesJob(job, lang, { cloud: ctx.cloud === true });
  const erreur = (j) => {
    // (15/10 soir, Nico) Jamais une heure ni une durée promise dans une barre.
    try { return sansEstimation(ctx.texteErreur?.(j) || "") || null; } catch { return null; }
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
  // (31/10, lot F) Une republication close parce que l’annonce était déjà remise en ligne : faite, jamais « arrêtée ».
  if (job?.action === "republish" && job?.status === "cancelled" && pf.republication_sans_objet && typeof pf.republication_sans_objet === "object") {
    return { ...base, etape: etapes.at(-1).cle, etat: "termine", phraseFin: T.dejaEnLigne(nom) };
  }
  const reussi = job?.action === "delete"
    ? job?.status === "deleted"
    : job?.action === "republish"
      ? step === "recreated"
      : ["published", "sold", "dry_run_completed"].includes(job?.status);
  if (reussi) {
    // (03/11, règle de Nico) La plateforme avait déjà retiré l'annonce et a dit pourquoi : ses mots, tels quels.
    const motif = motifRetraitParPlateforme(job);
    return { ...base, etape: etapes.at(-1).cle, etat: "termine", ...(motif ? { phraseFin: T.dejaRetireeParPlateforme(nom, motif) } : {}) };
  }

  // ── Arrêté ── La barre s'arrête à l'étape ATTEINTE (ce qui est acquis
  // reste affiché), jamais plus loin.
  const etapeAtteinte = job?.action === "republish"
    ? ({ a_capturer: "releve", captured: "attente", deleted: "remise" }[step] ?? null)
    : "action";
  if (job?.status === "needs_user") {
    // (25/10, balayage des erreurs visibles, règle 3) Une attente AUTOMATIQUE (etat-job.js, attenteAutomatique :
    // relevé attendu, coupure technique, plateforme écartée…) est « En pause » — la file la range là, la barre le
    // dit aussi. Elle disait « À toi de jouer » en ambre sur tout needs_user.
    const s = situationJob(job, { ...ctx, lang, maintenant });
    if (s.groupe === "en_pause") {
      return { ...base, etape: horsLigne ? "remise" : step === "captured" ? "attente" : "file", etat: "pause", phrasePause: s.raison };
    }
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
      // (15/10 soir) Plus de « remise en ligne vers 17:36… » : l'étape, sans heure.
      return { ...base, etape: "remise", etat: "en_cours", depuis: depuisPlausible(pf.deleted_at, maintenant) };
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
  if (s.groupe === "a_toi") return { ...base, etape: null, etat: "echec", ton: "action", phraseEchec: s.raison };
  if (s.groupe === "en_pause") return { ...base, etape: step === "captured" ? "attente" : "file", etat: "pause", phrasePause: s.raison };
  const etape = step === "captured" ? "attente" : "file";
  return { ...base, etape, etat: "en_cours", depuis: depuisPlausible(job?.created_at, maintenant) };
}

// ═══════════════════════════════════════════════════════════════════════════
// L'HEURE DE CHAQUE ÉTAPE D'UNE REPUBLICATION (05/11 soir, lot « Ouverture du Cloud », point 10)
// ═══════════════════════════════════════════════════════════════════════════
// Des heures PASSÉES, jamais promises (règle du 15/10 : aucune heure annoncée). Source : le journal tenu par la base
// (platform_fields.journal_etapes, déclencheur zz_journal_etapes_republication, horloge du serveur) — pour chaque étape,
// le DERNIER passage dans cette étape (un nouvel essai depuis le début recommence l'histoire). Une republication d'avant
// le journal retombe sur les horodatages déjà écrits (created_at, republish_snapshot.captured_at, deleted_at,
// recreated_at / published_at) ; « Prise » n'existe qu'avec le journal (processing_since ne garde que le dernier essai).
const ETAPES_HEURES = [
  { cle: "file", fr: "En file", en: "Queued" },
  { cle: "prise", fr: "Prise", en: "Started" },
  { cle: "captured", fr: "Copie faite", en: "Copy saved" },
  { cle: "deleted", fr: "Ancienne retirée", en: "Old one removed" },
  { cle: "recreated", fr: "De retour en ligne", en: "Back online" },
];
const ORDRE_ETAPE = { a_capturer: 0, captured: 1, deleted: 2, recreated: 3 };

/**
 * Les heures des étapes franchies par une republication (pure) : [{ cle, libelle, le (ms), heure (« 21:04 », « hier
 * 23:58 »…) }], dans l'ordre des étapes ; [] pour une publication ou un retrait.
 */
export function heuresEtapes(job, opts = {}) {
  if (job?.action !== "republish") return [];
  const lang = opts.lang === "en" ? "en" : "fr";
  const maintenant = opts.maintenant ?? Date.now();
  const pf = pfDe(job);
  const step = etapeRepublication(job);
  const t = {};
  const journal = Array.isArray(pf.journal_etapes) ? pf.journal_etapes.filter((e) => e && typeof e === "object") : [];
  if (journal.length) {
    // Le dernier passage dans chaque étape ; une remise à « a_capturer » recommence l'histoire.
    let avant = null;
    for (const e of journal) {
      const le = depuisPlausible(e.le, maintenant);
      if (!Number.isFinite(le)) continue;
      const etape = String(e.etape ?? "a_capturer");
      if (etape !== avant) {
        if (etape === "a_capturer") { delete t.prise; delete t.captured; delete t.deleted; delete t.recreated; t.file = le; }
        else if (etape in ORDRE_ETAPE) t[etape] = le;
      }
      if (etape === "a_capturer" && e.statut === "processing" && !Number.isFinite(t.prise)) t.prise = le;
      avant = etape;
    }
  }
  t.file ??= depuisPlausible(job?.created_at, maintenant);
  const ordre = ORDRE_ETAPE[step] ?? 0;
  if (ordre >= 1) t.captured ??= depuisPlausible(pf.republish_snapshot?.captured_at, maintenant);
  if (ordre >= 2) t.deleted ??= depuisPlausible(pf.deleted_at, maintenant);
  if (ordre >= 3) t.recreated ??= depuisPlausible(pf.recreated_at, maintenant) ?? depuisPlausible(job?.published_at, maintenant);
  // Une étape que la republication n'a pas (encore) atteinte n'a pas d'heure, même notée par un essai précédent.
  for (const k of ["captured", "deleted", "recreated"]) if (ORDRE_ETAPE[k] > ordre) delete t[k];
  return ETAPES_HEURES
    .filter((e) => Number.isFinite(t[e.cle]))
    .map((e) => ({ cle: e.cle, libelle: e[lang], le: t[e.cle], heure: depuisQuand(t[e.cle], maintenant, lang) }));
}

/** Une ligne lisible : « En file 20:58 · Prise 21:01 · Copie faite 21:02 » ; "" s'il n'y a rien à dire. */
export function phraseHeuresEtapes(job, opts = {}) {
  const h = heuresEtapes(job, opts);
  return h.length >= 2 ? h.map((x) => `${x.libelle} ${x.heure}`).join(" · ") : "";
}

// Prix lisible quand la fiche en porte un (jamais « 0 € » pour un prix vide).
// (07/11) En anglais, format anglais (« €24.99 ») ; le français inchangé (« 24,99 € »).
function prixLisible(item, formaterPrix, lang = "fr") {
  const n = Number(item?.sell ?? item?.prix_vente);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (formaterPrix) return formaterPrix(n);
  try { return new Intl.NumberFormat(lang === "en" ? LOCALE_MONTANT_ANGLAIS : "fr-FR", { style: "currency", currency: "EUR" }).format(n); } catch { return lang === "en" ? `€${n}` : `${n} €`; }
}

/** La carte d'identité d'un article pour une barre : photo, titre, prix · action. */
export function articleDeJob(job, item, { lang = "fr", formaterPrix = null, action = null } = {}) {
  const fr = lang !== "en";
  const titre = (item?.title ?? item?.titre ?? job?.title ?? "").trim() || (fr ? "Ton article" : "Your item");
  const prix = prixLisible(item, formaterPrix, lang);
  const quoi = action ?? libelleAction(job, lang);
  return {
    photo: item ? (urlsPhotos(item.photos)[0] ?? null) : null,
    titre,
    sousTitre: [prix, quoi].filter(Boolean).join(" · "),
  };
}

