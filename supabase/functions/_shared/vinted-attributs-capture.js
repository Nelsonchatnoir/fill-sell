// ═══════════════════════════════════════════════════════════════════════════
// LA RECRÉATION REPREND LES CARACTÉRISTIQUES DE L'ANNONCE D'ORIGINE (02/10 soir, point 10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : Tech-t (2hyk6vg842), « ASUS Chromebook CM14 (CM1402) » 2d37ee4a —
// annonce RETIRÉE de Vinted, recréation refusée (400) : « model »,
// « computer_storage_capacity », « computer_ram », « laptop_charger_included ».
// La capture 10759 PORTAIT tout : natif.model = « Chromebook CM14 » (modèle
// connu, collection 8576) et natif.item_attributes (ids) : RAM 3460, stockage
// 3480, chargeur 3500, clavier 1430, système 3489, écran 3496. Personne ne les
// a remis sur le formulaire :
//   · le modèle ne passe par aucun canal (il n'est pas dans item_attributes) ;
//   · les ids se résolvent en libellés sur le formulaire seulement si la sonde
//     a capté la config de la catégorie — sinon « non résolus, laissés vides » ;
//   · et le pré-vol, qui ne juge « requis » que ce que la config marque requis
//     (ces attributs y sont facultatifs), a laissé retirer l'annonce.
// Ici : les libellés des ids, relevés sur le VRAI formulaire Vinted (compte de
// Nico, 02/10 ~20:55, catégorie 3580 « Ordinateurs portables », options
// `data-testid="<code>-<id>--title"`) — jamais devinés. Un id absent de la table
// reste NON RÉSOLU : rien n'est inventé.
// Pur (Deno + Node).

/** Libellés exacts relevés sur le formulaire Vinted (code → id → libellé). */
export const VINTED_LIBELLES_RELEVES = {
  computer_ram: {
    3445: "512 Go", 3446: "256 Go", 3447: "128 Go", 3448: "96 Go", 3449: "64 Go", 3450: "48 Go",
    3451: "36 Go", 3452: "32 Go", 3453: "24 Go", 3454: "18 Go", 3455: "16 Go", 3456: "12 Go",
    3457: "10 Go", 3458: "8 Go", 3459: "6 Go", 3460: "4 Go", 3461: "3 Go", 3462: "2 Go", 3463: "1 Go",
  },
  computer_storage_capacity: {
    3502: "8 To", 3503: "6 To", 3464: "4 To", 3465: "3 To", 3466: "2,5 To", 3467: "2 To", 3468: "1,5 To",
    3469: "1 To", 3470: "512 Go", 3471: "500 Go", 3472: "480 Go", 3473: "320 Go", 3474: "256 Go",
    3475: "250 Go", 3476: "240 Go", 3477: "180 Go", 3478: "128 Go", 3479: "120 Go", 3480: "64 Go",
    3481: "32 Go", 3482: "16 Go", 3483: "8 Go", 3484: "4 Go", 3485: "2 Go", 3486: "1 Go",
  },
  laptop_charger_included: { 3500: "Inclus", 3501: "Non inclus" },
  keyboard_layout: { 1430: "AZERTY", 1434: "QWERTY", 1435: "QWERTZ", 1896: "Autre disposition du clavier" },
  computer_operating_system: {
    3487: "macOS", 3488: "Windows", 3489: "Chrome OS", 3490: "Linux", 3491: "DOS", 3492: "Autre",
    3493: "Sans système d'exploitation",
  },
  laptop_display_size: {
    3494: "18\" (45 cm) ou plus", 3495: "16\"-17,9\" (40-44 cm)", 3496: "14\"-15,9\" (35-39 cm)",
    3497: "12\"-13,9\" (30-34 cm)", 3498: "10\"-11,9\" (25-29 cm)", 3499: "9,9\" (24 cm) ou moins",
  },
};

/** Codes posés par leurs propres canaux (jamais par celui-ci). */
const CANAUX_DEDIES = new Set(["condition", "size", "material", "language_book", "color", "isbn", "brand"]);

/**
 * Ce que la capture permet de reposer, À L'IDENTIQUE, et ce qu'elle porte sans
 * qu'on sache le relire.
 * @param {Record<string, any>|null} natif  vinted_republish_captures.payload.natif
 * @returns {{ aspects: Record<string, string>, nonResolus: string[], modele: string|null }}
 */
export function aspectsDeLaCapture(natif) {
  const aspects = {};
  const nonResolus = [];
  const n = natif && typeof natif === "object" ? natif : {};
  const m = n.model && typeof n.model === "object" ? n.model : null;
  // Un modèle CONNU de Vinted (choisi dans sa liste) : son nom est l'option du
  // formulaire (« model-8576--title » = « Chromebook CM14 »).
  const modele = m && String(m.type ?? "") === "known" && String(m.name ?? "").trim() ? String(m.name).trim() : null;
  if (modele) aspects.model = modele;
  for (const a of Array.isArray(n.item_attributes) ? n.item_attributes : []) {
    const code = String(a?.code ?? "").trim();
    if (!code || CANAUX_DEDIES.has(code)) continue;
    const ids = Array.isArray(a?.ids) ? a.ids : [];
    const table = VINTED_LIBELLES_RELEVES[code];
    const libelle = table && ids.length ? table[Number(ids[0])] : null;
    if (libelle) aspects[code] = libelle;
    else nonResolus.push(code);
  }
  return { aspects, nonResolus, modele };
}

/**
 * Les caractéristiques de la capture versées dans vintedAspects : un champ vide
 * est rempli ; le MODÈLE de l'annonce d'origine prime sur une saisie qui n'est
 * pas un modèle de la liste Vinted (Tech-t a répondu « CM1400FX » — aucun
 * modèle de ce nom chez Vinted, la recréation ne pouvait pas passer).
 * @returns {{ vintedAspects: Record<string, string>, poses: string[], remplace: Record<string, string> }}
 */
export function completerAspects(vintedAspectsActuels, capture) {
  const actuels = vintedAspectsActuels && typeof vintedAspectsActuels === "object" ? { ...vintedAspectsActuels } : {};
  const poses = [];
  const remplace = {};
  for (const [code, libelle] of Object.entries(capture?.aspects ?? {})) {
    const avant = String(actuels[code] ?? "").trim();
    if (!avant) { actuels[code] = libelle; poses.push(code); continue; }
    if (code === "model" && avant !== libelle) { remplace.model = avant; actuels.model = libelle; poses.push(code); }
  }
  return { vintedAspects: actuels, poses, remplace };
}

/** Tous les champs exigés par Vinted ont-ils maintenant une valeur ? */
export function exigencesCouvertes(serverRequiredFields, vintedAspects) {
  const liste = Array.isArray(serverRequiredFields) ? serverRequiredFields : [];
  if (!liste.length) return false;
  const a = vintedAspects && typeof vintedAspects === "object" ? vintedAspects : {};
  return liste.every((f) => String(a[String(f?.key ?? "")] ?? "").trim());
}

/** Champs que Vinted exige mais que leurs propres canaux posent (jamais demandés ici). */
export const CHAMPS_VINTED_CANAUX_DEDIES = new Set([
  "color", "brand", "size", "package_size", "isbn", "language_book", "photos", "material", "condition",
  "description", "title", "price", "catalog_id", "status",
]);

/** Libellé humain d'un champ Vinted (relevés sur le formulaire, 02/10). */
const LIBELLES_CHAMPS = {
  model: "Modèle", computer_ram: "RAM", computer_storage_capacity: "Capacité de stockage",
  laptop_charger_included: "Chargeur inclus", keyboard_layout: "Disposition du clavier",
  computer_operating_system: "Système d'exploitation", laptop_display_size: "Taille de l'écran",
  computer_cpu_line: "Processeur", internal_memory_capacity: "Espace de stockage", sim_lock: "Simlockage",
};
export function libelleChampVinted(code) {
  return LIBELLES_CHAMPS[code] ?? String(code ?? "");
}
