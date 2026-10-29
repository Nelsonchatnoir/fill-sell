// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE DU CONTENU D'UNE ANNONCE — RELANCER UN REFUS BEEBS, C'EST CHANGER LE CONTENU D'ABORD
// (29/10, lot B 4.6 — XEWER, 10 jeux vidéo refusés à la vérification Beebs)
// ═══════════════════════════════════════════════════════════════════════════
// Le refus de Beebs était PROUVÉ (_shared/beebs-sortie-verification.js : sortie de « en vérification », absente des
// lectures complètes « en ligne » sept jours plus tard, page 404) et le message le disait : « La reproposer à
// l'identique serait refusé de même ». L'app a pourtant laissé relancer les 10 À L'IDENTIQUE le 29/10 (même titre,
// même description, mêmes photos, même rayon) : 9 sur 10 refusés de nouveau. Défaut de notre fait.
//
// LA RÈGLE, pour tous les comptes : au refus prouvé, le serveur pose l'EMPREINTE du contenu déposé
// (refus_verification_beebs.empreinte_contenu = titre + description + liste des photos + rayon beebsCategoryPath).
// Une relance dont le contenu a la MÊME empreinte ne part pas :
//   · l'app (StockTab, « Relancer ») : le bouton dit « Change d'abord le texte, les photos ou le rayon : Beebs
//     refuserait la même annonce » et ne relance pas ;
//   · le serveur (get-pending-jobs) : une publication Beebs servie avec la même empreinte passe en needs_user
//     (needs_user_source « refus_beebs_meme_contenu »), aucune tentative consommée, jamais redéposée.
// La MÊME fonction pure ici pour l'app et le serveur (Deno l'importe par ../../../src/utils/empreinteContenu.js) :
// jamais deux calculs. Sans empreinte au refus (refus d'avant le 29/10, job lu sans son texte) : rien ne change.
// Pur, sans import (navigateur, Deno, Node).

/** Préfixe de version : une empreinte d'une autre version n'est jamais « la même » (on laisse partir). */
export const VERSION_EMPREINTE = "c1";
export const SOURCE_REFUS_BEEBS_MEME_CONTENU = "refus_beebs_meme_contenu";
export const MESSAGE_BOUTON_REFUS_BEEBS = Object.freeze({
  fr: "Change d'abord le texte, les photos ou le rayon : Beebs refuserait la même annonce",
  en: "Change the text, photos or category first: Beebs would refuse the same listing",
});

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
// Un espace de plus ou un retour à la ligne ne change pas l'annonce que Beebs examine.
const texte = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
function listePhotos(photos) {
  let p = photos;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = [p]; } }
  if (!Array.isArray(p)) return [];
  // L'ordre compte (la première photo est la vignette) ; l'adresse entière fait foi (?v= compris : une photo
  // remplacée au même chemin change de version).
  return p.map((x) => (typeof x === "string" ? x : String(objet(x).url ?? objet(x).src ?? ""))).map((u) => u.trim()).filter(Boolean);
}

// Hachage 53 bits (cyrb53), synchrone et identique partout : Math.imul sur les unités UTF-16 d'un texte NFC.
function hache(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * L'empreinte stable d'un contenu d'annonce.
 * @param {{ titre?: unknown, description?: unknown, photos?: unknown, rayon?: unknown }} [c]
 * @returns {string} « c1:<16 hex> »
 */
export function empreinteContenu({ titre = "", description = "", photos = [], rayon = [] } = {}) {
  const canon = JSON.stringify([
    texte(titre),
    texte(description),
    listePhotos(photos),
    (Array.isArray(rayon) ? rayon : []).map(texte).filter(Boolean),
  ]);
  return `${VERSION_EMPREINTE}:${hache(canon)}`;
}

/**
 * Le contenu que redéposerait ce job (titre, description, photos du job ; rayon Beebs de la copie), ou null quand le
 * job a été lu SANS son texte ou ses photos (colonnes non sélectionnées : on ne conclut rien).
 */
export function contenuDuJob(job) {
  if (!job || typeof job !== "object") return null;
  if (job.title === undefined || job.description === undefined || job.photos === undefined) return null;
  return { titre: job.title, description: job.description, photos: job.photos, rayon: objet(job.platform_fields).beebsCategoryPath };
}

/** L'empreinte du contenu d'un job, ou null (contenu pas en main). */
export function empreinteContenuDuJob(job) {
  const c = contenuDuJob(job);
  return c ? empreinteContenu(c) : null;
}

/** Le refus de vérification Beebs PROUVÉ que porte ce job, s'il porte l'empreinte du contenu refusé ; sinon null. */
export function refusBeebsAvecEmpreinte(job) {
  if (job?.platform !== "beebs" || !["publish", "republish"].includes(String(job?.action ?? "publish"))) return null;
  const r = objet(objet(job?.platform_fields).refus_verification_beebs);
  return typeof r.empreinte_contenu === "string" && r.empreinte_contenu.trim() ? r : null;
}

/**
 * Relancer ce job redéposerait-il le contenu que Beebs a refusé ?
 * @returns {null | { verdict: "meme_contenu" | "contenu_modifie" | "a_verifier", refus: Record<string, unknown> }}
 *   null : aucun refus Beebs avec empreinte — rien ne change ; « a_verifier » : le job n'a pas son contenu en main
 *   (liste de l'app : ni description ni photos), il faut le relire avant de conclure.
 */
export function relanceRefusBeebs(job) {
  const refus = refusBeebsAvecEmpreinte(job);
  if (!refus) return null;
  const e = empreinteContenuDuJob(job);
  if (!e) return { verdict: "a_verifier", refus };
  return { verdict: e === String(refus.empreinte_contenu).trim() ? "meme_contenu" : "contenu_modifie", refus };
}

/** Le motif du job retenu par le serveur (needs_user « refus_beebs_meme_contenu »). */
export function messageRefusBeebsMemeContenu(job) {
  const quoi = job?.action === "republish" ? "la nouvelle annonce" : "cette annonce";
  return `Beebs a refusé ${quoi} à sa vérification (Beebs ne dit pas pourquoi), et elle repartirait à l'identique : `
    + "même titre, même description, mêmes photos, même rayon — Beebs la refuserait de même. Rien n'a été envoyé à "
    + "Beebs, rien n'est décompté. Change d'abord le texte, les photos ou le rayon, puis relance.";
}
