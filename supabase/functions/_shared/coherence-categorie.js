// ═══════════════════════════════════════════════════════════════════════════
// LA CATÉGORIE POSÉE EST COHÉRENTE AVEC LE TITRE ET L'OBJET (21/11/2026, complément de Nico au lot du 21/11, points 1 et 7)
// ═══════════════════════════════════════════════════════════════════════════
// Audit des publications du 21/11 (vérifiées une par une en base) : des catégories justes « au mot », fausses pour l'objet.
// Exemples (corrigés par la RÈGLE, pour tous les comptes) :
//   · un pull de personne → « Maison › Animaux › Chiens › Vêtements & accessoires › Pulls » (Vinted) ;
//   · « miniature blendeur rose » (accessoire de maison de poupée) → « Petit électroménager › Mixeurs » (Beebs),
//     « Électroménager » (Leboncoin) ;
//   · « Petite boîte en émail cloisonné » → « Décoration d'intérieur › Vases » (eBay) ;
//   · « livre d'or du chocolat » → « Livres pour bébé » (Beebs ; choix de la cliente, la règle vaut pour le moteur) ;
//   · « pin's pikachu » → « Loisirs › Jeux & Jouets » (Leboncoin) ;
//   · « Gilet » sans manches en maille → « Gilets de costume » (Vinted).
// RÈGLE : un rayon SPÉCIALISÉ (animaux, gilet de costume, livres pour bébé, vase…) n'est retenu que si le TITRE ou l'OBJET
// reconnu par l'IA le dit ; un objet NOMMÉ (chaussure, miniature, pin's) n'est jamais rangé dans un rayon qui le contredit.
// ⛔ Le TITRE et l'OBJET seulement : un mot isolé de la description n'est jamais une preuve (règle du 21/11, Vetis).
// Lu par : l'app (résolution des rayons : candidates, choix de l'IA, contrôle final), le worker eBay (suggestions d'eBay),
// ops-digest (contrôle quotidien des catégories posées). Pur (Node + navigateur + Deno).

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim();

// Le chemin, plié, ses niveaux séparés par « › ».
const cheminPlie = (chemin) => (Array.isArray(chemin) ? chemin : [chemin]).map(plier).filter(Boolean).join(" › ");
const feuille = (chemin) => { const c = Array.isArray(chemin) ? chemin : [chemin]; return plier(c[c.length - 1] ?? ""); };

const MOTS_ANIMAUX = /\b(chiens?|chiots?|chats?|chatons?|animal|animaux|toutous?|lapins?|rongeurs?|hamsters?|cochons? d'inde|oiseaux?|perroquets?|perruches?|poissons?|aquariums?|reptiles?|tortues?|chevaux|cheval|equitation|poneys?|niches?|laisses?|harnais|gamelles?|litieres?|griffoirs?|croquettes?|furets?|canins?|felins?|cages?|clapiers?|terrariums?|volieres?|guinea|hippiques?|hippo ?tonic|equestres?|cavaliers?|pansage|cure.?pieds?|licols?|selles?|tapis de selle|mors|brides?|longes?)\b/;
// Les mots d'une chaussure portée (pluriel ou terme sans ambiguïté : « basket » seul peut être le sport).
const MOTS_CHAUSSURE = /\b(baskets|sneakers?|chaussures?|bottes|bottines?|sandales?|escarpins?|mocassins?|ballerines?|espadrilles?|derbies|richelieus?|tongs|claquettes|chaussons|babies|boots|santiags?)\b/;
// … sauf quand le mot nomme ce qui LES range ou les entretient (« boîte à chaussures », « sac à baskets », « lacets »).
const CHAUSSURE_ACCESSOIRE = /\b(boites?|sacs?|housses?|range|rangements?|meubles?|etageres?|embauchoirs?|cirages?|lacets?|semelles?|chausse.?pieds?|bombes?|kits?|nettoyants?|patins?)\s+(a|de|pour|d')\s*(chaussures|baskets|bottes|sneakers|chaussons)/;
const RAYON_CHAUSSURES = /(chaussure|basket|botte|bottine|sandale|shoe|sneaker|escarpin|mocassin|ballerine|tong|espadrille|chausson|derby|claquette|pied|boot|santiag)/;
const MOTS_MINIATURE = /\b(miniatures?|maisons? de poupees?|dinettes?|pour poupees?|playmobil|sylvanian|barbie)\b/;
const RAYON_APPAREIL = /(electromenager|\bmixeurs?\b|\bblenders?\b|robots? (de )?cuisine|cafetieres?|bouilloires?|grille.?pain|\bfours?\b|micro.?ondes|aspirateurs?|lave.?(linge|vaisselle)|refrigerateurs?)/;
const MOTS_PINS = /\b(pin'?s|epinglettes?)\b/;
const RAYON_JOUETS = /(jeux (&|et) jouets|\bjouets?\b)/;

/**
 * Les règles, dans l'ordre. `chemin` : le rayon visé (motif sur le chemin plié) ; `exige` : ce que le titre ou l'objet doit
 * dire pour qu'il soit cohérent ; `objet` : ce que le titre ou l'objet nomme, et que le rayon ne doit pas contredire.
 */
export const REGLES_COHERENCE = Object.freeze([
  {
    id: "animaux_sans_animal",
    chemin: (c) => /(^| › )(animaux|animalerie|animaux de compagnie)( › |$)/.test(c),
    exige: MOTS_ANIMAUX,
    motif: "rayon des animaux, alors que ni le titre ni l'objet ne nomment un animal",
  },
  {
    id: "gilet_de_costume_sans_costume",
    chemin: (c, f) => /\bgilets? de costume\b/.test(f),
    exige: /\b(costume|costumes|tailleur|trois pieces|3 pieces|ceremonie|mariage|smoking|de costume)\b/,
    motif: "« gilet de costume », alors que le titre ne parle pas de costume",
  },
  {
    id: "gilet_specialise",
    chemin: (c, f) => /\bgilets? (haute visibilite|lestes?|de course|de flottaison|d'impact|de sauvetage)\b/.test(f),
    exige: /\b(haute visibilite|fluo|securite|lestes?|running|course|trail|flottaison|sauvetage|impact|kayak|paddle|wake|nautique)\b/,
    motif: "gilet d'un usage précis (sécurité, sport), que le titre ne dit pas",
  },
  {
    id: "livre_bebe_sans_bebe",
    chemin: (c, f) => /\blivres? (pour |de )?(bebes?|tout.?petits?)\b/.test(f),
    exige: /\b(bebes?|tout.?petits?|naissance|eveil|cartonnes?|imagiers?|tissu|bain|0.?(a|-)?.?3 ans|18 mois|premiers? mots?|mon premier|mes premiers|a toucher|tactiles?|sensoriels?|comptines?|a sons?|sonores?)\b/,
    motif: "« livres pour bébé », alors que le titre ne parle pas d'un livre de tout-petit",
  },
  {
    id: "vase_sans_vase",
    chemin: (c, f) => /^vases?$/.test(f),
    exige: /\b(vases?|soliflores?|amphores?)\b/,
    motif: "rayon « Vases », alors que le titre ne nomme pas un vase",
  },
  {
    id: "chaussure_hors_chaussures",
    // L'OBJET reconnu par l'IA d'abord (« Barbie avec robe et chaussures » est une poupée) ; sans objet, le titre.
    objet: (t, o, ti) => (o ? MOTS_CHAUSSURE.test(o) && !CHAUSSURE_ACCESSOIRE.test(o) : MOTS_CHAUSSURE.test(ti) && !CHAUSSURE_ACCESSOIRE.test(ti)),
    chemin: (c) => !RAYON_CHAUSSURES.test(c),
    motif: "le titre nomme une chaussure : le rayon doit être un rayon de chaussures",
  },
  {
    id: "miniature_en_appareil",
    objet: (t) => MOTS_MINIATURE.test(t),
    chemin: (c) => RAYON_APPAREIL.test(c),
    motif: "une miniature (maison de poupée, jouet) n'est jamais l'appareil réel",
  },
  {
    id: "pins_en_jouets",
    objet: (t) => MOTS_PINS.test(t),
    chemin: (c) => RAYON_JOUETS.test(c),
    motif: "un pin's est un objet de collection (ou un bijou), jamais un jouet",
  },
]);

/**
 * Le rayon est-il incohérent avec le titre et l'objet ? (pur)
 * @param {{chemin: string[]|string, titre?: string, objet?: string|null}} p
 * @returns {null | {regle: string, motif: string}}
 */
export function incoherenceCategorie({ chemin, titre = "", objet = "" } = {}) {
  const c = cheminPlie(chemin);
  if (!c) return null;
  const f = feuille(chemin);
  const ti = plier(titre);
  const o = plier(objet);
  const t = `${ti} ${o}`.trim();
  for (const r of REGLES_COHERENCE) {
    if (r.objet && !r.objet(t, o, ti)) continue;
    if (!r.chemin(c, f)) continue;
    if (r.exige && r.exige.test(t)) continue;
    return { regle: r.id, motif: r.motif };
  }
  return null;
}

/** Les candidates cohérentes (pur) : celles qu'aucune règle n'écarte. `chemin` lu sur chaque candidate. */
export function candidatesCoherentes(candidates, { titre = "", objet = "" } = {}) {
  return (Array.isArray(candidates) ? candidates : []).filter((x) => !incoherenceCategorie({ chemin: x?.chemin ?? x, titre, objet }));
}

/** Un objet de COLLECTION nommé au titre ou par l'IA (pin's, fève, timbre…) : sa catégorie d'origine (souvent un bijou ou
 *  un vêtement) ne dit pas sa famille (pur). */
export function objetDeCollection({ titre = "", objet = "" } = {}) {
  return /\b(pin'?s|epinglettes?|feves?|timbres?|capsules? de champagne|plaques? de muselet|medailles? de collection|pieces? de monnaie)\b/.test(plier(`${titre} ${objet ?? ""}`));
}
