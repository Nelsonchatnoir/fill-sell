// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LEBONCOIN : CINQ MOTS-CLÉS AU PLUS DANS LE TEXTE SERVI, COMPTÉS COMME LEBONCOIN LES LIT (13/11, lot du 13/11)
// ═══════════════════════════════════════════════════════════════════════════
// La règle de Leboncoin (page de correction lue le 10/09) : « nous vous autorisons à utiliser CINQ (5) mots-clés dans
// le descriptif ». FillSell la tient dans _shared/description-leboncoin.ts (plafond du 10/09, ligne « Mots-clés : » du
// 15/10) — mais elle comptait les hashtags DISTINCTS et ne lisait une ligne « Mots-clés : » que si la liste était sur
// la MÊME ligne. Deux refus de modération du 06/11 au 13/11 en viennent (cas réels, relus en prod le 13/11) :
//   · compte f0acd3af, job ae8d7ec6 (Leboncoin 3308018636, « Haut IKKS Women… », Cloud 0.6.186, 12/11 17:24) : 50
//     hashtags en cinq langues ; le plafond en gardait 5 distincts mais laissait leurs répétitions → 9 hashtags servis
//     (#IKKSWomen cinq fois) ; absente des relevés de 22:47 et 09:05, mise en échec. Le seul des 67 dépôts du compte ce
//     jour-là à dépasser 5 ; les 66 autres (0 à 13 hashtags, ramenés à 5) sont en ligne.
//   · compte ca9afe24, job f18c726d (Leboncoin 3303637549, « Adaptateur secteur rétro Game Boy », 0.6.175, 06/11) :
//     « Mots-clés : » seul sur sa ligne, puis 12 mots-clés sur la suivante → servis tels quels.
// Mesure (13/11, lecture seule, dépôts Leboncoin depuis le 01/10 dont la description porte > 5 hashtags) : texte servi
// avec > 5 hashtags → 5 refusés sur 16 jugés (31 %) ; texte servi avec ≤ 5 → 1 refusé sur 562 (0,2 %).
// LA RÈGLE (tous comptes) : au-delà de 5 hashtags dans le texte, une répétition d'un hashtag gardé part (la première
// occurrence reste) ; une étiquette « Mots-clés : / Keywords : / Tags : » seule sur sa ligne compte les éléments du bloc
// qui la suit (jusqu'à la ligne vide) et part avec lui au-delà du plafond. Un texte déjà conforme ressort IDENTIQUE.
//   node scripts/lbc-cinq-mots-cles-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { nettoyerDescriptionLeboncoin: servi, nettoyerSeulement: propre } =
  await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/description-leboncoin.ts")).href);
const fixture = (n) => readFileSync(join(ROOT, "scripts/fixtures", n), "utf8").replace(/\r\n/g, "\n");

let ko = 0;
const v = (ok, nom, detail = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { ko++; console.error(`  ✗ ${nom}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); }
};
const hashtags = (s) => String(s ?? "").match(/#[^\s#]+/g) ?? [];
// Ce que Leboncoin compte : chaque hashtag, plus chaque élément d'une liste étiquetée « Mots-clés ».
const motsClesServis = (s) => {
  const lignes = String(s ?? "").split("\n");
  let n = hashtags(s).length;
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^\s*(?:mots?[\s-]*cl[ée]s?|keywords?|tags?)\s*:\s*(.*)$/i);
    if (!m) continue;
    const bloc = [m[1]];
    if (!m[1].trim()) for (let k = i + 1; k < lignes.length && lignes[k].trim(); k++) bloc.push(lignes[k]);
    n += bloc.join(",").split(/[,;·|•\/\n]+/).map((x) => x.trim()).filter(Boolean).length;
  }
  return n;
};

console.log("▸ cas réel f0acd3af / ae8d7ec6 — « Haut IKKS Women… » (50 hashtags, dont des répétitions)");
{
  const brut = fixture("description-lbc-1311-f0acd3af-haut.txt");
  const r = servi(brut, { titre: "Haut IKKS Women gris anthracite – Taille S – Broderies et sequins dorés – Col V", marque: "IKKS", etat: "Très bon état" });
  v(hashtags(brut).length === 50, "la fiche porte bien 50 hashtags (décor du cas)", hashtags(brut).length);
  v(hashtags(r.texte).length <= 5, `texte servi : 5 hashtags au plus (servi : ${hashtags(r.texte).length})`, hashtags(r.texte).join(" "));
  v(new Set(hashtags(r.texte).map((h) => h.toLowerCase())).size === hashtags(r.texte).length, "aucun hashtag répété dans le texte servi", hashtags(r.texte).join(" "));
  v(/#HautIKKS/.test(r.texte) && /#IKKSWomen/.test(r.texte), "les plus spécifiques restent (#HautIKKS, #IKKSWomen)", hashtags(r.texte).join(" "));
  v(r.texte.startsWith("Très joli haut pour femme de la marque IKKS Women") && /Aisselle à aisselle : 51 cm/.test(r.texte)
    && /Envoi rapide et soigné\./.test(r.texte), "le texte de la vendeuse reste intact");
  v(propre(r.texte, { titre: "Haut IKKS Women gris anthracite – Taille S – Broderies et sequins dorés – Col V", marque: "IKKS" }).texte === r.texte,
    "idempotent : nettoyer le texte servi ne change plus rien");
}

console.log("▸ cas réel ca9afe24 / f18c726d — « Adaptateur secteur rétro Game Boy » (« Mots-clés : » puis 12 éléments à la ligne)");
{
  const brut = fixture("description-lbc-1311-ca9afe24-adaptateur.txt");
  const r = servi(brut, { titre: "Adaptateur secteur rétro Game Boy", marque: "Gameboy", etat: "Bon état" });
  v(motsClesServis(brut) === 12, "la fiche porte 12 mots-clés étiquetés (décor du cas)", motsClesServis(brut));
  v(motsClesServis(r.texte) <= 5, `texte servi : 5 mots-clés au plus (servi : ${motsClesServis(r.texte)})`, r.texte.slice(-200));
  v(!/Mots-clés/i.test(r.texte) && !/retrogame, gamer/.test(r.texte), "l'étiquette ET sa liste partent du texte servi", r.texte.slice(-200));
  v(/Parfait pour compléter une collection rétro gaming ou décorer un espace geek\.$/.test(r.texte)
    && /✔️ Design rétro type Game Boy/.test(r.texte), "le texte de la vendeuse reste intact, jusqu'à sa dernière phrase", r.texte.slice(-200));
}

console.log("▸ zéro régression : un texte conforme ressort identique, octet pour octet");
{
  const memes = [
    "Robe Zara.\n#Zara #Zara #robe",                       // 3 hashtags (une répétition) : sous le plafond
    "Robe.\n#robe #lin #ete #robe #lin",                    // 5 occurrences : au plafond, rien ne bouge
    "Robe d'été en lin.\nMots-clés : robe, lin, été",       // ligne de 3 (règle du 15/10)
    "Robe.\nMots-clés : robe, lin\n#robe #lin #ete",        // 2 + 3 = 5
    "Robe.\nMots-clés :\nrobe, lin, été",                   // étiquette seule + 3 éléments à la ligne
    "Robe.\nMots-clés :\n\nUne belle robe d'été, légère, en lin, taille 38, portée deux fois.", // étiquette puis ligne vide : rien n'est une liste
    "Tags du jour : soleil",                                // pas une étiquette de mots-clés
    // une entité HTML n'est pas un hashtag (texte importé d'eBay, compte 53efea05, 11/11) : rien n'est coupé
    "Vase tr&#232;s soign&#233;, tr&#232;s beau, tr&#232;s rare, tr&#232;s ancien, tr&#232;s solide, tr&#232;s propre.",
  ];
  for (const t of memes) v(propre(t, {}).texte === t && propre(t, {}).modifiee === false, `intact : ${JSON.stringify(t).slice(0, 70)}`, propre(t, {}).texte);
}

console.log("▸ la règle, au-delà du cas");
{
  const r1 = propre("Pull.\n#pull #laine #pull #laine #pull #laine", {});
  v(r1.texte === "Pull.\n#pull #laine", "6 occurrences de 2 hashtags → les répétitions partent, la première de chaque reste", r1.texte);
  const r2 = propre("Pull.\n#a #b #c #d #e #a #b #c #d #e #f #g", { titre: "Pull" });
  v(hashtags(r2.texte).length === 5 && new Set(hashtags(r2.texte)).size === 5, "7 distincts répétés → 5 occurrences, 5 distincts", r2.texte);
  const r3 = propre("Lampe.\nKeywords:\nlampe\nvintage\nlaiton\nbureau\nchevet\nretro\n\nEnvoi soigné.", {});
  v(r3.texte === "Lampe.\n\nEnvoi soigné.", "étiquette seule + un mot par ligne (6) → le bloc part, jusqu'à la ligne vide", JSON.stringify(r3.texte));
  const r5 = propre("Lampe.\nMots-clés :\nlampe, laiton, vintage, bureau, chevet, retro\nEnvoi rapide et soigné.", {});
  v(r5.texte === "Lampe.\nEnvoi rapide et soigné.", "la phrase qui suit la liste sans ligne vide n'est pas une liste : elle reste", JSON.stringify(r5.texte));
  const r4 = propre("Lampe.\nMots clés :\nlampe, laiton\n#lampe #laiton #vintage #bureau", {});
  v(/Mots clés/.test(r4.texte) === false && /#lampe #laiton #vintage #bureau/.test(r4.texte),
    "étiquette seule + 2 éléments, avec 4 hashtags = 6 → le bloc étiqueté part, les hashtags restent (comme le 15/10)", r4.texte);
}

if (ko) { console.error(`\n[selftest:lbc-cinq-mots-cles] ${ko} échec(s)`); process.exit(1); }
console.log("\n[selftest:lbc-cinq-mots-cles] OK — 5 mots-clés au plus servis à Leboncoin, répétitions et listes à la ligne comprises.");
