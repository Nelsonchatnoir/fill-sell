// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON REFUSÉ NE PART JAMAIS (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (base, dépôts du 18 au 24/09) : 719 dépôts, dont 33 dont la
// vérification IA a rendu « incoherent » ou « refuse_hors_famille » — et 21 de
// ces 33 sont partis EN LIGNE quand même, dans le rayon refusé (10 Vinted,
// 6 Leboncoin, 2 eBay). Le mécanisme fautif : l'app propose un rayon depuis
// le mot du titre ou l'icône, l'IA le refuse, et l'app le GARDE en le marquant
// « incertain », en comptant sur la suggestion de la plateforme pour le
// corriger. Personne ne demandait ensuite à l'IA de CHOISIR le bon.
// Cas de référence (Jocabroc, Vinted) : des bobines Pathé Baby en « DVD »,
// des coupes en cristal en « Assiettes », une statue en « Encadrements », un
// tableau en « Pinceaux » (job d8224311, bloqué sur un état « neuf seulement »).
//
// LA RÈGLE, appliquée ICI et nulle part ailleurs :
//   1. le rayon refusé n'est JAMAIS utilisé : il sort de l'arbre avant la
//      descente, et il est retiré du job ;
//   2. l'IA redescend l'arbre RÉEL de la plateforme, niveau par niveau — la
//      voie « ia_descente_arbre » qui existait déjà pour Beebs, Leboncoin et
//      Opla, étendue à Vinted et eBay (branchement relevé le 25/09 : Vinted
//      ≤ 20 options par niveau, eBay ≤ 80 ; la mesure du 21/09 dit qu'une
//      liste de 65 se tranche, une de 312 non) — avec la consigne « le plus
//      proche qui existe » : sans rayon exact, elle prend le plus proche, en
//      connaissance de cause ;
//   3. la feuille retenue passe trois contrôles, dans cet ordre : l'âge et le
//      sexe de la fiche (rayonIncoherent, l'alerte du 20/09), la famille de
//      l'objet quand elle vient de la FICHE elle-même, puis une confirmation
//      IA de la feuille seule. Si rien de sûr ne ressort : pas de rayon, une
//      QUESTION au vendeur, les rayons candidats en tête de liste. Jamais un
//      rayon par défaut ;
//   4. le choix du vendeur (choix_humain) passe toujours : il est reposé
//      APRÈS la résolution (rayonPublication.js), comme avant.
//
// ⛔ PÉRIMÈTRE : n'entrent ici que les dépôts dont la vérification rend
//    « incoherent », « refuse_hors_famille », ou « descente_non_confirmee »
//    (qui n'existe qu'à la suite d'un « incoherent »). Tout le reste ne voit
//    jamais ce module : même rayon qu'avant, au caractère près.
// ⛔ LA FAMILLE D'ORIGINE NE MET PAS DE VETO ICI, et c'est mesuré. Sur les 33,
//    chaque refus « hors famille » venait d'une catégorie d'ORIGINE traduite
//    d'une autre plateforme : « Art, antiquités › … › Peintures » (eBay) résolu
//    en « Nail art › Peintures » (famille beauté) faute de branche Art dans
//    notre arbre eBay ; « Antiquités » (Leboncoin, famille loisirs) contre
//    « Maison › Décoration » (Vinted, famille maison) pour une gravure. Chaque
//    plateforme range l'art, la déco et la collection dans une famille à elle :
//    la traduction d'un arbre à l'autre ne tient pas (mesuré le 19/09 : 40 %
//    vers Vinted, 1 à 13 % ailleurs). La famille ne met donc de veto que
//    lorsqu'elle vient de la fiche (catalogue Vinted, icône d'autorité).
// ═══════════════════════════════════════════════════════════════════════════

import { texteComparable } from "./texteComparable";
import { feuillesDe, niveauSousChemin, estFeuilleDeLArbre } from "./categorieParMot";
import { plausibiliteDuChemin } from "./familleCategorie";
import { rayonContreditLaFiche } from "./rayonIncoherent";

/** Les verdicts de vérification qui font entrer un dépôt ici — et eux seuls. */
export const VERDICTS_REFUS = new Set(["incoherent", "refuse_hors_famille", "descente_non_confirmee"]);

/** Où chaque plateforme range son chemin (et son identifiant) dans le job. */
const CHAMPS = {
  vinted: { chemin: "categoryPath", id: null },
  leboncoin: { chemin: "lbcCategoryPath", id: null },
  beebs: { chemin: "beebsCategoryPath", id: null },
  // eBay et Opla NAVIGUENT PAR IDENTIFIANT : un chemin sans lui n'y mène nulle part.
  ebay: { chemin: "ebayCategoryPath", id: "ebayCategoryId" },
  opla: { chemin: "oplaCategoryPath", id: "oplaCategoryCode" },
};

const PALIERS_MAX = 8;
const QUESTION_MAX = 12;
// Ce qu'une branche montre de son contenu à l'IA (resolve-categorie en
// affiche au plus 30) : assez pour reconnaître le bon rayon, jamais l'arbre.
const APERCU_MAX = 30;

const cle = (c) => (Array.isArray(c) ? c : []).map((s) => texteComparable(String(s ?? ""))).join(" > ");
const estChemin = (c) => Array.isArray(c) && c.length > 0 && c.every((s) => String(s ?? "").trim());
const dernier = (c) => (Array.isArray(c) && c.length ? c[c.length - 1] : "");

// ── LE « AUTRES » D'UNE BRANCHE (2026-09-25) ────────────────────────────────
// Même motif que le serveur (resolve-categorie, FOURRE_TOUT) : il RETIRE ces
// feuilles d'une liste qui contient de vrais rayons. Deux conséquences, que
// les 33 cas montrent toutes les deux :
//   · la vérification n'a JAMAIS vu un chemin d'icône en « … › Autres » dès
//     qu'il avait des voisines — un jogging d'enfant rangé par l'icône en
//     « Pantalons et shorts › Autres » (le seul rayon Vinted des pantalons qui
//     ne sont ni des jeans ni des leggings) sortait « incoherent » sans que
//     l'IA l'ait jugé ;
//   · dans la descente, quand l'IA a trouvé la bonne BRANCHE mais qu'aucune
//     feuille précise ne convient, le « Autres » de cette branche est le rayon
//     le plus proche qui existe — et le serveur ne le lui montrait pas.
// On distingue donc le « Autres » d'une branche (profondeur ≥ 3 : « Pantalons
// et shorts › Autres ») du fourre-tout racine (« Divers › Autres », le rayon
// par défaut de Leboncoin), qui ne part JAMAIS (règle du 24/09).
const FOURRE_TOUT = /^(autres?|divers|other|others|miscellaneous)$/i;
const estAutresDeBranche = (c) => estChemin(c) && c.length >= 3 && FOURRE_TOUT.test(String(dernier(c)).trim());

/** Le chemin que porte le job pour cette plateforme, ou null. */
export function cheminDuChamp(platform, pf) {
  const k = CHAMPS[platform]?.chemin;
  const c = k ? pf?.[k] : null;
  return estChemin(c) ? c : null;
}

/** Tous les rayons refusés d'un dépôt : celui de l'icône que l'IA a refusé,
 *  celui que la famille a écarté, celui que la descente stricte n'a pas vu
 *  confirmer — et le chemin encore posé, qui est l'un d'eux. */
export function cheminsRefuses(platform, pf) {
  const v = pf?.categorie_verification ?? {};
  const p = pf?.categorie_plausibilite ?? {};
  const bruts = [v.chemin_icone, p.chemin_ecarte, v.chemin_propose, cheminDuChamp(platform, pf)];
  const vus = new Set();
  const out = [];
  for (const c of bruts) {
    if (!estChemin(c)) continue;
    const k = cle(c);
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(c.map((s) => String(s)));
  }
  return out;
}

/** La famille qui a le droit de mettre un veto ici : celle de la FICHE
 *  (catalogue Vinted, icône d'autorité), jamais celle d'une catégorie
 *  d'origine traduite d'une autre plateforme (cf. en-tête). */
export function familleVetoDe(detail) {
  const f = detail?.famille ?? null;
  const s = String(detail?.source ?? "");
  if (!f || !s || s.startsWith("categorie_origine_")) return null;
  return f;
}

async function candidatsDeQuestion(platform, { proposes = [], niveau = [], connus = [], exclus }) {
  const feuilles = await feuillesDe(platform);
  const parCle = new Map(feuilles.map((f) => [cle(f.chemin), f]));
  const out = [];
  const vus = new Set();
  const ajoute = (chemin) => {
    const k = cle(chemin);
    if (!k || vus.has(k) || exclus.has(k)) return;
    const f = parCle.get(k);
    if (!f) return; // une candidate qui n'est pas une feuille relevée ne se propose pas
    // Jamais un fourre-tout de catalogue (« Divers › Autres ») en tête de liste.
    if (f.chemin.length <= 2 && FOURRE_TOUT.test(String(dernier(f.chemin)).trim())) return;
    vus.add(k);
    out.push({ chemin: f.chemin, id: f.id ?? null });
  };
  const proposees = (proposes ?? []).filter(estChemin);
  // 1. Les feuilles les plus proches que l'IA a trouvées, si un contrôle ou
  //    l'arbitrage les a écartées.
  for (const p of proposees) ajoute(p);
  // 2. Leurs voisines immédiates : c'est là que se trouve le bon rayon quand
  //    la proposée est « presque » juste.
  for (const propose of proposees) {
    if (propose.length < 2) continue;
    const parent = cle(propose.slice(0, -1));
    for (const f of feuilles) {
      if (f.chemin.length === propose.length && cle(f.chemin.slice(0, -1)) === parent) ajoute(f.chemin);
    }
  }
  // 3. Les feuilles du dernier niveau que l'IA a regardé : la branche où elle
  //    s'est arrêtée est la plus proche de l'objet.
  for (const o of niveau ?? []) ajoute(o);
  // 4. Les candidates ratissées par le mot (étape 3 de la résolution).
  for (const c of connus ?? []) if (estChemin(c?.chemin)) ajoute(c.chemin);
  return out.slice(0, QUESTION_MAX);
}

// Un « Autres » de premier ou second niveau (« Divers › Autres »,
// « Collections › Autres ») est un fourre-tout de CATALOGUE, pas le « autres »
// d'une branche : il n'est jamais proposé (règle du 24/09, et règle Nico
// « Autre n'est pas une catégorie »).
const estFourreToutRacine = (c) => estChemin(c) && c.length <= 2 && FOURRE_TOUT.test(String(dernier(c)).trim());
const RETOURS_MAX = 1;

/**
 * UNE DESCENTE : l'arbre réel, niveau par niveau, avec l'IA.
 *   · chaque branche proposée montre ce qu'elle CONTIENT (son niveau suivant) :
 *     sans cet aperçu, à la racine de Vinted, l'IA rangeait un tableau dans
 *     « Loisirs et collections » faute de savoir que la décoration murale vit
 *     sous « Maison » (mesuré sur les 33 le 25/09) ;
 *   · quand l'IA ne trouve RIEN dans la branche qu'elle vient de choisir, on
 *     remonte d'un cran et on lui redemande sans cette branche (une fois) ;
 *   · le « autres » d'une branche lui est MONTRÉ (garder_fourre_tout) — c'est
 *     le seul rayon Vinted d'un jogging d'enfant —, le fourre-tout de catalogue
 *     jamais.
 * @returns {Promise<{feuille: string[]|null, racine: string|null, paliers: string[], appels: number, niveauVu: string[][], injoignable?: boolean}>}
 */
async function descendre({ platform, genre, exclure, appelerResolve, corps }, { racinesExclues = [], onRacine = null } = {}) {
  const paliers = [];
  let appels = 0;
  let chemin = [];
  let niveauVu = [];
  let arret = false;
  let retours = 0;
  const mortes = new Set(racinesExclues.filter(Boolean).map((r) => cle([r])));
  // Ce qu'une branche contient, élagué comme la descente elle-même. Une
  // branche qui ne contient plus rien d'admissible n'est pas proposée.
  const enfants = async (option) => {
    const { options } = await niveauSousChemin(platform, option, { genre, exclure });
    return options.filter((o) => !estFourreToutRacine(o));
  };
  for (let palier = 0; palier < PALIERS_MAX + RETOURS_MAX; palier++) {
    const { options: brutes } = await niveauSousChemin(platform, chemin, { genre, exclure });
    const options = [];
    const candidats = [];
    for (const o of brutes) {
      if (mortes.has(cle(o)) || estFourreToutRacine(o)) continue;
      const feuille = await estFeuilleDeLArbre(platform, o);
      const sous = feuille ? [] : (await enfants(o)).map((e) => String(dernier(e))).slice(0, APERCU_MAX);
      if (!feuille && !sous.length) continue;
      options.push(o);
      candidats.push(sous.length ? { chemin: o, id: null, sous } : { chemin: o, id: null });
    }
    if (!options.length) { arret = true; break; }
    niveauVu = options;
    // Un seul chemin possible : on ne dérange pas l'IA pour ça (l'arbitrage
    // final, lui, jugera la feuille).
    if (options.length === 1) {
      chemin = options[0];
      paliers.push(`${dernier(chemin)} (seul)`);
      if (chemin.length === 1) onRacine?.(chemin[0]);
      if (await estFeuilleDeLArbre(platform, chemin)) break;
      continue;
    }
    const { data, injoignable } = await appelerResolve(corps(candidats));
    appels++;
    if (injoignable) {
      paliers.push(`injoignable parmi ${options.length}`);
      return { feuille: null, racine: chemin[0] ?? null, paliers, appels, niveauVu, injoignable: true };
    }
    const suivant = data?.choix?.[platform]?.chemin;
    if (!estChemin(suivant)) {
      paliers.push(`aucune parmi ${options.length}`);
      // RETOUR EN ARRIÈRE : la branche choisie au niveau d'avant ne contient
      // rien pour cet objet — on la retire, et on redemande au niveau d'avant.
      if (chemin.length && retours < RETOURS_MAX) {
        mortes.add(cle(chemin));
        paliers.push(`↩ hors de « ${dernier(chemin)} »`);
        chemin = chemin.slice(0, -1);
        retours++;
        continue;
      }
      arret = true;
      break;
    }
    chemin = suivant;
    paliers.push(`${dernier(chemin)} (parmi ${options.length})`);
    if (chemin.length === 1) onRacine?.(chemin[0]);
    if (await estFeuilleDeLArbre(platform, chemin)) break;
  }
  const feuille = !arret && chemin.length && (await estFeuilleDeLArbre(platform, chemin)) ? chemin : null;
  return { feuille, racine: chemin[0] ?? null, paliers, appels, niveauVu };
}

/**
 * Le rayon d'un dépôt dont la vérification vient de refuser le rayon envisagé.
 *
 * DEUX DESCENTES, PUIS UN ARBITRAGE (mesuré le 25/09 sur les 33) : une feuille
 * montrée SEULE à l'IA est acceptée presque toujours — « Chaussures à talon »
 * pour des derbies plates, « Autres souvenirs » pour un tableau. Confrontée à
 * une autre feuille, trouvée par une AUTRE racine du catalogue, elle choisit.
 * La seconde descente part donc d'une racine différente de la première, et
 * l'IA tranche entre les deux (ou aucune).
 *
 * @param {object} p
 * @param {"vinted"|"leboncoin"|"beebs"|"ebay"|"opla"} p.platform
 * @param {string} p.objet        l'objet identifié (categorie_objet_ia, sinon le titre)
 * @param {string} p.titre        le titre de l'article
 * @param {object} [p.attributs]  { genre, taille, marque } transmis à l'IA
 * @param {string} [p.genre]      le genre qui élague l'arbre (Femme, Homme…)
 * @param {string[][]} [p.refuses] les rayons refusés (cheminsRefuses)
 * @param {string|null} [p.familleVeto] familleVetoDe(…)
 * @param {object} [p.pf]         les champs du job (âge, sexe de la fiche)
 * @param {Function} p.appelerResolve async (corps) => ({ data, injoignable })
 * @param {Array} [p.candidatsConnus] les candidates ratissées par le mot
 * @returns {Promise<
 *   {issue:"trouve", chemin:string[], id:string|null, paliers:string[], appels:number}
 * | {issue:"question", candidats:Array<{chemin:string[],id:string|null}>, motif:string, chemin_propose:string[]|null, paliers:string[], appels:number}
 * | {issue:"attente", motif:string, paliers:string[], appels:number}>}
 */
export async function rayonApresRefus({
  platform, objet, titre, attributs = {}, genre = "", refuses = [], familleVeto = null,
  pf = {}, appelerResolve, candidatsConnus = [],
}) {
  // Le « Autres » d'une branche que la vérification n'a jamais pu montrer à
  // l'IA (le serveur le retire dès qu'il a des voisines — cf. plus haut) n'a
  // pas été REFUSÉ : il n'a pas été jugé. Il reste dans l'arbre, et il ne
  // partira que si l'IA le CHOISIT. Tout autre rayon refusé sort de l'arbre
  // avant la descente.
  const voisinesReelles = (candidatsConnus ?? []).some((c) => estChemin(c?.chemin) && !FOURRE_TOUT.test(String(dernier(c.chemin)).trim()));
  const nonJuges = voisinesReelles ? (refuses ?? []).filter(estAutresDeBranche) : [];
  const refusesJuges = (refuses ?? []).filter((c) => estChemin(c) && !nonJuges.some((n) => cle(n) === cle(c)));
  const exclus = new Set(refusesJuges.map(cle));
  const paliers = [];
  let appels = 0;
  let niveauVu = [];
  const corps = (candidats) => ({
    titre: String(titre ?? ""),
    attributs: { ...attributs, objet: String(objet ?? "") },
    candidats: { [platform]: candidats },
    consigne: "plus_proche",
    garder_fourre_tout: true,
    // Un niveau entier, jamais tronqué : eBay a des nœuds de 50 à 80 options.
    max_candidats: Math.max(20, candidats.length),
  });
  // Chaque issue dit AUSSI quels rayons étaient refusés (jugés par l'IA) et
  // lesquels ne l'étaient pas (jamais montrés) : la trace du job le garde.
  const fin = (o) => ({ ...o, paliers, appels, refuses_juges: refusesJuges, non_juges: nonJuges });
  const question = async (motif, proposes = []) => fin({
    issue: "question", motif, chemin_propose: proposes[0] ?? null,
    candidats: await candidatsDeQuestion(platform, { proposes, niveau: niveauVu, connus: candidatsConnus, exclus }),
  });
  const ctx = { platform, genre, exclure: refusesJuges, appelerResolve, corps };

  // ── Descente A, et descente B par une AUTRE racine ────────────────────────
  // B part dès que A a choisi sa racine : les deux descentes avancent en même
  // temps (l'attente est celle de la plus longue, pas leur somme).
  let signalerRacine;
  const racineA = new Promise((ok) => { signalerRacine = ok; });
  const pA = descendre(ctx, { onRacine: (r) => signalerRacine(r) }).finally(() => signalerRacine(null));
  const pB = racineA.then((r) => (r ? descendre(ctx, { racinesExclues: [r] }) : null));
  const [a, bBrut] = await Promise.all([pA, pB]);
  appels += a.appels + (bBrut?.appels ?? 0);
  paliers.push(...a.paliers.map((x) => `A: ${x}`), ...(bBrut?.paliers ?? []).map((x) => `B: ${x}`));
  niveauVu = a.niveauVu;
  if (a.injoignable) return fin({ issue: "attente", motif: "resolution_injoignable" });
  // Une panne sur B seule ne bloque rien : A a répondu, l'arbitrage tranchera.
  const b = bBrut && !bBrut.injoignable ? bBrut : null;

  // ── Les feuilles trouvées, contrôlées une à une ───────────────────────────
  const toutes = await feuillesDe(platform);
  const refusees = [];
  const retenues = [];
  for (const f of [a.feuille, b?.feuille]) {
    if (!estChemin(f) || retenues.some((r) => cle(r.chemin) === cle(f))) continue;
    // Ceinture : la descente ne peut pas retomber sur un rayon refusé (il est
    // sorti de l'arbre), mais une règle qui dit « jamais » se vérifie.
    if (exclus.has(cle(f))) { refusees.push({ chemin: f, motif: "rayon_refuse" }); continue; }
    const feuille = toutes.find((x) => cle(x.chemin) === cle(f));
    const id = feuille?.id != null ? String(feuille.id) : null;
    if (CHAMPS[platform]?.id && !id) { refusees.push({ chemin: f, motif: "feuille_sans_identifiant" }); continue; }
    // Contrôle 1 — l'âge et le sexe de la fiche.
    const contre = rayonContreditLaFiche(f, pf);
    if (contre) { refusees.push({ chemin: f, motif: `fiche_${contre.motif}` }); continue; }
    // Contrôle 2 — la famille, quand elle vient de la fiche elle-même.
    if (familleVeto && !plausibiliteDuChemin(platform, f, familleVeto).ok) {
      refusees.push({ chemin: f, motif: "hors_famille_fiche" });
      continue;
    }
    retenues.push({ chemin: f, id });
  }
  if (!retenues.length) {
    return question(refusees[0]?.motif ?? "aucun_rayon_proche", refusees.map((r) => r.chemin));
  }

  // ── L'arbitrage : l'IA choisit entre les feuilles trouvées, ou aucune ─────
  const arb = await appelerResolve(corps(retenues.map((r) => ({ chemin: r.chemin, id: r.id }))));
  appels++;
  if (arb.injoignable) return fin({ issue: "attente", motif: "confirmation_injoignable" });
  const choisi = arb.data?.choix?.[platform]?.chemin;
  const gagnante = estChemin(choisi) ? retenues.find((r) => cle(r.chemin) === cle(choisi)) : null;
  paliers.push(gagnante
    ? `arbitrage : « ${dernier(gagnante.chemin)} »${retenues.length > 1 ? ` parmi ${retenues.length}` : " (seule)"}`
    : `arbitrage : aucune parmi ${retenues.length}`);
  if (!gagnante) return question("non_confirme", retenues.map((r) => r.chemin));
  return fin({ issue: "trouve", chemin: gagnante.chemin, id: gagnante.id });
}


function poserChemin(platform, pf, chemin, id) {
  const k = CHAMPS[platform];
  if (!k) return;
  pf[k.chemin] = chemin;
  if (k.id) {
    if (id) pf[k.id] = String(id);
    else delete pf[k.id];
  }
}

function retirerChemin(platform, pf) {
  const k = CHAMPS[platform];
  if (!k) return;
  delete pf[k.chemin];
  if (k.id) delete pf[k.id];
}

/**
 * Écrit le résultat sur les champs du job. Trois issues, et aucune ne laisse
 * le rayon refusé en place :
 *   · trouvé   → le rayon, confirmé, source « ia_descente_arbre » ;
 *   · question → PAS de rayon : la plateforme est écartée avant le débit
 *                (regles.plateformesSansChemin) et la carte pose la question ;
 *   · attente  → une panne (IA injoignable) : pas de rayon non plus, le clic
 *                suivant recalcule (resolutionARetenter) — jamais le refusé.
 */
export function appliquerRayonApresRefus(platform, pf, res, { objet = null, motSource = null, refuses = [] } = {}) {
  const verif = pf.categorie_verification ?? {};
  const trace = {
    ...verif,
    verdict_avant: verif.verdict ?? null,
    // Les rayons que l'IA (ou la famille) a REFUSÉS : aucun ne repart.
    chemins_refuses: res?.refuses_juges ?? refuses,
    // Le « Autres » d'une branche que la vérification n'a jamais pu montrer :
    // il ne repart que confirmé par l'IA, seul (cf. estAutresDeBranche).
    ...(res?.non_juges?.length ? { chemins_non_juges: res.non_juges } : {}),
    paliers_apres_refus: res?.paliers ?? [],
    appels_apres_refus: res?.appels ?? 0,
  };
  // La famille qui a écarté le rayon reste LISIBLE, mais plus là où le worker
  // eBay la lit comme un verdict en cours (categorie_plausibilite).
  if (pf.categorie_plausibilite) {
    trace.plausibilite_refusee = pf.categorie_plausibilite;
    delete pf.categorie_plausibilite;
  }
  // Plus rien ne dit « on n'est pas sûrs, laisse la plateforme trancher » :
  // soit le rayon est confirmé, soit il n'y en a pas.
  delete pf.categorie_incertaine;
  delete pf.lbcCategorieIncertaine;
  delete pf.categorie_a_choisir;

  if (res?.issue === "trouve") {
    poserChemin(platform, pf, res.chemin, res.id);
    pf.categorie_source = "ia_descente_arbre";
    pf.categorie_par_mot = {
      mot: objet, mot_source: motSource, chemin: res.chemin, id: res.id ?? null,
      choisi_par_ia: true, descente_arbre: true, apres_refus: true,
    };
    pf.categorie_verification = { ...trace, verdict: "rayon_apres_refus", chemin_retenu: res.chemin, confirmation_ia: "confirme" };
    delete pf.rayon_a_reessayer;
    delete pf.rayon_a_choisir;
    return pf;
  }
  retirerChemin(platform, pf);
  if (res?.issue === "attente") {
    pf.rayon_a_reessayer = { motif: res.motif, le: new Date().toISOString(), paliers: res.paliers ?? [] };
    pf.categorie_verification = { ...trace, verdict: "attente_resolution", motif_attente: res.motif };
    return pf;
  }
  pf.rayon_a_choisir = {
    objet,
    chemins_refuses: res?.refuses_juges ?? refuses,
    chemin_propose: res?.chemin_propose ?? null,
    candidats: res?.candidats ?? [],
    motif: res?.motif ?? "aucun_rayon_proche",
    le: new Date().toISOString(),
  };
  pf.categorie_verification = { ...trace, verdict: "rayon_a_choisir", motif_question: res?.motif ?? null, chemin_propose: res?.chemin_propose ?? null };
  return pf;
}
