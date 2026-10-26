// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN JOB, UNE SEULE FOIS, POUR TOUS LES ÉCRANS (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : l'app (file, barres, pastilles, modales, suivi de publication, lot),
// l'extension (popup) et le serveur (messages) décidaient chacun, à leur façon,
// ce qu'un job « est » — cinq calculs de la nature d'un needs_user, cinq mots
// pour un pending (« En attente », « En file », « Dans la file… », « En
// attente de son tour », « En file d'attente »), et des heures promises qui ne
// se tenaient pas. Nico, 15/10 : « ça fait fuir ».
//
// DEPUIS : CE module tranche, et les écrans ne font qu'afficher. SIX mots,
// les mêmes partout (app, extension, mails) :
//   · En file         — ça partira tout seul, à son tour ;
//   · En cours        — l'ordinateur ou nos serveurs y travaillent maintenant
//                       (une annonce retirée et pas encore remise en ligne aussi) ;
//   · Fait            — publiée, republiée, retirée ;
//   · À toi de jouer  — une question, une connexion, une autorisation, ou une
//                       publication qui n'est pas partie et attend ta relance ;
//   · En pause        — retenu pour une raison dite en une ligne : limite du
//                       jour, créneau, boutique à ouvrir, relevé attendu, plateforme
//                       en pause chez nous, nouvel essai automatique, ordinateur
//                       éteint, mise à jour de l'extension… Ça repart seul ;
//   · Arrêtée         — annulée (à ta demande, vendue, doublon) : rien à faire.
// ⛔ AUCUNE HEURE, AUCUNE DURÉE, AUCUN COMPTE À REBOURS : ni ici, ni dans un
//    texte qu'un écran affiche. `sansEstimation` nettoie ce qui en porte encore.
// Chaque statut technique (status × needs_user_source × platform_fields) va
// vers UN seul état ; `motif` dit pourquoi, pour que l'écran choisisse sa phrase.
// L'extension embarque une copie BUNDLÉE de ce module
// (chrome-extension/etat-job.js, générée par scripts/gen-etat-job-extension.mjs,
// vérifiée par selftest:etat-job) : jamais une recopie à la main.
// Preuve : scripts/etat-job-selftest.mjs.
import { attenteBoutiqueLevable } from "./attente-autre-boutique.js";
import { retenueServeurDuJob, RETENUE_BOUTIQUE_INCONNUE } from "../../../src/utils/retenueServeur.js";
import { estArretUtilisateur, estGeleLivres } from "../../../src/utils/publicationState.js";

export const ETATS = Object.freeze({
  EN_FILE: "en_file",
  EN_COURS: "en_cours",
  FAIT: "fait",
  A_TOI: "a_toi",
  EN_PAUSE: "en_pause",
  ARRETEE: "arretee",
});

// Les mots, et rien d'autre. Un écran qui a besoin d'un mot d'état le prend ICI.
export const LIBELLES = Object.freeze({
  fr: Object.freeze({ en_file: "En file", en_cours: "En cours", fait: "Fait", a_toi: "À toi de jouer", en_pause: "En pause", arretee: "Arrêtée" }),
  en: Object.freeze({ en_file: "Queued", en_cours: "In progress", fait: "Done", a_toi: "Your move", en_pause: "Paused", arretee: "Stopped" }),
});
export function libelleEtat(etat, lang = "fr") {
  const t = LIBELLES[lang === "en" ? "en" : "fr"];
  return t[etat] ?? t.en_file;
}

// Le ton d'un état (la règle des couleurs de l'app) : ok (teal) · regler (ambre)
// · echec (rouge, réservé à une publication qui n'est PAS partie) · neutre (gris).
export function tonEtat(etat, motif = null) {
  if (etat === ETATS.FAIT) return "ok";
  if (etat === ETATS.A_TOI) return motif === "pas_partie" ? "echec" : "regler";
  return "neutre";
}

// Statuts qui ne bougeront plus.
export const STATUTS_FINIS = Object.freeze(["published", "sold", "failed", "cancelled", "dry_run_completed", "deleted"]);

// Un needs_user n'est « à toi de jouer » que s'il attend la PERSONNE. Ces
// sources-là repartent seules (handler-watch, relevé, serveur) ou ne demandent
// rien : elles sont « en pause », avec leur raison.
export const SOURCES_AUTOMATIQUES = Object.freeze({
  introuvable_a_confirmer: "releve",
  ebay_site_etranger: "ebay_etranger",
  plateforme_ecartee: "ecartee",
  build_min_requis: "mise_a_jour",
  // (26/10 nuit, point 5) Leboncoin a refusé le texte à la modération : FillSell adapte la copie Leboncoin.
  lbc_moderation: "lbc_moderation",
});

// Les motifs TECHNIQUES d'une republication mise en pause avant tout retrait :
// la reprise sur preuve de handler-watch les relance seule — même liste
// qu'au serveur (handler-watch, reprise sur preuve).
// (18/10, lot 3) LA SIGNATURE UNIQUE D'UNE COUPURE TECHNIQUE (canal, onglet,
// réseau) : rien n'a bougé chez la plateforme. Une seule source pour le serveur
// (pas-de-rouge.js la réexporte, handler-watch l'importe) et l'écran.
export const CANAL_RE =
  /Could not establish connection|Receiving end does not exist|The message port closed|message channel closed|A listener indicated an asynchronous response|No tab with id|Onglet de travail ferm|onglet navigué\/rechargé|pas de réponse du content script|le content script ne répond pas|sonde injoignable|onglet de travail Vinted\s*:|Timeout\s*:|Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|L'opération n'a pas pu aboutir sur ton ordinateur|mise en veille par Chrome/i;
export const MOTIF_TECHNIQUE_RE = /protection anti-?robot|v[ée]rification anti-?robot|bot_shield|DataDome|Connexion (Vinted|Leboncoin|Beebs|eBay|Depop|Opla) requise|configuration non capt[ée]e|lecture de l'annonce (re|a [ée]t[ée] )?(fus[ée]e|bloqu[ée]e)|bloqu[ée] notre lecture/i;
/** (18/10, lot 3) Un texte (message affiché OU brut de l'extension) qui ne dit qu'une coupure ou un mur technique. */
export function texteTechnique(texte) {
  const t = String(texte ?? "");
  if (!t) return false;
  const reste = t.replace(MOTIF_TECHNIQUE_RE, "").replace(CANAL_RE, "");
  return (MOTIF_TECHNIQUE_RE.test(t) || CANAL_RE.test(t)) && !MOTIF_PERSONNE_RE.test(reste);
}
/** Le brut technique d'un job (platform_fields.error_technique), s'il y en a un. */
export const brutTechnique = (pf) => {
  const et = pf?.error_technique;
  return typeof et === "string" ? et : String(et?.brut ?? "");
};
export const MOTIF_PERSONNE_RE = /champ|Marque|taille|rayon|cat[ée]gorie|interdit|payant|Boostez|option gratuite|nom et (ton )?pr[ée]nom|configuration de vendeur|exige|passe la v[ée]rification|connecte-toi/i;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pfDe = (j) => objet(j?.platform_fields);
export const etapeRepublication = (j) => {
  const s = pfDe(j).republish_step;
  return ["a_capturer", "captured", "deleted", "recreated"].includes(s) ? s : "a_capturer";
};
export const parNosServeurs = (j) => j?.voie === "api";

// « En attente de ta connexion à … » : le job bute sur une session fermée.
export const attendConnexion = (j) => j?.status === "pending"
  && Boolean(pfDe(j).attente_session)
  && /^En attente de ta connexion à /i.test(String(j?.error ?? ""));

/** Une attente AUTOMATIQUE d'un needs_user (en pause), ou null (à toi de jouer). */
export function attenteAutomatique(j) {
  if (j?.status !== "needs_user") return null;
  const pf = pfDe(j);
  const src = String(pf.needs_user_source ?? "");
  if (SOURCES_AUTOMATIQUES[src]) return SOURCES_AUTOMATIQUES[src];
  if (src === "boutique_etrangere" && attenteBoutiqueLevable(pf.boutique_etrangere)) return "boutique";
  if (j.action === "republish" && ["", "a_capturer", "captured"].includes(String(pf.republish_step ?? ""))
      && !pf.deleted_at && (src === "relancer" || src === "")) {
    if (pf.republish_etat_indetermine && typeof pf.republish_etat_indetermine === "object") return "technique";
    // (18/10, lot 3) Le message affiché OU le brut de l'extension : une coupure
    // (onglet qui ne répond pas, réseau) repart seule, comme un mur technique.
    if (texteTechnique(j.error) || texteTechnique(brutTechnique(pf))) return "technique";
  }
  return null;
}

// Inconnue ≠ absente : on ne dit « ordinateur éteint » que sur une absence CONSTATÉE.
const extensionFraiche = (ext) => !ext || !["eteinte", "inactive", "session_expiree"].includes(ext.etat);

// ── La boutique Vinted d'un job (multi-boutiques) ───────────────────────────
// ctx.boutiques = { connectee: {userId, login, fraiche}|null, liste: [{user_id, login}],
// origines: Map(inventaire_id → vinted_account_id) }.
const origineDe = (j, b) => {
  const o = b?.origines instanceof Map ? b.origines.get(String(j?.inventaire_id)) : b?.origines?.[String(j?.inventaire_id)];
  return o == null ? "" : String(o).trim();
};
export const loginDe = (id, b) => {
  const x = (b?.liste ?? []).find((y) => String(y?.user_id ?? "") === String(id));
  return x?.login ? String(x.login) : null;
};
/** La boutique qu'attend un job retenu par la garde du serveur, sinon null. */
export function boutiqueAttendue(j, b) {
  if (!b?.connectee?.userId || b.connectee.fraiche === false) return null;
  if (j?.platform !== "vinted" || !["republish", "delete"].includes(j?.action) || j?.inventaire_id == null) return null;
  const o = origineDe(j, b);
  if (!o || o === String(b.connectee.userId).trim()) return null;
  return { userId: o, login: loginDe(o, b) };
}
/** La boutique d'un job Vinted, pour l'étiquette « @login » — à partir de deux boutiques. */
export function boutiqueDuJob(j, b) {
  if (j?.platform !== "vinted" || (b?.liste?.length ?? 0) < 2) return null;
  const o = origineDe(j, b) || String(pfDe(j).vinted_account_id ?? "").trim();
  const login = o ? loginDe(o, b) : null;
  return login ? { userId: o, login } : null;
}

/** Un job qui ne bougera plus (fini, arrêté). */
export function jobFini(j) {
  if (!j) return true;
  if (STATUTS_FINIS.includes(j.status)) return true;
  if (j.action === "republish" && etapeRepublication(j) === "recreated") return true;
  if (estArretUtilisateur(j)) return true;
  return !["pending", "processing", "needs_user"].includes(j.status);
}

/**
 * L'état d'UN job, et son motif.
 * ctx (tout optionnel) = { maintenant, extension: {etat}|null, plateformesEnPause: Set,
 *   plafond: {retenue, motif}|null, creneaux: {pf: {actif, dans_creneau}}|null,
 *   oplaAAutoriser: bool, boutiques, extensionAMettreAJour: bool }
 * → { etat, motif, detail? }   detail : { login } (boutique), { boutiques } (à ouvrir), { champ }
 */
export function etatJob(j, ctx = {}) {
  if (!j) return { etat: ETATS.ARRETEE, motif: "arretee" };
  const pf = pfDe(j);
  const etape = j.action === "republish" ? etapeRepublication(j) : null;
  const st = j.status;

  // ── Finis ──
  if (st === "cancelled" || estArretUtilisateur(j)) return { etat: ETATS.ARRETEE, motif: "arretee" };
  if (st === "failed") return { etat: ETATS.A_TOI, motif: "pas_partie" };
  if (j.action === "delete" && st === "deleted") return { etat: ETATS.FAIT, motif: "retiree" };
  if (st === "published" || st === "sold" || st === "dry_run_completed" || st === "deleted") return { etat: ETATS.FAIT, motif: st === "sold" ? "vendue" : "publiee" };
  if (j.action === "republish" && etape === "recreated") return { etat: ETATS.FAIT, motif: "republiee" };

  // ── needs_user : à toi de jouer, sauf attente automatique ──
  if (st === "needs_user") {
    const auto = attenteAutomatique(j);
    if (auto === "boutique") {
      const g = objet(pf.boutique_etrangere);
      return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: g.login_article ? String(g.login_article) : loginDe(g.article, ctx.boutiques) } };
    }
    if (auto) return { etat: ETATS.EN_PAUSE, motif: auto };
    const src = String(pf.needs_user_source ?? "");
    if (src === "opla_acces") return { etat: ETATS.A_TOI, motif: "opla" };
    if (src === "depop_acces") return { etat: ETATS.A_TOI, motif: "depop" };
    if (src === "connexion" || src === "session_vinted" || src === "ebay_connexion_requise" || src === "ebay_compte_chrome" || src === "verification_antirobot") return { etat: ETATS.A_TOI, motif: "connexion" };
    return { etat: ETATS.A_TOI, motif: "geste" };
  }
  if (attendConnexion(j)) return { etat: ETATS.A_TOI, motif: "connexion" };
  if (st === "pending" && j.platform === "opla" && ctx.oplaAAutoriser) return { etat: ETATS.A_TOI, motif: "opla" };

  // (03/10, point 16) Retenu par la garde de boutique du SERVEUR, à toute
  // étape (une remise en ligne se fait sur la boutique d'origine) : c'est la
  // boutique qui manque — on dit laquelle ouvrir.
  if (st === "pending") {
    const attendue = boutiqueAttendue(j, ctx.boutiques);
    if (attendue) return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: attendue.login } };
  }

  // ── Hors ligne entre retrait et remise en ligne : en cours, toujours ──
  if (etape === "deleted") return { etat: ETATS.EN_COURS, motif: "remise_en_ligne" };
  if (st === "processing") return { etat: ETATS.EN_COURS, motif: parNosServeurs(j) ? "serveurs" : "ordinateur" };

  // ── pending : ce qui le RETIENT, sinon la file ──
  if (st === "pending") {
    // (22/10 soir, point 6) La file mise en pause par la personne : publications et republications pas encore
    // commencées attendent la reprise (un retrait n'est jamais en pause ; une republication retirée est plus haut).
    if (ctx.filePause && (j.action === "publish" || j.action === "republish")
        && !(pf.deleted_at || pf.republish_suppression_envoyee)) return { etat: ETATS.EN_PAUSE, motif: "file_en_pause" };
    // (22/10 soir, point 8) Fiche importée : la publication attend la lecture de l'annonce d'origine (texte, photos,
    // état du vendeur) — elle avance, ce n'est jamais une erreur.
    if (pf.attente_lecture_origine && typeof pf.attente_lecture_origine === "object") {
      return { etat: ETATS.EN_FILE, motif: "lecture_origine", detail: { plateforme: String(pf.attente_lecture_origine.plateforme ?? "") } };
    }
    if (ctx.extensionAMettreAJour && !parNosServeurs(j)) return { etat: ETATS.EN_PAUSE, motif: "mise_a_jour" };
    if (estGeleLivres(j)) return { etat: ETATS.EN_PAUSE, motif: "gel" };
    const retenue = retenueServeurDuJob(j);
    if (retenue?.motif === RETENUE_BOUTIQUE_INCONNUE) return { etat: ETATS.EN_PAUSE, motif: "boutiques_a_ouvrir", detail: { boutiques: retenue.boutiques ?? [] } };
    if (retenue) return { etat: ETATS.EN_PAUSE, motif: "retenue_serveur" };
    // (17/10) Republication dont la marque de l'annonce ne partira que par son
    // identifiant, envoi direct pas encore prouvé (pause_marque_par_id, posé
    // par l'extension AVANT tout retrait) : annonce intacte, ça repart seul —
    // jamais « à toi de jouer », jamais une durée.
    if (j.action === "republish" && etape !== "deleted" && pf.pause_marque_par_id && typeof pf.pause_marque_par_id === "object") {
      return { etat: ETATS.EN_PAUSE, motif: "retenue_serveur" };
    }
    const boutique = objet(pf.attente_boutique);
    if (boutique.login || pf.attente_boutique === true) return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: boutique.login ?? null } };
    if (j.action === "republish") {
      const pl = ctx.plafond;
      if (pl?.retenue) return { etat: ETATS.EN_PAUSE, motif: pl.motif === "pause" ? "rythme" : "limite_jour" };
      const cr = pf.republish_source === "auto" ? ctx.creneaux?.[j.platform] : null;
      if (cr && cr.actif === false) return { etat: ETATS.EN_PAUSE, motif: "auto_en_pause" };
      if (cr && cr.dans_creneau === false) return { etat: ETATS.EN_PAUSE, motif: "creneau" };
    }
    if (ctx.plateformesEnPause?.has?.(j.platform)) return { etat: ETATS.EN_PAUSE, motif: "plateforme" };
    const naa = Date.parse(pf.next_action_after ?? "");
    const maintenant = ctx.maintenant ?? Date.now();
    if ((Number.isFinite(naa) && naa > maintenant) || (j.error && String(j.error).trim())) return { etat: ETATS.EN_PAUSE, motif: "essai" };
    if (parNosServeurs(j)) return { etat: ETATS.EN_FILE, motif: "serveurs" };
    if (!extensionFraiche(ctx.extension)) {
      return { etat: ETATS.EN_PAUSE, motif: ctx.extension?.etat === "session_expiree" ? "ordinateur_session" : "ordinateur" };
    }
    return { etat: ETATS.EN_FILE, motif: "tour" };
  }
  return { etat: ETATS.ARRETEE, motif: "arretee" };
}

// ── AUCUNE ESTIMATION DE TEMPS (15/10 soir, Nico) ─────────────────────────
// Les textes du serveur et de l'extension ont longtemps promis une heure ou
// une durée (« Reprise automatique dans ~6 min », « vers 17:36 », « toutes
// les heures », « 2 min au plus ») : la phrase qui en porte une est retirée
// avant tout affichage — l'état reste.
const ESTIMATION_RE = /\b(dans|d'ici|sous|en|avant|après) (environ |à peu près |moins d'|moins de |un |une |deux |trois |quelques |plusieurs |~\s*)?\d*\s*(-\s*\d+\s*)?(s|sec|secondes?|min|minutes?|h|heures?|quarts? d'heure|demi-heure|jours?)\b|~\s*\d|\bvers \d{1,2}\s*[:h]\s*\d{2}|\b(in|within|around|after) (about )?~?\d+\s*(s|sec|seconds?|min|minutes?|h|hours?|days?)\b|\bà \d{1,2}[:h]\d{2}\b|\bat \d{1,2}:\d{2}\b|\btoutes les (heures|\d+ (minutes|min|heures|h))\b|\bevery (hour|\d+ (minutes|min|hours))\b|\bprochain(e)? (essai|passage|tentative|recr[ée]ation) (vers|dans|à|le) \S+/i;
export function sansEstimation(texte) {
  const t = String(texte ?? "").trim();
  if (!t || !ESTIMATION_RE.test(t)) return t;
  const phrases = t.split(/(?<=[.!?…])\s+/);
  const gardees = phrases.filter((p) => !ESTIMATION_RE.test(p));
  if (gardees.length) return gardees.join(" ");
  // Une seule phrase : on la coupe avant l'estimation — et avant le mot qui
  // l'annonçait (« dans », « vers »…), pour ne pas laisser une phrase en l'air.
  const m = t.match(ESTIMATION_RE);
  const avant = t.slice(0, m.index).replace(/[\s,:;(—–-]+$/, "").replace(/\s+(dans|d'ici|vers|sous|en|avant|après|depuis|in|within|at|after)$/i, "").trim();
  return avant ? avant + "." : "";
}
export const porteUneEstimation = (texte) => ESTIMATION_RE.test(String(texte ?? ""));
