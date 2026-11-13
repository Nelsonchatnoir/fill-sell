// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UNE PUBLICATION AUX PHOTOS D'UNE ANNONCE DÉJÀ EN LIGNE SUR LE COMPTE EST RETENUE
// (13/11/2026, lot du 13/11 — 3e réponse de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico : « Publication aux mêmes photos qu'une annonce déjà en ligne sur le compte : on la retient, avec un
// message clair (« Une annonce avec ces photos est déjà en ligne sur Leboncoin »). Rien n'est envoyé à Leboncoin. »
// Prouvé le 30/10 (essai réel) et sur 8 refus du 05/11 au 13/11 (cfdfda6f ×6, f44b5917 ×2 ; rapport LBC du 13/11,
// famille 2) : Leboncoin refuse un dépôt dont les photos sont celles d'une annonce en ligne du même compte ; sur 3 744
// dépôts vus en ligne depuis le 01/11, aucun n'avait un jumeau à fichier photo identique en ligne au dépôt.
//
// « LES MÊMES PHOTOS » (jamais un titre) : appariement 1-1 des photos de la publication et de celles de l'autre annonce,
// par le FICHIER (même adresse, ?v= compris) ou, quand le serveur les a lues, par l'EMPREINTE (dHash identique, pHash à
// 10 bits au plus — photo_empreintes) ; toutes les photos du plus petit des deux ensembles appariées. Une photo commune
// sur trois (bandeau de boutique, guide des tailles) n'en fait pas « les mêmes photos ».
// « UNE ANNONCE DÉJÀ EN LIGNE » (les occupants, lus par get-pending-jobs) : une annonce Leboncoin du relevé, en ligne,
// d'une AUTRE fiche du compte (`en_ligne`) ; un dépôt FillSell publié et pas encore relevé (`publie`) ; un dépôt en cours
// (`en_cours`) ou une publication servie avant celle-ci dans le même passage (`file`) — ces deux-là font ATTENDRE la
// publication sans rien écrire (elle est jugée au passage suivant, quand l'autre est partie ou a échoué).
// JAMAIS RETENUE : la même fiche (une republication remplace son annonce ; une remise en vente vise l'annonce vendue de
// sa fiche), deux exemplaires déclarés (quantité > 1 sur l'une des deux fiches, « Non, deux exemplaires » répondu sur la
// paire), une annonce prise par une vente (transaction lue « pending » / « sold » : elle n'est plus « en ligne », règle du
// 07/11), une republication dont le retrait est engagé (l'article ne reste jamais hors ligne pour ça), un retrait, une
// autre plateforme.
// LE SEUIL (mesuré, voir SEUIL_ANNONCES_MEMES_FICHIERS) : Leboncoin accepte la deuxième annonce aux mêmes fichiers et
// refuse la troisième — retenue à partir de deux jumelles en ligne ; une paire posée par le moteur, dès la première.
// L'EFFET : needs_user « lbc_memes_photos », le message de Nico (et les numéros des annonces), aucune tentative, hors quota
// (`hors_quota` { motif } : publications_du_cycle l'ignore) — levé quand la tâche part. La relance de l'app la remet en
// file ; le serveur la retient de nouveau tant que l'autre annonce est en ligne avec les mêmes photos.
// Pur (Deno + Node) : scripts/lbc-memes-photos-selftest.mjs.

export const SOURCE_LBC_MEMES_PHOTOS = "lbc_memes_photos";
export const MESSAGE_LBC_MEMES_PHOTOS = Object.freeze({
  fr: "Une annonce avec ces photos est déjà en ligne sur Leboncoin",
  en: "A listing with these photos is already live on Leboncoin",
});
export const PHASH_MAX_BITS = 10;
// ── COMBIEN D'ANNONCES AUX MÊMES FICHIERS AVANT DE RETENIR (mesuré le 13/11, lecture seule) ─────────────────────────
// Dépôts Leboncoin publiés depuis le 01/11 sur les comptes à jumeaux (cfdfda6f, f44b5917, bf85d176), selon le nombre
// d'annonces d'AUTRES fiches du compte en ligne AU DÉPÔT avec les mêmes fichiers photo : 0 → 528 en ligne, 1 refusé ;
// 1 → 14 en ligne, 1 refusé (f44b5917, compte de test ; cfdfda6f : 13 en ligne sur 13) ; 2 → 0 en ligne, 4 refusés
// (cfdfda6f f181149a, bf94a937, 76d55115 ; f44b5917 7f81d77f). Leboncoin accepte la DEUXIÈME annonce aux mêmes photos
// (un revendeur qui vend deux exemplaires) et refuse la TROISIÈME. Le seuil suit la mesure : retenue à partir de deux
// annonces en ligne aux mêmes fichiers. La décision de Nico du 13/11, au mot (« une annonce … déjà en ligne »), est
// SEUIL = 1 : une ligne à changer — question posée à Nico (rapport LBC2 du 13/11).
export const SEUIL_ANNONCES_MEMES_FICHIERS = 2;
// Une paire que le moteur a posée (« Est-ce le même article ? », photo identique, OUVERTE) : sans doute le même objet
// publié deux fois (42 réponses « Oui » sur 43, N6a) — retenue dès la première annonce (bf85d176, clavier, refusé).
export const SEUIL_PAIRE_DU_MOTEUR = 1;
const ETATS_DITS = new Set(["en_ligne", "publie"]);

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const actionDe = (job) => String(job?.action ?? "publish");
const fiche = (x) => (x === null || x === undefined || x === "" ? "" : String(x));
export const clePaire = (a, b) => [fiche(a), fiche(b)].sort().join(":");

/** Les adresses des photos (objet { url | original } ou chaîne), dans l'ordre, sans vide. */
export function urlsPhotosLbc(photos) {
  let p = photos;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = [p]; } }
  if (!Array.isArray(p)) return [];
  return p.map((x) => (typeof x === "string" ? x : String(objet(x).url ?? objet(x).original ?? ""))).map((u) => u.trim()).filter(Boolean);
}

const binaire64 = (s) => typeof s === "string" && /^[01]{64}$/.test(s) && !/^(0+|1+)$/.test(s);
function hamming(a, b) {
  let n = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++;
  return n;
}
/** Deux lignes photo_empreintes de la même image : dHash identique (utile), pHash proche quand les deux sont lus. */
export function memeEmpreinte(a, b) {
  if (!a || !b || !binaire64(a.dhash) || a.dhash !== b.dhash) return false;
  if (binaire64(a.phash) && binaire64(b.phash)) return hamming(a.phash, b.phash) <= PHASH_MAX_BITS;
  return true;
}

/**
 * Les photos de B (la publication) et de A (l'autre annonce) sont-elles « les mêmes » ?
 * @param {unknown} photosB @param {unknown} photosA
 * @param {{ empreintes?: Map<string, { dhash?: string, phash?: string }> }} [o]
 * @returns {{ identiques: boolean, n: number, k: number, preuve: "fichier"|"empreinte"|null }}
 */
export function memesPhotos(photosB, photosA, { empreintes } = {}) {
  const B = urlsPhotosLbc(photosB), A = urlsPhotosLbc(photosA);
  const k = Math.min(B.length, A.length);
  if (!k) return { identiques: false, n: 0, k, preuve: null };
  const prisB = new Set(), prisA = new Set();
  let parFichier = 0, parEmpreinte = 0;
  A.forEach((a, i) => {
    const j = B.findIndex((b, jj) => !prisB.has(jj) && b === a);
    if (j >= 0) { prisB.add(j); prisA.add(i); parFichier++; }
  });
  if (empreintes instanceof Map && empreintes.size) {
    A.forEach((a, i) => {
      if (prisA.has(i)) return;
      const ea = empreintes.get(a);
      const j = B.findIndex((b, jj) => !prisB.has(jj) && memeEmpreinte(ea, empreintes.get(b)));
      if (j >= 0) { prisB.add(j); prisA.add(i); parEmpreinte++; }
    });
  }
  const n = parFichier + parEmpreinte;
  return { identiques: n >= k, n, k, preuve: n >= k ? (parEmpreinte ? "empreinte" : "fichier") : null };
}

/** Une publication ou republication Leboncoin en attente — ce que la règle lit. */
export function estPublicationLbcEnAttente(job) {
  return job?.platform === "leboncoin" && String(job?.status ?? "") === "pending" && ["publish", "republish"].includes(actionDe(job));
}

/** Les numéros d'annonce que cette tâche remplace ou vise elle-même (jamais « une autre annonce »). */
function numerosPropres(job) {
  const pf = objet(job?.platform_fields);
  const s = new Set();
  const add = (x) => { const t = String(x ?? "").trim(); if (t) s.add(t); };
  if (actionDe(job) === "republish") add(job?.platform_listing_id);
  add(objet(pf.remise_en_vente).annonce_vendue);
  return s;
}

/**
 * Le juge. `candidats` : les tâches Leboncoin qui partiraient, DANS L'ORDRE où elles seraient servies.
 * `occupants` : [{ cle, numero, fiche, etat: "en_ligne"|"publie"|"en_cours", photos, priseParUneVente? }] (photos ENTIÈRES).
 * `quantites` : Map(fiche → quantité) ; `pairesNon` : Set(clePaire) des « Non, deux exemplaires » ; `empreintes` :
 * Map(url → { dhash, phash }) ; `retraitEngage(job)` : la republication a-t-elle déjà retiré son annonce ?
 * `pairesMoteur` : Set(clePaire) des questions « Est-ce le même article ? » ouvertes (photo identique) — seuil
 * `seuilMoteur` ; sinon `seuil` annonces jumelles DITES (en ligne, ou publiées pas encore relevées) retiennent, et des
 * jumelles en cours ou servies avant dans ce passage qui l'atteindraient font attendre (sans écriture).
 * @param {Array<Record<string, any>>} candidats
 * @param {{ occupants?: Array<Record<string, any>>, quantites?: Map<string, number>, pairesNon?: Set<string>,
 *           empreintes?: Map<string, { dhash?: string, phash?: string }>, retraitEngage?: (job: any) => boolean,
 *           pairesMoteur?: Set<string>, seuil?: number, seuilMoteur?: number }} [donnees]
 * @returns {Map<string, { retenir: true, silencieux: boolean, numero: string|null, numeros: string[], jumelles: number, fiche: string, preuve: string, n: number, k: number, etat: string }>}
 */
export function jugerMemesPhotosLbc(candidats, { occupants = [], quantites = new Map(), pairesNon = new Set(), empreintes = new Map(), retraitEngage = () => false,
  pairesMoteur = new Set(), seuil = SEUIL_ANNONCES_MEMES_FICHIERS, seuilMoteur = SEUIL_PAIRE_DU_MOTEUR } = {}) {
  const res = new Map();
  const qte = (f) => { const q = Number(quantites instanceof Map ? quantites.get(fiche(f)) : NaN); return Number.isFinite(q) ? q : 1; };
  const servis = [];
  for (const j of Array.isArray(candidats) ? candidats : []) {
    if (!estPublicationLbcEnAttente(j)) continue;
    const fJ = fiche(j.inventaire_id);
    const propres = numerosPropres(j);
    const tous = [...(Array.isArray(occupants) ? occupants : []), ...servis];
    // Les annonces jumelles (une par numéro, ou par tâche quand le dépôt n'a pas encore de numéro).
    const dites = new Map(), attentes = new Map();
    let moteur = false;
    if (!(actionDe(j) === "republish" && retraitEngage(j)) && qte(fJ) <= 1) {
      for (const o of tous) {
        const fO = fiche(o?.fiche);
        if (!o || o.priseParUneVente || (fJ && fO === fJ) || String(o.cle ?? "") === String(j.id)) continue;
        if (o.numero && propres.has(String(o.numero).trim())) continue;
        if (qte(fO) > 1 || (fJ && fO && pairesNon.has(clePaire(fJ, fO)))) continue;
        const m = memesPhotos(j.photos, o.photos, { empreintes });
        if (!m.identiques) continue;
        const v = { numero: o.numero ? String(o.numero) : null, fiche: fO, preuve: m.preuve, n: m.n, k: m.k, etat: String(o.etat ?? "") };
        const cle = v.numero ?? `tache:${String(o.cle ?? "")}`;
        (ETATS_DITS.has(v.etat) ? dites : attentes).set(cle, v);
        if (o.parMoteur || (fJ && fO && pairesMoteur instanceof Set && pairesMoteur.has(clePaire(fJ, fO)))) moteur = true;
      }
    }
    const lim = moteur ? Math.min(seuil, seuilMoteur) : seuil;
    const premier = [...dites.values()][0] ?? [...attentes.values()][0] ?? null;
    if (premier && dites.size >= lim) {
      res.set(String(j.id), { ...premier, retenir: true, silencieux: false, numeros: [...dites.values()].map((x) => x.numero).filter(Boolean), jumelles: dites.size });
      continue;
    }
    if (premier && dites.size + attentes.size >= lim) {
      res.set(String(j.id), { ...premier, retenir: true, silencieux: true, numeros: [...dites.values()].map((x) => x.numero).filter(Boolean), jumelles: dites.size + attentes.size });
      continue;
    }
    servis.push({ cle: String(j.id), numero: null, fiche: fJ, etat: "file", photos: j.photos });
  }
  return res;
}

/** Le message de la retenue (en base en français ; l'app le lit en anglais par utils/messagesServeur.js). */
export function messageLbcMemesPhotos(numeros, lang = "fr") {
  const ns = [...new Set((Array.isArray(numeros) ? numeros : [numeros]).map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (lang === "en") {
    return `${MESSAGE_LBC_MEMES_PHOTOS.en}${ns.length ? ` (${ns.map((x) => `no. ${x}`).join(", ")})` : ""}. Nothing was sent to Leboncoin, and this listing doesn't count toward your limits.`;
  }
  return `${MESSAGE_LBC_MEMES_PHOTOS.fr}${ns.length ? ` (${ns.map((x) => `n° ${x}`).join(", ")})` : ""}. Rien n'a été envoyé à Leboncoin, et cette publication ne compte pas dans tes limites.`;
}

/**
 * Ce que le serveur écrit sur la tâche retenue : { status, error, platform_fields }.
 * @param {any} job @param {any} verdict @param {{ maintenant?: number, par?: string }} [o]
 * @returns {{ status: string, error: string, platform_fields: Record<string, any> }}
 */
export function patchRetenueMemesPhotos(job, verdict, { maintenant = Date.now(), par = "get-pending-jobs" } = {}) {
  const pf = { ...objet(job?.platform_fields) };
  const le = new Date(maintenant).toISOString();
  pf.needs_user_source = SOURCE_LBC_MEMES_PHOTOS;
  const numeros = Array.isArray(verdict?.numeros) && verdict.numeros.length ? verdict.numeros : [verdict?.numero].filter(Boolean);
  pf[SOURCE_LBC_MEMES_PHOTOS] = { le, numero: verdict?.numero ?? null, numeros, jumelles: verdict?.jumelles ?? numeros.length,
    fiche: verdict?.fiche ?? null, preuve: verdict?.preuve ?? null, photos: `${verdict?.n ?? 0}/${verdict?.k ?? 0}`, etat: verdict?.etat ?? null, pose_par: par };
  // Hors quota pendant la retenue (rien n'est parti) ; un hors_quota déjà posé par une autre règle reste le sien.
  if (!("hors_quota" in pf)) pf.hors_quota = { motif: SOURCE_LBC_MEMES_PHOTOS, le };
  delete pf.processing_since;
  return { status: "needs_user", error: messageLbcMemesPhotos(numeros, "fr"), platform_fields: pf };
}

/** Au départ de la tâche : le hors quota posé par CETTE règle est levé (la publication compte). null = rien à écrire. */
export function leverHorsQuotaMemesPhotos(pf) {
  const p = objet(pf);
  if (objet(p.hors_quota).motif !== SOURCE_LBC_MEMES_PHOTOS) return null;
  const out = { ...p };
  delete out.hors_quota;
  return out;
}
