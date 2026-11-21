// ═══════════════════════════════════════════════════════════════════════════
// NOS LISTES FIGÉES FACE AUX VRAIES LISTES DES PLATEFORMES (21/11/2026, lot de Nico, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico : toutes nos listes de valeurs (tailles, pointures, champs) doivent venir des VRAIES listes des
// plateformes, relues chez elles, avec un contrôle automatique qui compare nos listes aux leurs et signale tout écart.
// Ce module ne lit rien : il compare ce qu'on lui donne.
//   · ecartsGrillesParUnivers : une grille figée (lbc-grilles-univers.js) face à la DERNIÈRE lecture du même menu pour
//     le même univers (lbc_grilles_relevees) — options manquantes, options en trop, ordre ;
//   · libellesAbsents : des libellés que nous écrivons pour une plateforme (childSizes, tables de correspondance) et
//     qu'aucune de ses listes relevées ne porte ;
//   · champsAListesDependantes : un même champ, un même rayon, un même univers, et PLUSIEURS grilles lues — la liste
//     dépend d'un autre champ (Produit selon Type, Modèle selon Marque…) alors que le catalogue n'en garde qu'une.
// Pur ; Deno + Node + Vite.

const net = (v) => String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const libelleDe = (o) => net(typeof o === "string" ? o : (o?.label ?? o?.title ?? o?.value ?? o?.code ?? ""));

/**
 * @param {{ figees: Record<string, readonly string[]>, releves: Array<{ univers: string, options: unknown[], le?: string|null }> }} p
 *   releves : une ou plusieurs lectures par univers ; la plus récente (`le`) fait foi.
 * @returns {Array<{ univers: string, manquantes: string[], enTrop: string[], ordre: boolean, releveLe: string|null, sansReleve?: boolean }>}
 *   manquantes = chez la plateforme, absentes de notre grille ; enTrop = dans notre grille, absentes chez elle.
 */
export function ecartsGrillesParUnivers({ figees, releves }) {
  const dernier = new Map();
  for (const r of Array.isArray(releves) ? releves : []) {
    const u = net(r?.univers);
    if (!u || !Array.isArray(r?.options) || !r.options.length) continue;
    const avant = dernier.get(u);
    if (!avant || String(r.le ?? "") > String(avant.le ?? "")) dernier.set(u, r);
  }
  const out = [];
  for (const [univers, grille] of Object.entries(figees ?? {})) {
    const r = dernier.get(net(univers));
    if (!r) { out.push({ univers, manquantes: [], enTrop: [], ordre: false, releveLe: null, sansReleve: true }); continue; }
    const chez = r.options.map(libelleDe).filter(Boolean);
    const nous = (grille ?? []).map(libelleDe).filter(Boolean);
    const manquantes = chez.filter((x) => !nous.includes(x));
    const enTrop = nous.filter((x) => !chez.includes(x));
    const ordre = !manquantes.length && !enTrop.length && chez.join("\u0001") !== nous.join("\u0001");
    if (manquantes.length || enTrop.length || ordre) out.push({ univers, manquantes, enTrop, ordre, releveLe: r.le ?? null });
  }
  return out;
}

/**
 * Les libellés que nous écrivons pour une plateforme et qu'aucune de ses listes relevées ne porte (pure).
 * @param {{ libelles: unknown[], valeursRelevees: Iterable<unknown> }} p
 */
export function libellesAbsents({ libelles, valeursRelevees }) {
  const chez = new Set([...(valeursRelevees ?? [])].map(libelleDe).filter(Boolean));
  return [...new Set((libelles ?? []).map(libelleDe).filter(Boolean))].filter((l) => !chez.has(l));
}

/**
 * Les champs dont la liste DÉPEND d'un autre champ (pure) : plusieurs grilles différentes lues pour un même
 * (rayon, champ, univers). `releves` : [{ categorie, champ, univers?, options }]. `min` lectures par grille (bruit).
 * @returns {Array<{ categorie: string, champ: string, univers: string, grilles: number, tailles: number[] }>}
 */
export function champsAListesDependantes(releves, { min = 2 } = {}) {
  const par = new Map();
  for (const r of Array.isArray(releves) ? releves : []) {
    if (!Array.isArray(r?.options) || !r.options.length) continue;
    const cle = `${net(r.categorie)}\u0001${net(r.champ)}\u0001${net(r.univers) || "-"}`;
    const empreinte = r.options.map(libelleDe).join("\u0001");
    const m = par.get(cle) ?? new Map();
    // `n` : une ligne déjà regroupée (n lectures de la même grille) ; sinon une lecture.
    m.set(empreinte, (m.get(empreinte) ?? 0) + (Number.isFinite(Number(r.n)) && Number(r.n) > 0 ? Number(r.n) : 1));
    par.set(cle, m);
  }
  const out = [];
  for (const [cle, m] of par) {
    const grilles = [...m.entries()].filter(([, n]) => n >= min);
    if (grilles.length < 2) continue;
    const [categorie, champ, univers] = cle.split("\u0001");
    out.push({ categorie, champ, univers, grilles: grilles.length, tailles: grilles.map(([e]) => e.split("\u0001").length) });
  }
  return out.sort((a, b) => b.grilles - a.grilles || a.categorie.localeCompare(b.categorie));
}
