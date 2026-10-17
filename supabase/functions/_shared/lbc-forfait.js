// ══════════════════════════════════════════════════════════════════════════
// LEBONCOIN N'OFFRE PLUS QUE « VALIDER ET PAYER » À UN COMPTE PRO : FILLSELL
// PRÉPARE LE DÉPÔT, LA PERSONNE PAIE ELLE-MÊME (18/10, décision de Nico) —
// UNE CARTE PAR COMPTE, JAMAIS UN PAIEMENT PAR FILLSELL
// ══════════════════════════════════════════════════════════════════════════
// DeadRoz, 14/10 : son compte Leboncoin est devenu PRO (formulaire pro :
// « Vos conditions générales de vente », « Référence », « Type d'article
// neuf », « Poids du colis »). Hors forfait, l'écran /deposer-une-annonce/options
// n'offre plus que « Voir détail » et « Valider et payer » (états du bundle
// Leboncoin relevés le 21/09 : out_of_bundle, out_of_subscription_quota_*).
// En une nuit, 26 dépôts ont buté sur ce mur et 5 sont passés, intercalés,
// avec les mêmes 10 photos : ni le pack photos ni l'annonce, le COMPTE.
//
// LA RÈGLE (une seule source, lue par l'extension, l'app ET le serveur) :
//   · un compte est PRO quand l'un de ses jobs Leboncoin porte un champ du SEUL
//     formulaire pro (`general_sales_condition`, `custom_ref` — preuve de la
//     porte pro de get-pending-jobs : 18/18 pro, 0/7 particuliers), dans son
//     erreur ou ses erreurs archivées ; get-pending-jobs le dit à l'extension
//     (platform_fields.compte_pro) et l'extension le voit aussi sur le
//     formulaire. Un particulier n'entre JAMAIS ici : son mur payant est le pack
//     photos, il se règle annonce par annonce, rien ne change pour lui ;
//   · (18/10) PUBLICATION d'un compte pro au mur : l'extension prépare le dépôt
//     jusqu'à l'écran « Valider et payer », LAISSE L'ONGLET OUVERT dans la
//     fenêtre de la personne et pose le motif EXACT `lbc_valider_et_payer`
//     (needs_user, aucune tentative consommée). La personne clique elle-même
//     « Valider et payer » ; FillSell ne paie JAMAIS. L'extension surveille cet
//     onglet : page de confirmation → dépôt « publié » (preuve
//     `paiement_utilisateur`, numéro lu si la page le montre) ; onglet fermé →
//     noté (la carte propose « Préparer à nouveau »). UNE publication préparée à
//     la fois par compte : tant qu'une attente de paiement est VIVANTE (moins de
//     24 h, onglet non fermé), get-pending-jobs ne sert aucune autre publication
//     Leboncoin (retenue silencieuse, rien d'écrit) ; sinon il en sert UNE ;
//   · (18/10) REPUBLICATION pas encore retirée d'un compte pro au mur : retenue
//     (needs_user, motif du mur, « retenue avant essai »), parce qu'un redépôt
//     payant retirerait l'annonce en ligne pour la laisser hors ligne jusqu'au
//     paiement. Elle repart quand une publication Leboncoin du compte passe SANS
//     paiement (le forfait couvre de nouveau) ; un dépôt payé par la personne ne
//     prouve rien sur le forfait ;
//   · ANCIENNES EXTENSIONS (motif `lbc_options_payant_seulement`, mur vu sans
//     onglet gardé) : règle du 17/10 inchangée — rien sur ce mur, UN éclaireur
//     (la plus ancienne PUBLICATION) sur le « C'est fait » de la carte ou tout
//     seul au plus toutes les 12 h (poste vu < 24 h), tout repart quand une
//     publication passe. Dès que le poste a la nouvelle extension, c'est elle
//     qui pose le nouveau motif ;
//   · le mur n'hérite jamais d'une question passée (update-job-status, toutes
//     versions) ; l'app rassemble tout en UNE carte par compte (« À régler ») ;
//     jamais soldé à 72 h tant que ça a moins de 30 j.
// Pur (Deno + Node + Vite), sans import. Jumeau de lbc-identite.js.

export const MOTIF_LBC_PAYANT = "lbc_options_payant_seulement";
/** (18/10) Le dépôt est PRÊT sur l'écran « Valider et payer », l'onglet attend la personne. */
export const MOTIF_LBC_A_PAYER = "lbc_valider_et_payer";
export const MOTIFS_LBC_PAIEMENT = Object.freeze([MOTIF_LBC_PAYANT, MOTIF_LBC_A_PAYER]);
/** La preuve d'un dépôt payé par la personne (lbcDepot.preuve) : il ne prouve rien sur le forfait. */
export const PREUVE_PAIEMENT_UTILISATEUR = "paiement_utilisateur";
export const ECLAIREUR_FORFAIT_INTERVALLE_MS = 12 * 3_600_000;
export const ESPACEMENT_REPRISE_FORFAIT_MS = 45_000;
export const FENETRE_FORFAIT_MS = 30 * 86_400_000;
/** Une attente de paiement est VIVANTE 24 h (onglet ouvert) ; après, la suivante peut être préparée. */
export const ATTENTE_PAIEMENT_MS = 24 * 3_600_000;
export const URL_LEBONCOIN = "https://www.leboncoin.fr/";

/** Les champs que seul le formulaire d'un compte PRO porte (relevés du 10/09). */
export const PREUVE_PRO_RE = /general_sales_condition|custom_ref/;
/** Le même relevé en filtre PostgREST (erreur courante ou archivée d'un job). */
export const FILTRE_PREUVE_PRO =
  "error.ilike.*general_sales_condition*,error.ilike.*custom_ref*," +
  "platform_fields->>erreurs_archivees.ilike.*general_sales_condition*,platform_fields->>erreurs_archivees.ilike.*custom_ref*";
/** « Mise à jour de ligne d'adressage requise » : un geste de COMPTE que Leboncoin réclame sur son écran (14/10). */
export const ADRESSAGE_RE = /ligne d[’']adressage/i;
/** Les marqueurs d'une question passée : un mur de paiement n'en garde aucun. */
export const MARQUEURS_QUESTION_PASSEE = Object.freeze([
  "needsUserField", "needsUserFields", "champs_a_completer", "server_required_fields", "serverRequired", "needsUserBoucle",
]);

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : 0; };

/** Le motif posé par l'extension sur cette tâche (last_diagnostic.quoi), ou null. */
export function motifDiagnostic(job) {
  const d = pfDe(job).last_diagnostic;
  return d && typeof d === "object" ? String(d.quoi ?? "") || null : null;
}

/** Ce job Leboncoin prouve-t-il que son compte est PRO (erreur courante ou archivée) ? */
export function jobProuvePro(job) {
  if (!job || job.platform !== "leboncoin") return false;
  if (PREUVE_PRO_RE.test(String(job.error ?? ""))) return true;
  const arch = pfDe(job).erreurs_archivees;
  return Array.isArray(arch) && arch.length > 0 && PREUVE_PRO_RE.test(JSON.stringify(arch));
}

/** Le compte est-il prouvé PRO par l'un de ses jobs Leboncoin ? */
export function compteProuvePro(jobs) {
  return (Array.isArray(jobs) ? jobs : []).some(jobProuvePro);
}

/** Le mur VU par l'extension sur ce job (sa date, en ms) — 0 pour une retenue avant essai ou un autre motif. */
export function murVuLe(job) {
  if (!MOTIFS_LBC_PAIEMENT.includes(motifDiagnostic(job))) return 0;
  const d = pfDe(job).last_diagnostic;
  if (d && d.retenue_avant_essai === true) return 0;
  return ms(d && d.at);
}

/** Le dernier mur VU parmi ces jobs (ms), 0 s'il n'y en a aucun. */
export function dernierMurForfait(jobs) {
  return (Array.isArray(jobs) ? jobs : []).reduce((m, j) => Math.max(m, murVuLe(j)), 0);
}

/** (18/10) Le motif du dernier mur VU : `lbc_valider_et_payer` (nouvelle extension) ou `lbc_options_payant_seulement`. */
export function dernierMotifMur(jobs) {
  let m = 0, motif = null;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    const t = murVuLe(j);
    if (t > m) { m = t; motif = motifDiagnostic(j); }
  }
  return motif;
}

/** Un dépôt payé par la personne (lbcDepot.preuve = paiement_utilisateur) ne prouve rien sur le forfait. */
export function publicationPayee(p) {
  const pf = pfDe(p);
  const depot = pf.lbc_depot ?? pf.lbcDepot;
  const preuve = p && (p.preuve ?? (depot && typeof depot === "object" ? depot.preuve : null));
  return String(preuve ?? "") === PREUVE_PAIEMENT_UTILISATEUR;
}

/** Une publication Leboncoin est-elle passée SANS paiement après ce mur ? (la preuve que le forfait couvre de nouveau les dépôts) */
export function publicationApresMur(publications, mur) {
  return (Array.isArray(publications) ? publications : [])
    .some((p) => String(p?.status ?? "") === "published" && ms(p?.published_at) > mur && !publicationPayee(p));
}

/** Cette tâche attend-elle que le compte PRO retrouve un dépôt sans paiement (ou que la personne paie celui qui est prêt) ? */
export function attendForfaitLbc(job, comptePro) {
  if (!comptePro || !job || job.platform !== "leboncoin" || job.status !== "needs_user") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  if (job.action === "republish" && pf.republish_step === "deleted") return false; // recréation : son propre circuit
  return MOTIFS_LBC_PAIEMENT.includes(motifDiagnostic(job));
}

/** (18/10) Le dépôt de cette tâche est PRÊT sur l'écran « Valider et payer » (onglet laissé à la personne). */
export function estAttentePaiement(job) {
  return !!job && job.platform === "leboncoin" && job.status === "needs_user"
    && String(job.action ?? "publish") === "publish" && motifDiagnostic(job) === MOTIF_LBC_A_PAYER;
}

/** (18/10) L'attente de paiement est VIVANTE : moins de 24 h, onglet pas fermé. */
export function attentePaiementVivante(job, maintenant = Date.now()) {
  if (!estAttentePaiement(job)) return false;
  const pf = pfDe(job);
  if (pf.attente_paiement && pf.attente_paiement.onglet_ferme_le) return false;
  const depuis = ms(pf.attente_paiement && pf.attente_paiement.depuis) || ms(pf.last_diagnostic && pf.last_diagnostic.at);
  return depuis > 0 && maintenant - depuis < ATTENTE_PAIEMENT_MS;
}

/** (18/10) Les attentes de paiement vivantes d'un compte (la plus ancienne d'abord). */
export function attentesPaiementVivantes(jobs, maintenant = Date.now()) {
  return (Array.isArray(jobs) ? jobs : []).filter((j) => attentePaiementVivante(j, maintenant))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesForfaitLbc(jobs, comptePro) {
  return (Array.isArray(jobs) ? jobs : []).filter((j) => attendForfaitLbc(j, comptePro))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
}

/** Un job que get-pending-jobs retient avant tout essai quand le compte est au mur. */
export function candidatRetenueForfait(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const action = String(job.action ?? "publish");
  if (action === "publish") return true;
  return action === "republish" && pfDe(job).republish_step !== "deleted";
}

/** L'éclaireur relancé APRÈS le dernier mur vu (une publication seulement). */
export function estEclaireurForfait(job, mur) {
  if (String(job?.action ?? "publish") !== "publish") return false;
  const e = ms(pfDe(job).forfait_lbc?.eclaireur_le);
  return e > 0 && e > mur;
}

/** Le partage d'un poll (ancienne extension, mur `lbc_options_payant_seulement`) : au plus UN éclaireur servi, toutes les autres retenues. */
export function partagerCandidatsForfait(candidats, mur) {
  const servis = [];
  const retenus = [];
  for (const j of Array.isArray(candidats) ? candidats : []) {
    if (!servis.length && estEclaireurForfait(j, mur)) servis.push(j);
    else retenus.push(j);
  }
  return { servis, retenus };
}

/** (18/10) Une attente de paiement CLOSE SANS PAIEMENT (onglet fermé, ou 24 h passées) : rien ne se prépare tout seul derrière. */
export function attentePaiementCloseSansPaiement(job, maintenant = Date.now()) {
  if (!estAttentePaiement(job)) return false;
  return !attentePaiementVivante(job, maintenant);
}

/** (18/10) La personne a demandé « Préparer à nouveau » (carte) après le dernier mur : cette publication passe, quoi qu'il en soit. */
export function preparationDemandeeApres(job, mur) {
  if (String(job?.action ?? "publish") !== "publish") return false;
  const p = ms(pfDe(job).forfait_lbc?.prepare_de_nouveau_le);
  return p > 0 && p > (Number(mur) || 0);
}

/**
 * (18/10) Le partage d'un poll quand le dernier mur est `lbc_valider_et_payer` (nouvelle
 * extension) : UNE publication à la fois. Passe toujours : la publication que la
 * personne a demandé de « Préparer à nouveau » après le mur. Sinon, UNE publication
 * seulement si `autoServir` (aucune attente vivante, aucune attente close sans
 * paiement — après un paiement, ou la première fois) ; les autres publications
 * restent en file SANS écriture (`silencieux`) ; les republications pas encore
 * retirées sont retenues (`retenus`, needs_user, carte).
 */
export function partagerCandidatsAPayer(candidats, autoServir, mur = 0) {
  const servis = [], silencieux = [], retenus = [];
  for (const j of Array.isArray(candidats) ? candidats : []) {
    if (String(j?.action ?? "publish") !== "publish") { retenus.push(j); continue; }
    if (!servis.length && (preparationDemandeeApres(j, mur) || autoServir)) servis.push(j); else silencieux.push(j);
  }
  return { servis, silencieux, retenus };
}

/**
 * (18/10) Après un paiement (plus aucune attente de paiement en cours), la publication
 * suivante se prépare toute seule : la plus ancienne PUBLICATION retenue ou au mur
 * (needs_user, motif du mur), à remettre en file. Null s'il n'y en a pas.
 */
export function prochainePublicationAPreparer(jobs) {
  const l = (Array.isArray(jobs) ? jobs : [])
    .filter((j) => j && j.platform === "leboncoin" && j.status === "needs_user" && String(j.action ?? "publish") === "publish"
      && MOTIFS_LBC_PAIEMENT.includes(motifDiagnostic(j)) && !estAttentePaiement(j))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
  return l[0] ?? null;
}

/** L'éclaireur à relancer (ancienne extension seulement) : la plus ancienne PUBLICATION au mur `lbc_options_payant_seulement`, sauf essai récent. */
export function eclaireurForfaitLbc(jobs, comptePro, maintenant = Date.now(), intervalle = ECLAIREUR_FORFAIT_INTERVALLE_MS, dernierLance = 0) {
  const l = attentesForfaitLbc(jobs, comptePro)
    .filter((j) => String(j.action ?? "publish") === "publish" && motifDiagnostic(j) === MOTIF_LBC_PAYANT);
  if (!l.length) return null;
  const dernier = l.reduce((m, j) => Math.max(m, ms(pfDe(j).forfait_lbc?.eclaireur_le)), Number(dernierLance) || 0);
  if (dernier && maintenant - dernier < intervalle) return null;
  return l[0];
}

/** Les platform_fields d'une tâche retenue avant tout essai (get-pending-jobs) ; `motif` = le motif du mur du compte. */
export function champsRetenueForfait(pf, maintenantIso, motif = MOTIF_LBC_PAYANT) {
  const out = { ...(pf ?? {}) };
  for (const k of MARQUEURS_QUESTION_PASSEE) delete out[k];
  delete out.processing_since;
  out.needs_user_source = "relancer";
  out.last_diagnostic = {
    quoi: MOTIFS_LBC_PAIEMENT.includes(motif) ? motif : MOTIF_LBC_PAYANT, at: maintenantIso, retenue_avant_essai: true,
    detail: "retenue avant tout essai : le compte Leboncoin (pro) est au mur du paiement",
  };
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), retenue_le: maintenantIso };
  return out;
}

/** Les platform_fields de l'éclaireur relancé (geste de la carte ou passage serveur). */
export function champsEclaireurForfait(pf, par, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
    "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), eclaireur_le: maintenantIso, par, n: (Number(out.forfait_lbc?.n) || 0) + 1 };
  return out;
}

/** (18/10) Les platform_fields d'une publication à PRÉPARER DE NOUVEAU (geste de la carte : l'onglet a été fermé). */
export function champsPreparerDeNouveau(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
    "next_action_after", "processing_since", "attente_paiement"]) delete out[k];
  out.needsUserAttempts = 0;
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), prepare_de_nouveau_le: maintenantIso, n_preparations: (Number(out.forfait_lbc?.n_preparations) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée quand une publication est passée (rang k : 45 s × k). */
export function champsRepriseForfait(pf, k, maintenantMs) {
  const out = { ...(pf ?? {}) };
  for (const c of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "processing_since", "attente_paiement"]) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_FORFAIT_MS).toISOString();
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), reprise_le: new Date(maintenantMs).toISOString(), par: "publication_passee" };
  return out;
}

/** Un mur de ce compte porte-t-il la demande de « ligne d'adressage » ? */
export function adressageDemande(jobs) {
  return (Array.isArray(jobs) ? jobs : []).some((j) => ADRESSAGE_RE.test(String(j?.error ?? "")));
}

/** Le message d'une tâche retenue avant tout essai (ancienne extension ; aucune durée, aucun mot technique). */
export const MSG_FORFAIT_LBC_RETENUE =
  "Pas encore envoyée : ton compte Leboncoin est un compte pro, et hors forfait Leboncoin fait payer chaque nouvelle annonce " +
  "(son dernier écran n'offre plus que « Valider et payer »). FillSell ne paie jamais à ta place et n'envoie plus rien sur ce mur : " +
  "vérifie ton forfait dans ton espace pro Leboncoin, puis appuie sur « C'est fait » dans « À régler ».";

/** (18/10) Le message d'une REPUBLICATION retenue pendant que le compte pro est au mur. */
export const MSG_FORFAIT_LBC_REPUBLICATION_RETENUE =
  "Republication retenue : ton compte Leboncoin est un compte pro hors forfait, et un redépôt serait payant — FillSell ne retire pas " +
  "ton annonce en ligne pour la laisser hors ligne jusqu'à un paiement. Elle repart toute seule dès qu'une annonce de ton compte " +
  "passe sans paiement sur Leboncoin (quand ton forfait couvre de nouveau les dépôts).";

/** (18/10) Le message d'une publication PRÊTE sur « Valider et payer » (le même texte dans l'extension : content-scripts/leboncoin.js). */
export const MSG_LBC_A_PAYER =
  "Ton annonce est prête sur Leboncoin : dans l'onglet Leboncoin ouvert sur ton ordinateur, clique « Valider et payer » " +
  "(ton compte pro est hors forfait, Leboncoin fait payer ce dépôt). FillSell ne paie jamais à ta place. " +
  "Si l'onglet a été fermé, appuie sur « Préparer à nouveau » dans « À régler ».";
