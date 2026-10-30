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
  return lues.map((l) => l.nom);
}
