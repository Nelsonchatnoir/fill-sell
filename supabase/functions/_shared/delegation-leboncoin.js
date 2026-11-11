// ═══════════════════════════════════════════════════════════════════════════
// DÉLÉGATION LEBONCOIN PAR COMPTE (01/11, décision de Nico — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis a deux comptes FillSell sur UN compte Leboncoin (boutique « Clayton ») : Amiral (compte faf5021a, son vrai
// PC) et louis-seller (compte 447d920c, une machine virtuelle de son NAS que Leboncoin refuse). Décision :
// toutes les actions Leboncoin de louis-seller (publication, republication, retrait, relevé des annonces, veille et
// relevé des ventes, essai de levée de pause) sont EXÉCUTÉES par l'extension du poste d'Amiral, sur SA session
// Leboncoin. Les données restent celles de louis-seller : l'extension d'Amiral ouvre un second compte de travail,
// avec une session de louis-seller fabriquée par extension-session (jamais un mot de passe), limitée à Leboncoin.
// Tout ce qu'elle écrit (tâches, relevés, annonces, ventes) passe donc par le jeton de louis-seller : RLS, auth.uid(),
// quotas, garde « une annonce, un compte » (annonces_plateforme_un_compte) et comptes liés jouent comme avant.
//
// Le réglage vit côté serveur, dans profiles.beta_flags (colonne fermée en écriture au client), DES DEUX CÔTÉS :
//   compte qui délègue (louis-seller) : beta_flags.delegation_leboncoin = { executant: "<uuid d'Amiral>", nom: "Amiral", … }
//   compte qui exécute (Amiral)       : beta_flags.execute_leboncoin_pour = ["<uuid de louis-seller>"]
// Un seul côté posé = AUCUNE délégation. Sans ces clés — tous les autres comptes —, rien ne change.
// Pur (Deno + Node).

export const CLE_DELEGATION_LBC = "delegation_leboncoin";
export const CLE_EXECUTE_LBC_POUR = "execute_leboncoin_pour";
export const PLATEFORME_DELEGUEE = "leboncoin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v) => (typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null);
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Côté du compte qui délègue : l'exécutant déclaré, ou null. */
export function executantLbcDeclare(betaFlags) {
  const d = objet(objet(betaFlags)?.[CLE_DELEGATION_LBC]);
  return d ? uuid(d.executant) : null;
}

/** Le nom de l'exécutant montré à la personne (« Amiral »), ou null. */
export function nomExecutantLbc(betaFlags) {
  const d = objet(objet(betaFlags)?.[CLE_DELEGATION_LBC]);
  const n = d && typeof d.nom === "string" ? [...d.nom].filter((ch) => ch.charCodeAt(0) >= 32).join("").trim().slice(0, 40) : "";
  return n || null;
}

/**
 * Côté du compte qui exécute : les comptes pour lesquels il accepte d'exécuter Leboncoin.
 * @returns {string[]}
 */
export function comptesExecutesLbc(betaFlags) {
  const l = objet(betaFlags)?.[CLE_EXECUTE_LBC_POUR];
  if (!Array.isArray(l)) return [];
  /** @type {string[]} */
  const ids = [];
  for (const v of l) { const id = uuid(v); if (id && !ids.includes(id)) ids.push(id); }
  return ids.slice(0, 5);
}

/** La délégation tient-elle ? Les deux côtés posés, l'un vers l'autre, deux comptes distincts. */
export function delegationLbcValide({ proprietaire, flagsProprietaire, executant, flagsExecutant }) {
  const p = uuid(proprietaire);
  const e = uuid(executant);
  if (!p || !e || p === e) return false;
  return executantLbcDeclare(flagsProprietaire) === e && comptesExecutesLbc(flagsExecutant).includes(p);
}

/** Le compte DÉLÈGUE-t-il Leboncoin (côté propriétaire posé) ? Ses propres postes ne touchent alors plus Leboncoin. */
export function delegueLbc(betaFlags) {
  return executantLbcDeclare(betaFlags) != null;
}

// ── Ce qu'une session déléguée reçoit : Leboncoin, et rien d'autre ─────────────────────────────────────────────
/** Les tâches servies au compte de travail délégué : Leboncoin seulement. */
export function tachesDuDelegue(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter((j) => String(j?.platform ?? "") === PLATEFORME_DELEGUEE);
}

/** Les tâches laissées aux postes du compte qui délègue : tout SAUF Leboncoin. */
export function tachesSansLbc(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter((j) => String(j?.platform ?? "") !== PLATEFORME_DELEGUEE);
}

// ── La pause sur refus de Leboncoin suit la session qui travaille ──────────────────────────────────────────────
// Le compte de travail délégué tourne sur la session d'Amiral : sa pause est celle d'Amiral OU la sienne (un refus
// lu pendant une tâche déléguée pose la pause du compte qui délègue, règle inchangée). L'état le plus prudent gagne.
const RANG_ETAT = { libre: 0, reprise: 1, essai: 2, pause: 3, bloque: 3 };
export function etatLePlusPrudent(a, b) {
  const ra = RANG_ETAT[String(a ?? "libre")] ?? 3;
  const rb = RANG_ETAT[String(b ?? "libre")] ?? 3;
  return rb > ra ? b : a;
}

// ── Les phrases ─────────────────────────────────────────────────────────────────────────────────────────────────
const nomOu = (nom) => (nom ? `ton compte ${nom}` : "ton autre compte FillSell");

/** La ligne de la carte de synchro et de la réponse « blocages » des postes du compte qui délègue. */
export function messageDelegationLbc(nom) {
  return `Leboncoin passe par ${nomOu(nom)} : ses annonces, ses ventes et ses tâches Leboncoin sont faites depuis ` +
    `l'ordinateur où l'extension FillSell est ouverte sur ce compte. Rien à faire de ton côté.`;
}

/** Le message d'une tâche Leboncoin qui attend parce que le poste d'Amiral n'a pas été vu depuis 2 h. */
export function messageTacheDelegueeEnAttente(nom) {
  return `Leboncoin passe par ${nomOu(nom)} : cette tâche partira dès que l'extension FillSell (à jour) sera ouverte ` +
    `sur ${nom ? `le compte ${nom}` : "cet autre compte"}, sur ton ordinateur. Rien n'a été touché.`;
}

/** (05/11, point 4 — louis-seller) Le compte de travail est EN PAUSE Leboncoin (Leboncoin y a restreint l'accès) : son
 *  extension, ouverte, ne fait aucun travail délégué tant que la pause dure. Jamais « ouvre l'extension » à tort. */
export function messageTacheDelegueeEnPause(nom) {
  return `Leboncoin passe par ${nomOu(nom)} : Leboncoin y a restreint l'accès, et FillSell y a mis Leboncoin en pause ` +
    "pour ne pas aggraver le blocage. Cette tâche partira toute seule dès que la pause sera levée (FillSell revérifie " +
    "lui-même, par une simple lecture). Rien n'a été touché.";
}
