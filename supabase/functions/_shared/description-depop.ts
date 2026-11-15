// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : 5 HASHTAGS AU PLUS DANS LE TEXTE SERVI — JAMAIS UN ARTICLE BLOQUÉ POUR ÇA (15/11/2026, sebastien64310)
// ═══════════════════════════════════════════════════════════════════════════
// Constat : « Jupe plissée vintage 90s » (compte 48dd94f7, job 950ee139, 15/11 16:13) arrêtée en needs_user, source
// « relancer » : « Trop de hashtags pour Depop (13, 5 au plus). » — le pré-vol du connecteur Depop
// (content-scripts/depop.js, depopPrevol, MAX_HASHTAGS du formulaire relevé le 08/10) refuse un texte de plus de 5
// hashtags, et la description du job portait les 13 hashtags de la copie Vinted (l'app ne passe pas par
// utils/depopPublication.texteDepop sur tous ses chemins). Les autres plateformes du même article étaient parties.
// C'est NOTRE défaut : la règle de Depop est connue, on s'y adapte au lieu de bloquer l'article.
//
// LA RÈGLE (get-pending-jobs, texte SERVI à l'extension — PC comme Cloud, toutes versions ; le job en base n'est pas
// modifié, même contrat que la description Leboncoin, _shared/description-leboncoin.ts) :
//   · au-delà de DEPOP_HASHTAGS_MAX (5) hashtags, on garde les 5 plus SPÉCIFIQUES à l'article (même classement que
//     Leboncoin : la marque de l'article, puis les mots du titre, les génériques en dernier ; à score égal, l'ordre
//     d'écriture de la personne — classement recopié, voir plus bas) ; une répétition d'un hashtag gardé part (la
//     première occurrence reste) ;
//   · RIEN d'autre ne bouge : seuls les hashtags retirés quittent leur ligne (espaces de la ligne resserrés, ligne
//     devenue vide retirée) ; les autres lignes, les émojis, les sauts de ligne restent à l'octet ;
//   · une entité HTML (« tr&#232;s », textes importés d'eBay) n'est jamais un hashtag : jamais coupée ;
//   · 5 hashtags ou moins : le texte ressort identique.
// Compté LARGE (lettres accentuées comprises, comme l'app) : le texte servi tient sous le compte du connecteur
// (/#[a-zA-Z0-9_]+/, ASCII), quelle que soit l'écriture.
// Autre plateforme à plafond de hashtags (capacites-texte.js, hashtagsMaxPlateforme) : Leboncoin (5), plafonné au
// même endroit depuis le 10/09 (nettoyerDescriptionLeboncoin). Vinted : sans limite ; Beebs, eBay, Opla : aucune.
// Pur, sans import (Deno + Node ≥ 23, types retirés à la volée) : scripts/depop-hashtags-plafond-selftest.mjs.
// ⚠️ Le classement est RECOPIÉ de description-leboncoin.ts (hashtagsARetirer, étape 2) et non importé : ce fichier-là
//    est verrouillé par son empreinte (selftest:lbc-relance-identique — y toucher change la version des règles du texte
//    Leboncoin). selftest:depop-hashtags-plafond vérifie que les deux classements rendent les mêmes hashtags.

export const DEPOP_HASHTAGS_MAX = 5;

// ── Le classement de spécificité (le même que Leboncoin, plafond du 10/09) ──────────────────────────────────────────
const MOTS_GENERIQUES = new Set(("mode fashion style styl look looks tendance tendances chic casual basic basics premium urbain urban streetwear ootd outfit " +
  "femme femmes homme hommes enfant enfants fille filles garcon garcons bebe kids kid vetement vetements clothes clothing tenue tenues " +
  "shopping occasion secondemain seconde main bonplan bonplans promo pascher cher neuf etat tbe luxe sport sports ete hiver printemps automne " +
  "dressing vintage cool top idee cadeau nouveau new collection selection qualite confort confortable elegant elegante classe classique moderne " +
  "jolie joli beau belle marque brand original originale deal bon plan").split(/\s+/));
const replier = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const motsDuHashtag = (h: string): string[] => String(h).replace(/^#/, "")
  .replace(/([a-zà-ÿ0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .split(/[^\p{L}\p{N}]+/u).map((m) => replier(m)).filter(Boolean);

/** La spécificité d'un hashtag pour l'article (pur) : 5 la marque de l'article (ou un dérivé), 4 tous ses mots dans le
 *  titre, 3 un de ses mots dans le titre, 1 les autres, 0 un hashtag entièrement générique. */
export function scoreSpecificiteHashtag(h: string, contexte: { titre?: string; marque?: string } = {}): number {
  const marqueArticle = replier(contexte.marque ?? "");
  const tok = replier(h);
  if (marqueArticle && (tok === marqueArticle || tok.startsWith(marqueArticle) || marqueArticle.startsWith(tok))) return 5;
  const motsTitre = new Set(String(contexte.titre ?? "").split(/[^\p{L}\p{N}]+/u).map(replier).filter(Boolean));
  const mots = motsDuHashtag(h);
  const dansTitre = mots.filter((m) => motsTitre.has(m)).length;
  if (mots.length && dansTitre === mots.length) return 4;
  if (dansTitre > 0) return 3;
  if (mots.length && mots.every((m) => MOTS_GENERIQUES.has(m))) return 0;
  return 1;
}

/** Les hashtags (distincts, ordre d'écriture) au-delà d'un plafond de `max` : les moins spécifiques partent, l'ordre
 *  d'écriture départage à score égal (pur). */
export function hashtagsAuDelaDuPlafond(hashtags: readonly string[], max: number, contexte: { titre?: string; marque?: string } = {}): string[] {
  if (hashtags.length <= max) return [];
  return hashtags.map((h, i) => ({ h, i, s: scoreSpecificiteHashtag(h, contexte) }))
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(max).map((c) => c.h);
}
// Un hashtag : « # » suivi de lettres (accents compris), chiffres ou « _ », jamais précédé de « & » (entité HTML) ni
// d'une lettre ou d'un chiffre (« C# », « n°#2 » collé).
const HASHTAG_RE = /(?<![&\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu;
// Le compte du connecteur Depop (content-scripts/depop.js, depopCompterHashtags) — recopié pour la preuve.
const COMPTE_CONNECTEUR_RE = /#[a-zA-Z0-9_]+/g;

const cle = (h: string) => h.normalize("NFC").toLowerCase();

/** Combien de hashtags le connecteur Depop compterait (pur). */
export function hashtagsComptesParDepop(texte: string): number {
  return (String(texte ?? "").match(COMPTE_CONNECTEUR_RE) ?? []).length;
}

export interface PlafondDepop {
  texte: string;
  modifie: boolean;
  avant: number;       // hashtags (compte LARGE, répétitions comprises) avant
  apres: number;       // après
  retires: string[];   // hashtags distincts retirés (les répétitions d'un gardé n'y figurent pas)
  repetes: number;     // répétitions d'un hashtag gardé retirées
}

/**
 * Le texte Depop SERVI : 5 hashtags au plus, les plus spécifiques gardés, le reste du texte intact (pur).
 * @param contexte titre et marque de l'article (le classement de spécificité) — absents : l'ordre d'écriture tranche.
 */
export function plafonnerHashtagsDepop(description: string, contexte: { titre?: string; marque?: string } = {}): PlafondDepop {
  const brut = String(description ?? "");
  const tous = brut.match(HASHTAG_RE) ?? [];
  const sortie = (texte: string, retires: string[] = [], repetes = 0): PlafondDepop => ({
    texte, modifie: texte !== brut, avant: tous.length, apres: (texte.match(HASHTAG_RE) ?? []).length, retires, repetes,
  });
  if (tous.length <= DEPOP_HASHTAGS_MAX) return sortie(brut);
  // Distincts, dans l'ordre d'écriture (la première écriture fait foi pour la casse).
  const distincts: string[] = [];
  const vus = new Set<string>();
  for (const h of tous) { const k = cle(h); if (!vus.has(k)) { vus.add(k); distincts.push(h); } }
  const partent = new Set(hashtagsAuDelaDuPlafond(distincts, DEPOP_HASHTAGS_MAX, contexte).map(cle));
  const dejaGarde = new Set<string>();
  let repetes = 0;
  const RETIRE = "\u0000";
  const lignes = brut.split("\n").map((ligne) => {
    let touchee = false;
    const neuve = ligne.replace(HASHTAG_RE, (h) => {
      const k = cle(h);
      if (partent.has(k)) { touchee = true; return RETIRE; }
      if (dejaGarde.has(k)) { touchee = true; repetes++; return RETIRE; }
      dejaGarde.add(k);
      return h;
    });
    if (!touchee) return { ligne, garder: true };
    // Seuls les blancs qui ENTOURENT un hashtag retiré bougent : un espace entre deux mots, rien en bord de ligne ni
    // devant une ponctuation. Le reste de la ligne reste à l'octet ; une ligne devenue vide disparaît.
    const r = neuve.replace(/[ \t]*(?:\u0000[ \t]*)+/g, (m: string, off: number, s: string) => {
      const suivant = s[off + m.length] ?? "";
      return off === 0 || suivant === "" || /[,.;:!?)\]]/.test(suivant) ? "" : " ";
    });
    return { ligne: r, garder: r.trim() !== "" };
  });
  const texte = lignes.filter((l) => l.garder).map((l) => l.ligne).join("\n").replace(/\n+$/, (m) => (/\n+$/.test(brut) ? m : ""));
  return sortie(/\S/.test(texte) ? texte : brut, distincts.filter((h) => partent.has(cle(h))), repetes);
}
