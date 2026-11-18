// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LEBONCOIN : LA LISTE D'AUTRES ARTICLES DU VENDEUR NE PART PAS (18/11/2026, point 6 du lot du 18/11)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (compte 020816ba, relu en prod le 18/11, lecture seule) : 18 dépôts Leboncoin sur 18 refusés par la modération
// le 16/11 (00:09 → 00:48) portaient « 🍀 - De temps en temps sur mon profil les mangas suivants : » puis 24 titres
// d'AUTRES séries (ou « les jeux suivants : » + 20 jeux Switch) ; les 6 dépôts du même compte SANS ce bloc (même session,
// même rayon, même gabarit, dont 4 entre deux refus) sont en ligne. Le texte servi d'avant le correctif le laissait tel
// quel. Mesure (60 jours, tous comptes) : 20 dépôts portent le bloc → 18 refusés, 2 jamais vus en ligne, 0 accepté ; la
// règle ne change aucun des 323 dépôts acceptés qui parlent d'autres articles (15 comptes).
// La règle (_shared/description-leboncoin.ts, blocsAutresArticles — tous comptes, texte SERVI seulement, jamais la
// fiche) : une ligne qui annonce les autres articles du vendeur, un deux-points, une liste de plus de cinq éléments → la
// ligne et sa liste partent. Tout le reste ressort IDENTIQUE.
//   node scripts/lbc-autres-articles-selftest.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGLES = join(ROOT, "supabase/functions/_shared/description-leboncoin.ts");
const { nettoyerDescriptionLeboncoin: servi } = await import(pathToFileURL(REGLES).href);

let ko = 0;
const v = (ok, nom, detail = "") => { if (ok) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${detail ? `\n      ${detail}` : ""}`); } };
const S = (t, titre = "") => servi(t, { titre, marque: "Sans marque", etat: "Très bon état" });

// Gabarit du compte 020816ba (sans son pseudo ni son réseau social : donnees-clients).
const TETE = "📚 - manga shonen kaguya sama 9 tomes \n🌟 - État très bon \n🚭 - non fumeur.   💸 - prix librairie: 65 euros\n\n🗳️ - Défauts :  \nPas/peu de défauts, voir photos\n\n📍- tout est parfaitement lisible !\nIdéal cadeau ! ;)\n\n🌸 - envoie protégé, soigné et pas cher\n\n🌼 Vous pouvez me solliciter pour plus d’infos ou de photos";
const BLOC_MANGAS = "🍀 - De temps en temps sur mon profil les mangas suivants :\n\nNaruto, mha vigilante, One piece, Dragon ball z et super, Full Metal Alchemist, Arslan, Berserk, demon slayer, Attaque des titans aot snk, bleach, tokyo ghoul + re, jujutsu kaisen, my hero academia, dr stone, fireforce, kingdom, mob psycho 100, gto, one punch man , black clover, fairy tail, hunter x hunter, mashle, chainsaw man et plus encore !";
const PIED = "Nouveaux mangas toutes les semaines, autres annonces pour lots!\nbonne journée à vous! :)";
const AVEC = `${TETE}\n\n${BLOC_MANGAS}\n\n${PIED}`;
const SANS = `${TETE}\n\n${PIED}`;
// Un texte que le nettoyage TOUCHE ressort ligne par ligne sans blancs en bout ni blancs doublés (règle du 09/09, inchangée).
const fini = (t) => t.split("\n").map((l) => l.replace(/[ \t]{2,}/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

console.log("▸ 1. la liste de mangas (intro, ligne vide, 24 titres) part ; le reste est servi tel quel");
{
  const r = S(AVEC, "Kaguya-Sama Love is War 1 à 10 sans 9");
  v(r.texte === fini(SANS), "texte servi = le même texte sans le bloc (comme les 6 dépôts acceptés)", JSON.stringify(r.texte.slice(-200)));
  v(!/suivants\s*:/i.test(r.texte) && !/Naruto/.test(r.texte), "ni l'annonce « … les mangas suivants : » ni la liste ne partent");
  v(r.modifiee === true && r.autres_articles === 24, "trace : 24 éléments retirés (autres_articles)", `autres_articles=${r.autres_articles}`);
  v(S(r.texte).texte === r.texte, "idempotent (nettoyer deux fois = une fois)");
}

console.log("▸ 2. la liste sur la MÊME ligne (« les jeux suivants : Zelda: …, Mario Kart 8, … ») part");
{
  const jeux = "The Legend of Zelda: Breath of the Wild, Super Mario Odyssey, Mario Kart 8 Deluxe, Animal Crossing: New Horizons, Super Smash Bros. Ultimate, Pokémon Épée / Bouclier, Splatoon 3, Metroid Dread";
  const t = `🎮 - jeu Switch cartouche avec boîte et notice \n🌟 - État très bon \n\n🍀 - De temps en temps sur mon profil les jeux suivants : ${jeux}\nBonne journée à vous! :)`;
  const r = S(t, "Jeu Switch - Family Trainer");
  v(r.texte === "🎮 - jeu Switch cartouche avec boîte et notice\n🌟 - État très bon\n\nBonne journée à vous! :)", "la ligne des jeux part, le reste reste", JSON.stringify(r.texte));
  v(/cartouche avec boîte et notice/.test(r.texte) && /Bonne journée/.test(r.texte), "la description de l'article reste");
}

console.log("▸ 2b. « mes autres ventes : » + une liste de RAYONS (plus de cinq) part aussi (gabarit d'un compte, 605 fiches, jamais déposé sur Leboncoin)");
{
  const t = "Chemise noire taille 42, très bon état.\n\nAllez voir mes autres ventes : nombreux articles livres, CD, jeux, jouets, déco, maison, cuisine, bijoux femme, fillette + vêtements enfant, femme, homme + chaussures et sacs etc...";
  const r = S(t, "Chemise noire Taille 42");
  v(r.texte === "Chemise noire taille 42, très bon état.", "la ligne « mes autres ventes : … » part, l'article reste", JSON.stringify(r.texte));
}

console.log("▸ 3. ce qui ne bouge JAMAIS (texte identique, aucun octet touché)");
{
  const intacts = [
    ["le texte sans bloc (les 6 dépôts acceptés du compte)", SANS],
    ["« je vends aussi » sans deux-points", "Jean bleu taille 38. Je vends aussi des livres, des DVD, des jeux, des jouets, des CD et de la déco sur mon profil."],
    ["une PHRASE après les deux-points, puis des mots-clés de l'article", "🎮 Plusieurs jeux et objets à petits prix dans mon dressing : lots possibles et offres raisonnables bienvenues\nwarhammer 40k, warhammer 40000, games workshop, cartes warhammer, tau empire, cartes orks, orks warhammer"],
    ["l'article lui-même (« le lot contient les tomes suivants : »)", "Lot de manga Naruto.\nLe lot contient les tomes suivants : 1, 2, 4, 5, 6, 7, 8, 9, 10, 30, 31, 43"],
    ["cinq autres articles au plus", "Robe fleurie taille M.\nSur mon profil aussi : robe, jupe, pantalon, pull, gilet"],
    ["« de temps en temps » sans liste", "Porté de temps en temps : très bon état."],
  ];
  for (const [nom, t] of intacts) { const r = S(t); v(r.texte === t && !r.autres_articles, nom, JSON.stringify(r.texte)); }
  // Des liens vers d'autres annonces : la règle des adresses (09/09) les retire déjà ; leurs « / » ne font pas une liste
  // de mots-clés, la phrase qui les annonce reste (compte c22c5429).
  const liens = S("Livre de poche.\nJe vends également d'autres livres sur ces annonces :\nhttps://www.leboncoin.fr/livres/1000000001.htm\nhttps://www.leboncoin.fr/livres/1000000002.htm");
  v(/Je vends également d'autres livres/.test(liens.texte) && !liens.autres_articles, "des liens vers d'autres annonces ne sont pas une liste d'autres articles", JSON.stringify(liens.texte));
}

console.log("▸ 4. la version des règles du texte servi suit le fichier (une relance refusée repart avec le texte corrigé)");
{
  const R = await import(pathToFileURL(join(ROOT, "src/utils/relanceRefusLbc.js")).href);
  const md5 = createHash("md5").update(readFileSync(REGLES, "utf8").replace(/\r\n/g, "\n")).digest("hex");
  v(R.REGLES_TEXTE_LBC !== "lbc-texte-1311", `REGLES_TEXTE_LBC changée (${R.REGLES_TEXTE_LBC}) : les refus d'avant sont rejugés sur le texte corrigé`);
  v(R.SOURCES_REGLES_TEXTE_LBC?.[R.REGLES_TEXTE_LBC] === md5, `md5 du fichier des règles noté (${md5})`, JSON.stringify(R.SOURCES_REGLES_TEXTE_LBC ?? null));
}

console.log(ko ? `\n[selftest:lbc-autres-articles] ✗ ${ko} échec(s)` : "\n[selftest:lbc-autres-articles] OK — la liste d'autres articles du vendeur ne part pas à Leboncoin ; le reste du texte est servi tel quel.");
process.exit(ko ? 1 : 0);
