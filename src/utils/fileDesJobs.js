// ═══════════════════════════════════════════════════════════════════════════
// LA FILE DES JOBS — ce qui tourne, ce qui vient, ce qui attend et pourquoi
// (chantier clarté, 01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Calcul PUR (aucun DOM, aucune requête) : à partir des jobs de la personne et
// de ce qu'on SAIT de son poste et du serveur, range chaque job vivant dans
// un groupe et dit, en mots simples, POURQUOI il attend.
//
//   · en_cours — l'ordinateur (ou nos serveurs) y travaille maintenant ; une
//     republication hors ligne en attente de sa remise en ligne en fait partie ;
//   · a_venir  — partira à son tour, DANS L'ORDRE RÉEL de départ ;
//   · pause    — retenu jusqu'à une heure CONNUE (rythme ou limite du jour,
//     créneau, nouvel essai espacé), ou par le serveur (« ton annonce est
//     intacte »), ou par une plateforme en pause de notre côté ;
//   · geste    — attend la personne (question, connexion, autorisation).
// Les jobs finis (publiés, retirés, remis en ligne, arrêtés, annulés,
// échoués) n'y entrent pas.
//
// L'ORDRE DE DÉPART est celui de l'extension (background.js, tri stable après
// le created_at croissant du serveur) : la republication hors ligne qui attend
// sa remise en ligne d'abord, puis publications et retraits, puis les autres
// republications, puis les remises en ligne qui ont déjà buté trois fois.
// Une HEURE ne s'écrit que si elle est connue (colonne ou calcul du serveur) :
// jamais d'estimation inventée. Heure de Paris.
// ⛔ LECTURE SEULE : rien ici n'écrit, ne relance ni n'annule un job.
// Preuve : scripts/file-des-jobs-selftest.mjs.

import { retenueServeurDuJob } from "./retenueServeur.js";
import { estArretUtilisateur, estGeleLivres } from "./publicationState.js";

export const PLATEFORMES_NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla" };
export const nomPlateforme = (p) => PLATEFORMES_NOM[p] ?? (p ? String(p) : "");

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pfDe = (j) => objet(j?.platform_fields);
export const etapeRepublication = (j) => {
  const s = pfDe(j).republish_step;
  return ["a_capturer", "captured", "deleted", "recreated"].includes(s) ? s : "a_capturer";
};
export const parNosServeurs = (j) => j?.voie === "api";

// Statuts qui ne bougeront plus. `recreated` est l'étape finale d'une
// republication réussie (son statut peut rester 'processing').
const TERMINAUX = new Set(["published", "sold", "failed", "cancelled", "dry_run_completed", "deleted"]);
export function jobVivant(j) {
  if (!j || TERMINAUX.has(j.status)) return false;
  if (j.action === "republish" && etapeRepublication(j) === "recreated") return false;
  if (estArretUtilisateur(j)) return false;
  return ["pending", "processing", "needs_user"].includes(j.status);
}

// « En attente de ta connexion à … » : le job bute sur une session fermée —
// même lecture que la carte du Stock (attenteDeConnexion).
export const attendConnexion = (j) => j?.status === "pending"
  && Boolean(pfDe(j).attente_session)
  && /^En attente de ta connexion à /i.test(String(j?.error ?? ""));

// ── L'heure, en heure de Paris, seulement quand elle est connue ─────────────
const jourParis = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const hhmmParis = (ts) => new Date(ts).toLocaleTimeString("en-GB", {
  timeZone: "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit",
});
/** « 17:26 », « demain 08:00 », « le 3 oct. à 08:00 » — ou null (inconnue ou passée). */
export function heureConnue(iso, maintenant, lang = "fr") {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t) || t <= maintenant) return null;
  const fr = lang !== "en";
  const h = hhmmParis(t);
  const j = jourParis(t);
  if (j === jourParis(maintenant)) return h;
  if (j === jourParis(maintenant + 86400000)) return fr ? `demain ${h}` : `tomorrow ${h}`;
  const date = new Date(t).toLocaleDateString(fr ? "fr-FR" : "en-GB", { timeZone: "Europe/Paris", day: "numeric", month: "short" });
  return fr ? `le ${date} à ${h}` : `${date} at ${h}`;
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

const TEXTE = {
  fr: {
    tour: "En attente de son tour",
    serveurs: "Part de nos serveurs à son tour",
    ordinateur: "En attente de ton ordinateur — Chrome fermé ou extension pas vue",
    ordinateurSession: "En attente de ton ordinateur — l'extension doit se reconnecter à ton compte",
    intacte: "En attente, ton annonce est intacte",
    pauseJusqua: (h, pourquoi) => `En pause jusqu'à ${h}${pourquoi ? ` (${pourquoi})` : ""}`,
    pauseSansHeure: (pourquoi) => `En pause${pourquoi ? ` (${pourquoi})` : ""}`,
    limiteJour: "limite du jour",
    rythme: "rythme de republication",
    creneau: "créneau de republication",
    essaiA: (h) => `Nouvel essai à ${h}`,
    essaiBientot: "Nouvel essai dans un instant",
    plateformePause: (p) => `${p} est en pause de notre côté — reprise automatique`,
    boutique: (login) => (login
      ? `En attente de ta boutique @${login} : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul`
      : "En attente de ton autre boutique Vinted : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul"),
    geste: "Un geste à faire",
    connexion: (p) => `Un geste à faire : connecte-toi à ${p} sur ton ordinateur`,
    opla: "Un geste à faire : autorise Opla dans l'extension — l'annonce partira toute seule ensuite",
    horsLigne: (h) => (h ? `Hors ligne quelques minutes : remise en ligne vers ${h}` : "Hors ligne quelques minutes : remise en ligne en cours"),
    enCours: "En cours sur ton ordinateur",
    enCoursServeurs: "En cours sur nos serveurs",
  },
  en: {
    tour: "Waiting for its turn",
    serveurs: "Goes out from our servers in turn",
    ordinateur: "Waiting for your computer — Chrome closed or extension not seen",
    ordinateurSession: "Waiting for your computer — the extension must reconnect to your account",
    intacte: "On hold, your listing is untouched",
    pauseJusqua: (h, pourquoi) => `Paused until ${h}${pourquoi ? ` (${pourquoi})` : ""}`,
    pauseSansHeure: (pourquoi) => `Paused${pourquoi ? ` (${pourquoi})` : ""}`,
    limiteJour: "daily limit",
    rythme: "repost pacing",
    creneau: "repost time slot",
    essaiA: (h) => `Next try at ${h}`,
    essaiBientot: "Next try in a moment",
    plateformePause: (p) => `${p} is paused on our side — resumes automatically`,
    boutique: (login) => (login
      ? `Waiting for your @${login} shop: open it on vinted.fr in Chrome, it resumes on its own`
      : "Waiting for your other Vinted shop: open it on vinted.fr in Chrome, it resumes on its own"),
    geste: "Something to do",
    connexion: (p) => `Something to do: sign in to ${p} on your computer`,
    opla: "Something to do: allow Opla in the extension — the listing then goes out on its own",
    horsLigne: (h) => (h ? `Offline for a few minutes: back online around ${h}` : "Offline for a few minutes: going back online"),
    enCours: "In progress on your computer",
    enCoursServeurs: "In progress on our servers",
  },
};

// Inconnue ≠ absente : on ne dit « en attente de ton ordinateur » que sur une
// absence CONSTATÉE (même règle que la carte du Stock).
const extensionFraiche = (ext) => !ext || !["eteinte", "inactive", "session_expiree"].includes(ext.etat);

// ── LA BOUTIQUE VINTED D'UN JOB (03/10, point 16 — Ornella) ────────────────
// ctx.boutiques = { connectee: {userId, login, fraiche}|null, liste: [{user_id,
// login}], origines: Map(inventaire_id → vinted_account_id) }. La boutique
// d'un article est son ORIGINE (inventaire.vinted_account_id), comme au
// serveur ; ouverte = boutique.connectee (_shared/boutique-connectee.js).
const origineDe = (j, b) => {
  const o = b?.origines instanceof Map ? b.origines.get(String(j?.inventaire_id)) : b?.origines?.[String(j?.inventaire_id)];
  return o == null ? "" : String(o).trim();
};
const loginDe = (id, b) => {
  const x = (b?.liste ?? []).find((y) => String(y?.user_id ?? "") === String(id));
  return x?.login ? String(x.login) : null;
};
/** La boutique qu'attend un job retenu par la garde du serveur, sinon null (mêmes fail-open). */
export function boutiqueAttendue(j, b) {
  if (!b?.connectee?.userId || b.connectee.fraiche === false) return null;
  if (j?.platform !== "vinted" || !["republish", "delete"].includes(j?.action) || j?.inventaire_id == null) return null;
  const o = origineDe(j, b);
  if (!o || o === String(b.connectee.userId).trim()) return null;
  return { userId: o, login: loginDe(o, b) };
}
/** La boutique d'un job Vinted, pour l'étiquette « @login » — seulement à partir de deux boutiques. */
export function boutiqueDuJob(j, b) {
  if (j?.platform !== "vinted" || (b?.liste?.length ?? 0) < 2) return null;
  const o = origineDe(j, b) || String(pfDe(j).vinted_account_id ?? "").trim();
  const login = o ? loginDe(o, b) : null;
  return login ? { userId: o, login } : null;
}

/**
 * Où en est UN job vivant, et pourquoi.
 * ctx = { maintenant, lang, extension: {etat}|null, plateformesEnPause: Set,
 *         plafond: {retenue, reprise, motif}|null, creneaux: {pf: {dans_creneau, reprise}}|null,
 *         oplaAAutoriser: bool (verdict serveur « a_autoriser »),
 *         boutiques: { connectee, liste, origines } | null (multi-boutiques Vinted) }
 * → { groupe: 'en_cours'|'a_venir'|'pause'|'geste', raison, heure|null, motif }
 */
export function situationJob(j, ctx = {}) {
  const maintenant = ctx.maintenant ?? Date.now();
  const lang = ctx.lang === "en" ? "en" : "fr";
  const T = TEXTE[lang];
  const pf = pfDe(j);
  const nom = nomPlateforme(j.platform);
  const etape = j.action === "republish" ? etapeRepublication(j) : null;

  if (j.status === "needs_user") return { groupe: "geste", raison: T.geste, heure: null, motif: "geste" };
  if (attendConnexion(j)) return { groupe: "geste", raison: T.connexion(nom), heure: null, motif: "connexion" };
  // Opla sans autorisation CONNUE (verdict serveur « a_autoriser ») : le
  // serveur ne la sert pas, elle attend le geste — jamais « son tour ».
  if (j.status === "pending" && j.platform === "opla" && ctx.oplaAAutoriser) {
    return { groupe: "geste", raison: T.opla, heure: null, motif: "opla" };
  }

  // (03/10, point 16) Retenu par la garde de boutique du SERVEUR, à toute
  // étape (une remise en ligne se fait sur la boutique d'origine) : c'est la
  // boutique qui manque, pas son tour — on dit laquelle ouvrir.
  if (j.status === "pending") {
    const attendue = boutiqueAttendue(j, ctx.boutiques);
    if (attendue) return { groupe: "pause", raison: T.boutique(attendue.login), heure: null, motif: "boutique" };
  }

  // Hors ligne entre retrait et remise en ligne : c'est EN COURS, toujours.
  if (etape === "deleted") {
    const h = heureConnue(pf.next_action_after, maintenant, lang);
    return { groupe: "en_cours", raison: T.horsLigne(h), heure: h, motif: "remise_en_ligne" };
  }
  if (j.status === "processing") {
    return { groupe: "en_cours", raison: parNosServeurs(j) ? T.enCoursServeurs : T.enCours, heure: null, motif: "en_cours" };
  }

  // pending — d'abord ce qui le RETIENT, avec une heure quand elle est connue.
  if (estGeleLivres(j)) return { groupe: "pause", raison: T.pauseSansHeure(null), heure: null, motif: "gel" };
  if (retenueServeurDuJob(j)) return { groupe: "pause", raison: T.intacte, heure: null, motif: "retenue_serveur" };
  // La boutique avant le plafond : c'est le geste qui débloque (marqueur posé
  // par l'extension à la capture ; la garde du serveur est lue plus haut).
  const boutique = objet(pf.attente_boutique);
  if (boutique.login || pf.attente_boutique === true) {
    return { groupe: "pause", raison: T.boutique(boutique.login ?? null), heure: null, motif: "boutique" };
  }
  if (j.action === "republish") {
    const pl = ctx.plafond;
    if (pl?.retenue) {
      const pourquoi = pl.motif === "pause" ? T.rythme : T.limiteJour;
      const h = heureConnue(pl.reprise, maintenant, lang);
      return { groupe: "pause", raison: h ? T.pauseJusqua(h, pourquoi) : T.pauseSansHeure(pourquoi), heure: h, motif: pl.motif === "pause" ? "rythme" : "limite_jour" };
    }
    const cr = pf.republish_source === "auto" ? ctx.creneaux?.[j.platform] : null;
    if (cr && cr.dans_creneau === false) {
      const h = heureConnue(cr.reprise, maintenant, lang);
      return { groupe: "pause", raison: h ? T.pauseJusqua(h, T.creneau) : T.pauseSansHeure(T.creneau), heure: h, motif: "creneau" };
    }
  }
  if (ctx.plateformesEnPause?.has?.(j.platform)) {
    return { groupe: "pause", raison: T.plateformePause(nom), heure: null, motif: "plateforme" };
  }
  const essai = heureConnue(pf.next_action_after, maintenant, lang);
  if (essai) return { groupe: "pause", raison: T.essaiA(essai), heure: essai, motif: "essai" };
  if (j.error && String(j.error).trim()) return { groupe: "pause", raison: T.essaiBientot, heure: null, motif: "essai" };

  if (parNosServeurs(j)) return { groupe: "a_venir", raison: T.serveurs, heure: null, motif: "tour" };
  if (!extensionFraiche(ctx.extension)) {
    return {
      groupe: "a_venir",
      raison: ctx.extension?.etat === "session_expiree" ? T.ordinateurSession : T.ordinateur,
      heure: null, motif: "ordinateur",
    };
  }
  return { groupe: "a_venir", raison: T.tour, heure: null, motif: "tour" };
}

/**
 * La file complète, rangée.
 * jobs : tous les jobs connus (n'importe quel ordre, les finis sont écartés).
 * → { en_cours, a_venir, pause, geste, compteurs: {enCoursOuAVenir, enPause, gestes}, total }
 *   chaque ligne : { job, situation }
 */
export function lireFile(jobs, ctx = {}) {
  const groupes = { en_cours: [], a_venir: [], pause: [], geste: [] };
  for (const j of jobs ?? []) {
    if (!jobVivant(j)) continue;
    const situation = situationJob(j, ctx);
    groupes[situation.groupe].push({ job: j, situation });
  }
  const parDepart = (a, b) => comparerDepart(a.job, b.job);
  groupes.en_cours.sort((a, b) => (a.job.status === "processing" ? 0 : 1) - (b.job.status === "processing" ? 0 : 1) || parDepart(a, b));
  groupes.a_venir.sort(parDepart);
  // En pause : la reprise la plus proche d'abord (heure connue), puis l'ordre de départ.
  const repriseDe = (l) => {
    const pf = pfDe(l.job);
    const iso = l.situation.motif === "essai" ? pf.next_action_after
      : (l.situation.motif === "rythme" || l.situation.motif === "limite_jour") ? ctx.plafond?.reprise
      : l.situation.motif === "creneau" ? ctx.creneaux?.[l.job.platform]?.reprise : null;
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  groupes.pause.sort((a, b) => repriseDe(a) - repriseDe(b) || parDepart(a, b));
  groupes.geste.sort((a, b) => tsDe(b.job.created_at) - tsDe(a.job.created_at));
  const compteurs = {
    enCoursOuAVenir: groupes.en_cours.length + groupes.a_venir.length,
    enPause: groupes.pause.length,
    gestes: groupes.geste.length,
  };
  return { ...groupes, compteurs, total: compteurs.enCoursOuAVenir + compteurs.enPause + compteurs.gestes };
}

/** « 3 en cours ou à venir · 1 en pause · 1 geste à faire » — seulement ce qui existe. */
export function phraseCompteurs(c, lang = "fr") {
  const fr = lang !== "en";
  const parts = [];
  if (c.enCoursOuAVenir) parts.push(fr ? `${c.enCoursOuAVenir} en cours ou à venir` : `${c.enCoursOuAVenir} running or coming up`);
  if (c.enPause) parts.push(fr ? `${c.enPause} en pause` : `${c.enPause} paused`);
  if (c.gestes) parts.push(fr ? `${c.gestes} geste${c.gestes > 1 ? "s" : ""} à faire` : `${c.gestes} thing${c.gestes > 1 ? "s" : ""} to do`);
  if (!parts.length) return fr ? "Rien en cours ni à venir" : "Nothing running or coming up";
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
