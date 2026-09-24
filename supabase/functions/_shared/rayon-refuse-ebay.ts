// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON REFUSÉ NE PART JAMAIS — CÔTÉ SERVEUR eBAY, VOIE API (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Le pendant serveur de src/utils/rayonApresRefus.js. Par la voie API, l'app
// laisse la ligne eBay telle qu'avant ce lot : le rayon que sa vérification a
// REFUSÉ reste sur le job, noté (categorie_verification.verdict + le chemin
// refusé). C'est ebay-api-worker qui tranche, avec les suggestions d'eBay —
// son catalogue ENTIER, lu en direct, là où notre arbre relevé n'a ni
// « Réseau » ni « Art, antiquités » (mesuré : un routeur 4G y serait resté
// sans aucun rayon possible).
//
// Jusqu'ici la « règle n°2 » du worker faisait l'essentiel (3 refus sur 3
// corrigés depuis le 10/09) mais ne le GARANTISSAIT pas : quand la première
// suggestion d'eBay était notre rayon refusé, ou que l'IA ne tranchait pas, le
// mapping refusé repartait tel quel (repli « mapping »). Ce module dit, sans
// réseau, si le mapping d'un job est un rayon refusé, et lesquels retirer des
// suggestions ; le worker s'en sert pour ne JAMAIS le retenir.
//
// ⛔ PÉRIMÈTRE : un job dont la vérification n'a rien refusé, ou dont le
//    mapping n'est pas le rayon refusé (un choix du vendeur, un rayon repris
//    par l'app), rend `null` — et le worker suit son chemin d'avant, au
//    caractère près.
// Module PUR : aucun import, aucun réseau (scripts/rayon-refuse-ebay-selftest.ts).
// ═══════════════════════════════════════════════════════════════════════════

/** Les verdicts de la vérification de l'app qui REFUSENT le rayon envisagé. */
export const VERDICTS_REFUS = new Set(["incoherent", "refuse_hors_famille", "descente_non_confirmee"]);

type Objet = Record<string, unknown>;
const objet = (v: unknown): Objet | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Objet : null);
const norme = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** Clé de comparaison d'un chemin : accents, casse et espaces neutralisés. */
export function cleChemin(chemin: unknown): string {
  return Array.isArray(chemin) ? chemin.map(norme).filter(Boolean).join(" > ") : "";
}

/** Les rayons que la vérification de l'app a refusés pour ce job (vide sans refus). */
export function cheminsRefusesParLApp(pf: Objet | null | undefined): string[][] {
  const verif = objet(pf?.categorie_verification);
  if (!verif || !VERDICTS_REFUS.has(String(verif.verdict ?? ""))) return [];
  const plaus = objet(pf?.categorie_plausibilite);
  const vus = new Set<string>();
  const sortie: string[][] = [];
  for (const c of [verif.chemin_icone, plaus?.chemin_ecarte]) {
    const k = cleChemin(c);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    sortie.push((c as unknown[]).map((s) => String(s)));
  }
  return sortie;
}

/**
 * Le mapping que porte le job EST-il un rayon refusé par l'app ?
 * Rend la liste des rayons refusés si oui, `null` sinon (chemin d'avant).
 */
export function mappingRefuseParLApp(pf: Objet | null | undefined, cheminMappe: unknown): string[][] | null {
  const k = cleChemin(cheminMappe);
  if (!k) return null;
  const refuses = cheminsRefusesParLApp(pf);
  return refuses.some((c) => cleChemin(c) === k) ? refuses : null;
}

/**
 * Les suggestions d'eBay privées des rayons refusés — par chemin, et par
 * l'identifiant du mapping refusé (les libellés d'eBay et ceux de notre arbre
 * relevé peuvent diverger d'un accent ; l'identifiant, jamais).
 */
export function suggestionsSansRefus<T extends { id: string; chemin: string[] }>(
  suggestions: T[], refuses: string[][], idRefuse: string | null,
): T[] {
  const cles = new Set(refuses.map(cleChemin));
  const id = String(idRefuse ?? "").trim();
  return suggestions.filter((s) => !cles.has(cleChemin(s.chemin)) && !(id && String(s.id) === id));
}
