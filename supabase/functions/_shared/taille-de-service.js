// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE SERVIE — PLUS JAMAIS UN ARTICLE BLOQUÉ PAR UNE CORRESPONDANCE
// (06/10 soir, exigence de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : patrick giry, « ASOS Design Jeans Mom High Rise
// Relaxed Bleu Clair W28 L32 » (06/10 18:46) — eBay : « eBay n'accepte que
// ses propres valeurs pour Taille (W28 L32 refusée) » ; Opla : « Opla
// n'accepte pas la taille W28 L32 ». La grille eBay porte « 38 », la grille
// Opla « M » : la même taille, que tailles.js refusait de traduire (« un W ne
// devient jamais un nombre nu »). Recensement du 06/10 (rapport) : W/L, nombres
// femme sur des grilles en lettres (Opla, jupes Vinted), « Ajustable » (Beebs),
// âges suivis de leur stature entre parenthèses.
//
// LA RÈGLE, EXPLICITE, DANS CET ORDRE — on s'arrête à la première qui répond :
//   R0 tailles.js (tailleDansGrille), INCHANGÉ : tout ce qui passait passe à
//      l'identique (exact, orthographe, pays, W lu dans une grille qui écrit
//      des W, étiquettes composites, nombre nu → EU, stature enfant).
//   R3 l'âge et sa stature entre parenthèses (« 12 ans (140-152 cm) ») : la
//      partie hors parenthèses, puis celle du dedans — même taille, R0.
//   R4 « Ajustable », « Réglable » : une seule taille qui s'ajuste = « Taille
//      unique » de la grille (R0).
//   R1 TOUR DE TAILLE (« W28 », « W28 L32 », « 28/32 », « 28x32 ») → le nombre
//      français par LA table que Vinted publie dans ses grilles (« W28 | FR
//      38 », relevé du 18/09, fixture tailles-publiees-2026-09-18.json : chaque
//      W a UN seul FR), puis R0 sur « FR n ». Le L ne choisit jamais rien ;
//      « 34/36 » (fourchette française possible) reste une question.
//   R2 NOMBRE FRANÇAIS → LETTRE, FEMMES seulement, et seulement face à une
//      grille SANS AUCUNE taille chiffrée (Opla « XXS…8XL », jupes Vinted) :
//      la table que Vinted (« M / 38 / 10 »), Leboncoin (« 38 - M ») et Beebs
//      (« M / 38 ») publient tous trois — 30 XXXS, 32 XXS, 34 XS, 36 S, 38 M,
//      40 L, 42 XL, 44 XXL, 46 XXXL, 48 4XL … 58 9XL — puis R0 sur la lettre
//      (« XXXL » ≡ « 3XL »). Point G du 28/09 : il interdisait une table
//      « générique » ; celle-ci est celle des plateformes, et elle ne joue que
//      là où la grille cible n'a AUCUN nombre (elle ne peut donc jamais
//      contredire une option chiffrée). Hommes : aucune table publiée → question.
//   Sinon : null — la personne choisit (exception rare, nommée au rapport) :
//      demi-pointure sur une grille d'entiers, col « 17-1/2 », « 34/36 »,
//      UK/US/IT absents de la grille, nombre homme sur une grille en lettres,
//      âge sur une grille adulte (rayon faux).
// ⛔ EU n'est jamais lu comme un FR (pour Vinted femme, FR 40 = EU 38) ; UK,
//    US, IT, DE ne se convertissent jamais.
// ⛔ La fiche n'est jamais réécrite : seule la valeur servie à la plateforme.
//
// ES module pur (Deno + Node), un seul import relatif lui-même sans import.
import { tailleDansGrille } from "./tailles.js";

// W (pouces) → FR, la table publiée par Vinted (« W28 | FR 38 »).
export const FR_PAR_TOUR_DE_TAILLE = Object.freeze({
  23: 32, 24: 34, 25: 34, 26: 36, 27: 36, 28: 38, 29: 38, 30: 40, 31: 40,
  32: 42, 33: 42, 34: 44, 35: 44, 36: 46, 38: 48, 40: 50, 42: 52, 44: 54,
  46: 56, 48: 58, 50: 60, 52: 62, 54: 64,
});
// FR (femme) → lettre, la table publiée par Vinted, Leboncoin et Beebs.
export const LETTRE_FEMME_PAR_FR = Object.freeze({
  30: "XXXS", 32: "XXS", 34: "XS", 36: "S", 38: "M", 40: "L", 42: "XL", 44: "XXL",
  46: "XXXL", 48: "4XL", 50: "5XL", 52: "6XL", 54: "7XL", 56: "8XL", 58: "9XL",
});

const plier = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/,/g, ".").replace(/[\s_\-–—]+/g, " ").replace(/\s+/g, " ").trim();

// Même lecture que tailles.js (lireTourDeTaille), recopiée ici pour ne pas
// toucher le module partagé avec l'extension : { w, l } | { ambigu } | null.
export function lireTourDeTaille(v) {
  const s = plier(v);
  const plausible = (w, l) => w >= 23 && w <= 54 && (l === null || (l >= 26 && l <= 38));
  let m = /^w\s*(\d{2})(?:\s*(?:\/|x)?\s*l\s*(\d{2}))?$/.exec(s)
    || /^(\d{2})\s*w(?:\s*(?:\/|x)?\s*(\d{2})\s*l)?$/.exec(s);
  if (m) {
    const w = Number(m[1]), l = m[2] === undefined ? null : Number(m[2]);
    return plausible(w, l) ? { w, l } : null;
  }
  m = /^(\d{2})\s*x\s*(\d{2})$/.exec(s);
  if (m && plausible(Number(m[1]), Number(m[2]))) return { w: Number(m[1]), l: Number(m[2]) };
  m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(s);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a % 2 === 0 && b === a + 2) return { ambigu: true };
    if (plausible(a, b)) return { w: a, l: b };
  }
  return null;
}

// Un nombre FRANÇAIS (nu, « T38 », « taille 38 », « FR 38 ») ; jamais un EU.
function nombreFrancais(v) {
  const m = /^(?:(?:fr|t|taille)\s*)?(\d{2})(?:\s*fr)?$/.exec(plier(v));
  return m ? Number(m[1]) : null;
}

const options = (grille) => (Array.isArray(grille) ? grille : [])
  .map((o) => String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
// Une grille « en lettres » : aucune option ne porte une taille CHIFFRÉE
// (« 38 », « FR 38 », « EU 38 », « UK 10 », « W30 », « 86 cm », ni comme
// morceau d'une étiquette « M / 38 / 10 ») — « 3XL », « 4XL » sont des lettres.
const tailleChiffree = (morceau) => /^(?:(?:fr|eu|it|uk|us|de|t)\s*)?\d{1,3}(?:\.\d)?(?:\s*cm)?$/.test(plier(morceau))
  || /^w\s*\d{2}/.test(plier(morceau));
const grilleSansChiffre = (grille) => options(grille)
  .every((o) => !o.split(/\s+[-–—]\s+|[/|·•]+/).some((m) => tailleChiffree(m.trim())));

/**
 * La branche d'un article, lue sur ce que le job sait (chemin de rayon,
 * Département eBay, genre) : 'femme' | 'homme' | 'enfant' | null.
 */
/** @param {...unknown} indices @returns {'femme'|'homme'|'enfant'|null} */
export function brancheDeTaille(...indices) {
  const t = indices.flat(Infinity).map((x) => plier(x)).join(" | ");
  if (!t.trim()) return null;
  if (/\b(filles?|garcons?|enfants?|bebes?|girls?|boys?|kids?|juniors?)\b/.test(t)) return "enfant";
  if (/\b(femmes?|women|womens|woman|dames?)\b/.test(t)) return "femme";
  if (/\b(hommes?|men|mens|man|messieurs?)\b/.test(t)) return "homme";
  return null;
}

/**
 * LA fonction : la valeur à servir pour `brut` dans `grille`, ou null.
 * @param {unknown} brut
 * @param {unknown[]} grille
 * @param {{branche?: string|null, sansR0?: boolean}} [opts]
   `sansR0` : l'appelant a déjà sa propre comparaison stricte de la valeur brute
   (Beebs, « jamais approchée ») — seules les règles R1 → R4 s'ajoutent.
 * @returns {{valeur:string, motif:string, regle:'R0'|'R1'|'R2'|'R3'|'R4'}|null}
 */
export function tailleDeService(brut, grille, opts = {}) {
  const valeur = String(brut ?? "").trim();
  const opt = options(grille);
  if (!valeur || !opt.length) return null;
  const branche = opts?.branche ?? null;
  const r0 = (v) => tailleDansGrille(v, opt);

  // R0 — inchangé.
  const a = opts?.sansR0 ? null : r0(valeur);
  if (a) return { ...a, regle: "R0" };

  // R3 — l'âge et sa stature entre parenthèses.
  const par = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(valeur);
  if (par) {
    for (const morceau of [par[1], par[2]]) {
      const r = morceau.trim() ? r0(morceau.trim()) : null;
      if (r) return { valeur: r.valeur, motif: `« ${morceau.trim()} » lu hors parenthèses (${r.motif})`, regle: "R3" };
    }
  }

  // R4 — ajustable = taille unique.
  if (/^(ajustable|reglable|adjustable|taille ajustable|taille reglable)$/.test(plier(valeur))) {
    const r = r0("Taille unique");
    if (r) return { valeur: r.valeur, motif: "« Ajustable » = taille unique", regle: "R4" };
  }

  // R1 — tour de taille → FR (table publiée par Vinted), puis la grille.
  let fr = null;
  const tour = lireTourDeTaille(valeur);
  if (tour?.w) {
    fr = FR_PAR_TOUR_DE_TAILLE[tour.w] ?? null;
    if (fr != null) {
      const r = r0(`FR ${fr}`) ?? r0(String(fr));
      if (r) return { valeur: r.valeur, motif: `tour de taille W${tour.w} = FR ${fr} (table publiée par Vinted)`, regle: "R1" };
    }
  }
  if (tour?.ambigu) return null;

  // R2 — nombre français → lettre, femmes, grille sans aucun chiffre.
  const n = fr ?? nombreFrancais(valeur);
  if (n != null && branche === "femme" && grilleSansChiffre(opt)) {
    const lettre = LETTRE_FEMME_PAR_FR[n];
    const r = lettre ? r0(lettre) : null;
    if (r) {
      return {
        valeur: r.valeur,
        motif: `${tour?.w ? `W${tour.w} = FR ${n}` : `FR ${n}`} = ${lettre} (table femme publiée par Vinted, Leboncoin et Beebs ; grille en lettres)`,
        regle: "R2",
      };
    }
  }
  return null;
}

/**
 * La valeur à SERVIR quand la grille de la plateforme n'est pas connue du
 * serveur mais qu'elle n'écrit JAMAIS de tour de taille (Leboncoin :
 * « 38 - M », relevé du 07/09 ; aucune option en W) : « W28 L32 » → « 38 ».
 * null quand ce n'est pas un tour de taille, ou un tour ambigu.
 */
export function tourDeTailleEnFrancais(brut) {
  const tour = lireTourDeTaille(String(brut ?? "").trim());
  if (!tour?.w) return null;
  const fr = FR_PAR_TOUR_DE_TAILLE[tour.w];
  return fr != null ? { valeur: String(fr), motif: `tour de taille W${tour.w} = FR ${fr} (table publiée par Vinted)` } : null;
}
