// ═══════════════════════════════════════════════════════════════════════════
// DESCRIPTION LEBONCOIN : AUCUNE MENTION D'UN AUTRE SITE (2026-09-09)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LEBONCOIN FAIT (mesuré le 09/09 sur le compte de Nico, wizard réel) :
// la règle est SERVEUR. Le formulaire ne dit rien pendant la saisie ; c'est
// `POST api.leboncoin.fr/api/adsubmit/v2/classifieds` qui répond 403
//   {"status":"rejected","details":[{"field":"body","message":"Nous vous
//    invitons à supprimer toute mention d'un site internet autre que
//    leboncoin.fr dans le titre et/ou le texte de votre annonce."}]}
// et le message apparaît sous le champ (#body-error). L'extension voyait un
// « Continuer qui ne fait rien » : le job 8fea6e80 (Sweat Tommy Jeans) est
// tombé sur « Leboncoin n'a pas confirmé le dépôt ».
//
// Ce qui déclenche, PROUVÉ :
//   · la description Vinted de Nico, dont le seul mot « de site » est le
//     hashtag « #VintedStyle » → 403. La règle est donc une SOUS-CHAÎNE,
//     insensible à la casse : un hashtag suffit, une borne de mot ne
//     protège pas (« VintedStyle » est refusé).
//   · « Robe Shein en très bon état » → ACCEPTÉ (annonce créée puis
//     supprimée) : une marque qui est aussi un site n'est pas visée.
//     « shein » (148 articles en base) NE DOIT PAS être dans la liste.
//
// LISTE FERMÉE : les places de marché entre particuliers (sous-chaîne) et
// toute adresse web. Jamais « leboncoin » (c'est leur site). Toute addition
// se mesure d'abord (scripts/description-leboncoin-selftest.mjs + comptage
// en base) — pas de devinette : un terme qu'on retire, c'est du texte de la
// vendeuse qui disparaît.
//
// CE QU'ON RETIRE, ET SEULEMENT ÇA (jamais une réécriture, l'IA n'y touche pas) :
//   1. le HASHTAG entier qui contient un terme (#VintedStyle, #vintedfrance) —
//      227 des 254 descriptions Vinted touchées ne portent QUE ça ;
//   2. sinon la PHRASE qui contient le terme — segment entre ponctuations
//      finales (. ! ?), retours à la ligne ou pictogrammes (📦 ❌ ✅ ⚠️
//      servent de puces dans ces descriptions : « ❌ Pas d'envoi via Vinted
//      Go » part en entier, « Envoi rapide 📦 » juste avant reste) ;
//   3. les adresses web (http…, www…, quelque-chose.fr/.com…) — le mot seul.
// FAIL-SAFE : si le texte devient vide, on rend l'ORIGINAL inchangé (un
// refus qu'on comprend vaut mieux qu'une annonce sans description) ; toute
// exception rend l'original. Le job en base n'est jamais modifié : c'est le
// texte SERVI à l'extension (get-pending-jobs) qui est nettoyé.
// Copie de la liste côté app : src/utils/descriptionMentions.js (bornes de
// mot, informatif) — les deux listes n'ont PAS le même rôle, ne pas fusionner.

export const TERMES_SITES_LEBONCOIN: readonly string[] = [
  "vinted",              // prouvé (403 sur « #VintedStyle »)
  "ebay",
  "beebs",
  "vestiaire collective",
  "vestiairecollective",
  "videdressing",        // l'ancien site ; en base, 74 hashtags « #videdressing »
  "depop",
  "wallapop",
];

// Adresse web : protocole, www., ou domaine.tld — leboncoin.fr exclu.
const ADRESSE_WEB = /(?:https?:\/\/\S+|www\.\S+|\b(?!leboncoin\.)[a-z0-9-]+\.(?:fr|com|net|org|eu|io|app|shop|co|be|ch)\b)/gi;

const PICTO = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u;
// Délimiteurs de segment : ponctuation finale suivie d'un blanc ou de la fin,
// ou un pictogramme. Les parenthèses capturantes gardent le délimiteur dans
// le split.
const DELIM = new RegExp(`([.!?]+(?=\\s|$)|${PICTO.source})`, "gu");

export interface NettoyageLeboncoin {
  texte: string;
  modifiee: boolean;
  termes: string[];
  retires: number;   // hashtags + phrases + adresses retirés
  vide: boolean;     // le nettoyage aurait tout effacé → original rendu
}

const minuscule = (s: string) => s.toLowerCase();
const termesDans = (s: string): string[] => {
  const bas = minuscule(s);
  const t = TERMES_SITES_LEBONCOIN.filter((x) => bas.includes(x));
  ADRESSE_WEB.lastIndex = 0;
  if (ADRESSE_WEB.test(s)) t.push("adresse web");
  return t;
};

function nettoyerLigne(ligne: string, termes: Set<string>): { ligne: string; retires: number } {
  let retires = 0;
  // 1. hashtags entiers
  let l = ligne.replace(/#[^\s#]+/g, (h) => {
    if (termesDans(h).length) { retires++; termesDans(h).forEach((t) => termes.add(t)); return ""; }
    return h;
  });
  // 3. adresses web (mot seul)
  l = l.replace(ADRESSE_WEB, () => { retires++; termes.add("adresse web"); return ""; });
  if (!termesDans(l).length) return { ligne: l, retires };
  // 2. phrases : segments entre délimiteurs
  const parts = l.split(DELIM); // [seg, delim, seg, delim, …]
  const garder: boolean[] = parts.map(() => true);
  const estPicto = (s: string | undefined) => !!s && new RegExp(`^${PICTO.source}$`, "u").test(s);
  const vide = (s: string | undefined) => !s || !s.trim();
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i];
    const trouves = termesDans(seg);
    if (!trouves.length) continue;
    trouves.forEach((t) => termes.add(t));
    garder[i] = false; retires++;
    // la ponctuation qui FERME cette phrase part avec elle
    if (i + 1 < parts.length && !estPicto(parts[i + 1])) garder[i + 1] = false;
    // un pictogramme qui SERVAIT DE PUCE à cette phrase (rien devant lui) part aussi
    if (i - 1 >= 0 && estPicto(parts[i - 1]) && (i - 2 < 0 || vide(parts[i - 2]) || !garder[i - 2])) garder[i - 1] = false;
    // un pictogramme qui DÉCORAIT la fin de cette phrase (rien derrière lui) part aussi
    if (i + 1 < parts.length && estPicto(parts[i + 1]) && (i + 2 >= parts.length || vide(parts[i + 2]))) garder[i + 1] = false;
  }
  l = parts.filter((_, i) => garder[i]).join("");
  return { ligne: l, retires };
}

export function nettoyerDescriptionLeboncoin(description: string): NettoyageLeboncoin {
  const original = String(description ?? "");
  try {
    if (!termesDans(original).length) return { texte: original, modifiee: false, termes: [], retires: 0, vide: false };
    const termes = new Set<string>();
    let retires = 0;
    const lignes = original.split(/\r?\n/).map((ligne) => {
      const r = nettoyerLigne(ligne, termes);
      retires += r.retires;
      // On ne retouche que les DOUBLES espaces créés par un retrait — jamais
      // la typographie de la vendeuse (« Offres bienvenues ! » garde son espace).
      const nettoyee = r.ligne.replace(/[ \t]{2,}/g, " ").trim();
      // Une ligne qui avait du texte et n'en a plus (ou plus que des
      // pictogrammes / ponctuation, « 📦 ✨ ») DISPARAÎT — pas de ligne vide
      // orpheline à sa place. Les lignes vides d'origine restent.
      if (ligne.trim() && !/[\p{L}\p{N}]/u.test(nettoyee)) return null;
      return nettoyee;
    }).filter((l): l is string => l !== null);
    const texte = lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!texte) return { texte: original, modifiee: false, termes: [...termes], retires, vide: true };
    return { texte, modifiee: texte !== original, termes: [...termes], retires, vide: false };
  } catch {
    return { texte: original, modifiee: false, termes: [], retires: 0, vide: false };
  }
}
