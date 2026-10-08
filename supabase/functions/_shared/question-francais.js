// ══════════════════════════════════════════════════════════════════════════
// UNE QUESTION SE POSE EN FRANÇAIS, AVEC DES CHOIX FERMÉS (27/09)
// ══════════════════════════════════════════════════════════════════════════
// doriane-henri (Pro), 27/09 21:17 : « La catégorie « KID_SLEEPSACK_BOYS_NEW »
// exige une taille. » — un code de catégorie à l'écran, et des choix écrits
// « 0M, 0-3M, 12-18M, 2Y… ». Règle de Nico : toute question affiche des choix
// fermés en français, jamais un code.
//
// Ce module ne décide RIEN : il réécrit la question qu'un handler a posée
// (needsUserField + message) dans les mots de l'écran. La réponse choisie
// (« 18 mois ») est relue par le vocabulaire des tailles (tailleDansGrille :
// « 18 mois » ≡ « 18M ») au passage suivant — côté serveur (opla-completion)
// comme côté extension (pré-vol Opla).
//
// ES module SANS import Deno : chargé par Deno (Edge Functions) et par Node
// (selftest), même contrat que tailles.js.
import { libelleTaille } from "./tailles.js";

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };
const CHAMPS_TAILLE = new Set(["oplaSizeChoice", "size", "taille"]);
// Un code de catégorie Opla (« KID_SLEEPSACK_BOYS_NEW ») : majuscules et
// soulignés, au moins un souligné. Jamais montré.
const CODE_CATEGORIE_RE = /«\s*[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\s*»/;

/**
 * @param {{platform?:string, action?:string, pf?:Record<string,unknown>|null, message?:string|null}} arg
 * @returns {{pf?:Record<string,unknown>, message?:string}|null} ce qui change, ou null
 */
export function questionEnFrancais({ platform, action, pf, message }) {
  const nuf = pf && typeof pf === "object" ? pf.needsUserField : null;
  if (!nuf || typeof nuf !== "object") return null;
  const pfNuf = String(nuf.platform ?? platform ?? "");
  const nom = NOMS[pfNuf] ?? pfNuf;
  const cle = String(nuf.field_key ?? "");
  let pfOut = null;
  let msgOut = null;

  // ── Les choix d'une TAILLE : « 18M » → « 18 mois », « 2Y » → « 2 ans » ────
  if (CHAMPS_TAILLE.has(cle) && Array.isArray(nuf.allowed_values)) {
    const vus = new Set();
    const libelles = [];
    for (const v of nuf.allowed_values) {
      const brut = typeof v === "string" ? v : (v && typeof v === "object" ? (v.title ?? v.code ?? "") : String(v ?? ""));
      const l = libelleTaille(String(brut).trim());
      if (!l || vus.has(l)) continue;
      vus.add(l);
      libelles.push(l);
    }
    const change = libelles.length !== nuf.allowed_values.length
      || libelles.some((l, i) => l !== String(nuf.allowed_values[i]));
    if (change && libelles.length) {
      pfOut = { ...pf, needsUserField: { ...nuf, allowed_values: libelles, field_label: nuf.field_label && !/opla/i.test(String(nuf.field_label)) ? nuf.field_label : "Taille" } };
    }
  }

  // ── Le message : jamais un code de catégorie, jamais la liste en codes ────
  const m = String(message ?? "");
  const repart = action === "republish" ? "la republication repart" : action === "publish" ? "la publication repart" : "on repart";
  if (CHAMPS_TAILLE.has(cle) && (CODE_CATEGORIE_RE.test(m) || /exige une taille/i.test(m))) {
    msgOut = `${nom} demande la taille de cet article pour le déposer. Choisis-la dans la liste ci-dessous : un seul geste, et ${repart}.`;
  } else if (CHAMPS_TAILLE.has(cle) && /n'accepte pas la taille/i.test(m) && /accepte\s*:\s*[0-9]+[MY]\b/.test(m)) {
    const refusee = /«\s*([^»]+?)\s*»/.exec(m)?.[1] ?? "";
    msgOut = (refusee ? `${nom} n'accepte pas la taille « ${refusee} » pour ce type d'article.` : `${nom} n'accepte pas cette taille.`)
      + ` Choisis celle qui convient dans la liste ci-dessous : un seul geste, et ${repart}.`;
  } else if (CODE_CATEGORIE_RE.test(m)) {
    msgOut = m.replace(new RegExp(CODE_CATEGORIE_RE.source, "g"), "de cet article");
  }

  if (!pfOut && !msgOut) return null;
  return { ...(pfOut ? { pf: pfOut } : {}), ...(msgOut ? { message: msgOut } : {}) };
}
