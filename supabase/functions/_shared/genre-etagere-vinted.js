// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (19/11/2026, décision de Nico) L'ÉTAGÈRE VINTED DU VENDEUR FAIT FOI POUR LE GENRE eBAY, AVANT TOUTE DÉDUCTION DE L'APP
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// « Quand le vendeur a choisi une catégorie (étagère) sur Vinted, c'est elle qui fait foi pour le genre sur eBay, AVANT
// toute déduction de l'app. Un article sans étagère Vinted garde le comportement actuel ; aucune régression sur les
// articles qui partent déjà bien. »
// Cas : compte 2f8b09d2, « Parka longue NikeLab ACG Gore-Tex », étagère Vinted 2551 « Hommes › … › Vestes coupe-vent »,
// copie eBay sortie de la rédaction au genre DEVINÉ « Femme » (consigne « tranche toujours ») → « Femme : … › Manteaux »
// → refus, pause. Le 18/11, seul le worker (après un refus) lisait l'étagère ; l'app, elle, partait du genre deviné.
// Mesuré (lecture seule, 60 jours au 19/11) : 2 902 publications eBay décidées par l'app, 1 106 sur une fiche à étagère
// genrée — 91 copies au genre contraire à l'étagère (77 publiées dans le rayon de l'autre genre, 20 comptes), 915
// déjà d'accord (inchangées), 17 au genre choisi par la personne (inchangées), 83 objets hors mode sans genre (rien).
//
// LA RÈGLE — UNE SEULE, lue par l'app (resolutionPublication.js : avant la règle du texte et l'auto-genre, donc pour
// le pré-calcul ET le clic, à l'unité ET en lot) et par le worker eBay après un refus (ebay-genre-apres-refus.js) :
//   0. (19/11 midi) un GENRE choisi ou tapé à la main par la personne passe avant tout — l'étagère ET la déduction
//      (genreSaisiParLaPersonne, genreAvantDeduction ; trace TRACE_GENRE_CHOISI, plus bas) ;
//   1. un genre choisi par la PERSONNE reste au-dessus : rayon eBay choisi (`rayon_choisi`, `categorie_source`
//      « choix_humain »), public d'un rayon Vinted choisi à l'écran (`genre_du_choix`, ou ce rayon passé par
//      l'appelant), genre aligné sur un rayon choisi (`genre_aligne_sur_rayon`) → null : la règle d'avant, inchangée ;
//   2. une étagère Vinted GENRÉE relevée (l'attribut `categorie_vinted` d'un relevé, sinon la colonne
//      `vinted_catalog_id` ; son public lu par _shared/vinted-branche.ts — l'IDENTIFIANT fait foi, jamais un libellé)
//      FIXE le genre : celui de la copie s'il est compatible (« Bébé » sous « Enfants »), sinon celui de l'étagère. Plus
//      aucune déduction après elle (ni le genre lu dans des titres que l'IA a réécrits, ni l'auto-genre) ;
//   3. sans étagère genrée (Maison, Livres, aucun identifiant…) : null — l'appelant fait exactement ce qu'il faisait.
// ⛔ eBay seulement (la décision de Nico) : les autres copies ne bougent pas ici.
// ⛔ Aucune annonce déjà en ligne n'est réécrite : la règle ne joue qu'au moment de décider une publication.
// Pur (Deno + Node + Vite), la lecture de l'étagère est injectée : scripts/ebay-genre-etagere-selftest.mjs.

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PUBLIC = {
  femme: { age: "adulte", sexe: "f" }, homme: { age: "adulte", sexe: "m" },
  fille: { age: "enfant", sexe: "f" }, garcon: { age: "enfant", sexe: "m" },
  bebe: { age: "enfant", sexe: null }, enfant: { age: "enfant", sexe: null },
};

/** Le genre `g` contredit-il le public `cible` ? Vide, « Mixte », inconnu : oui (à remplir). Cible inconnue : non. */
export function genreContredit(g, cible) {
  const a = PUBLIC[plier(g)], b = PUBLIC[plier(cible)];
  if (!b) return false;
  if (!a) return true;
  if (a.age !== b.age) return true;
  return Boolean(a.sexe && b.sexe && a.sexe !== b.sexe);
}

const SOURCE_RELEVE = /^(capture|vinted|releve)/;
const idValide = (v) => {
  const n = Number(v && typeof v === "object" ? v.v : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * L'étagère Vinted de la fiche et le public qu'elle porte : l'attribut d'un RELEVÉ d'abord, sinon la colonne
 * `vinted_catalog_id` (écrite par la synchronisation Vinted). `brancheVinted(id)` → « Femme » | « Homme » | « Enfant »
 * | « Fille » | « Garçon » | null (_shared/vinted-branche.ts). null = aucune étagère genrée connue.
 * @param {{ categorieVinted?: unknown, colonne?: unknown }} fiche
 * @param {(id: unknown) => string | null} brancheVinted
 * @returns {{ genre: string, via: string, id: number } | null}
 */
export function etagereDeLaFiche({ categorieVinted = null, colonne = null } = {}, brancheVinted) {
  if (typeof brancheVinted !== "function") return null;
  const cv = categorieVinted && typeof categorieVinted === "object" ? categorieVinted : null;
  const idAttribut = cv && SOURCE_RELEVE.test(String(cv.source ?? "")) ? idValide(cv.v) : null;
  for (const [id, d] of [[idAttribut, "attribut"], [idValide(colonne), "colonne"]]) {
    if (!id) continue;
    const genre = brancheVinted(id);
    if (genre) return { genre: String(genre), via: `étagère Vinted ${id} (${d})`, id };
  }
  return null;
}

// ── (19/11 midi, décision de Nico) LE GENRE CHOISI OU TAPÉ À LA MAIN DANS LA CARTE eBAY ─────────────────────────────
// Ordre : le choix de la personne à l'écran (tapé à la main compris), puis l'étagère Vinted, puis la déduction de l'app.
// Le champ « Genre » de la carte eBay n'avait aucune trace (noteSharedOverride ne retient que taille, couleur, matière,
// marque) : l'étagère le recouvrait. Le GESTE de la personne dans la carte (CarteRayon, changerParLaPersonne — jamais
// l'effet qui pose les valeurs par défaut par le même chemin) écrit cette trace sur la copie ; elle part avec la tâche et
// se lit ici, dans l'app comme au serveur. Elle ne vaut que tant que le genre de la copie est celui qu'elle dit.
export const TRACE_GENRE_CHOISI = "genre_choisi_main";

/**
 * Les champs qu'un GESTE de la personne ajoute à sa copie, en plus de la valeur : la trace du genre choisi sur eBay
 * (null quand elle le vide). [] pour tout autre champ ou plateforme. Pur.
 * @returns {Array<[string, { genre: string, le: string } | null]>}
 */
export function champsDuGesteDeLaPersonne(plateforme, cleNotre, valeur, le = new Date().toISOString()) {
  if (plateforme !== "ebay" || cleNotre !== "genre") return [];
  const g = String(valeur ?? "").trim();
  return [[TRACE_GENRE_CHOISI, g ? { genre: g, le } : null]];
}

/** Le GENRE lui-même est-il celui de la personne ? Tapé ou choisi dans la carte eBay (trace encore juste), public d'un
 *  rayon Vinted choisi à l'écran (`genre_du_choix`), genre aligné sur un rayon choisi (`genre_aligne_sur_rayon`).
 *  Il passe alors avant l'étagère ET avant toute déduction (texte, auto-genre). */
export function genreSaisiParLaPersonne(pf) {
  const p = pf && typeof pf === "object" ? pf : {};
  const t = p[TRACE_GENRE_CHOISI];
  const tape = Boolean(t && typeof t === "object" && String(t.genre ?? "").trim()
    && String(t.genre).trim() === String(p.genre ?? "").trim());
  return tape || Boolean(p.genre_du_choix) || Boolean(p.genre_aligne_sur_rayon);
}

/** Un choix de la personne est-il posé sur cette copie (son genre, ou son rayon) ? L'étagère se tait alors.
 *  (`choixPersonne` : ce que l'appelant sait en plus — rayon eBay choisi, rayon Vinted choisi à l'écran.) */
export function genreChoisiParLaPersonne(pf, choixPersonne = false) {
  if (choixPersonne) return true;
  const p = pf && typeof pf === "object" ? pf : {};
  return String(p.categorie_source ?? "") === "choix_humain" || genreSaisiParLaPersonne(p);
}

/**
 * Le genre que l'étagère Vinted fixe pour la copie, ou null (pas d'étagère genrée, un choix de la personne, ou un genre
 * vide dont eBay n'a pas besoin : la règle d'avant s'applique alors, inchangée).
 * Un genre vide, « Mixte » ou inconnu n'est rempli par l'étagère que si `genreRequis` (l'article EXIGE un genre pour son
 * rayon eBay — l'app en aurait sinon DÉDUIT un) : un objet hors mode rangé sous « Enfants › Jouets » ou « Femmes ›
 * Beauté » ne reçoit pas de genre qu'eBay ne demande pas, et 🌸 + « Mixte » (Parfums mixtes, un vrai rayon) reste.
 * @param {{ genre?: string|null, pf?: object, etagere?: {genre: string, via?: string, id?: number}|null, choixPersonne?: boolean, genreRequis?: boolean }} x
 * @returns {{ genre: string|null, source: "etagere_vinted", avant: string|null, change: boolean, via: string|null, id: number|null } | null}
 */
export function genreDeLEtagere({ genre = null, pf = {}, etagere = null, choixPersonne = false, genreRequis = false } = {}) {
  if (!etagere?.genre || !PUBLIC[plier(etagere.genre)]) return null;
  if (genreChoisiParLaPersonne(pf, choixPersonne)) return null;
  const g = String(genre ?? "").trim() || null;
  if (!PUBLIC[plier(g)] && !genreRequis) return null;
  const change = genreContredit(g, etagere.genre);
  return { genre: change ? String(etagere.genre) : g, source: "etagere_vinted", avant: g, change,
    via: etagere.via ?? null, id: Number.isInteger(etagere.id) ? etagere.id : null };
}

/**
 * Le genre retenu AVANT toute déduction de l'app : le genre de la personne (tapé, choisi), sinon celui que l'étagère
 * fixe ; null = ni l'un ni l'autre, la déduction d'avant (texte, auto-genre) s'applique, inchangée.
 * Un rayon choisi sans genre saisi (rayon eBay choisi) : l'étagère se tait, la déduction reste celle d'avant.
 * @returns {{ genre: string|null, source: "choix"|"etagere_vinted", avant: string|null, change: boolean, via?: string|null } | null}
 */
export function genreAvantDeduction({ genre = null, pf = {}, etagere = null, choixPersonne = false, genreRequis = false } = {}) {
  const g = String(genre ?? "").trim() || null;
  if (genreSaisiParLaPersonne(pf)) return { genre: g, source: "choix", avant: g, change: false };
  return genreDeLEtagere({ genre: g, pf, etagere, choixPersonne, genreRequis });
}

/**
 * L'app : la copie eBay de `edited`, le genre fixé par l'étagère. Rend { edited, decision } — `edited` identique (même
 * objet) quand rien ne change ; `decision` null quand l'étagère ne dit rien (la règle d'avant s'applique). Un genre
 * changé est tracé sur la copie (`genre_de_l_etagere`, avec le genre d'avant).
 * @param {object} edited
 * @param {{ etagere?: object|null, choixPersonne?: boolean, genreRequis?: boolean, le?: string }} x
 */
export function copieEbayALEtagere(edited, { etagere = null, choixPersonne = false, genreRequis = false, le = new Date().toISOString() } = {}) {
  const copie = edited && typeof edited === "object" ? edited.ebay : null;
  const pf = copie?.platform_fields;
  if (!pf || typeof pf !== "object") return { edited, decision: null };
  const choix = choixPersonne || Boolean(copie.rayon_choisi?.chemin?.length);
  const decision = genreDeLEtagere({ genre: pf.genre, pf, etagere, choixPersonne: choix, genreRequis });
  if (!decision?.change) return { edited, decision };
  return {
    edited: { ...edited, ebay: { ...copie, platform_fields: { ...pf, genre: decision.genre,
      genre_de_l_etagere: { avant: decision.avant, genre: decision.genre, via: decision.via, le } } } },
    decision,
  };
}
