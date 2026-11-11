// ═══════════════════════════════════════════════════════════════════════════
// (11/11, L1 — chemin résiduel 1, décision de Nico) UNE TÂCHE DÉJÀ PRISE QUAND SON ARTICLE EST RETIRÉ : CE QU'ELLE PUBLIE
// REPART AUSSITÔT
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 11/11 : « aucun chemin ne remet en ligne un article retiré sans geste du client — une tâche déjà prise par un
// ordinateur au moment du retrait doit revérifier avant d'agir ».
// LE TROU. L'extension (ordinateurs et Cloud, même code) ne relit rien avant son clic final : seule sa borne de temps
// l'arrête (FILLSELL_ABANDON_REMPLISSAGE, 0.6.178, Leboncoin/Beebs/Vinted). Une tâche « processing » va donc au bout, et
// update-job-status ÉCRIT son « publié » :
//   · fiche supprimée « avec retrait » pendant la tâche : l'app (executerSuppression) et le filet serveur
//     (inventaire_arme_retraits_avant_suppression) l'annulent (« Annulé : l'article a été supprimé du stock », sans
//     arret_utilisateur) ; controler_job_extension laisse passer, ecrire_statut_job_extension écrit sur « cancelled » ;
//   · article retiré « partout » depuis le compte relié (L1) : la traversée ne touche jamais une tâche en cours, elle la
//     nomme dans son bilan (usage_logs « retrait_partout_compte_relie », taches_laissees) ;
//   · republication en vol dont l'annonce reçoit un retrait (logo, bandeau…) : get-pending-jobs ne clôt que les
//     republications NON engagées ; celle-ci recrée l'annonce.
// L'annonce neuve était en ligne, et rien ne la retirait.
// LE FILET (serveur, update-job-status, toutes les versions d'extension, le Cloud compris) : le « publié » s'écrit comme
// avant (l'annonce est SUIVIE), puis le retrait de l'annonce qui vient de partir est armé par la voie ordinaire — une tâche
// « delete » par son lien ou son numéro (jamais un titre), comme le logo du Stock. Ni lien ni numéro : aucun retrait, la
// tâche est marquée (retrait_apres_publication_attendu) et le journal le dit.
// ⛔ Jamais : « Supprimer la fiche, laisser les annonces en ligne » (annonces_laissees_en_ligne : le choix de la personne) ;
// une annulation pour une autre raison ; une PUBLICATION à côté d'un retrait de la même fiche (la remise en vente suit
// le retrait de la vendue : c'est le circuit normal).
// (Relecture du 11/11) La RACINE d'abord : une tâche annulée par la suppression de sa fiche n'accepte plus aucune écriture
// d'un poste sauf son « publié » (tacheAnnuleeParSuppression, 409 dans update-job-status) — plus de résurrection en file.
// A suit le CHOIX de la personne (marque annulee_par_suppression.avec_retrait, posée à l'annulation par le déclencheur
// de 20261111180000 : sans elle, A ne retire rien) ; B ne vaut que pour une tâche EN COURS laissée par L1 et l'essai
// commencé avant le bilan ; C se borne au début de l'essai et à SA fiche ; idempotent ; une colonne restée sur
// l'ancienne annonce d'une republication compte comme « sans lien ». Un « publié » sans lien ni numéro est marqué
// (retrait_apres_publication_attendu) : le lecteur du lien tardif (même migration) arme son retrait dès qu'un lien sûr
// arrive — jamais un lien retrouvé par le titre.
// ⛔ Deux chaînes tenues (selftest) : pose_par ne contient pas « armer_retrait_job » (l'app et handler-watch y lisent un
// retrait d'article VENDU) ; chemin ne commence pas par « vente_ » (_shared/retrait-vente-prouvee.js).
// Le vrai correctif (l'extension revérifie juste avant le clic) demande une nouvelle version : RAPPORT.md de
// docs/enquetes/retrait-comptes-relies-1111/, § « Chemins résiduels fermés ». Verrou : npm run selftest:publication-apres-retrait.
// Pur (Deno + Node).
import { identifiantsVises } from "./retenue-creneau.js";
import { numeroAnnonceDuJob } from "./retrait-deja-absent.js";

export const CHEMIN_PUBLICATION_APRES_RETRAIT = "publication_apres_retrait";
export const POSE_PAR_PUBLICATION_APRES_RETRAIT = "update-job-status (publiée après le retrait de son article)";
export const FEATURE_BILAN_RETRAIT_PARTOUT = "retrait_partout_compte_relie";
export const MOTIF_PUBLICATION_APRES_RETRAIT = Object.freeze({
  FICHE_SUPPRIMEE: "fiche_supprimee_pendant_la_tache",
  RETRAIT_PARTOUT_COMPTE_RELIE: "article_retire_partout_compte_relie",
  ANNONCE_RETIREE_PENDANT_LA_REPUBLICATION: "annonce_retiree_pendant_la_republication",
});
// Les deux textes de l'annulation d'une tâche à la suppression de sa fiche « avec retrait » : l'app (FR / EN,
// src/App.jsx executerSuppression) et le filet serveur (inventaire_arme_retraits_avant_suppression, FR).
export const MESSAGES_ANNULATION_SUPPRESSION_FICHE = Object.freeze([
  "Annulé : l'article a été supprimé du stock",
  "Cancelled: the item was deleted from stock",
]);
const STATUTS_RETRAIT_VIVANT = Object.freeze(["pending", "processing", "needs_user", "deleted"]);
const STATUTS_RETRAIT_OUVERT = Object.freeze(["pending", "processing", "needs_user"]);
export const STATUTS_RETRAIT_OUVERTS = STATUTS_RETRAIT_OUVERT;
const RAYON_CANONIQUE_LBC = "vetements"; // même règle que l'extension (lienLeboncoinOuvrable) et _shared/annonce-lien.ts
// (Relecture du 11/11) Le refus d'une écriture qui ressusciterait une tâche annulée par la suppression de sa fiche (409,
// même forme que « Arrêtée à ta demande » : l'extension lit l'erreur et son statut, ne re-tente rien).
export const MESSAGE_TACHE_ARTICLE_SUPPRIME = "Article supprimé du stock : cette tâche est arrêtée, rien à faire.";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const texte = (v) => { const s = String(v ?? "").trim(); return s || null; };
const estUneUrl = (s) => /[/:]/.test(String(s));

/**
 * (Relecture du 11/11, la racine) Cette tâche a-t-elle été annulée par la SUPPRESSION de sa fiche (avec ou sans retrait) ?
 * Fiche partie (inventaire_id NULL, clé étrangère SET NULL) ET la trace de la suppression : le texte de l'app ou du filet,
 * « laisser les annonces en ligne » (inventaire_supprimer_sans_retrait), ou la marque posée à l'annulation
 * (20261111180000). Aucune écriture d'un poste ne la ressuscite : seul son « publié » passe. (pur)
 */
export function tacheAnnuleeParSuppression(job) {
  if (!job || String(job.status ?? "") !== "cancelled" || !("inventaire_id" in job) || job.inventaire_id != null) return false;
  const pf = objet(job.platform_fields) ?? {};
  return MESSAGES_ANNULATION_SUPPRESSION_FICHE.includes(String(job.error ?? "").trim())
    || Boolean(pf.annonces_laissees_en_ligne) || Boolean(pf.fiche_supprimee_le) || Boolean(objet(pf.annulee_par_suppression));
}

/** Les numéros (jamais une URL entière) de l'annonce que vise cette tâche : la clé de la lecture des retraits (C). (pur) */
export function numerosVises(job) {
  return [...identifiantsVises(job)].filter((t) => t && !estUneUrl(t));
}

/**
 * L'état d'AVANT l'écriture du « publié » d'une republication : les identifiants de son ANCIENNE annonce. (pur)
 * @returns {string[]}
 */
export function identifiantsAvantPublication(jobAvant) {
  return String(jobAvant?.action ?? "") === "republish" ? [...identifiantsVises(jobAvant)].filter(Boolean).map(String) : [];
}

/**
 * La tâche dont le « publié » arrive a-t-elle vu son article retiré pendant qu'elle travaillait ? Le motif, ou null. (pur)
 * @param {any} jobAvant  la ligne cross_post_jobs telle qu'en base AVANT l'écriture du « publié »
 * @param {{ bilans?: any[], retraits?: any[] }} [faits]
 *   bilans   : les lignes usage_logs « retrait_partout_compte_relie » du compte nées depuis le début de l'essai ;
 *   retraits : les tâches « delete » du compte, sur la plateforme, par numéro de l'ancienne annonce, nées depuis le début de
 *              l'essai (republication seulement ; arme_par en colonne ou dans platform_fields).
 * (Relecture du 11/11) Le DÉBUT DE L'ESSAI qui publie (platform_fields.processing_since, posé à la prise) borne B et C :
 * une relance par la personne après le retrait (« Republier maintenant », « À régler ») est un geste — jamais un retrait.
 */
export function retraitPendantLaTache(jobAvant, { bilans = [], retraits = [] } = {}) {
  if (!jobAvant || !["publish", "republish"].includes(String(jobAvant.action ?? "publish"))) return null;
  const pf = objet(jobAvant.platform_fields) ?? {};
  if (pf.annonces_laissees_en_ligne) return null;
  // (7) Idempotence : un retrait déjà armé (ou attendu faute de lien) pour cette publication ne se réarme jamais.
  if (pf.retrait_apres_publication || pf.retrait_apres_publication_attendu) return null;
  const id = String(jobAvant.id ?? "");
  const debut = Date.parse(String(pf.processing_since ?? ""));
  // A. Fiche supprimée pendant la tâche, et la personne a CHOISI le retrait : la marque posée à l'annulation par
  //    20261111180000 le dit (avec_retrait : un retrait de la fiche était armé à cet instant). Suppression « simple »
  //    (aucune annonce retirée), publication annulée sans annonce, ou marque absente : jamais (le choix de la personne).
  if (tacheAnnuleeParSuppression(jobAvant) && MESSAGES_ANNULATION_SUPPRESSION_FICHE.includes(String(jobAvant.error ?? "").trim())
      && objet(pf.annulee_par_suppression)?.avec_retrait === true) {
    return MOTIF_PUBLICATION_APRES_RETRAIT.FICHE_SUPPRIMEE;
  }
  // B. La traversée L1 l'a laissée finir parce qu'elle était EN COURS, et c'est CET essai-là qui publie (commencé avant
  //    le bilan). Une republication engagée, un dépôt avec numéro : la traversée les annule (décision de Nico).
  if (id && Number.isFinite(debut) && (Array.isArray(bilans) ? bilans : []).some((b) => {
    const t = Date.parse(String(b?.created_at ?? ""));
    const taches = objet(b?.metadata)?.taches_laissees;
    return Number.isFinite(t) && debut <= t && Array.isArray(taches)
      && taches.some((x) => String(x?.job ?? "") === id && String(x?.motif ?? "") === "en_cours");
  })) return MOTIF_PUBLICATION_APRES_RETRAIT.RETRAIT_PARTOUT_COMPTE_RELIE;
  // C. Republication en vol : un retrait de SON annonce (même compte, même fiche, même plateforme, même numéro) est né
  //    après le DÉBUT DE L'ESSAI qui publie.
  if (String(jobAvant.action ?? "") === "republish" && Number.isFinite(debut)) {
    const vises = identifiantsVises(jobAvant);
    const touche = (Array.isArray(retraits) ? retraits : []).some((d) => {
      if (!d || String(d.action ?? "") !== "delete" || String(d.id ?? "") === id) return false;
      if (String(d.user_id ?? "") !== String(jobAvant.user_id ?? "") || String(d.platform ?? "") !== String(jobAvant.platform ?? "")) return false;
      if (String(d.inventaire_id ?? "") !== String(jobAvant.inventaire_id ?? "")) return false;
      if (!STATUTS_RETRAIT_VIVANT.includes(String(d.status ?? ""))) return false;
      const t = Date.parse(String(d.created_at ?? ""));
      if (!Number.isFinite(t) || t < debut) return false;
      const arme = objet(d.arme_par) ?? objet(objet(d.platform_fields)?.arme_par) ?? {};
      if (String(arme.republication ?? "") === id || String(arme.chemin ?? "") === CHEMIN_PUBLICATION_APRES_RETRAIT) return false;
      const num = String(numeroAnnonceDuJob(d) ?? "").trim().toLowerCase();
      return Boolean(num) && vises.has(num);
    });
    if (touche) return MOTIF_PUBLICATION_APRES_RETRAIT.ANNONCE_RETIREE_PENDANT_LA_REPUBLICATION;
  }
  return null;
}

/**
 * La ligne cross_post_jobs du retrait de l'annonce qui vient de partir — la voie ordinaire (celle du logo du Stock),
 * par son lien ou son numéro — ou null quand ni l'un ni l'autre n'est connu (jamais un retrait par le titre). (pur)
 * @param {any} job  la tâche telle qu'en base APRÈS l'écriture du « publié »
 * @param {{ motif: string, maintenantIso?: string, identifiantsAvant?: string[] }} o
 *   identifiantsAvant : (republication) les identifiants de l'ANCIENNE annonce, lus avant l'écriture
 *   (identifiantsAvantPublication) — une colonne qui en porte un, ou porte old_*, compte comme « sans lien ».
 */
export function ligneRetraitApresPublication(job, { motif, maintenantIso = new Date().toISOString(), identifiantsAvant = [] }) {
  if (!job?.id || !job?.user_id) return null;
  const pf = objet(job.platform_fields) ?? {};
  const p = String(job.platform ?? "");
  // (9) Republication : jamais l'ANCIENNE annonce (celle qu'on retirait), même restée dans les colonnes.
  const anciens = String(job.action ?? "") === "republish"
    ? new Set([...(Array.isArray(identifiantsAvant) ? identifiantsAvant : []).map((x) => String(x).toLowerCase()),
      ...identifiantsVises({ platform: p, platform_fields: { old_listing_url: pf.old_listing_url, old_platform_listing_id: pf.old_platform_listing_id,
        republish_snapshot: pf.republish_snapshot } })])
    : new Set();
  const ancien = (v) => v != null && (anciens.has(String(v).toLowerCase())
    || anciens.has(String(numeroAnnonceDuJob({ platform: p, listing_url: v }) ?? "").toLowerCase()));
  let url = texte(job.listing_url);
  if (url && ancien(url)) url = null;
  // Le lien est ce qui vient de partir : son numéro prime sur une colonne restée d'avant (republication).
  let num = (url ? texte(numeroAnnonceDuJob({ platform: p, listing_url: url })) : null) ?? texte(job.platform_listing_id);
  if (num && anciens.has(num.toLowerCase())) num = null;
  if (!num && p === "leboncoin") {
    const d = objet(pf.lbc_depot) ?? {};
    const candidat = texte(objet(d.adsubmit)?.id) ?? texte(objet(d.sans_adsubmit)?.id);
    if (candidat && /^\d{6,}$/.test(candidat) && !anciens.has(candidat)) num = candidat;
  }
  if (!num && url) num = texte(numeroAnnonceDuJob({ platform: p, listing_url: url }));
  if (!url && num && p === "leboncoin" && /^\d{6,}$/.test(num)) url = `https://www.leboncoin.fr/ad/${RAYON_CANONIQUE_LBC}/${num}`;
  if (!url && num && p === "vinted" && /^\d{6,}$/.test(num)) url = `https://www.vinted.fr/items/${num}`;
  if (!url && !num) return null;
  const pfR = {
    arme_par: { chemin: CHEMIN_PUBLICATION_APRES_RETRAIT, motif: String(motif ?? ""), le: maintenantIso, depot: String(job.id),
      pose_par: POSE_PAR_PUBLICATION_APRES_RETRAIT },
  };
  if (p === "vinted" && texte(pf.vinted_account_id)) pfR.vinted_account_id = String(pf.vinted_account_id).trim();
  if (p === "depop" && /^\d+$/.test(String(pf.depop_product_id ?? ""))) pfR.depop_product_id = pf.depop_product_id;
  return {
    user_id: job.user_id, inventaire_id: job.inventaire_id ?? null, platform: p, action: "delete", status: "pending",
    photo_option: "original", title: texte(job.title)?.slice(0, 200) ?? null, listing_url: url, platform_listing_id: num,
    platform_fields: pfR,
  };
}

/** Un retrait encore ouvert vise-t-il déjà cette annonce (même plateforme, même numéro ou même lien) ? (pur) */
export function retraitDejaOuvert(retraits, ligne) {
  if (!ligne) return false;
  const num = String(ligne.platform_listing_id ?? numeroAnnonceDuJob(ligne) ?? "").trim();
  const url = String(ligne.listing_url ?? "").trim();
  return (Array.isArray(retraits) ? retraits : []).some((d) => d && String(d.action ?? "") === "delete"
    && String(d.platform ?? "") === String(ligne.platform ?? "") && STATUTS_RETRAIT_OUVERT.includes(String(d.status ?? ""))
    && ((num && String(numeroAnnonceDuJob(d) ?? "").trim() === num) || (url && String(d.listing_url ?? "").trim() === url)));
}

/** Les champs de la tâche publiée dont le retrait vient d'être armé (le serveur le dit, sur elle). (pur) */
export function champsPublicationApresRetrait(pf0, { motif, retraitId, maintenantIso = new Date().toISOString() }) {
  const pf = { ...(objet(pf0) ?? {}) };
  pf.pending_removal = false;
  pf.retrait_arme = { job: String(retraitId ?? ""), le: maintenantIso, chemin: CHEMIN_PUBLICATION_APRES_RETRAIT };
  pf.retrait_apres_publication = { le: maintenantIso, motif: String(motif ?? ""), retrait: String(retraitId ?? ""), par: POSE_PAR_PUBLICATION_APRES_RETRAIT };
  return pf;
}

/** Les champs de la tâche publiée sans lien ni numéro : aucun retrait possible, la tâche le porte. (pur) */
export function champsPublicationSansLien(pf0, { motif, maintenantIso = new Date().toISOString() }) {
  return {
    ...(objet(pf0) ?? {}),
    retrait_apres_publication_attendu: { le: maintenantIso, motif: String(motif ?? ""), par: POSE_PAR_PUBLICATION_APRES_RETRAIT,
      raison: "ni lien ni numéro : jamais un retrait par le titre" },
  };
}
