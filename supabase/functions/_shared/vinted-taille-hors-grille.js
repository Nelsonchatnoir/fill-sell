// ═══════════════════════════════════════════════════════════════════════════
// UNE TAILLE QUE VINTED NE PROPOSE PLUS POUR CE RAYON : L'IDENTIFIANT, PUIS UNE VRAIE QUESTION (12/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Point 1c de Nico (lot « zéro problème »). Compte 2bde8576, republication 479f51c0 (catalogue 1653, Chaussures
// bébé) : capture 28729 = « 15 et moins », identifiant 657 (ancienne grille 31). Vinted a remplacé la grille des
// chaussures bébé par des onglets EU / UK / US (« EU 15 » = 2190…). Trois défauts en chaîne :
//   1. get-pending-jobs RETIRAIT l'identifiant d'origine de toute capture (règle du 10/09, née des grilles adultes
//      combinées) — même quand il est toujours dans le groupe du rayon : compte af37fa49, id 2258 = « UK 8 enfant »
//      (onglet UK du formulaire), libellé capturé « UK 8 child » (autre langue) → rien trouvé ;
//   2. update-job-status, après deux reprises, RETIRAIT la liste servie (needsUserField) et disait « Relance depuis
//      l'app ; si ça se reproduit, écris-nous » : une impasse — ni liste, ni choix ;
//   3. (relance-apres-maj.js) une relance « corrigé par la 0.6.150 » sur un arrêt écrit par une 0.6.186.
// Ce module porte les règles PURES des deux premiers (le troisième vit dans relance-apres-maj.js) :
//   · retirerIdsTaillePourCePoste : l'identifiant d'origine n'est plus retiré pour un poste qui le confronte
//     lui-même au groupe de tailles du rayon (capacité déclarée « taille_groupe_rayon_v1 », extension 0.6.187 :
//     un id encore dans un onglet du rayon part tel quel, un id retiré se traduit par identifiant quand c'est
//     certain — vinted.js, tailleEquivalenteRetiree) ;
//   · questionTailleHorsGrille : la valeur n'est pas dans la liste servie et la liste est connue → UNE question,
//     la liste fermée entière, les voisines en tête — jamais « relance / écris-nous » ;
//   · tailleChoisieVersCapture : la réponse de la personne entre dans la capture du job (à l'étape « captured »,
//     l'extension relit la capture EN BASE, jamais republish_user_fields — la réponse n'atteignait pas le formulaire).
// ⛔ Aucune règle ne cherche un texte français : les voisines se lisent sur le SYSTÈME (EU, UK, US…) et le NOMBRE des
//    libellés de Vinted ; une option sans nombre n'est voisine que si elle OUVRE un bloc (« Très petit bébé » avant
//    « UK 0 bébé ») — par sa place dans la liste, jamais par ses mots.
// Testé par scripts/vinted-grille-chaussures-enfant-selftest.mjs (verrou du 12/11).

/** Capacité déclarée par l'extension (background.js, capacitesDeclarees) à partir de la 0.6.187. */
export const CAPACITE_TAILLE_GROUPE_RAYON = "taille_groupe_rayon_v1";

/**
 * Le retrait des identifiants de taille de la capture (get-pending-jobs, règle du 10/09) s'applique-t-il à ce poste ?
 * Un poste qui déclare CAPACITE_TAILLE_GROUPE_RAYON confronte lui-même l'id au groupe du rayon : on le lui laisse.
 * `forcerTousPostes` (coin_config « republish_taille_ids_retires_taille_par_id » = 2) : retour à la règle du 10/09
 * pour tout le monde, sans déploiement.
 * @param {{ capacites?: unknown[], forcerTousPostes?: boolean }} a
 */
export function retirerIdsTaillePourCePoste({ capacites = [], forcerTousPostes = false } = {}) {
  if (forcerTousPostes === true) return true;
  return !(Array.isArray(capacites) ? capacites : []).map(String).includes(CAPACITE_TAILLE_GROUPE_RAYON);
}

// ── Lire un libellé de taille de Vinted : système et nombre (jamais ses mots) ─────────────────────────────────────────
// Codes en MAJUSCULES seulement (Vinted les écrit ainsi) : « De 3 à 6 mois » n'est jamais lu « DE ».
const SYSTEME_RE = /^(EU|EUR|UK|US|FR|IT|DE|ES|JP|CN|MX|BR|AU|INT)(?=[\s\d.,]|$)\.?\s*/;
/** « EU 15,5 » → { systeme: "EU", nombre: 15.5 } ; « 15 et moins » → { systeme: null, nombre: 15 } ; « Très petit bébé » → nombre null. */
export function lireTaille(libelle) {
  const t = String(libelle ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(SYSTEME_RE);
  let systeme = m ? m[1].toUpperCase() : null;
  if (systeme === "EUR") systeme = "EU";
  const reste = m ? t.slice(m[0].length) : t;
  const n = reste.match(/\d+(?:[.,]\d+)?/);
  return { texte: t, systeme, nombre: n ? Number(n[0].replace(",", ".")) : null };
}
// Une valeur sans système se lit comme la grille nue de Vinted, c'est-à-dire l'EU (doctrine du 23/09 : « N » ≡ « EU N »).
const famille = (systeme) => (systeme == null || systeme === "EU" ? "EU" : systeme);
const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Les options de la liste servie les plus proches d'une taille absente : même système et même nombre d'abord, puis,
 * quand la taille est au bas de la grille (nombre ≤ le plus petit de son système), les options SANS nombre qui ouvrent
 * un bloc (« Très petit bébé »), puis les nombres les plus proches du même système. Au plus `max`.
 * @param {string} valeur @param {unknown[]} liste @returns {string[]}
 */
export function voisinesTaille(valeur, liste, { max = 4 } = {}) {
  const v = lireTaille(valeur);
  const options = (Array.isArray(liste) ? liste : []).map(String).filter((s) => s.trim());
  if (v.nombre == null || !options.length) return [];
  const lus = options.map((o, i) => ({ o, i, ...lireTaille(o) }));
  const memeFamille = lus.filter((x) => x.nombre != null && famille(x.systeme) === famille(v.systeme));
  if (!memeFamille.length) return [];
  const out = [];
  const pousser = (o) => { if (out.length < max && !out.includes(o)) out.push(o); };
  for (const x of memeFamille) if (x.nombre === v.nombre) pousser(x.o);
  const plusPetit = Math.min(...memeFamille.map((x) => x.nombre));
  if (v.nombre <= plusPetit) {
    // Une option sans nombre qui OUVRE un bloc : l'option suivante porte un nombre, le plus petit de son système.
    for (const x of lus) {
      if (x.nombre != null) continue;
      const suivante = lus[x.i + 1];
      if (!suivante || suivante.nombre == null) continue;
      const minSysteme = Math.min(...lus.filter((y) => y.nombre != null && famille(y.systeme) === famille(suivante.systeme)).map((y) => y.nombre));
      if (suivante.nombre === minSysteme) pousser(x.o);
    }
  }
  const proches = memeFamille
    .filter((x) => x.nombre !== v.nombre)
    .sort((a, b) => Math.abs(a.nombre - v.nombre) - Math.abs(b.nombre - v.nombre) || a.i - b.i);
  for (const x of proches) pousser(x.o);
  return out;
}

const CHAMPS_TAILLE = new Set(["size", "taille", "size_id"]);

/**
 * Reprises épuisées sur une taille que la capture porte mais que la liste servie par Vinted ne contient pas :
 * UNE question vraie, ou null (hors périmètre : la règle d'avant s'applique).
 * ⛔ null quand la valeur EST dans la liste (la saisie n'a pas pris — ce n'est pas une question), quand la grille servie
 *    était une grille adulte sur une taille enfant (une autre grille que celle du rayon : la proposer ferait choisir
 *    faux), quand la liste ou la valeur est vide, ou quand le champ n'est pas la taille.
 * @param {{ champ?: unknown, valeur?: unknown, liste?: unknown[], valeurOfferte?: boolean, grilleAdulteEnfant?: boolean }} [a]
 * @returns {{ allowed_values: string[], voisines: string[], message: string } | null}
 */
export function questionTailleHorsGrille({ champ = "size", valeur, liste, valeurOfferte = false, grilleAdulteEnfant = false } = {}) {
  if (!CHAMPS_TAILLE.has(comparable(champ))) return null;
  const v = String(valeur ?? "").trim();
  const options = (Array.isArray(liste) ? liste : []).map(String).filter((s) => s.trim());
  if (!v || !options.length || valeurOfferte === true || grilleAdulteEnfant === true) return null;
  if (options.some((o) => comparable(o) === comparable(v))) return null;
  const voisines = voisinesTaille(v, options);
  const allowed = [...voisines, ...options.filter((o) => !voisines.includes(o))];
  const tete = voisines.length
    ? ` (les plus proches en tête : ${voisines.slice(0, 3).map((o) => `« ${o.replace(/\s+/g, " ").trim()} »`).join(", ")})`
    : "";
  return {
    allowed_values: allowed.slice(0, 200), // la liste servie entière (l'extension 0.6.187 en sert jusqu'à 200)
    voisines,
    message:
      "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. " +
      `Vinted ne propose plus la taille « ${v} » pour ce rayon. ` +
      `Choisis la taille de ton article dans la liste${tete} : ta réponse sert à republier cette annonce, ` +
      "et rien n'est retiré avant.",
  };
}

/**
 * La taille CHOISIE par la personne (réponse à la question, needsUserResolved["republish_user_fields.taille"]) entre
 * dans la capture du job — à l'étape « captured » (et « deleted »), l'extension relit la capture en base et ne lit
 * jamais republish_user_fields : sans ce passage, la réponse n'atteignait pas le formulaire.
 * L'identifiant d'origine quitte la copie (il désigne la taille que Vinted ne propose plus) et reste dans la trace
 * `taille_choisie` (réversible). Rien quand la valeur vient du serveur (aucune réponse de la personne), quand la capture
 * la porte déjà, ou à l'étape « a_capturer » (la recapture fusionne déjà republish_user_fields).
 * @param {{ pf?: Record<string, any>, capture?: Record<string, any> | null, maintenant?: string }} [a]
 * @returns {{ libelles: Record<string, unknown>, payload: Record<string, unknown>,
 *   trace: { de: string | null, vers: string, size_id: unknown, item_attributes_size: unknown, le: string, pose_par: string } } | null}
 */
export function tailleChoisieVersCapture({ pf, capture, maintenant = new Date().toISOString() } = {}) {
  const p = pf && typeof pf === "object" ? pf : {};
  if (!["captured", "deleted"].includes(String(p.republish_step ?? ""))) return null;
  const choisie = String((p.republish_user_fields ?? {}).taille ?? "").trim();
  const repondue = String(((p.needsUserResolved ?? {})["republish_user_fields.taille"]) ?? "").trim();
  if (!choisie || !repondue || comparable(choisie) !== comparable(repondue)) return null;
  const lib = (capture?.libelles && typeof capture.libelles === "object") ? capture.libelles : {};
  if (comparable(lib.taille) === comparable(choisie)) return null;
  const payload = (capture?.payload && typeof capture.payload === "object") ? capture.payload : {};
  const natif = (payload.natif && typeof payload.natif === "object") ? payload.natif : {};
  const attrs = Array.isArray(natif.item_attributes) ? natif.item_attributes : [];
  const attrTaille = attrs.find((a) => String(a?.code ?? "").trim().toLowerCase() === "size") ?? null;
  const trace = {
    de: String(lib.taille ?? "") || null,
    vers: choisie,
    size_id: natif.size_id ?? null,
    item_attributes_size: attrTaille,
    le: maintenant,
    pose_par: "get-pending-jobs (taille choisie par la personne, _shared/vinted-taille-hors-grille.js)",
  };
  return {
    libelles: { ...lib, taille: choisie },
    payload: {
      ...payload,
      natif: { ...natif, size_id: null, item_attributes: attrs.filter((a) => a !== attrTaille) },
      champs_utilisateur: { ...((payload.champs_utilisateur && typeof payload.champs_utilisateur === "object") ? payload.champs_utilisateur : {}), taille: choisie },
      taille_choisie: trace,
    },
    trace,
  };
}
