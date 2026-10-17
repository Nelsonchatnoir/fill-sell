// ═══════════════════════════════════════════════════════════════════════════
// LA MARQUE DEPOP : UNE RÈGLE, JAMAIS DE QUESTION (17/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Thibault, 14 publications Depop arrêtées sur « Marque (Depop) » : « Autres »
// (le « sans marque » de Vinted), « Short », « T shirt », et des marques que
// Depop ne connaît pas (Jules, Bonobo, Orchestra…). Le connecteur (≤ 0.6.122)
// posait une question en saisie libre ; la réponse, relue telle quelle et
// toujours absente de la liste de Depop, faisait revenir la même question
// (« ta réponse a bien été enregistrée, et ce champ est pourtant redemandé à
// l'identique », T-shirt du 17/10). Sa clé ignorait aussi « & » et « + » :
// « H&M » et « H&M+ », « Lacoste » et « Lacoste + » se confondaient (45 paires
// dans la liste relevée le 08/10), d'où « Plusieurs marques Depop s'écrivent… ».
//
// LA RÈGLE — une seule, appliquée AU DÉPÔT par content-scripts/depop.js sur la
// liste VIVANTE de Depop (GET /presentation/api/v1/attributes/) :
//   1. une valeur qui dit « pas de marque » (MOTS_SANS_MARQUE_DEPOP) ou un nom
//      commun de vêtement (NOMS_COMMUNS_DEPOP) → « Other » (`unbranded`) ;
//   2. égalité EXACTE — casse, accents et espaces multiples ignorés — avec le
//      nom (ou l'identifiant) d'UNE marque active de Depop → cette marque ;
//   3. sinon → « Other ». Jamais une autre marque, jamais une ressemblance,
//      jamais une question. Le remplacement est tracé et dit.
// ⚠️ « Pantalón », « Maillot », « Slip », « Chapeau », « Şans », « Generic »,
//    « No Brand » sont AUSSI des entrées de la liste Depop (relevé du 08/10) :
//    les listes fermées passent AVANT la liste, ces mots ne deviennent jamais
//    une marque. « Gant », « Polo », « Bob », « Top » n'y entrent pas : ce
//    sont des marques connues.
//
// ICI : la copie serveur des deux listes (à l'identique de depop.js, vérifié
// par selftest:depop-marque) et le FILET des extensions ≤ 0.6.122, pour les
// PUBLICATIONS seulement (une republication garde la marque de son annonce),
// sans copie de la liste Depop côté serveur :
//   · question « Marque (Depop) » dont la valeur est dans une liste fermée, ou
//     dont la question dit « n'est pas dans la liste » (l'égalité exacte
//     échouerait aussi) → « Sans marque », que le connecteur traduit en
//     `unbranded` — la même écriture que le geste « ✋ Compléter » ;
//   · question « Plusieurs marques Depop s'écrivent… » : jamais tranchée ici —
//     le correctif d'extension `depop_marque_ambigue` la relance une fois quand
//     le poste porte la règle exacte (_shared/correctifs-extension.js).
// La fiche n'est jamais touchée : sa marque reste la sienne ailleurs.
// Pur, sans import (Deno + Node + Vite).

/** La valeur interne de l'absence de marque (le connecteur Depop la traduit en `unbranded`). */
export const SANS_MARQUE_DEPOP = "Sans marque";

/** Le champ de la question « Marque (Depop) » posée par le connecteur (≤ 0.6.122). */
export const QUESTION_MARQUE_DEPOP = "depopMarque";

/** La forme comparable d'une marque : accents, casse, apostrophes typographiques, espaces multiples et ponctuation de bord ignorés. */
export function cleMarqueDepop(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—_.,;:!?()"'«»]+|[\s\-–—_.,;:!?()"'«»]+$/g, "");
}

/** (18/10, règle de Nico) La forme COMPACTE : casse, espaces, ponctuation et accents ignorés ; « & » et « + » gardés (H&M ≠ H&M+). Copie de depopCleMarqueExacte (content-scripts/depop.js). */
export function cleMarqueDepopCompacte(s) {
  return cleMarqueDepop(s).replace(/[^a-z0-9&+]+/g, "");
}

// Ce qui dit « pas de marque » : la liste commune (estSansMarque,
// _shared/marque-absente.js) et les mots des plateformes (« Autres » de Vinted,
// « Other » de Depop, « Divers »…). Formes comparables (cleMarqueDepop).
export const MOTS_SANS_MARQUE_DEPOP = Object.freeze([
  "", "sans marque", "sans", "aucune", "aucune marque", "aucun", "pas de marque", "non marque", "non marquee",
  "marque generique", "generique", "sans marque generique", "sans marque / generique",
  "no brand", "nobrand", "unbranded", "unbranded generic", "unbranded / generic", "generic", "generic brand",
  "other", "others", "autre", "autres", "autre marque", "autres marques", "divers", "diverse", "diverses",
  "inconnu", "inconnue", "marque inconnue",
]);

// Les noms communs de vêtement qui ne sont pas une marque (liste fermée,
// prudente : jamais un mot qui est aussi une marque connue — ni « gant », ni
// « polo », ni « bob », ni « top »).
export const NOMS_COMMUNS_DEPOP = Object.freeze([
  "short", "shorts", "jean", "jeans", "t shirt", "t-shirt", "tshirt", "tee shirt", "tee-shirt",
  "pantalon", "robe", "jupe", "veste", "pull", "chemise", "manteau", "maillot", "slip", "chapeau",
  "gilet", "blouson", "sweat", "debardeur", "legging", "leggings", "echarpe", "bonnet", "chaussures", "baskets",
]);

const SANS = new Set(MOTS_SANS_MARQUE_DEPOP);
const COMMUNS = new Set(NOMS_COMMUNS_DEPOP);

/** « absence » | « nom_commun » quand la valeur n'est pas une marque (listes fermées), null sinon. */
export function nonMarqueDepop(valeur) {
  const cle = cleMarqueDepop(valeur);
  if (SANS.has(cle)) return "absence";
  // « Sans marque/Générique » : chaque moitié est une absence de la liste.
  const parties = cle.split(/\s*\/\s*/).filter(Boolean);
  if (parties.length > 1 && parties.every((p) => SANS.has(p))) return "absence";
  if (COMMUNS.has(cle)) return "nom_commun";
  return null;
}

// Les deux phrases du connecteur ≤ 0.6.122 (content-scripts/depop.js, avant le 17/10).
const HORS_LISTE_RE = /n'est pas dans la liste des marques de Depop/;
const AMBIGUE_RE = /^Plusieurs marques Depop s'écrivent/;

/** « hors_liste » | « ambigue » d'après le texte d'une question « Marque (Depop) », null sinon. */
export function motifQuestionMarqueDepop(texte) {
  const t = String(texte ?? "");
  if (AMBIGUE_RE.test(t)) return "ambigue";
  if (HORS_LISTE_RE.test(t)) return "hors_liste";
  return null;
}

/**
 * Le filet des extensions ≤ 0.6.122 : la réponse que la règle donne à la
 * question « Marque (Depop) » d'une PUBLICATION, ou null (question ambiguë,
 * republication, autre question, déjà tranchée une fois).
 * @param {{ platform?: string, action?: string, status?: string, error?: string|null, platform_fields?: object|null }} job
 * @returns {{ valeur: string, de: string|null, motif: string } | null}
 */
export function reponseMarqueDepop(job) {
  if (!job || job.platform !== "depop") return null;
  if (String(job.action ?? "publish") !== "publish") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  // La même question rendue en BOUCLE par le background ≤ 0.6.122 (« ta réponse
  // a bien été enregistrée… », gardeAntiBoucleNeedsUser) : failed, la question
  // retirée, `boucle_needs_user` posé. Seule une valeur des listes fermées s'y
  // tranche (une valeur hors liste et une valeur « ambiguë » s'y confondent).
  const boucle = pf.boucle_needs_user && typeof pf.boucle_needs_user === "object" ? pf.boucle_needs_user : null;
  const enBoucle = job.status === "failed" && String(boucle?.field_key ?? "") === QUESTION_MARQUE_DEPOP;
  if (job.status !== "needs_user" && !enBoucle) return null;
  const f = pf.needsUserField && typeof pf.needsUserField === "object" ? pf.needsUserField : null;
  if (!enBoucle && String(f?.field_key ?? "") !== QUESTION_MARQUE_DEPOP) return null;
  // Une fois : une question revenue après la réponse de la règle est vraie, elle reste à la personne.
  if (pf.marque_depop_tranchee) return null;
  const de = String(pf.depopMarque ?? "").trim() || String(boucle?.valeur ?? "").trim() || String(pf.marque ?? "").trim();
  const nonMarque = nonMarqueDepop(de);
  if (nonMarque) return { valeur: SANS_MARQUE_DEPOP, de: de.slice(0, 80) || null, motif: nonMarque };
  if (enBoucle) return null;
  const motifs = [job.error, f?.explication].map(motifQuestionMarqueDepop);
  if (motifs.includes("ambigue")) return null;
  if (motifs.includes("hors_liste")) return { valeur: SANS_MARQUE_DEPOP, de: de.slice(0, 80) || null, motif: "hors_liste_depop" };
  return null;
}

/**
 * Les platform_fields après la réponse de la règle : la même écriture que le
 * geste « ✋ Compléter » (cible depopMarque, needsUserResolved), question et
 * compteurs effacés, et la trace. Rend une copie.
 */
export function champsApresMarqueDepop(pf, rep, maintenantIso, par) {
  const out = { ...(pf ?? {}) };
  out.depopMarque = rep.valeur;
  out.needsUserResolved = { ...(out.needsUserResolved ?? {}), [QUESTION_MARQUE_DEPOP]: rep.valeur };
  for (const k of ["needsUserField", "needsUserFields", "needsUserBoucle", "boucle_needs_user", "needs_user_source", "needs_user_sans_motif",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.marque_depop_tranchee = { de: rep.de ?? null, vers: rep.valeur, motif: rep.motif, le: maintenantIso, par };
  return out;
}
