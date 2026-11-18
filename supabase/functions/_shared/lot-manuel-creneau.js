// ═══════════════════════════════════════════════════════════════════════════
// UN LOT MANUEL DE PLUS DE 10 ARTICLES PART DANS LES CRÉNEAUX DE REPUBLICATION (09/11, décision de Nico — OPTION B)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : josephinecerni (Pro, créneaux 10:00–22:00 tous les jours sur Vinted, Leboncoin et Beebs) lance le 04/11
// à 22:07 « Republier 874 annonces (296 articles sur 3 plateformes) » (lot 77b7bf38, 299 articles en tout) : le manuel
// ignorait les créneaux (décision du « point 7 », remplacée ici), d'où des republications à 22 h passées et avant 10 h.
//
// LA RÈGLE (décision de Nico du 09/11, tous les comptes) :
//   · la personne a des créneaux de republication sur la plateforme (module ACTIF : réglage valide, palier Pro) ET le lot
//     manuel compte PLUS de 10 articles → ses republications de cette plateforme partent DANS le créneau, au rythme de la
//     plateforme (inchangé : 2 min entre deux gestes d'une plateforme, pause de 2 h toutes les 50, quotas) ;
//   · un lot de 1 à 10 articles, une republication à l'unité : tout de suite, comme avant ;
//   · sans créneau sur la plateforme (aucun module, module en pause ou arrêté) : rien ne change ;
//   · la programmation automatique reste en pause tant que le lot est en file (garde « en vol » du balayage SQL,
//     republish_planifiee_sweep, inchangée : tout republish pending/processing de la plateforme la bloque) — jamais deux
//     volumes ;
//   · rien n'est recréé, annulé ni dupliqué : la règle se lit À L'EXÉCUTION (get-pending-jobs), sur les tâches déjà en
//     file — le lot de Joséphine la suit tel qu'il est ;
//   · comme pour l'automatique : une republication dont l'annonce est déjà retirée (étape « deleted ») ou dont la
//     suppression est partie (retraitEngage) va au bout, créneau fermé ou non ; l'exception de créneau bornée aussi.
// Le lot = bulk_batch_id (posé par l'app sur chaque tâche du lot, StockTab.lancerRepublicationLot) ; sa taille = ses
// articles distincts, toutes plateformes et tous statuts (ce que la personne a lancé), lue en base.
// ⏳ Un lot en cours de CRÉATION (l'app crée ~3 tâches par seconde, et pose le numéro du lot juste après chaque création)
// ne se juge pas avant d'être complet : hors créneau, une republication manuelle née il y a moins de 90 s, ou d'un lot dont
// la dernière tâche a moins de 90 s, attend sa fin (au pire 90 s de plus pour une republication à l'unité hors créneau) —
// sans cela, le passage tombé pendant la création servait les premières tâches du lot hors créneau.
// Pur (Deno + Node + Vite), sans import.

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

export const SEUIL_LOT_MANUEL_ARTICLES = 10;
export const DELAI_LOT_EN_CREATION_MS = 90_000;

// ── (18/11/2026, lot T2 point 2 — ordre de Nico) « LANCER MAINTENANT » ───────────────────────────────────────────────
// Un lot lancé hors de son créneau : l'app dit à quelle heure il partira, et propose de changer le créneau ou de le
// lancer maintenant. « Maintenant » = la personne l'a choisi pour CE lot : il part tout de suite, au rythme habituel de
// chaque plateforme (le même que pour un lot de 1 à 10 articles : espacement, pause de respiration, quotas — rien
// d'autre ne change). Le choix vit dans profiles.platform_settings.lots_maintenant = { "<bulk_batch_id>": "<ISO>" },
// écrit par l'app (platform_settings_fusionner, la seule voie), lu par get-pending-jobs avec la taille des lots. Un choix
// de plus de 7 jours ne vaut plus (un lot plus vieux est fini depuis longtemps) ; une valeur illisible ne vaut rien.
export const CLE_LOTS_MAINTENANT = "lots_maintenant";
export const DUREE_CHOIX_MAINTENANT_MS = 7 * 24 * 3600_000;
/** Les lots que la personne a lancés « maintenant » (Set d'ids), lus dans platform_settings.lots_maintenant. */
export function lotsLancesMaintenant(valeur, maintenant = Date.now()) {
  const out = new Set();
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return out;
  for (const [id, quand] of Object.entries(valeur)) {
    const t = ms(quand);
    if (String(id).trim() && Number.isFinite(t) && t <= maintenant + 60_000 && maintenant - t < DUREE_CHOIX_MAINTENANT_MS) out.add(String(id).trim());
  }
  return out;
}

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});

/** Une republication demandée par la personne (jamais l'automatique). */
export function estRepublicationManuelle(job) {
  return !!job && job.action === "republish" && pfDe(job).republish_source !== "auto";
}

/**
 * Les lots lus en base : lignes { bulk_batch_id, inventaire_id, created_at } → Map(lot → { articles, dernier_cree }).
 * @param {Array<{ bulk_batch_id?: string|null, inventaire_id?: number|string|null, created_at?: string|null }>} lignes
 */
export function lotsDepuisLignes(lignes) {
  const m = new Map();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const id = String(l?.bulk_batch_id ?? "").trim();
    if (!id) continue;
    if (!m.has(id)) m.set(id, { fiches: new Set(), dernier_cree: -Infinity });
    const e = m.get(id);
    if (l.inventaire_id != null) e.fiches.add(String(l.inventaire_id));
    const c = ms(l.created_at);
    if (Number.isFinite(c) && c > e.dernier_cree) e.dernier_cree = c;
  }
  const out = new Map();
  for (const [id, e] of m) out.set(id, { articles: e.fiches.size, dernier_cree: e.dernier_cree });
  return out;
}

/** Un lot « dans les créneaux » : plus de 10 articles, et pas lancé « maintenant » par la personne (18/11). */
export function lotDansLesCreneaux(lot) {
  return !!lot && lot.maintenant !== true && Number(lot.articles) > SEUIL_LOT_MANUEL_ARTICLES;
}

/**
 * Faut-il retenir CETTE republication manuelle hors du créneau de sa plateforme ?
 * @param {object} job                  la tâche (pending), avec bulk_batch_id
 * @param {{ fenetre?: { actif?: boolean, dans_creneau?: boolean }|null, lot?: { articles: number, dernier_cree: number }|null,
 *           exemptee?: boolean, maintenant?: number }} o
 *   exemptee : étape « deleted », suppression partie ou exception de créneau (calculé par l'appelant, même règle que l'auto).
 * @returns {{ retenir: boolean, motif: string }}
 */
export function retenueLotManuel(job, { fenetre = null, lot = null, exemptee = false, maintenant = Date.now() } = {}) {
  if (!estRepublicationManuelle(job)) return { retenir: false, motif: "pas_manuelle" };
  if (exemptee) return { retenir: false, motif: "va_au_bout" };
  if (!fenetre || fenetre.actif !== true) return { retenir: false, motif: "sans_creneau" };
  if (fenetre.dans_creneau === true) return { retenir: false, motif: "dans_le_creneau" };
  // (18/11) Lancé « maintenant » par la personne : part tout de suite, création comprise (son choix est posé AVANT la
  // création de la première tâche).
  if (lot && lot.maintenant === true) return { retenir: false, motif: "lance_maintenant" };
  const cree = ms(job.created_at);
  if (Number.isFinite(cree) && maintenant - cree < DELAI_LOT_EN_CREATION_MS) return { retenir: true, motif: "lot_en_creation" };
  const lotId = String(job.bulk_batch_id ?? "").trim();
  if (!lotId) return { retenir: false, motif: "a_l_unite" };
  if (!lot) return { retenir: false, motif: "lot_illisible" }; // jamais une retenue sur une lecture ratée
  if (Number.isFinite(lot.dernier_cree) && maintenant - lot.dernier_cree < DELAI_LOT_EN_CREATION_MS) return { retenir: true, motif: "lot_en_creation" };
  if (lotDansLesCreneaux(lot)) return { retenir: true, motif: "lot_dans_creneaux" };
  return { retenir: false, motif: "petit_lot" };
}

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", opla: "Opla", depop: "Depop" };

/** Le message d'une republication de lot retenue hors créneau — jamais une heure (règle du 16/10). */
export function messageRetenueLotCreneau(platform) {
  const nom = NOM[platform] ?? platform ?? "";
  return `Republication de ton lot (plus de 10 articles) en attente de ton créneau ${nom ? `${nom} ` : ""}: elle partira ` +
    "dans ton créneau de republication, au rythme habituel, si Chrome est ouvert sur ton ordinateur à ce moment-là. " +
    "Ton annonce est intacte, rien n'a été retiré.";
}

/** Les lots (ids) que la file de l'app doit montrer « en pause (créneau) » : ctx.lotsCreneaux de _shared/etat-job.js. */
export function lotRetenuAuxCreneaux(job, lotsCreneaux) {
  if (!estRepublicationManuelle(job)) return false;
  const id = String(job?.bulk_batch_id ?? "").trim();
  if (!id || !lotsCreneaux) return false;
  return Array.isArray(lotsCreneaux) ? lotsCreneaux.includes(id) : (typeof lotsCreneaux.has === "function" && lotsCreneaux.has(id));
}
