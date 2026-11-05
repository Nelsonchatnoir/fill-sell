// ═══════════════════════════════════════════════════════════════════════════
// LES CARACTÈRES INVISIBLES NE PARTENT JAMAIS VERS UNE PLATEFORME (05/11, point 6 — Smail Lachkar, ee5fc232)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : « ​Basket Asics Gel-Lethal MP 7… » — le titre ET la description commencent par une espace de largeur nulle
// (U+200B). La fiche vient d'un relevé Leboncoin (origine releve_leboncoin, 03/11 20:23) : le caractère était dans
// l'annonce Leboncoin de la personne (copier-coller), invisible. Vinted le refuse (« Tu ne peux pas utiliser les
// caractères spéciaux (​) dans le champ Titre ») et la publication demandait à la personne d'écrire un autre titre —
// pour un caractère qu'elle ne peut pas voir. Mesuré le 05/11 sur le parc : 18 titres et 527 descriptions de fiches
// en portent (relevés Leboncoin, Beebs, eBay, Vinted) ; aucun ne vient de notre génération.
// LA RÈGLE : avant tout envoi (dépôt, republication, recréation), toutes plateformes, le titre et la description
// perdent leurs caractères INVISIBLES ; les espaces spéciales deviennent des espaces ordinaires. Les accents, la
// ponctuation, les emojis (et le ZWJ qui lie deux emojis, les sélecteurs de variante) ne bougent pas. La fiche de la
// personne ne change pas : seul le texte ENVOYÉ est nettoyé (get-pending-jobs au service, l'extension avant de taper).
// Pur (Deno + Node + navigateur) ; jamais d'expression rationnelle à « lookbehind » (un vieux Safari ne la lit pas).
import { titreEnvoye } from "./casse-titre.js";
import { archiverErreur } from "./erreurs-archivees.js";

// Supprimés : largeur nulle (200B-200D hors emoji, 2060-2064, FEFF), marques de sens (200E, 200F, 061C, 202A-202E,
// 2066-2069), trait d'union conditionnel (00AD), séparateur mongol (180E), annotations (FFF9-FFFB), contrôles C0 (hors
// tabulation et retour à la ligne), DEL, contrôles C1.
const INVISIBLE = (c) =>
  (c >= 0x200B && c <= 0x200D) || (c >= 0x2060 && c <= 0x2064) || c === 0xFEFF
  || c === 0x200E || c === 0x200F || c === 0x061C || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069)
  || c === 0x00AD || c === 0x180E || (c >= 0xFFF9 && c <= 0xFFFB)
  || (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F || (c >= 0x80 && c <= 0x9F);
// Espaces spéciales → espace ordinaire : insécables (00A0, 202F, 2007), espaces typographiques (2000-200A), 205F,
// 3000, 1680, et la tabulation.
const ESPACE_SPECIALE = (c) =>
  c === 0x00A0 || c === 0x202F || (c >= 0x2000 && c <= 0x200A) || c === 0x205F || c === 0x3000 || c === 0x1680 || c === 0x09;
// Séparateurs de ligne et de paragraphe Unicode → retour à la ligne. Un retour à la ligne d'un TITRE reste à sa règle
// d'avant (Vinted seul le change en espace, titreSansSautDeLigne, 25/10) : rien de plus ici.
const SEPARATEUR_LIGNE = (c) => c === 0x2028 || c === 0x2029;

let PICTO = null;
try { PICTO = new RegExp("\\p{Extended_Pictographic}", "u"); } catch { PICTO = null; }
const estEmoji = (ch) => {
  if (!ch) return false;
  const c = ch.codePointAt(0);
  if (c === 0xFE0F || (c >= 0x1F3FB && c <= 0x1F3FF)) return true;   // sélecteur emoji, teintes de peau
  return PICTO ? PICTO.test(ch) : c >= 0x1F000;
};

function nettoyer(texte, { multiligne }) {
  const src = Array.from(String(texte ?? "").replace(/\r\n?/g, "\n"));
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const c = ch.codePointAt(0);
    // Le ZWJ qui lie deux emojis (👩‍👩‍👧, 🏳️‍🌈) fait partie de l'emoji : gardé ; seul, il est invisible.
    if (c === 0x200D && estEmoji(src[i - 1]) && estEmoji(src[i + 1])) { out += ch; continue; }
    if (INVISIBLE(c)) continue;
    if (ESPACE_SPECIALE(c)) { out += " "; continue; }
    if (SEPARATEUR_LIGNE(c) || c === 0x0A) { out += "\n"; continue; }
    out += ch;
  }
  if (!multiligne) return out.replace(/ {2,}/g, " ").trim();
  // Description : les lignes gardent leur forme ; seules les espaces de fin de ligne et le blanc des extrémités partent.
  return out.split("\n").map((l) => l.replace(/ +$/, "")).join("\n").trim();
}

/** Le titre envoyé : sans caractère invisible, espaces ordinaires (ses retours à la ligne : la règle Vinted du 25/10). */
export function nettoyerTitre(titre) { return titre == null ? titre : nettoyer(titre, { multiligne: false }); }
/** La description envoyée : sans caractère invisible, ses lignes gardées. */
export function nettoyerDescription(description) { return description == null ? description : nettoyer(description, { multiligne: true }); }

/** Le texte porte-t-il un caractère invisible ou une espace spéciale (ce que le nettoyage retire ou remplace) ? */
export function porteInvisibles(texte) {
  const s = String(texte ?? "");
  return nettoyer(s, { multiligne: true }) !== s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/ +$/, "")).join("\n").trim();
}

/** Une chaîne faite UNIQUEMENT de caractères invisibles ou d'espaces (le « (​) » d'un refus de Vinted). */
export function seulementInvisibles(texte) {
  const s = String(texte ?? "");
  return s.length > 0 && nettoyer(s, { multiligne: false }) === "";
}

/** Le job tel qu'il part vers l'extension : titre, description et textes de recréation nettoyés. Inchangé = même objet. */
export function jobSansInvisibles(job) {
  if (!job || typeof job !== "object") return job;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  const titre = nettoyerTitre(job.title);
  const description = nettoyerDescription(job.description);
  let pfNeuf = pf;
  if (pf) {
    const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : null;
    const snapTitre = snap ? nettoyerTitre(snap.titre) : null;
    const snapDesc = snap ? nettoyerDescription(snap.description) : null;
    const saisi = typeof pf.titre_saisi === "string" ? nettoyerTitre(pf.titre_saisi) : pf.titre_saisi;
    if ((snap && (snapTitre !== snap.titre || snapDesc !== snap.description)) || saisi !== pf.titre_saisi) {
      pfNeuf = { ...pf, titre_saisi: saisi };
      if (pf.titre_saisi === undefined) delete pfNeuf.titre_saisi;
      if (snap) pfNeuf.republish_snapshot = { ...snap, titre: snapTitre, description: snapDesc };
      if (snap && snap.titre === undefined) delete pfNeuf.republish_snapshot.titre;
      if (snap && snap.description === undefined) delete pfNeuf.republish_snapshot.description;
    }
  }
  if (titre === job.title && description === job.description && pfNeuf === pf) return job;
  return { ...job, title: titre, description, ...(pf ? { platform_fields: pfNeuf } : {}) };
}

// ── Le refus de Vinted pour un caractère INVISIBLE (« caractères spéciaux (​) ») ─────────────────────────────────
// Lu sur le motif du refus du champ Titre : les caractères entre parenthèses sont TOUS invisibles → c'est notre envoi
// qui est en cause, jamais la personne. Réponse rangée comme une réponse (titre_saisi + titre_refuse : get-pending-jobs
// l'écrit sur le job, l'ancien titre archivé), une fois par job (titre_invisibles_retires). Un caractère VISIBLE
// (« ★ ») reste la question d'avant.
const MOTIF_CARACTERES_SPECIAUX_RE = /caract[èe]res? sp[ée]ciaux?\s*\(([^)]*)\)/i;
export function refusPourInvisibles(motifRefus) {
  const m = MOTIF_CARACTERES_SPECIAUX_RE.exec(String(motifRefus ?? ""));
  return Boolean(m && seulementInvisibles(m[1]));
}
export function repriseTitreInvisibles({ titre, pf = {}, motifRefus, maintenant = new Date().toISOString(), par = "update-job-status (pas-de-rouge)" }) {
  if (!refusPourInvisibles(motifRefus)) return null;
  if (pf && pf.titre_invisibles_retires) return null;
  const avant = String((typeof pf?.titre_saisi === "string" && pf.titre_saisi.trim()) ? pf.titre_saisi : (titre ?? ""));
  const apres = nettoyerTitre(avant);
  if (!apres || apres === avant) return null;
  return {
    avant, apres,
    pf: {
      titre_refuse: { motif: String(motifRefus), le: maintenant },
      titre_saisi: apres,
      titre_invisibles_retires: { le: maintenant, par },
    },
  };
}

/** Le message de la reprise : rien à faire, la fiche ne change pas. */
export function messageRepriseInvisibles(acteMaj) {
  return `Vinted refusait un caractère invisible au début ou dans le titre (copié avec le texte de ton annonce) : FillSell ` +
    `l'a retiré du texte envoyé, ta fiche ne change pas. ${acteMaj} repart toute seule, rien à faire de ton côté.`;
}

const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];

/**
 * questions-tranchees (handler-watch), règle 10 : une question « Titre » posée parce que Vinted refusait un caractère
 * INVISIBLE est tranchée par le titre sans lui — la publication (ou la republication) repart, comme après une réponse
 * de la personne. Une passe par job (titre_invisibles_retires) ; titre_refuse GARDÉ (get-pending-jobs écrit titre_saisi
 * sur le job au service et archive l'ancien). La fiche ne change pas.
 * @returns {null | { avant: string, apres: string, platform_fields: Record<string, unknown> }}
 */
export function titreInvisiblesATrancher(job, maintenant = new Date().toISOString()) {
  if (!job || job.status !== "needs_user") return null;
  if (job.action !== "publish" && job.action !== "republish") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  if (!pf || pf.needs_user_source !== "champ_a_choisir") return null;
  if (pf.needsUserField?.target?.key !== "titre_saisi") return null;
  if (!refusPourInvisibles(pf.titre_refuse?.motif)) return null;
  if (pf.titre_invisibles_retires) return null;
  const avant = titreEnvoye({ title: job.title, action: job.action, platform_fields: { ...pf, titre_saisi: undefined } });
  const apres = nettoyerTitre(avant);
  if (!apres || apres === avant) return null;
  const np = { ...pf };
  for (const k of ["needs_user_source", "needsUserField", "needsUserFields", ...TICKS]) delete np[k];
  np.needsUserAttempts = 0;
  np.titre_saisi = apres;
  np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), titre_saisi: apres };
  np.titre_invisibles_retires = { le: maintenant, par: "handler-watch (questions tranchées, règle 10)" };
  np.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error ?? null, "needs_user",
    "handler-watch (titre : caractère invisible retiré)");
  return { avant, apres, platform_fields: np };
}
