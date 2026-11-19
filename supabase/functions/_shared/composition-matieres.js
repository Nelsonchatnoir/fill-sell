// ═══════════════════════════════════════════════════════════════════════════
// LA MATIÈRE, C'EST CE QUE DIT L'ÉTIQUETTE (30/10/2026, lot E — thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : un jean dont l'étiquette dit coton, polyester et
// élasthanne est parti sur Vinted (et partout) en « Denim » : l'analyse photo
// identifiait la matière « à partir des indices visuels » (un jean a l'air en
// denim), la rédaction la recopiait sur toutes les plateformes, et Vinted n'en
// cochait qu'une. Aucune étiquette n'avait été lue (attributs_visibles sans
// composition).
// RÈGLE : la matière d'un vêtement se LIT (étiquette de composition, texte de
// la fiche) ; lisible → les matières dans l'ordre de l'étiquette (la plus forte
// part d'abord) ; illisible → rien (jamais une matière déduite du type
// d'article). Ce module transforme une composition écrite en liste de
// matières : « 78 % coton, 20 % polyester, 2 % élasthanne » → Coton,
// Polyester, Élasthanne. Il ne devine rien : un mot qu'il ne connaît pas reste
// tel quel (capitalisé), une composition vide rend [].
// Lu par l'app (canonical_fields.matiere, ListingPreviewScreen), le serveur
// (aspects eBay) ; l'extension Vinted coche chaque matière (≤ 3).
// ═══════════════════════════════════════════════════════════════════════════

const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Les noms d'étiquette (français, anglais, abréviations normalisées) → le nom courant des listes des plateformes.
const NOMS = [
  [/^(coton|cotton|co|baumwolle|algodon|cotone)$/, "Coton"],
  [/^(polyester|pes|pl|poliester|polyester recycle|recycled polyester)$/, "Polyester"],
  [/^(elasthanne|elastane|ea|el|spandex|lycra|elastan)$/, "Élasthanne"],
  [/^(viscose|cv|vi|rayonne|rayon)$/, "Viscose"],
  [/^(polyamide|pa|nylon)$/, "Polyamide"],
  [/^(laine|wool|wo|laine vierge|virgin wool|lana)$/, "Laine"],
  [/^(lin|linen|li|flax)$/, "Lin"],
  [/^(soie|silk|se|seta)$/, "Soie"],
  [/^(acrylique|acrylic|pc|pan)$/, "Acrylique"],
  [/^(cachemire|cashmere|ws)$/, "Cachemire"],
  [/^(lyocell|tencel|cly)$/, "Lyocell"],
  [/^(modal|cmd|md)$/, "Modal"],
  [/^(cuir|leather)$/, "Cuir"],
  [/^(alpaga|alpaca)$/, "Alpaga"],
  [/^(mohair)$/, "Mohair"],
  [/^(angora)$/, "Angora"],
  [/^(merinos|merino)$/, "Mérinos"],
];

function nomCourant(brut) {
  const t = sansAccents(brut).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [re, nom] of NOMS) if (re.test(t)) return nom;
  // Inconnu : gardé tel qu'écrit, sans l'inventer ailleurs.
  const propre = String(brut).replace(/\d+([.,]\d+)?\s*%/g, "").replace(/\s+/g, " ").trim();
  return propre ? propre.charAt(0).toUpperCase() + propre.slice(1) : null;
}

/**
 * Les matières d'une composition écrite, dans l'ordre (part la plus forte d'abord quand des pourcentages sont lus).
 * @param {string|null|undefined} composition
 * @returns {string[]}
 */
export function matieresDeLaComposition(composition) {
  return matieresEtParts(composition).map((l) => l.nom);
}

/** Les matières d'une composition avec leur part lue (null sans pourcentage), dans l'ordre de matieresDeLaComposition. */
function matieresEtParts(composition) {
  const texte = String(composition ?? "").replace(/\r?\n/g, ", ").trim();
  if (!texte) return [];
  // Les couples (matière, part) : « 78% coton 2% EA » (la part d'abord) ou « coton 78 %, EA 2 % » (le mot d'abord) ;
  // sans pourcentage : « coton, polyester », « coton et élasthanne », « coton/élasthanne ».
  const couples = [];
  if (/\d\s*%/.test(texte)) {
    const jetons = [...texte.matchAll(/(\d+(?:[.,]\d+)?)\s*%|([\p{L}][\p{L}'’ -]*[\p{L}]|[\p{L}])/gu)]
      .map((m) => (m[1] != null ? { part: Number(m[1].replace(",", ".")) } : { mot: m[2].replace(/\b(et|and)\b/gi, " ").trim() }))
      .filter((j) => j.part != null || j.mot);
    const partDAbord = jetons[0]?.part != null;
    for (let k = 0; k < jetons.length; k++) {
      const j = jetons[k];
      if (partDAbord && j.part != null && jetons[k + 1]?.mot) { couples.push({ mot: jetons[k + 1].mot, part: j.part }); k++; }
      else if (!partDAbord && j.mot) {
        const suivant = jetons[k + 1];
        couples.push({ mot: j.mot, part: suivant?.part ?? null });
        if (suivant?.part != null) k++;
      }
    }
  } else {
    for (const p of texte.split(/\s*(?:[,;/+·|]|\bet\b|\band\b)\s*/i)) if (p.trim()) couples.push({ mot: p.trim(), part: null });
  }
  const lues = [];
  couples.forEach(({ mot, part }, i) => {
    const nom = nomCourant(mot);
    if (!nom) return;
    const deja = lues.find((l) => l.nom === nom);
    if (deja) { if (part != null) deja.part = (deja.part ?? 0) + part; return; }
    lues.push({ nom, part, i });
  });
  const avecPart = lues.some((l) => l.part != null);
  if (avecPart) lues.sort((a, b) => ((b.part ?? -1) - (a.part ?? -1)) || (a.i - b.i));
  return lues.map(({ nom, part }) => ({ nom, part }));
}

// ══ (19/11/2026, décision de Nico — compte 8ac5bbda) LA MATIÈRE MAJORITAIRE GAGNE, JAMAIS LA MINORITAIRE ══════════════
// Constat : veste « Matière : 54 % polyester, 44 % laine vierge, 2 % élasthanne » partie en « Laine » sur Leboncoin,
// Beebs et eBay (et « wool » sur Depop) — la rédaction IA avait choisi la laine, et sa réponse était recopiée partout
// (canonicalisation de _shared/redaction-plateformes.ts). RÈGLE, pour toutes les plateformes : quand le texte de
// l'article ÉCRIT une composition chiffrée (ligne « Matière : », « Composition : », « Tissu : »… ; jamais la doublure,
// le rembourrage ni une partie du vêtement), une matière servie qui y figure en part MINORITAIRE est remplacée par la
// part la plus forte. Rien n'est inventé : une matière absente de la composition, une égalité en tête (50/50), deux
// compositions principales qui se contredisent, ou un texte sans pourcentage → rien ne change.

// Seules les matières CONNUES (table NOMS) comptent : « Effet suédine (97 % polyester…) », « Mélange doux (50 % acrylique…) »
// ne font pas de « Effet suédine » une matière (rejeu 30 j du 19/11 : 6 cas de ce genre écartés).
const CONNUES = new Set(NOMS.map(([, nom]) => nom));
/** La composition d'une valeur : le contenu de SA parenthèse chiffrée (« Maille douce (80% viscose, 20% lurex) ») ; deux
 *  parenthèses chiffrées (« Satin (94 % polyester…) et tulle (100 % polyester) ») : deux parties, null. */
function contenuDeComposition(valeur) {
  const groupes = [...String(valeur ?? "").matchAll(/\(([^()]*\d\s*%[^()]*)\)/g)].map((m) => m[1]);
  if (groupes.length > 1) return null;
  return groupes.length === 1 ? groupes[0] : String(valeur ?? "");
}
/** Les parts CONNUES et chiffrées d'une valeur de composition, de la plus forte à la plus faible ; null si illisible ou
 *  si les parts dépassent 100 % (plusieurs compositions mêlées). */
function partsConnues(valeur) {
  const contenu = contenuDeComposition(valeur);
  if (contenu == null) return null;
  const chiffrees = matieresEtParts(contenu).filter((l) => l.part != null);
  // La plus forte part est un mot inconnu (« 80 % laine mérinos ») : la majoritaire n'est pas connue, rien n'est tranché.
  if (!chiffrees.length || !CONNUES.has(chiffrees[0].nom) || chiffrees.reduce((s, l) => s + l.part, 0) > 101) return null;
  return chiffrees.filter((l) => CONNUES.has(l.nom));
}

// Les libellés d'une ligne de composition PRINCIPALE (avant les deux-points), et ceux d'une PARTIE qui ne l'est pas.
const LIBELLE_PRINCIPAL = /^(?:composition|compo|matieres?|matiere principale|matiere exterieure|matieres? exterieures?|exterieur|tissu|tissu principal|etoffe|material|materials|fabric|main fabric|shell|outer)(?: \(s\))?$/;
const PARTIE = /doublure|lining|rembourrage|garnissage|ouatine|padding|filling|interieur|poche|col\b|manche|capuche|bord|semelle|empeigne|dessus|dessous|bride|bretelle|ceinture|insert|empiecement|garniture|fourrure|trim|contraste|broderie|imprime/;

/**
 * La composition PRINCIPALE écrite dans un texte (pur) : [{ nom, part }] de la plus forte part à la plus faible, ou
 * null — sans ligne de composition chiffrée, ou avec deux lignes principales dont la tête diffère.
 * Lignes lues : « Matière : 54 % polyester, 44 % laine », « Composition 80% coton 20% polyester », une ligne qui n'est
 * QU'une composition (« 100 % coton »). Jamais « Doublure : … », « Rembourrage : … », « Col : … ».
 * @param {string|null|undefined} texte
 */
export function compositionPrincipaleDuTexte(texte) {
  const lignes = String(texte ?? "").split(/\r?\n|(?<=\.)\s+(?=[A-ZÀ-Ý])/);
  const trouvees = [];
  for (const brute of lignes) {
    const ligne = brute.replace(/^[\s\-•*·–—>]+/, "").trim();
    if (!/\d\s*%/.test(ligne)) continue;
    let valeur = null;
    const m = /^([^:%\d]{2,40}?)\s*[:：]\s*(.+)$/.exec(ligne);
    if (m) {
      const lib = sansAccents(m[1]).replace(/[^a-z() ]/g, " ").replace(/\s+/g, " ").trim();
      if (PARTIE.test(lib) || !LIBELLE_PRINCIPAL.test(lib)) continue;
      valeur = m[2];
    } else {
      const m2 = /^(?:composition|compo|matieres?|tissu)\s+(\d.+)$/i.exec(sansAccents(ligne));
      if (m2) valeur = ligne.slice(ligne.length - m2[1].length);
      else if (/^\d+(?:[.,]\d+)?\s*%/.test(ligne)) valeur = ligne;
      else continue;
    }
    if (PARTIE.test(sansAccents(valeur))) continue;   // « 80 % coton, doublure 100 % polyester » : rien n'est tranché
    const parts = partsConnues(valeur);
    if (!parts) { if (/\d\s*%/.test(valeur)) trouvees.push(null); continue; }   // chiffrée mais illisible : on ne tranche pas
    trouvees.push(parts);
  }
  if (!trouvees.length || trouvees.includes(null)) return null;
  const tete = trouvees[0][0].nom;
  if (trouvees.some((t) => t[0].nom !== tete)) return null;
  return trouvees[0];
}

/**
 * La matière à servir quand la valeur servie est une part MINORITAIRE de la composition écrite (pur) :
 * { valeur, de, composition } ou null (rien à changer). `matiere` peut être une liste (« Laine, Polyester ») : sa
 * PREMIÈRE matière est celle que les plateformes à une case reçoivent.
 * @param {{ matiere?: string|null, texte?: string|null }} a
 */
export function matiereMajoritaireCorrigee({ matiere = null, texte = "" } = {}) {
  const contenu = contenuDeComposition(matiere);
  const servies = contenu == null ? [] : matieresDeLaComposition(contenu);
  if (!servies.length || !CONNUES.has(servies[0])) return null;
  const comp = compositionPrincipaleDuTexte(texte);
  if (!comp || !comp.length) return null;
  if (comp.length > 1 && comp[1].part === comp[0].part) return null;   // égalité en tête : rien n'est tranché
  const tete = comp[0].nom;
  if (servies[0] === tete) return null;
  if (!comp.some((l) => l.nom === servies[0])) return null;            // pas une part de la composition : on ne sait pas
  return { valeur: tete, de: String(matiere), composition: comp.map((l) => `${l.part} % ${l.nom}`).join(", ") };
}

/**
 * Des IDENTIFIANTS de matières d'une plateforme (Depop : « wool ») remis sur la composition écrite (pur) : la part la
 * plus forte d'abord, les identifiants déjà posés gardés ; null si rien ne change, si l'un d'eux n'est pas une part
 * de la composition, ou si la plus forte n'a pas d'identifiant. `idDe(nom)` : l'identifiant d'une matière, ou null.
 * Veste Pikeur : ["wool"] + « 54 % polyester, 44 % laine » → ["polyester", "wool"].
 * @param {string[]|null|undefined} ids
 * @param {string|null|undefined} texte
 * @param {(nom: string) => string|null} idDe
 * @param {number} [max]
 */
export function identifiantsSurLaComposition(ids, texte, idDe, max = 4) {
  const l = (Array.isArray(ids) ? ids : []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (!l.length || typeof idDe !== "function") return null;
  const comp = compositionPrincipaleDuTexte(texte);
  if (!comp || (comp.length > 1 && comp[1].part === comp[0].part)) return null;
  const idsComp = comp.map((c) => idDe(c.nom) ?? null);
  if (!idsComp[0] || l.some((x) => !idsComp.includes(x)) || l[0] === idsComp[0]) return null;
  const garder = new Set([idsComp[0], ...l]);
  return [...new Set(idsComp.filter((x) => x && garder.has(x)))].slice(0, max);
}

/**
 * Une liste de matières (Vinted, 3 au plus) remise dans l'ordre de la composition écrite (pur) : la liste réordonnée,
 * ou null si rien ne change (ou si l'une d'elles n'est pas dans la composition).
 * @param {string[]|null|undefined} matieres
 * @param {string|null|undefined} texte
 */
export function matieresDansLOrdreDeLaComposition(matieres, texte) {
  const l = (Array.isArray(matieres) ? matieres : []).map((m) => String(m ?? "").trim()).filter(Boolean);
  if (l.length < 2) return null;
  const comp = compositionPrincipaleDuTexte(texte);
  if (!comp || (comp.length > 1 && comp[1].part === comp[0].part)) return null;
  const rang = (m) => comp.findIndex((c) => c.nom === (matieresDeLaComposition(m)[0] ?? m));
  if (l.some((m) => rang(m) < 0)) return null;
  const triee = [...l].sort((a, b) => rang(a) - rang(b));
  return triee.every((m, i) => m === l[i]) ? null : triee;
}
