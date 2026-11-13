// ═══════════════════════════════════════════════════════════════════════════
// CE QUE CHAQUE PLATEFORME REÇOIT DANS UN TEXTE — PAR PLATEFORME ET PAR SITE (13/11, lot « zéro problème », 5a)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (12/11) : « une table de capacités PAR PLATEFORME et par site décide de ce que chacune reçoit
// (émojis, sauts de ligne, longueur, hashtags, phrase de test) ». Avant elle, la même décision vivait en quatre
// copies qui ne disaient pas la même chose : PLATFORM_LIMITS (rédaction : hashtags OBLIGATOIRES sur Beebs),
// descriptionFidele (hashtags RETIRÉS sur Beebs à la publication, 30/10), BORNES_TEXTE (texteConforme) et le
// retrait des émojis du titre dans l'extension (background.js, stripEmoji, 12/07). Elles lisent toutes ICI.
//
// PAR SITE : une plateforme a une entrée « * » (tous ses sites) et, au besoin, une entrée par site (code du pays ou
// de la langue du compte de plateforme : « it », « es »…) qui ne porte QUE ce qui diffère. Aucun site ne diffère
// aujourd'hui (Vinted Pro documente les mêmes bornes pour tous ses sites) : la forme est prête, rien n'est inventé.
//
// PROVENANCE de chaque valeur (jamais de mémoire) :
//   · titre.max / description.max : PLATFORM_LIMITS (redaction-plateformes.ts, sources ligne à ligne : doc Vinted
//     Pro 100/2000 ; eBay 80 refus à la saisie ; Leboncoin 200 relevé DOM ; Beebs 1 500 PRUDENT sans source ;
//     Depop 1 000 MAX_CHAR_COUNT du formulaire, texteConforme.js 09/10).
//   · titre.emojis : l'extension retire TOUS les émojis du titre avant de taper (background.js sanitizeJob,
//     12/07, « plusieurs plateformes refusent ») — Vinted, Leboncoin, Beebs, Depop, Opla. eBay passe par l'API et
//     les garde (ebay-publication.ts ; 7 annonces eBay en ligne depuis le 01/11 avec 🎮 en tête, compte de63ca45).
//     `emojisVerifie: false` = jamais essayé sur la plateforme : le comportement d'aujourd'hui est FIGÉ jusqu'à
//     l'essai de Nico sur son compte (annonce à 999 € ou plus) — selftest:titre-emoji-plateformes.
//   · description.emojis : aucune plateforme ne les refuse (annonces en ligne pleines d'émojis), aucun code ne les
//     retire hors consigne du vendeur.
//   · description.hashtags : combien FillSell en écrit — Vinted sans limite, Depop 5, jamais ailleurs (règle 5 de
//     Nico du 26/10, descriptionFidele). `hashtagsMaxPlateforme` : ce que la plateforme accepte d'un texte de
//     vendeur (Leboncoin 5, page de correction, description-leboncoin.ts ; Depop 5, refus au-delà, depop.js).
//   · description.phraseDeTest : Beebs NON — 4 dépôts du 02/11 refusés en vérification (n° 34282058, 34282196,
//     34286574, 34287829), 0 annonce en ligne sur 89 qui la portaient (mesure du 03/11). Ailleurs : en ligne
//     (70 annonces Vinted, 80 republications Leboncoin en 12 jours).
//   · redaction.cible : fourchette INDICATIVE de la rédaction (arbitrage Nico du 29/07) — seulement pour les
//     plateformes que le module de rédaction rédige.
// Pur, sans import (Deno + Node + Vite).
// ═══════════════════════════════════════════════════════════════════════════

const TOUS_LES_SITES = "*";

export const CAPACITES_TEXTE = Object.freeze({
  vinted: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 100, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 2000, emojis: true, sautsDeLigne: true, hashtags: Infinity, hashtagsMaxPlateforme: Infinity, phraseDeTest: true }),
      redaction: Object.freeze({ cible: Object.freeze([300, 650]) }),
    }),
  }),
  beebs: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 100, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 1500, emojis: true, sautsDeLigne: true, hashtags: 0, hashtagsMaxPlateforme: null, phraseDeTest: false }),
      redaction: Object.freeze({ cible: Object.freeze([250, 500]) }),
    }),
  }),
  leboncoin: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 200, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 3000, emojis: true, sautsDeLigne: true, hashtags: 0, hashtagsMaxPlateforme: 5, phraseDeTest: true }),
      redaction: Object.freeze({ cible: Object.freeze([300, 600]) }),
    }),
  }),
  ebay: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 80, emojis: true, emojisVerifie: true, sautsDeLigne: false }),
      description: Object.freeze({ max: 2000, emojis: true, sautsDeLigne: true, hashtags: 0, hashtagsMaxPlateforme: null, phraseDeTest: true }),
      redaction: Object.freeze({ cible: Object.freeze([300, 600]) }),
    }),
  }),
  depop: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 100, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 1000, emojis: true, sautsDeLigne: true, hashtags: 5, hashtagsMaxPlateforme: 5, phraseDeTest: true }),
    }),
  }),
  opla: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 100, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 2000, emojis: true, sautsDeLigne: true, hashtags: 0, hashtagsMaxPlateforme: null, phraseDeTest: true }),
    }),
  }),
  vestiaire: Object.freeze({
    [TOUS_LES_SITES]: Object.freeze({
      titre: Object.freeze({ max: 100, emojis: false, emojisVerifie: false, sautsDeLigne: false }),
      description: Object.freeze({ max: 2000, emojis: true, sautsDeLigne: true, hashtags: 0, hashtagsMaxPlateforme: null, phraseDeTest: true }),
      redaction: Object.freeze({ cible: Object.freeze([300, 600]) }),
    }),
  }),
});

/** Les plateformes de la table. */
export const PLATEFORMES_TEXTE = Object.freeze(Object.keys(CAPACITES_TEXTE));

/**
 * Les capacités d'une plateforme pour un site (le site ne porte que ce qui diffère de « * »). Plateforme inconnue → null.
 * @param {string} plateforme
 * @param {string|null} [site]  code du site du compte de plateforme (« fr », « it »…), null = tous les sites
 */
export function capacitesTexte(plateforme, site = null) {
  const p = CAPACITES_TEXTE[String(plateforme ?? "")];
  if (!p) return null;
  const base = p[TOUS_LES_SITES];
  const s = site ? p[String(site).toLowerCase()] : null;
  if (!s) return base;
  return {
    titre: { ...base.titre, ...(s.titre ?? {}) },
    description: { ...base.description, ...(s.description ?? {}) },
    ...(base.redaction || s.redaction ? { redaction: { ...(base.redaction ?? {}), ...(s.redaction ?? {}) } } : {}),
  };
}

/** Combien de hashtags FillSell écrit sur une plateforme (0 = aucun). */
export function hashtagsDeFillSell(plateforme, site = null) {
  return capacitesTexte(plateforme, site)?.description?.hashtags ?? 0;
}
