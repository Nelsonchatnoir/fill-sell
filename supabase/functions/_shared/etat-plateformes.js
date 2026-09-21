// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN ARTICLE — UNE SEULE CORRESPONDANCE, POUR TOUT LE MONDE
// ═══════════════════════════════════════════════════════════════════════════
// Ce fichier est un DÉPLACEMENT : la table et le classeur de paliers vivaient
// dans `_shared/redaction-plateformes.ts` (bloc « ÉTAT : UNE SEULE VALEUR,
// MAPPÉE », 2026-08-31), où seul le serveur pouvait les lire. L'écran de
// publication en a besoin lui aussi depuis le 21/09 (« État général », demande
// de XEWER) — et la consigne était explicite : « La correspondance existe déjà
// côté serveur : réutilise-la, n'en écris pas une seconde ».
//
// .js et non .ts : c'est la seule forme que Deno (Edge Functions) ET Vite
// (l'app React) savent lire sans transpilation ni configuration — même patron
// que `_shared/langue.js`, `_shared/beebs-interdits.js`, `_shared/tailles.js`,
// tous trois déjà importés des deux côtés.
//
// ⛔ LA RÈGLE, AVANT LA TABLE : un état ne s'invente pas et ne s'AMÉLIORE
//    jamais. Quand une plateforme n'a pas l'équivalent exact, on prend le plus
//    proche PAR EN DESSOUS, jamais au-dessus — et on le dit à l'écran. Un état
//    embelli, c'est un litige acheteur, pas une imprécision.
// ═══════════════════════════════════════════════════════════════════════════

/** Les cinq paliers, du meilleur au moins bon. `rang` sert aux comparaisons. */
export const RANG_ETAT = Object.freeze({
  neuf_etiquette: 5,
  neuf_sans: 4,
  tres_bon: 3,
  bon: 2,
  satisfaisant: 1,
});

/** Les paliers dans l'ordre d'affichage (du meilleur au moins bon). */
export const PALIERS_ETAT = Object.freeze([
  "neuf_etiquette", "neuf_sans", "tres_bon", "bon", "satisfaisant",
]);

// ── La table, recopiée de redaction-plateformes.ts sans une virgule de plus ──
// Les cinq listes viennent des prompts eux-mêmes (libellés RÉELS des
// formulaires) — « Satisfaisant » Vinted/eBay vs « État satisfaisant » LBC vs
// « État moyen » Beebs, « Neuf avec étiquette » vs « Neuf, avec étiquette ».
// Vestiaire n'a pas de palier bas : son plus bas est « Bon état ».
//
// `opla` AJOUTÉE ici (elle n'existait pas côté serveur, et c'est normal :
// generate-listing ne rédige que quatre annonces, la copie Opla dérive de la
// copie Vinted). Elle porte le vocabulaire VINTED, qui est celui que l'écran
// affiche et que `platform_fields.etat` transporte ; la conversion vers les
// codes de l'API Opla (« like-new ») reste où elle est, à l'insert du job
// (OPLA_ETAT_PAR_LIBELLE, ListingPreviewScreen).
export const ETAT_PAR_PLATEFORME = Object.freeze({
  neuf_etiquette: { vinted: "Neuf avec étiquette", ebay: "Neuf avec étiquette", beebs: "Neuf, avec étiquette", leboncoin: "Neuf avec étiquette", opla: "Neuf avec étiquette", vestiaire: "Neuf avec étiquette" },
  neuf_sans:      { vinted: "Neuf sans étiquette", ebay: "Neuf sans étiquette", beebs: "Neuf, sans étiquette", leboncoin: "Neuf sans étiquette", opla: "Neuf sans étiquette", vestiaire: "Neuf sans étiquette" },
  tres_bon:       { vinted: "Très bon état",       ebay: "Très bon état",       beebs: "Très bon état",        leboncoin: "Très bon état",      opla: "Très bon état",       vestiaire: "Très bon état" },
  bon:            { vinted: "Bon état",            ebay: "Bon état",            beebs: "Bon état",             leboncoin: "Bon état",           opla: "Bon état",            vestiaire: "Bon état" },
  satisfaisant:   { vinted: "Satisfaisant",        ebay: "Satisfaisant",        beebs: "État moyen",           leboncoin: "État satisfaisant",  opla: "Satisfaisant",        vestiaire: "Bon état" },
});

/** Le vocabulaire de référence — celui de l'« État général » de l'écran. */
export const ETATS_GENERAUX = Object.freeze(
  PALIERS_ETAT.map((tier) => ({ tier, libelle: ETAT_PAR_PLATEFORME[tier].vinted })),
);

/** Palier produit (2026-08-31) : identique à DEFAULT_CONDITION côté client. */
export const DEFAUT_ETAT = "tres_bon";

// ── Texte libre → palier (recopié de redaction-plateformes.ts) ──────────────
// Le Lens rend une des 5 valeurs Vinted, mais les relevés du 28/07 montrent
// aussi « Bon », « bon », « Très bon » : on tolère.
// ⚠️ « très bon » AVANT « bon » — le second est inclus dans le premier et
// l'ordre des tests fait toute la différence.
// Les codes de l'API Opla (« like-new », « new-with-tags »…) sont reconnus
// aussi : ce sont des états lus en base sur des jobs réels, pas une hypothèse.
export function tierEtat(v) {
  const brut = String(v ?? "").trim();
  if (!brut) return null;
  const code = brut.toLowerCase();
  if (code === "new-with-tags") return "neuf_etiquette";
  if (code === "new") return "neuf_sans";
  if (code === "like-new") return "tres_bon";
  if (code === "good") return "bon";
  if (code === "fair" || code === "poor") return "satisfaisant";
  const s = code.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!s) return null;
  if (/neuf/.test(s) && /avec/.test(s)) return "neuf_etiquette";
  if (/neuf/.test(s)) return "neuf_sans";
  if (/tres bon|excellent/.test(s)) return "tres_bon";
  if (/\bbon\b/.test(s)) return "bon";
  if (/satisfaisant|moyen|correct|piece/.test(s)) return "satisfaisant";
  return null;
}

/** Compare deux états. > 0 si `a` est MEILLEUR que `b`. null si incomparable. */
export function comparerEtats(a, b) {
  const ta = tierEtat(a), tb = tierEtat(b);
  if (!ta || !tb) return null;
  return RANG_ETAT[ta] - RANG_ETAT[tb];
}

/**
 * L'état d'une plateforme, à partir d'une valeur quelconque (libellé d'une
 * autre plateforme, lecture du Lens, texte d'un relevé).
 *
 * ⛔ `meilleur: true` = la plateforme n'a PAS l'équivalent exact et le plus
 *    proche disponible est AU-DESSUS du réel. C'est le seul cas où l'écran
 *    passe en ambre : la personne doit le voir, pas le subir.
 *
 * @returns {{valeur: string, tier: string, exact: boolean, meilleur: boolean} | null}
 */
export function etatPourPlateforme(valeur, plateforme) {
  const tier = tierEtat(valeur);
  if (!tier) return null;
  const libelle = ETAT_PAR_PLATEFORME[tier]?.[plateforme];
  if (!libelle) return null;
  // Le palier réellement porté par le libellé servi : c'est lui qui dit si la
  // correspondance est exacte ou si la plateforme force vers le haut
  // (Vestiaire, qui n'a pas de palier « satisfaisant »).
  const tierServi = tierEtat(libelle) ?? tier;
  return {
    valeur: libelle,
    tier: tierServi,
    exact: tierServi === tier,
    meilleur: RANG_ETAT[tierServi] > RANG_ETAT[tier],
  };
}

// ── UN TEXTE QUI CONTREDIT L'ÉTAT (2026-09-21) ─────────────────────────────
// Mesuré sur le cas de Louis THONET (article 1789991601609, 21/09 14:01) :
// `etat_branche = canonique`, `etat_tier = neuf_sans` — le CHAMP partait donc
// juste — mais `etat_lus = ["tres_bon"]`, c'est-à-dire que le modèle avait
// écrit « TRÈS BON ÉTAT » dans sa prose. La post-production de 2026-08-31 ne
// corrige que `platform_fields.etat` : l'annonce se contredisait elle-même,
// champ « Neuf sans étiquette » et description « Article en TRÈS BON ÉTAT ».
//
// ⛔ ON RETIRE, ON NE REFORMULE PAS. Même doctrine que
//    `description-leboncoin.ts` : on coupe le segment fautif, jamais une
//    réécriture, et si le texte devient vide on rend l'ORIGINAL (un état
//    contredit vaut mieux qu'une annonce sans description).
// ⛔ DANS LES DEUX SENS, et c'est voulu. Le cas de Louis va vers le BAS : son
//    article est neuf, la prose disait « TRÈS BON ÉTAT » — il n'y a pas de
//    litige, il y a une annonce qui se contredit et une vente perdue. Un
//    article annoncé MEILLEUR qu'il n'est, lui, est un litige. Les deux sont
//    le même défaut : une annonce dont le champ et le texte ne disent pas la
//    même chose.
// ⛔ UNIQUEMENT SUR UN TEXTE QUE NOUS AVONS ÉCRIT. Sur le texte du vendeur, la
//    contradiction n'existe pas : c'est SA phrase qui fait foi, pas notre
//    lecture (l'appelant passe alors `descVendeuse` et ne nettoie rien).

// Les formulations d'état. Le palier retenu est le PLUS HAUT de celles qui
// matchent : « très bon état » matche aussi « bon état », et c'est le premier
// qui compte.
// ⛔ PAS DE « neuf » NU : en français, « neuf » est aussi un nombre (« neuf
//    pots »). Chaque formule exige un contexte d'état — « état neuf »,
//    « État : neuf », « neuf avec/sans étiquette », « jamais porté ».
const FORMULES_ETAT = [
  { tier: "neuf_etiquette", re: /neuf\s*,?\s*avec\s+(?:son\s+|sa\s+|ses\s+)?étiquettes?/i },
  { tier: "neuf_sans",      re: /neuf\s*,?\s*sans\s+étiquettes?/i },
  { tier: "neuf_sans",      re: /(?:à\s+l'|en\s+)?état\s*:?\s*neuf(?:ve)?\b/i },
  { tier: "neuf_sans",      re: /jamais\s+(?:porté|portée|utilisé|utilisée|servi|servie)/i },
  { tier: "tres_bon",       re: /comme\s+neuf|très\s+bon\s+état|excellent\s+état|parfait\s+état|impeccable/i },
  { tier: "bon",            re: /bon\s+état/i },
  { tier: "satisfaisant",   re: /état\s+satisfaisant|état\s+moyen|état\s+correct|pour\s+pièces/i },
];

/** Le palier le plus HAUT affirmé par un texte, ou null. */
export function etatAffirmeParLeTexte(texte) {
  const t = String(texte ?? "");
  if (!t.trim()) return null;
  let meilleur = null;
  for (const { tier, re } of FORMULES_ETAT) {
    if (!re.test(t)) continue;
    if (!meilleur || RANG_ETAT[tier] > RANG_ETAT[meilleur]) meilleur = tier;
  }
  return meilleur;
}

// Délimiteurs de segment : même découpe que description-leboncoin.ts —
// ponctuation finale, retour à la ligne, ou pictogramme (✅ ⚠️ 📦 servent de
// puces dans les descriptions de vendeurs).
const PICTO_ETAT = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u;
const DELIM_ETAT = new RegExp(`([.!?]+(?=\\s|$)|\\n+|${PICTO_ETAT.source})`, "gu");

/**
 * Retire du texte les segments qui affirment un état DIFFÉRENT de celui qui
 * part dans le champ — meilleur comme moins bon (cf. le bandeau ci-dessus).
 * @returns {{texte: string, retires: string[], modifie: boolean}}
 */
export function retirerEtatContredit(texte, etatReel) {
  const original = String(texte ?? "");
  const tierReel = tierEtat(etatReel);
  if (!original.trim() || !tierReel) return { texte: original, retires: [], modifie: false };
  try {
    const morceaux = original.split(DELIM_ETAT);
    const retires = [];
    const gardes = [];
    for (let i = 0; i < morceaux.length; i += 1) {
      const m = morceaux[i] ?? "";
      // Les délimiteurs capturés occupent les index impairs : ils suivent le
      // segment qu'ils terminent et tombent avec lui.
      if (i % 2 === 1) { if (gardes.length && gardes[gardes.length - 1].index === i - 1) gardes.push({ index: i, texte: m }); continue; }
      const affirme = etatAffirmeParLeTexte(m);
      if (affirme && affirme !== tierReel) { retires.push(m.trim()); continue; }
      gardes.push({ index: i, texte: m });
    }
    if (!retires.length) return { texte: original, retires: [], modifie: false };
    const reconstruit = gardes.map((g) => g.texte).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    // FAIL-SAFE : le nettoyage aurait tout effacé → l'original, inchangé.
    if (!reconstruit) return { texte: original, retires: [], modifie: false };
    return { texte: reconstruit, retires, modifie: true };
  } catch {
    return { texte: original, retires: [], modifie: false };
  }
}
