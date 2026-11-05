// ═══════════════════════════════════════════════════════════════════════════
// UNE TÂCHE QUI ATTEND ALORS QUE L'EXTENSION QUI DOIT LA FAIRE EST OUVERTE (05/11, demande de Nico — louis-seller)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : le retrait Leboncoin 69f89a6d de louis-seller a attendu du 03/11 15:36 au 05/11 09:52. Leboncoin de
// louis-seller est fait par l'extension d'Amiral (délégation) ; Amiral était en pause Leboncoin, sa visite de contrôle
// avalée par une garde de la base — et son extension, OUVERTE tout du long, ne faisait plus rien pour Louis. Personne
// ne l'a vu : la section « pending > 48 h » de l'ops-digest ne connaît ni la délégation ni l'extension active.
// LA RÈGLE (tout le parc) : une tâche en file (pending) dont l'échéance est passée depuis plus de 6 h, alors que
// l'extension qui DOIT la faire (celle du compte, ou celle de l'exécutant d'une délégation valide) a été vue plus de
// 6 h après cette échéance, et que RIEN n'est parti sur ce compte et cette plateforme dans les 6 h qui précèdent cette
// dernière visite = une file arrêtée par NOTRE faute, jusqu'à preuve du contraire → rouge sur support@fillsell.app.
// Ce qui n'en est pas : une file qui avance (cadence, une à la fois — quelque chose est parti), une extension fermée
// (l'ordinateur éteint, ou pas vu depuis 24 h : dit par la section « pending > 48 h »), une tâche programmée plus tard
// (next_action_after), une tâche qui attend la personne (needs_user, file mise en pause par elle — même juge que
// get-pending-jobs : jobRetenuParPause), une republication AUTOMATIQUE pas encore engagée (son créneau la gouverne —
// même test que get-pending-jobs), eBay (par l'API, sans extension).
// Rejoué sur la prod le 05/11 sans ces exclusions : 28 comptes signalés, dont des files en pause voulue (Johan) et des
// comptes éteints depuis des semaines — du bruit qui aurait caché le vrai cas.
// Pur (Deno + Node) : ops-digest lit la base, ce module juge. Selftest : scripts/attente-extension-active-selftest.mjs.
import { delegationLbcValide, executantLbcDeclare, nomExecutantLbc, PLATEFORME_DELEGUEE } from "./delegation-leboncoin.js";
import { estFileEnPause, jobRetenuParPause } from "./file-pause.js";
import { retraitEngage } from "./retenue-creneau.js";

export const ATTENTE_ALERTE_MS = 6 * 3600_000;
// (05/11, point 8 — faux positif c) « Ouverte » = un passage dans l'heure : une extension muette depuis 10 à 18 h n'est
// pas « ouverte » (c'était 24 h).
export const VU_RECEMMENT_MS = 3600_000;
export const PLATEFORMES_EXTENSION = ["vinted", "leboncoin", "beebs", "depop"];
export const ACTIONS_SUIVIES = ["publish", "republish", "delete"];

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/** Depuis quand la tâche DOIT partir : sa création, ou la reprise programmée si elle est passée. null = programmée
 * plus tard (rien à dire). */
export function echeanceMs(job, maintenant = Date.now()) {
  const cree = ms(job?.created_at);
  const apres = ms(job?.next_action_after ?? job?.platform_fields?.next_action_after);
  if (apres != null && apres > maintenant) return null;
  if (cree == null) return apres;
  return apres != null ? Math.max(cree, apres) : cree;
}

/** Une attente VOULUE (pas une file arrêtée) : la personne a mis sa file en pause, une republication automatique
 * attend son créneau (pas encore engagée), ou une publication programmée attend sa plage. `profilProprietaire` porte platform_settings (au moins file_pause). */
export function attenteVoulue(job, profilProprietaire) {
  if (estFileEnPause(profilProprietaire?.platform_settings) && jobRetenuParPause(job)) return "pause_voulue";
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (String(job?.action ?? "") === "republish" && pf.republish_source === "auto" && pf.republish_step !== "deleted" && !retraitEngage(job)) {
    return "creneau";
  }
  // (05/11, point 18 — faux positif : doriane) Une PUBLICATION PROGRAMMÉE pas encore servie attend sa plage horaire et
  // son espacement (publication-programmee.js) : c'est voulu, jamais une file arrêtée.
  if (pf.programmee === true && !pf.programmee_servie_le) return "programmee";
  return null;
}

/** L'extension qui doit faire la tâche : celle du compte, ou — Leboncoin délégué, posé DES DEUX CÔTÉS — celle de
 * l'exécutant. `profils` : Map id → { id, username, email, extension_last_seen_at, beta_flags }. */
export function executantDe(job, profils) {
  const proprietaire = String(job?.user_id ?? "");
  const pP = profils.get(proprietaire) ?? null;
  if (String(job?.platform ?? "") === PLATEFORME_DELEGUEE && pP) {
    const e = executantLbcDeclare(pP.beta_flags);
    const pE = e ? profils.get(e) ?? null : null;
    if (pE && delegationLbcValide({ proprietaire, flagsProprietaire: pP.beta_flags, executant: e, flagsExecutant: pE.beta_flags })) {
      return { id: e, profil: pE, delegue: true, nom: nomExecutantLbc(pP.beta_flags) ?? pE.username ?? null };
    }
  }
  return { id: proprietaire, profil: pP, delegue: false, nom: null };
}

/** Les exécutants à lire en plus des propriétaires (délégations déclarées). */
export function executantsDeclares(profils) {
  const ids = new Set();
  for (const p of profils.values()) {
    const e = executantLbcDeclare(p?.beta_flags);
    if (e) ids.add(e);
  }
  return [...ids];
}

/**
 * Les files arrêtées, groupées par compte et plateforme.
 * @param {{ jobs: any[], profils: Map<string, any>, derniersDeparts: Map<string, number>, maintenant?: number }} o
 *   jobs            : tâches en file (status 'pending'), avec user_id, platform, action, created_at, error,
 *                     next_action_after (ou platform_fields.next_action_after) et platform_fields (au moins
 *                     republish_source, republish_step, deleted_at, republish_suppression_envoyee) ;
 *   profils         : Map id → { username, email, extension_last_seen_at, beta_flags, platform_settings (file_pause) } ;
 *   derniersDeparts : `${user_id}|${platform}` → dernier départ connu (ms, platform_fields.processing_since le plus
 *                     récent du compte sur la plateforme, toutes tâches confondues).
 * @returns {{ arretees: any[], filesQuiAvancent: number, extensionsFermees: number, attentesVoulues: number }}
 */
/** (05/11, point 8 d) Une pause Leboncoin en cours (blocage_acces posé, pas encore levé) sur ce profil. */
export function pauseLeboncoinActive(profil) {
  const b = profil?.platform_settings?.leboncoin?.blocage_acces;
  return Boolean(b && typeof b === "object" && !b.leve_le);
}

export function filesArretees({ jobs, profils, derniersDeparts, maintenant = Date.now() }) {
  const groupes = new Map();
  let attentesVoulues = 0;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (String(j?.status ?? "pending") !== "pending") continue;
    if (!PLATEFORMES_EXTENSION.includes(String(j?.platform ?? ""))) continue;
    if (!ACTIONS_SUIVIES.includes(String(j?.action ?? "publish"))) continue;
    if (attenteVoulue(j, profils.get(String(j.user_id)))) { attentesVoulues++; continue; }
    const ech = echeanceMs(j, maintenant);
    if (ech == null || maintenant - ech < ATTENTE_ALERTE_MS) continue;
    const cle = `${j.user_id}|${j.platform}`;
    const g = groupes.get(cle) ?? { cle, proprietaire: String(j.user_id), plateforme: String(j.platform), jobs: [], echeance: ech };
    g.jobs.push(j);
    g.echeance = Math.min(g.echeance, ech);
    groupes.set(cle, g);
  }
  const arretees = [];
  let filesQuiAvancent = 0, extensionsFermees = 0;
  for (const g of groupes.values()) {
    const ex = executantDe(g.jobs[0], profils);
    const vu = ms(ex.profil?.extension_last_seen_at);
    // L'extension n'a pas tourné 6 h après l'échéance, ou pas depuis 24 h : l'ordinateur est éteint (pas une file
    // arrêtée par nous — la section « pending > 48 h » le dit).
    if (vu == null || vu < g.echeance + ATTENTE_ALERTE_MS || maintenant - vu > VU_RECEMMENT_MS) { extensionsFermees++; continue; }
    // (05/11, point 8 — faux positif d) Leboncoin en PAUSE chez le compte qui exécute (restriction de Leboncoin, visite de
    // contrôle du serveur) : une attente de la plateforme, jamais une file arrêtée par nous.
    if (g.plateforme === "leboncoin" && pauseLeboncoinActive(ex.profil)) { attentesVoulues += g.jobs.length; continue; }
    const depart = derniersDeparts.get(g.cle) ?? null;
    // Quelque chose est parti dans les 6 h qui précèdent sa dernière visite : la file avance (cadence, une à la fois).
    if (depart != null && depart >= vu - ATTENTE_ALERTE_MS) { filesQuiAvancent++; continue; }
    const actions = new Map();
    const raisons = new Map();
    for (const j of g.jobs) {
      const a = String(j.action ?? "publish");
      actions.set(a, (actions.get(a) ?? 0) + 1);
      const r = String(j.error ?? "").trim();
      raisons.set(r, (raisons.get(r) ?? 0) + 1);
    }
    arretees.push({
      proprietaire: g.proprietaire,
      proprietaireNom: profils.get(g.proprietaire)?.username ?? profils.get(g.proprietaire)?.email ?? g.proprietaire,
      plateforme: g.plateforme,
      executant: ex.id,
      executantNom: ex.delegue ? (ex.nom ?? ex.profil?.username ?? ex.id) : null,
      delegue: ex.delegue,
      n: g.jobs.length,
      attenteH: Math.floor((maintenant - g.echeance) / 3600_000),
      echeance: new Date(g.echeance).toISOString(),
      vuIlYaMin: Math.max(0, Math.round((maintenant - vu) / 60_000)),
      dernierDepart: depart != null ? new Date(depart).toISOString() : null,
      actions: [...actions.entries()].map(([a, n]) => `${a}×${n}`).join(", "),
      // La raison que la personne lit (la plus fréquente ; vide = aucune raison écrite — le cas le plus grave).
      raison: [...raisons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      exemples: g.jobs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, 3).map((j) => String(j.id)),
    });
  }
  // Les plus anciennes d'abord ; à attente égale, celles sans raison écrite.
  arretees.sort((a, b) => b.attenteH - a.attenteH || Number(Boolean(a.raison)) - Number(Boolean(b.raison)));
  return { arretees, filesQuiAvancent, extensionsFermees, attentesVoulues };
}

/** Une ligne lisible, pour l'ops-digest. */
export function ligneFileArretee(a) {
  const nomPf = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop" }[a.plateforme] ?? a.plateforme;
  const qui = a.delegue ? `exécutée par ${a.executantNom} (délégation), extension vue il y a ${a.vuIlYaMin} min`
    : `extension du compte vue il y a ${a.vuIlYaMin} min`;
  const depart = a.dernierDepart ? `dernier départ ${a.dernierDepart.slice(0, 16).replace("T", " ")} UTC` : "aucun départ connu";
  return `[${nomPf}] ${a.proprietaireNom} — ${a.n} tâche(s) en file depuis ${a.attenteH} h (${a.actions}) · ${qui} · ${depart} · `
    + `${a.raison ? `affiché : « ${a.raison.slice(0, 160)} »` : "AUCUNE raison écrite"} · jobs ${a.exemples.map((x) => x.slice(0, 8)).join(", ")}`;
}
