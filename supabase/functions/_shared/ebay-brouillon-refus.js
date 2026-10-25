// ═══════════════════════════════════════════════════════════════════════════
// eBay (VOIE CLIC) : LE MANQUANT QU'eBAY NOMME QUAND IL REFUSE LE BROUILLON
// (25/10, N6 et R2)
// ═══════════════════════════════════════════════════════════════════════════
// La voie clic remplit le formulaire, clique « Mettre en vente », et quand le
// clic ne produit rien, soumet elle-même le brouillon (background.js,
// ebayDirectPublish). eBay répond alors 200 SANS annonce et NOMME ce qui manque
// (platform_fields.ebay_api_publish.manquants, et le texte « éléments manquants
// dans le brouillon : X »). Ce nom n'était lu par personne : tout finissait en
// « motif inconnu » (pas-de-rouge), reprise à l'identique, puis « relance-la ».
//
// N6 — LES RETOURS. lemonde-glad (e991fc5e), jobs 080e9d39, 130088e7, 3700c6ef
// (20/10) : seul manquant « Conditions des retours nationaux », quatre essais
// identiques, puis « motif inconnu » ; précédent albin.jour85 (11/09). La voie
// clic ne pose ni retours, ni livraison, ni paiement : elle compte sur les
// réglages du compte eBay, et ce compte n'en a pas.
// LA RÈGLE : un manquant qui dit « retour » → `ebay_retours_a_choisir` : UNE
// question pour le COMPTE, avec les deux options de l'écran « Compte eBay »
// (src/components/EbayCompteSection.jsx, retoursAcceptes / retoursRefuses —
// libellés recopiés, le selftest les compare), sans reprise à l'identique.
// FillSell ne choisit JAMAIS à la place de la personne. La réponse se range
// pour le compte (platform_settings.ebay.retours_voie_clic, RPC
// platform_settings_fusionner, get-pending-jobs) et part avec chaque job eBay
// de l'extension (platform_fields.ebay_retours_choix). Tant que la question
// attend, get-pending-jobs retient les autres publications eBay de l'extension
// du compte (elles buteraient sur le même refus). Choix fait et eBay qui refuse
// ENCORE pour les retours : l'extension de ce poste ne sait pas le poser — c'est
// de notre côté (defaut_fillsell : la tâche attend un poste plus récent).
//
// R2 — LES PHOTOS. Fleur de Lotus (22-23/10, extension 0.6.128, fenêtre
// minimisée) : 11 refus sur 11 nomment « Photos », eBay n'a reçu aucune image ;
// c64e5596 finit en « motif inconnu » alors que error_technique.brut nomme
// « Photos ». LA RÈGLE : « Photos » (ou le code `ebay_photos_non_recues` posé
// par l'extension quand elle compte les photos reçues, content-scripts/ebay.js)
// → notre fait : deux reprises bornées, puis un arrêt nommé et vrai qui attend
// un poste plus récent (defaut_fillsell) — jamais « relance-la ».
//
// ⛔ Le manquant se LIT (texte de l'arrêt, ebay_api_publish.manquants) : jamais
//    deviné, jamais tiré d'un mot du titre. Un autre manquant garde la suite
//    d'avant (pas-de-rouge).
// Pur (Deno + Node + Vite), sans import.

export const SOURCE_RETOURS_EBAY = "ebay_retours_a_choisir";
export const MOTIF_PHOTOS_EBAY = "ebay_photos_non_recues";
/** Début du message que l'extension écrit quand elle arrête AVANT le clic, faute de photos reçues. */
export const ANCRE_PHOTOS_NON_RECUES = "Photos non reçues par eBay";
export const REPRISES_PHOTOS_MAX = 2;

// Les deux options de l'écran Compte eBay, mot pour mot (EbayCompteSection.jsx, ~133-134).
export const OPTIONS_RETOURS_EBAY = Object.freeze([
  Object.freeze({ code: "acceptes_30", libelle: "Acceptés sous 30 jours, frais de retour à l'acheteur" }), // estimation-ok: politique eBay (réglage), pas une attente
  Object.freeze({ code: "refuses", libelle: "Pas de retour (vendeurs particuliers seulement)" }),
]);

/** La question (needsUserField) : liste fermée des deux options, réponse rangée à la racine. */
export const CHAMP_RETOURS_EBAY = Object.freeze({
  platform: "ebay",
  field_key: "ebay_retours_choix",
  field_label: "Retours eBay (pour toutes tes annonces)",
  allowed_values: OPTIONS_RETOURS_EBAY.map((o) => o.libelle),
  input_type: "selection_only",
  options_completes: true,
  target: { root: null, key: "ebay_retours_choix" },
});

const pfDe = (pf) => (pf && typeof pf === "object" ? pf : {});

/**
 * Les éléments qu'eBay dit manquer au brouillon : ebay_api_publish.manquants
 * (l'extension les écrit tels qu'eBay les nomme), puis le texte de l'arrêt
 * (« éléments manquants dans le brouillon : A, B. »). Sans doublon, dans l'ordre.
 * @param {{ brut?: unknown, pf?: Record<string, any>|null }} a
 * @returns {string[]}
 */
export function manquantsDuBrouillonEbay({ brut = "", pf = null } = {}) {
  const out = [];
  const ajouter = (m) => {
    const s = String(m ?? "").replace(/\s+/g, " ").trim();
    if (s && s.length <= 120 && !out.includes(s)) out.push(s);
  };
  const api = pfDe(pf).ebay_api_publish;
  if (api && typeof api === "object" && Array.isArray(api.manquants)) for (const m of api.manquants) ajouter(m);
  const t = String(brut ?? "");
  const re = /manquants dans le brouillon\s*:\s*([^.\n]+)/gi;
  for (const m of t.matchAll(re)) for (const x of m[1].split(",")) ajouter(x);
  return out;
}

/** Un manquant qui dit « retour » (« Conditions des retours nationaux », « Politique de retour »). */
export const estManquantRetours = (m) => /\bretours?\b/i.test(String(m ?? ""));
/** Le manquant « Photos » d'eBay. */
export const estManquantPhotos = (m) => /^\s*photos?\s*$/i.test(String(m ?? ""));

/**
 * L'extension a-t-elle dit « photos non reçues » (arrêt AVANT le clic, ebay.js) ?
 * @param {{ brut?: unknown, pf?: Record<string, any>|null }} a
 */
export function photosNonRecuesSignalees({ brut = "", pf = null } = {}) {
  if (String(brut ?? "").trim().startsWith(ANCRE_PHOTOS_NON_RECUES)) return true;
  let d = pfDe(pf).last_diagnostic;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = null; } }
  return !!d && typeof d === "object" && d.quoi === MOTIF_PHOTOS_EBAY;
}

/**
 * La classe du refus : "retours" | "photos" | null. Les retours d'abord : c'est
 * un geste de la personne ; les photos sont de notre fait.
 * @param {{ brut?: unknown, pf?: Record<string, any>|null }} a
 */
export function classeRefusBrouillonEbay({ brut = "", pf = null } = {}) {
  const manquants = manquantsDuBrouillonEbay({ brut, pf });
  // « Prix de départ » : le brouillon est resté en ENCHÈRES (notre bascule, 31/08) — sa règle à elle
  // (background.js, MSG_EBAY_BROUILLON_ENCHERES) passe d'abord ; rien n'est classé ici.
  if (manquants.some((m) => /prix de d[ée]part/i.test(m))) return null;
  if (manquants.some(estManquantRetours)) return "retours";
  if (manquants.some(estManquantPhotos) || photosNonRecuesSignalees({ brut, pf })) return "photos";
  return null;
}

/** Le code d'une réponse (libellé de l'option, ou le code lui-même), ou null. */
export function codeRetours(valeur) {
  const v = String(valeur ?? "").trim();
  if (!v) return null;
  const o = OPTIONS_RETOURS_EBAY.find((x) => x.code === v || x.libelle.toLowerCase() === v.toLowerCase());
  return o ? o.code : null;
}

/** Le choix du COMPTE (platform_settings.ebay.retours_voie_clic.choix), ou null. */
export function retoursChoisisDuCompte(platformSettings) {
  const r = pfDe(pfDe(platformSettings).ebay).retours_voie_clic;
  return r && typeof r === "object" ? codeRetours(r.choix) : null;
}

/** La réponse de la personne sur CE job (« ✋ Compléter » : la valeur ET sa trace needsUserResolved), ou null. */
export function retoursChoisisDuJob(pf) {
  const p = pfDe(pf);
  const res = p.needsUserResolved && typeof p.needsUserResolved === "object" ? p.needsUserResolved : {};
  if (!Object.prototype.hasOwnProperty.call(res, "ebay_retours_choix")) return null;
  return codeRetours(p.ebay_retours_choix ?? res.ebay_retours_choix);
}

const ACTE = { republish: "la republication", delete: "le retrait", publish: "la publication" };

/** La question : la cause (eBay), ce que FillSell ne fait jamais, le geste, et ce qui n'a pas bougé. */
export function messageRetoursAChoisir(action) {
  return "eBay refuse de mettre cet article en vente sans conditions de retour (« Conditions des retours nationaux ») : " +
    "ton compte eBay n'en propose aucune par défaut, et FillSell ne les choisit jamais à ta place. " +
    "Choisis-les ci-dessous, une seule fois : ton choix vaudra pour toutes tes annonces eBay publiées par l'extension. " +
    (action === "republish" ? "Ton annonce n'a pas été touchée." : "Rien n'a été publié.");
}

/** Choix fait, eBay refuse encore pour les retours : l'extension de ce poste ne sait pas le poser. */
export function messageRetoursNonPoses(action) {
  return "Ton choix de retours eBay est bien enregistré, mais l'extension FillSell de ton ordinateur ne sait pas encore " +
    "le poser sur le formulaire eBay : c'est de notre côté, pas le tien. " +
    `${action === "republish" ? "Ton annonce n'a pas été touchée" : "Rien n'a été publié"} ; ` +
    `${ACTE[action] ?? "la publication"} repartira toute seule avec la mise à jour de l'extension qui le pose.`;
}

/** Une reprise « photos » (n = 1 ou 2). */
export function messagePhotosReprise(n, action) {
  return `eBay n'a pas reçu les photos de cet article (il répond « Photos » manquantes) : ${action === "republish" ? "ton annonce n'a pas été touchée" : "rien n'a été publié"}. ` +
    `C'est de notre côté, pas le tien : on refait un essai tout seuls (essai ${n} sur ${REPRISES_PHOTOS_MAX}).`;
}

/** L'arrêt « photos » : nommé, vrai, sans geste demandé. */
export function messagePhotosArret(action) {
  return `eBay n'a reçu aucune photo de cet article, ${REPRISES_PHOTOS_MAX + 1} essais de suite : ` +
    `${action === "republish" ? "ton annonce n'a pas été touchée" : "rien n'a été publié"}. ` +
    "C'est un défaut de FillSell sur ton ordinateur, pas ton annonce ni ton compte : on arrête ici plutôt que de réessayer pour rien. " +
    `Nous sommes prévenus, et ${ACTE[action] ?? "la publication"} repartira toute seule avec la prochaine mise à jour de l'extension.`;
}

/** Le marqueur defaut_fillsell d'un arrêt de notre fait (même forme que update-job-status) : la tâche attend un poste plus récent. */
export function defautFillsellEbay(pf, { ou, signature, build, maintenantIso = new Date().toISOString() }) {
  const prec = pfDe(pfDe(pf).defaut_fillsell);
  return {
    le: maintenantIso, signature, ou,
    build: typeof build === "string" && build ? build.slice(0, 80) : null,
    occurrences: (Number(prec.occurrences) || 0) + 1,
    ...(prec.premier_le || prec.le ? { premier_le: prec.premier_le ?? prec.le } : {}),
  };
}
