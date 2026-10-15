// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES (12/10, A5)
// ═══════════════════════════════════════════════════════════════════════════
// L'invariant « une seule annonce hors ligne à la fois, par plateforme » (une
// republication ne retire rien tant qu'une AUTRE est à l'étape 'deleted', en
// pending/processing) vit dans l'extension (toutes versions), dans
// get-pending-jobs (retenue_hors_ligne) et dans le balayage de la
// republication automatique (republish_planifiee_sweep, étape 4). Il est juste
// tant que la remise en ligne est EN COURS. Il retenait SANS LIMITE : le
// Cendrier de jonathanrabany, retiré le 07/10 22:08, 28 remises en ligne
// ratées, gelait ses 8 autres republications Vinted depuis 4 jours ; 7 jobs à
// 'deleted' d'août en gelaient d'autres sur 4 comptes.
//
// LA RÈGLE :
//   · une remise en ligne qui a échoué au moins REPRISES_AVANT_SIGNAL fois et
//     dont l'annonce est retirée depuis plus de DELAI_AVANT_SIGNAL_MS sort de
//     la file : needs_user « recreation_bloquee », message clair (l'annonce
//     est hors ligne, rien n'est perdu, « Republier maintenant » la relance) —
//     les autres republications repartent, partout, sans nouvelle extension ;
//   · SAUF quand la cause est le COMPTE (Vinted restreint les mises en vente,
//     session fermée, compte bloqué) : retirer d'autres annonces les mettrait
//     hors ligne à leur tour, sans aucune chance de revenir — la retenue est
//     alors la protection, et le message le dit (même règle que le
//     disjoncteur, A4 : seul un échec du compte arrête le compte).
// Module PUR, importé par handler-watch.

export const SOURCE_RECREATION_BLOQUEE = "recreation_bloquee";
export const REPRISES_AVANT_SIGNAL = 2;
export const DELAI_AVANT_SIGNAL_MS = 2 * 3600_000;

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", ebay: "eBay", opla: "Opla" };

/** La cause DU COMPTE qui retient la remise en ligne, ou null (cause de l'article ou inconnue). */
export function causeCompte(pf = {}) {
  const texte = JSON.stringify([pf.error_technique ?? null, pf.last_diagnostic ?? null, pf.recreation_reprise?.brut ?? null]);
  if (pf.selling_restriction || /selling-restriction/.test(texte)) return "restriction";
  if (pf.attente_session || pf.attente_connexion || pf.verification_boutique_vinted?.motif === "session_inconnue") return "session";
  if (pf.compte_vinted_bloque || pf.needs_user_source === "compte_vinted_bloque") return "compte_bloque";
  if (pf.attente_antirobot_compte) return "anti_robot";
  return null;
}

/** Quand l'annonce a été retirée (preuve serveur d'abord), en ms, ou null. */
function retireeLe(pf) {
  for (const k of ["deleted_at_serveur", "deleted_at", "deleted_at_client"]) {
    const t = Date.parse(String(pf?.[k] ?? ""));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Le nombre d'essais de remise en ligne ratés, tel que les écrivains l'ont compté. */
export function essaisRates(pf = {}) {
  return Math.max(
    Number(pf.recreation_reprises) || 0,
    Number(pf.recreation_reprise?.n) || 0,
    Number(pf.recreation_tentee?.n) - 1 || 0,
  );
}

/**
 * La décision pour UN job de republication :
 *   « signaler »  → sortir de la file (needs_user), les autres repartent ;
 *   « proteger »  → cause du compte : il reste en file et retient (voulu) ;
 *   null          → rien à faire (en cours normal, ou pas son cas).
 */
export function decisionRecreationBloquee(job, maintenant = Date.now()) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.action !== "republish" || pf.republish_step !== "deleted") return null;
  if (!["pending", "processing"].includes(job.status)) return null;
  const le = retireeLe(pf) ?? Date.parse(String(job.created_at ?? ""));
  if (!Number.isFinite(le) || maintenant - le < DELAI_AVANT_SIGNAL_MS) return null;
  if (essaisRates(pf) < REPRISES_AVANT_SIGNAL) return null;
  // Un job en cours d'exécution (processing frais) n'est jamais arraché à son poste.
  if (job.status === "processing") {
    const depuis = Date.parse(String(pf.processing_since ?? ""));
    if (!Number.isFinite(depuis) || maintenant - depuis < 30 * 60_000) return null;
  }
  return causeCompte(pf) ? "proteger" : "signaler";
}

/**
 * Le message du job qui RESTE en file parce que la cause est le compte
 * (« proteger ») : jamais « rien à faire de ton côté » — la personne apprend
 * ce qui retient l'annonce, que ses autres annonces sont gardées en ligne
 * exprès, et le seul geste utile (Cendrier de jonathanrabany, 12/10 :
 * « /selling-restriction » depuis 4 jours, message « on réessaie tout seuls »).
 */
export function messageRecreationRetenueCompte(job) {
  const pf = job?.platform_fields ?? {};
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  const le = retireeLe(pf);
  const date = le ? new Date(le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : null;
  const annonce = `Ton annonce${titre ? ` « ${titre} »` : ""} a été retirée de ${nom}${date ? ` le ${date}` : ""}`;
  const cause = causeCompte(pf);
  const pourquoi = cause === "restriction"
    ? `et ne peut pas revenir en ligne : ${nom} limite en ce moment les mises en vente de ton compte. Ouvre ${nom} sur ton ordinateur pour lire son message (ou écris à son support)`
    : cause === "session"
      ? `et attend ta connexion : connecte-toi à ${nom} dans Chrome, sur ton ordinateur`
      : cause === "compte_bloque"
        ? `et ne peut pas revenir en ligne : ${nom} affiche « compte bloqué » sur ton ordinateur. Ouvre ${nom} pour lire son message`
        : `et ne peut pas revenir en ligne : ${nom} vérifie ton compte (contrôle anti-robot). Ouvre ${nom} sur ton ordinateur et passe sa vérification`;
  return `${annonce} ${pourquoi}. FillSell réessaie tout seul dès que c'est levé, et ne retire aucune autre de tes annonces ${nom} d'ici là : elles restent en ligne. `
    + `Rien n'est perdu : titre, description, photos et champs sont gardés.`;
}

/** Le message du job sorti de la file. */
export function messageRecreationBloquee(job) {
  const pf = job?.platform_fields ?? {};
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  const le = retireeLe(pf);
  const date = le ? new Date(le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : null;
  return `Ton annonce${titre ? ` « ${titre} »` : ""} a été retirée de ${nom}${date ? ` le ${date}` : ""} et FillSell n'a pas réussi à la remettre en ligne `
    + `(${essaisRates(pf)} essais). Rien n'est perdu : titre, description, photos et champs sont gardés. Ouvre ${nom} sur ton ordinateur pour vérifier ton compte, `
    + `puis appuie sur « Republier maintenant » : elle repartira. Tes autres republications, elles, continuent.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNE REMISE EN LIGNE BLOQUÉE REPART SEULE DÈS QUE LA CAUSE EST LEVÉE (15/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : ana0115, Beebs, « Tee shirt femme » (6ce123e7) — annonce
// retirée le 15/10 à 15:02, cinq redépôts refusés par le formulaire Beebs
// (« Ajouter au moins 5 caractères » : la copie n'avait aucune description),
// sortie de la file à 17:03 (needs_user « recreation_bloquee »). La cause
// était DE NOTRE CÔTÉ ; une fois corrigée (get-pending-jobs sert la
// description de la fiche), rien ne la faisait repartir : l'article restait
// hors ligne jusqu'à un geste de la personne.
//
// LA RÈGLE : une remise en ligne sortie de la file pour une cause que le
// serveur corrige désormais (signature PRÉCISE dans la trace de l'échec,
// plateforme visée) repart toute seule — UNE fois par cause et par job
// (`recreation_relancee[code]`). Si elle rate encore, elle ressort de la file
// par la porte ordinaire (2 échecs, 2 h) et n'est plus relancée pour cette
// cause : le nouveau diagnostic est la mesure qui manquait.
// Les essais déjà ratés sont mis de côté (`recreation_essais_avant_relance`),
// sinon la sortie de file la reprendrait au passage suivant, avant tout essai.
export const CAUSES_LEVEES_PAR_LE_SERVEUR = [
  {
    code: "description_beebs_trop_courte",
    plateformes: ["beebs"],
    signature: /Ajouter au moins 5 caract/i,
    // « Ajouter au moins 5 caractères » vaut aussi pour un TITRE trop court :
    // la cause n'est la nôtre que si la copie n'a pas de description.
    condition: (job) => String(job?.description ?? "").trim().length < 5,
    // get-pending-jobs v251 : toute remise en ligne Beebs part avec au moins
    // 5 caractères (annonce → fiche → faits du job).
    correctif: "get-pending-jobs sert la description de la fiche (ou des faits du job) à toute remise en ligne Beebs",
  },
];

/** Les textes où vit le motif d'un échec de remise en ligne. */
function textesEchec(job) {
  const pf = job?.platform_fields ?? {};
  return [
    String(job?.error ?? ""),
    String(pf.error_technique?.brut ?? ""),
    String(pf.recreation_reprise?.brut ?? ""),
    typeof pf.last_diagnostic === "string" ? pf.last_diagnostic : JSON.stringify(pf.last_diagnostic ?? ""),
    ...(Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees.map((e) => String(e?.erreur ?? "")) : []),
  ].join(" \n ");
}

/** La cause levée qui permet de relancer ce job, ou null. */
export function causeLeveePourRelance(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.action !== "republish" || job?.status !== "needs_user") return null;
  if (pf.needs_user_source !== SOURCE_RECREATION_BLOQUEE || pf.republish_step !== "deleted") return null;
  if (causeCompte(pf)) return null; // la cause est le compte : jamais relancé d'office
  const textes = textesEchec(job);
  for (const c of CAUSES_LEVEES_PAR_LE_SERVEUR) {
    if (!c.plateformes.includes(job.platform)) continue;
    if (pf.recreation_relancee && pf.recreation_relancee[c.code]) continue; // une fois par cause
    if (c.signature.test(textes) && (!c.condition || c.condition(job))) return c;
  }
  return null;
}

/** Le platform_fields du job remis en file pour cette cause (pur). */
export function champsRelanceCauseLevee(pf0 = {}, cause, maintenant = new Date().toISOString()) {
  const pf = { ...pf0 };
  pf.recreation_essais_avant_relance = {
    le: maintenant,
    recreation_reprises: pf.recreation_reprises ?? null,
    recreation_reprise: pf.recreation_reprise ?? null,
    recreation_tentee: pf.recreation_tentee ?? null,
    recreation_bloquee: pf.recreation_bloquee ?? null,
  };
  delete pf.recreation_reprises; delete pf.recreation_reprise; delete pf.recreation_tentee;
  delete pf.recreation_bloquee; delete pf.needs_user_source; delete pf.next_action_after; delete pf.processing_since;
  delete pf.pas_de_rouge; delete pf.error_technique;
  pf.recreation_relancee = { ...(pf.recreation_relancee ?? {}), [cause.code]: { le: maintenant, par: "handler-watch", correctif: cause.correctif } };
  return pf;
}

/** Le message de la remise en file : vrai, sans durée promise. */
export function messageRelanceCauseLevee(job) {
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  return `Ton annonce${titre ? ` « ${titre} »` : ""} est hors ligne sur ${nom} : sa remise en ligne avait échoué à cause d'un défaut de notre côté, `
    + `maintenant corrigé. FillSell la remet en ligne tout seul, rien à faire de ton côté. Titre, description, photos et champs sont gardés.`;
}
