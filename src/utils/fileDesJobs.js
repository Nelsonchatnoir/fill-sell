// ═══════════════════════════════════════════════════════════════════════════
// LA FILE DES JOBS — ce qui tourne, ce qui vient, ce qui attend et pourquoi
// (chantier clarté, 01/10/2026 ; une seule vérité sur l'état, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Calcul PUR (aucun DOM, aucune requête) : à partir des jobs de la personne et
// de ce qu'on SAIT de son poste et du serveur, range chaque job vivant dans
// un groupe et dit, en mots simples, POURQUOI il attend.
//
// ⛔ L'ÉTAT N'EST PLUS DÉCIDÉ ICI (16/10) : `etatJob` (_shared/etat-job.js)
//    tranche, une fois, pour l'app, l'extension et le serveur — six mots : En
//    file · En cours · Fait · À toi de jouer · En pause · Arrêtée. Ce fichier
//    ne fait que choisir la PHRASE qui va avec le motif, et ranger la file.
//   · en_cours — l'ordinateur (ou nos serveurs) y travaille maintenant ; une
//     republication hors ligne en attente de sa remise en ligne en fait partie ;
//   · en_file  — partira à son tour, DANS L'ORDRE RÉEL de départ ;
//   · en_pause — retenu (rythme de republication, créneau, nouvel essai espacé,
//     « ton annonce est intacte », plateforme en pause de notre côté, ordinateur
//     éteint, mise à jour de l'extension) ;
//   · a_toi    — attend la personne (question, connexion, autorisation).
// Les jobs finis (publiés, retirés, remis en ligne, arrêtés, annulés,
// échoués) n'y entrent pas.
//
// L'ORDRE DE DÉPART est celui de l'extension (background.js, tri stable après
// le created_at croissant du serveur) : la republication hors ligne qui attend
// sa remise en ligne d'abord, puis publications et retraits, puis les autres
// republications, puis les remises en ligne qui ont déjà buté trois fois.
// ⛔ (15/10 soir, Nico) AUCUNE ESTIMATION DE TEMPS DANS LA FILE — « ça fait
// fuir » : ni « remise en ligne vers 17:36 », ni « nouvel essai à… », ni
// « ~15-21 min ». On montre l'ÉTAT, jamais une durée ni une heure à venir.
// (16/10) Plus aucune heure, même pour ranger : la file est dans l'ordre de départ.
// ⛔ LECTURE SEULE : rien ici n'écrit, ne relance ni n'annule un job.
// Preuve : scripts/file-des-jobs-selftest.mjs, scripts/etat-job-selftest.mjs.

import {
  ETATS, LIBELLES, libelleEtat, etatJob, jobFini, etapeRepublication, parNosServeurs, attendConnexion,
  attenteAutomatique, boutiqueAttendue, boutiqueDuJob, sansEstimation,
} from "../../supabase/functions/_shared/etat-job.js";
import { phraseMiseAJourExtension } from "./extensionAJour.js";

export { ETATS, LIBELLES, libelleEtat, etatJob, etapeRepublication, parNosServeurs, attendConnexion, attenteAutomatique, boutiqueAttendue, boutiqueDuJob, sansEstimation };

export const PLATEFORMES_NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };
export const nomPlateforme = (p) => PLATEFORMES_NOM[p] ?? (p ? String(p) : "");

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pfDe = (j) => objet(j?.platform_fields);

export const jobVivant = (j) => !jobFini(j);

// ── L'heure, en heure de Paris — pour DIRE DEPUIS QUAND, jamais à quelle heure ──
const jourParis = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const hhmmParis = (ts) => new Date(ts).toLocaleTimeString("en-GB", {
  timeZone: "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit",
});
/** « 10:12 » (aujourd'hui), « hier 22:40 », « le 29 sept. » — heure de Paris, toujours PASSÉE. */
export function depuisQuand(t, maintenant, lang = "fr") {
  const fr = lang !== "en";
  if (jourParis(t) === jourParis(maintenant)) return hhmmParis(t);
  if (jourParis(t) === jourParis(maintenant - 86400000)) return fr ? `hier ${hhmmParis(t)}` : `yesterday ${hhmmParis(t)}`;
  const date = new Date(t).toLocaleDateString(fr ? "fr-FR" : "en-GB", { timeZone: "Europe/Paris", day: "numeric", month: "short" });
  return fr ? `le ${date}` : date;
}

// Rang de départ, la règle de l'extension (background.js, « tri des jobs »).
function rangDepart(j) {
  if (j.action === "republish" && etapeRepublication(j) === "deleted") {
    return (Number(pfDe(j).deleted_hang_count) || 0) >= 3 ? 3 : 0;
  }
  if (j.action === "publish" || j.action === "delete") return 1;
  return 2;
}
const tsDe = (v) => { const t = Date.parse(v ?? ""); return Number.isFinite(t) ? t : 0; };
export function comparerDepart(a, b) {
  const ra = rangDepart(a), rb = rangDepart(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return tsDe(pfDe(a).deleted_at) - tsDe(pfDe(b).deleted_at) || tsDe(a.created_at) - tsDe(b.created_at);
  return tsDe(a.created_at) - tsDe(b.created_at);
}

// Les phrases, par motif. Jamais une heure, jamais une durée. Chaque job repart
// À SON TOUR. (24/10, décision de Nico) Plus de limite par jour : « limite_jour »
// n'arrive plus du serveur ; s'il arrivait encore, il dit la même pause.
const TEXTE = {
  fr: {
    tour: "En file : elle partira à son tour",
    serveurs: "En file : part de nos serveurs à son tour",
    ordinateur: "En pause : ton ordinateur est éteint ou Chrome fermé — ouvre Chrome avec l'extension, ça repart tout seul",
    ordinateur_session: "En pause : l'extension doit se reconnecter à ton compte — ouvre fillsell.app dans Chrome, ça repart tout seul",
    retenue_serveur: "En pause, ton annonce est intacte : elle repart toute seule",
    gel: "En pause : elle repart toute seule",
    rythme: "En pause (rythme de republication) : elle repart toute seule",
    limite_jour: "En pause (rythme de republication) : elle repart toute seule",
    creneau: "En pause (créneau de republication) : elle repart toute seule au prochain créneau",
    auto_en_pause: "Republication automatique en pause : elle repartira quand tu la relanceras. Ton annonce est intacte",
    file_en_pause: "Ta file est en pause : elle partira quand tu la reprendras",
    programmee: "Programmée : elle partira dans ton créneau, une à la fois",
    essai: "En pause : nouvel essai automatique, rien à faire",
    plateforme: (p) => `En pause : ${p} est en pause de notre côté — reprise automatique`,
    boutique: (login) => (login
      ? `En pause : ouvre ta boutique @${login} sur vinted.fr dans Chrome, ça repartira tout seul`
      : "En pause : ouvre ton autre boutique Vinted sur vinted.fr dans Chrome, ça repartira tout seul"),
    boutiques_a_ouvrir: (liste) => (liste?.length
      ? `En pause : ouvre ${liste.join(" puis ")} sur vinted.fr dans Chrome — FillSell y cherchera l'annonce, ça repartira tout seul`
      : "En pause : ouvre sur vinted.fr, dans Chrome, la boutique qui porte cette annonce — ça repartira tout seul"),
    mise_a_jour: phraseMiseAJourExtension("fr"),
    geste: "À toi de jouer : une question t'attend",
    pas_partie: "À toi de jouer : elle n'est pas partie, relance-la",
    connexion: (p) => `À toi de jouer : connecte-toi à ${p} sur ton ordinateur`,
    opla: "À toi de jouer : autorise Opla dans l'extension — l'annonce partira toute seule ensuite",
    depop: "À toi de jouer : autorise Depop dans l'extension — l'annonce partira toute seule ensuite",
    remise_en_ligne: "En cours : hors ligne le temps de la remise en ligne",
    remise_en_ligne_depuis: (d) => `En cours : hors ligne depuis ${d}, remise en ligne dès que possible`,
    releve: (p) => `En pause, rien n'a été retiré : FillSell attend le prochain relevé de ${p} pour savoir si l'annonce est toujours en ligne`,
    technique: (p) => `En pause avant tout retrait, ton annonce est intacte : elle repart toute seule dès que ${p} répond à nouveau`,
    ebay_etranger: "En pause : ton compte eBay est inscrit sur un autre site qu'ebay.fr, FillSell n'y publie pas — rien n'a été envoyé",
    lbc_moderation: "En pause — FillSell s'en occupe : Leboncoin a refusé ce texte à la modération, l'équipe adapte la copie Leboncoin (ta fiche ne change pas)",
    ecartee: (p) => `En pause : tu as indiqué ne pas vendre sur ${p}, rien n'est envoyé`,
    en_cours_ordinateur: "En cours sur ton ordinateur",
    en_cours_serveurs: "En cours sur nos serveurs",
  },
  en: {
    tour: "Queued: it goes out in turn",
    serveurs: "Queued: goes out from our servers in turn",
    ordinateur: "Paused: your computer is off or Chrome closed — open Chrome with the extension, it resumes on its own",
    ordinateur_session: "Paused: the extension must reconnect to your account — open fillsell.app in Chrome, it resumes on its own",
    retenue_serveur: "Paused, your listing is untouched: it resumes on its own",
    gel: "Paused: it resumes on its own",
    rythme: "Paused (repost pacing): it resumes on its own",
    limite_jour: "Paused (repost pacing): it resumes on its own",
    creneau: "Paused (repost time slot): it resumes on its own at the next slot",
    auto_en_pause: "Automatic reposting is paused: it resumes when you restart it. Your listing is untouched",
    file_en_pause: "Your queue is paused: it goes out when you resume it",
    programmee: "Scheduled: it goes out in your time slot, one at a time",
    essai: "Paused: automatic retry, nothing to do",
    plateforme: (p) => `Paused: ${p} is paused on our side — resumes automatically`,
    boutique: (login) => (login
      ? `Paused: open your @${login} shop on vinted.fr in Chrome, it resumes on its own`
      : "Paused: open your other Vinted shop on vinted.fr in Chrome, it resumes on its own"),
    boutiques_a_ouvrir: (liste) => (liste?.length
      ? `Paused: open ${liste.join(" then ")} on vinted.fr in Chrome — FillSell will look for the listing, it resumes on its own`
      : "Paused: open, on vinted.fr in Chrome, the shop that holds this listing — it resumes on its own"),
    mise_a_jour: phraseMiseAJourExtension("en"),
    geste: "Your move: a question is waiting for you",
    pas_partie: "Your move: it didn't go out, relaunch it",
    connexion: (p) => `Your move: sign in to ${p} on your computer`,
    opla: "Your move: allow Opla in the extension — the listing then goes out on its own",
    depop: "Your move: allow Depop in the extension — the listing then goes out on its own",
    remise_en_ligne: "In progress: offline while it goes back online",
    remise_en_ligne_depuis: (d) => `In progress: offline since ${d}, back online as soon as possible`,
    releve: (p) => `Paused, nothing removed: FillSell waits for the next ${p} reading to know whether the listing is still online`,
    technique: (p) => `Paused before any removal, your listing is untouched: it resumes on its own as soon as ${p} answers again`,
    ebay_etranger: "Paused: your eBay account is registered on another site than ebay.fr, FillSell does not list there — nothing was sent",
    lbc_moderation: "Paused — FillSell is on it: Leboncoin's moderation refused this text, the team adapts the Leboncoin copy (your item doesn't change)",
    ecartee: (p) => `Paused: you said you don't sell on ${p}, nothing is sent`,
    en_cours_ordinateur: "In progress on your computer",
    en_cours_serveurs: "In progress on our servers",
  },
};

// Le groupe de la file, dérivé de l'état — jamais décidé ici.
const GROUPE_DE = { en_cours: "en_cours", en_file: "en_file", en_pause: "en_pause", a_toi: "a_toi" };

/**
 * Où en est UN job vivant, et pourquoi.
 * ctx = { maintenant, lang, extension: {etat}|null, plateformesEnPause: Set,
 *         plafond: {retenue, reprise, motif}|null, creneaux: {pf: {dans_creneau, reprise}}|null,
 *         oplaAAutoriser: bool (verdict serveur « a_autoriser »),
 *         boutiques: { connectee, liste, origines } | null (multi-boutiques Vinted),
 *         extensionAMettreAJour: bool (poste sous le seuil de version, utils/extensionAJour) }
 * → { etat, groupe: 'en_cours'|'en_file'|'en_pause'|'a_toi', raison, heure: null, motif }
 */
export function situationJob(j, ctx = {}) {
  const maintenant = ctx.maintenant ?? Date.now();
  const lang = ctx.lang === "en" ? "en" : "fr";
  const T = TEXTE[lang];
  const nom = nomPlateforme(j.platform);
  const v = etatJob(j, { ...ctx, maintenant });
  const groupe = GROUPE_DE[v.etat] ?? "en_pause";
  let raison;
  switch (v.motif) {
    case "boutique": raison = T.boutique(v.detail?.login ?? null); break;
    case "boutiques_a_ouvrir": raison = T.boutiques_a_ouvrir(v.detail?.boutiques ?? []); break;
    case "plateforme": raison = T.plateforme(nom); break;
    case "connexion": raison = T.connexion(nom); break;
    case "releve": raison = T.releve(nom); break;
    case "technique": raison = T.technique(nom); break;
    case "ecartee": raison = T.ecartee(nom); break;
    case "remise_en_ligne": {
      // (03/10, point 23 — nivake03) Une annonce retirée depuis plus de 30 min dit DEPUIS QUAND.
      const pf = pfDe(j);
      const retireeLe = Date.parse(pf.deleted_at ?? pf.deleted_at_serveur ?? "");
      const longtemps = Number.isFinite(retireeLe) && maintenant - retireeLe > 30 * 60_000;
      raison = longtemps ? T.remise_en_ligne_depuis(depuisQuand(retireeLe, maintenant, lang)) : T.remise_en_ligne;
      break;
    }
    case "serveurs": raison = v.etat === ETATS.EN_COURS ? T.en_cours_serveurs : T.serveurs; break;
    // (22/10 soir, point 8) La plateforme d'ORIGINE (celle où le vendeur a écrit son annonce), pas celle du dépôt.
    case "lecture_origine": {
      const origine = nomPlateforme(v.detail?.plateforme) || (lang === "en" ? "original" : "d'origine");
      raison = lang === "en"
        ? `Reading your original ${origine} listing (text, photos, condition): it goes out with YOUR content as soon as the FillSell extension on your computer has read it`
        : `En cours de lecture de ton annonce d'origine ${origine} (texte, photos, état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue`;
      break;
    }
    case "ordinateur": raison = v.etat === ETATS.EN_COURS ? T.en_cours_ordinateur : T.ordinateur; break;
    default: {
      const t = T[v.motif];
      raison = typeof t === "function" ? t(nom) : (t ?? libelleEtat(v.etat, lang));
    }
  }
  return { etat: v.etat, groupe, raison, heure: null, motif: v.motif, detail: v.detail ?? null };
}

/**
 * La file complète, rangée.
 * jobs : tous les jobs connus (n'importe quel ordre, les finis sont écartés).
 * → { en_cours, en_file, en_pause, a_toi, compteurs: {enCoursOuEnFile, enPause, aToi}, total }
 *   chaque ligne : { job, situation }
 */
export function lireFile(jobs, ctx = {}) {
  const groupes = { en_cours: [], en_file: [], en_pause: [], a_toi: [] };
  for (const j of jobs ?? []) {
    if (!jobVivant(j)) continue;
    const situation = situationJob(j, ctx);
    groupes[situation.groupe].push({ job: j, situation });
  }
  const parDepart = (a, b) => comparerDepart(a.job, b.job);
  groupes.en_cours.sort((a, b) => (a.job.status === "processing" ? 0 : 1) - (b.job.status === "processing" ? 0 : 1) || parDepart(a, b));
  groupes.en_file.sort(parDepart);
  groupes.en_pause.sort(parDepart);
  groupes.a_toi.sort((a, b) => tsDe(b.job.created_at) - tsDe(a.job.created_at));
  const compteurs = {
    enCoursOuEnFile: groupes.en_cours.length + groupes.en_file.length,
    enPause: groupes.en_pause.length,
    aToi: groupes.a_toi.length,
  };
  return { ...groupes, compteurs, total: compteurs.enCoursOuEnFile + compteurs.enPause + compteurs.aToi };
}

/** « 3 en cours ou en file · 1 en pause · 1 à toi de jouer » — seulement ce qui existe. */
export function phraseCompteurs(c, lang = "fr") {
  const fr = lang !== "en";
  const parts = [];
  if (c.enCoursOuEnFile) parts.push(fr ? `${c.enCoursOuEnFile} en cours ou en file` : `${c.enCoursOuEnFile} in progress or queued`);
  if (c.enPause) parts.push(fr ? `${c.enPause} en pause` : `${c.enPause} paused`);
  if (c.aToi) parts.push(fr ? `${c.aToi} à toi de jouer` : `${c.aToi} your move`);
  if (!parts.length) return fr ? "Rien en cours ni en file" : "Nothing in progress or queued";
  return parts.join(" · ");
}

/** Le libellé de l'action : « Publication sur Vinted », « Retrait de Leboncoin »… */
export function libelleAction(j, lang = "fr", boutiques = null) {
  const fr = lang !== "en";
  const nom = nomPlateforme(j?.platform);
  // (03/10, point 16) À partir de deux boutiques Vinted : laquelle.
  const b = boutiqueDuJob(j, boutiques);
  const ou = b ? ` · @${b.login}` : "";
  if (j?.action === "republish") return (fr ? `Republication sur ${nom}` : `Repost on ${nom}`) + ou;
  if (j?.action === "delete") return (fr ? `Retrait de ${nom}` : `Removal from ${nom}`) + ou;
  return (fr ? `Publication sur ${nom}` : `Listing on ${nom}`) + ou;
}
