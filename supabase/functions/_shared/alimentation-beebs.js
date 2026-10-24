// ═══════════════════════════════════════════════════════════════════════════
// « ALIMENTATION » BEEBS — LA VALEUR SE DÉDUIT (24/10/2026 soir, décision 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Beebs exige « Alimentation » (liste fermée relevée : « Avec pile », « Avec batterie », « Filaire », « Sans ») sur
// 4 rayons : Jouets d'activité et Montessori, Jouets électroniques pour bébé, Véhicules télécommandés, Autres jeux
// électroniques. Cas fondateur : sos.cuisine, « VTech Switch & Go Dinos Rotor » — la question lui a été posée.
// Nico : « Pour un jouet électronique, la valeur se déduit (piles). Si elle se déduit, on la met. On ne demande que
// s'il y a vraiment un doute. »
// RÈGLE (titre + description du vendeur, sans accents, en minuscules) :
//   1. ce que le texte DIT, du plus précis au plus large — chaque passage lu est retiré avant le suivant :
//      « vendu / livré / fourni sans piles », « piles non fournies / non incluses » → Avec pile (il en faut) ;
//      « fonctionne sans pile », « tir… sans piles », « à remonter / à friction / à pompe / à manivelle » → Sans ;
//      tout AUTRE « sans (les) piles » → DOUTE (mesuré : 4 fois sur 6, les piles ne sont pas fournies) ;
//      « batterie rechargeable / intégrée / lithium », « rechargeable », « se recharge », « câble (USB) de charge »,
//      « accu », « Li-ion », « Ni-MH » → Avec batterie (« piles rechargeables », « batteries AA » : des piles) ;
//      « secteur », « 220 / 230 V », « filaire », « câble d'alimentation » → Filaire (doute si un chargeur est cité) ;
//      « piles », « 3 piles », « avec piles », « AA », « AAA », « LR03 », « LR6 », « LR44 » → Avec pile ;
//   2. une seule valeur dite → posée, si elle est TELLE QUELLE dans la liste ; deux → question, les deux en tête ;
//   3. rien de dit : un rayon de JEUX ÉLECTRONIQUES (« Jeux électroniques > … », « Jouets électroniques pour bébé ») →
//      « Avec pile » (la décision de Nico) ; Véhicules télécommandés (pile OU batterie : vrai doute) et tout autre rayon
//      (Montessori : souvent sans) → la question, comme avant.
// Mesuré le 24/10 : 1 102 fiches de jouets relues à la main, 46 valeurs dites par un mot, 44 justes (les 2 fausses
// hors jouets : Roomba, Wii) ; 6 vrais doutes renvoyés en question.
// Pur, sans import : chargé par l'app (Vite) et utilisable par le serveur (Deno), comme option-du-texte.js.

const VALEURS = Object.freeze({ PILE: "Avec pile", BATTERIE: "Avec batterie", FILAIRE: "Filaire", SANS: "Sans" });

const normaliser = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/[’‘`]/g, "'").replace(/\s+/g, " ");

export const estChampAlimentationBeebs = (platform, key) => platform === "beebs" && /^alimentation$/i.test(String(key ?? "").trim());

/** Le rayon est-il un rayon de jeux ÉLECTRONIQUES (là où « rien de dit » vaut « Avec pile ») ? */
export function rayonJeuxElectroniques(chemin) {
  const c = (Array.isArray(chemin) ? chemin : String(chemin ?? "").split(/\s*>\s*/)).map(normaliser);
  return c.some((n) => n === "jeux electroniques" || n === "jouets electroniques pour bebe");
}

/** Ce que le texte dit de l'alimentation : { valeurs: Set, doute: boolean }.
 *  `textes` : des chaînes, ou la forme de textesDeLAnnonce (option-du-texte.js) — [{ source, texte }]. */
export function alimentationDuTexte(textes) {
  let t = ` ${(Array.isArray(textes) ? textes : [textes])
    .map((x) => normaliser(typeof x === "string" ? x : x?.texte)).filter(Boolean).join(" . ")} `;
  // « Piles rechargeables », « batteries AA / AAA / LRxx » : des PILES.
  t = t.replace(/\bpiles?\s+rechargeables?\b/g, " piles ").replace(/\bbatteries?\s+(aaa?|lr\s?\d{1,2})\b/g, " piles $1 ");
  const valeurs = new Set();
  let doute = false;
  const lire = (re, valeur) => {
    let vu = false;
    t = t.replace(re, () => { vu = true; return " "; });
    if (vu && valeur) valeurs.add(valeur);
    return vu;
  };
  // 1. Les tournures « sans piles » qui disent quelque chose.
  lire(/\b(?:vendue?s?|livree?s?|fournie?s?)\s+sans\s+(?:les\s+|ses\s+)?piles?\b/g, VALEURS.PILE);
  lire(/\bpiles?\s+(?:\w+\s+)?\(?(?:non|pas)\s+(?:fournie?s?|incluse?s?)\b/g, VALEURS.PILE);
  lire(/\bfonctionne\s+sans\s+(?:piles?|batterie)\b/g, VALEURS.SANS);
  lire(/\btir\w*\s+(?:\w+\s+)?sans\s+piles?\b/g, VALEURS.SANS);
  lire(/\ba\s+(?:remonter|friction|pompe|manivelle)\b/g, VALEURS.SANS);
  // Tout autre « sans (les) piles » : on ne sait pas si elles manquent ou si le jouet n'en a pas.
  if (lire(/\bsans\s+(?:les\s+|ses\s+)?piles?\b/g, null)) doute = true;
  // 2. Batterie, secteur, piles.
  lire(/\bbatterie\s+(?:rechargeable|integree|lithium|li-?ion|\d)/g, VALEURS.BATTERIE);
  lire(/\b(?:rechargeables?|se\s+recharge)\b/g, VALEURS.BATTERIE);
  lire(/\b(?:cable|cordon)\s+(?:usb\s+)?(?:de\s+)?(?:re)?charge\b/g, VALEURS.BATTERIE);
  lire(/\b(?:accus?|li-?ion|ni-?mh)\b/g, VALEURS.BATTERIE);
  if (lire(/\bsecteur\b|\b(?:220|230)\s?v\b|\bfilaire\b|\bcable\s+d'?alimentation\b/g, VALEURS.FILAIRE) && /\bchargeur\b/.test(t)) doute = true;
  lire(/\bpiles\b|\b(?:\d+|a|avec|des|les)\s+piles?\b|\b(?:\d\s?x\s?)?(?:aaa?|lr\s?0?3|lr\s?6|lr\s?44)\b/g, VALEURS.PILE);
  return { valeurs, doute };
}

/**
 * La valeur d'« Alimentation » pour un job Beebs. Même forme qu'optionDepuisTextes (option-du-texte.js) :
 *   { valeur, source, candidats } — valeur posée (déduite, jamais bloquante) ;
 *   { valeur: null, source: null, candidats: [a, b] } — deux valeurs dites : la question, les deux en tête ;
 *   null — le doute : la question, comme avant.
 */
export function alimentationBeebs({ options, textes, cheminCategorie = null }) {
  const liste = (Array.isArray(options) ? options : []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (!liste.length) return null;
  const dansListe = (v) => (liste.includes(v) ? v : null);
  const { valeurs, doute } = alimentationDuTexte(textes);
  if (valeurs.size >= 2) {
    const candidats = [...valeurs].map(dansListe).filter(Boolean);
    return candidats.length >= 2 ? { valeur: null, source: null, candidats } : null;
  }
  if (doute) return null;
  if (valeurs.size === 1) {
    const v = dansListe([...valeurs][0]);
    return v ? { valeur: v, source: "alimentation:texte", candidats: [v] } : null;
  }
  if (rayonJeuxElectroniques(cheminCategorie)) {
    const v = dansListe(VALEURS.PILE);
    return v ? { valeur: v, source: "alimentation:jouet_electronique", candidats: [v] } : null;
  }
  return null;
}
