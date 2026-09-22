// Autotest « UN COMPTE VIDE N'EST PAS UN ÉCHEC » — `npm run selftest:releve-compte-vide`
//
// m0nc3f, inscrit le 22/09 à 22:59 : son relevé eBay de 23:49 est parti en
// ROUGE (« le Hub vendeur n'a pas rendu son compteur », 0 annonce vue) alors
// qu'il n'a simplement aucune annonce eBay. Ses relevés Vinted et Leboncoin,
// eux, sont passés.
//
// Ce test relit À LA SOURCE, dans background.js :
//   · les motifs de « page vide » (ce que la plateforme ÉCRIT elle-même) ;
//   · la ligne qui décide du statut du run.
// Il fige les deux choses qui comptent : un compte vide finit en `done` et
// SANS le préfixe « [incomplet] » (que rapprocher_releve lit pour s'interdire
// de dater des disparitions) ; et rien d'autre ne change de couleur.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").split("\r\n").join("\n");
let ko = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { ko++; console.error(`  ✗ ${nom} ${extra}`); }
};

// ── 1. Les phrases de « liste vide », relevées sur les vraies pages ────────
const blocRegex = src.slice(src.indexOf("const PAGE_DIT_VIDE = {"));
const PAGE_DIT_VIDE = new Function(`${blocRegex.slice(0, blocRegex.indexOf("};") + 2)}; return PAGE_DIT_VIDE;`)();

console.log("\n1. Ce que la plateforme ÉCRIT quand elle n'a rien");
// Relevé LIVE le 23/09 sur le Hub vendeur eBay, liste filtrée à vide.
check("eBay — « Vous n'avez aucune annonce en cours. » reconnue",
  PAGE_DIT_VIDE.ebay.test("Tous les filtres\nVous n'avez aucune annonce en cours.\nCréer une annonce"));
check("eBay — variante anglaise reconnue",
  PAGE_DIT_VIDE.ebay.test("You don't have any active listings"));
// Et surtout : ABSENTE dès qu'une annonce s'affiche (vérifié sur le même
// compte, page non filtrée, 6 annonces).
check("eBay — PAS reconnue sur une liste qui a des annonces",
  !PAGE_DIT_VIDE.ebay.test("Gérer les annonces en cours(6)\nSweat à capuche\nModifier\nVendre un article similaire"));
// Le TITRE du compteur ne dit rien de la liste : « Gérer les annonces en
// cours(0) » n'est pas la phrase de liste vide, et ne doit pas être confondu
// avec elle — c'est le compteur qui la porte, et il a sa propre branche.
check("eBay — le titre du compteur seul n'est PAS la phrase de liste vide",
  PAGE_DIT_VIDE.ebay.test("Gérer les annonces en cours(0)") === false);
check("Leboncoin — « Vous n'avez pas encore d'annonce » reconnue",
  PAGE_DIT_VIDE.leboncoin.test("Vous n'avez pas encore d'annonce en ligne"));
check("Leboncoin — PAS reconnue sur une liste pleine",
  !PAGE_DIT_VIDE.leboncoin.test("En ligne (24)\nTable basse\nModifier"));

// ── 2. La décision de statut, relue dans le code ──────────────────────────
console.log("\n2. La ligne qui décide du statut du run");
const ligneStatut = src.split("\n").find((l) => l.includes("status: rienARelever ?"));
check("elle existe", !!ligneStatut);
check("elle laisse passer `vide` avant de conclure à l'échec",
  !!ligneStatut && /annonces\.length === 0 && !vide && \(erreur \|\| !complet\)/.test(ligneStatut),
  `— lue : ${ligneStatut?.trim()}`);

const ligneErreur = src.split("\n").find((l) => l.includes("erreur: [vide ?"));
check("la note d'un compte vide n'est PAS préfixée « [incomplet] »",
  !!ligneErreur && ligneErreur.includes("`[vide] ${vide}`"));

// Rejeu de la décision elle-même, avec la vraie expression.
const statut = new Function("rienARelever", "annonces", "vide", "erreur", "complet",
  `return ${ligneStatut.trim().replace(/^status:\s*/, "").replace(/,\s*$/, "")};`);
console.log("\n3. Rejeu de la décision");
check("compte vide (0 annonce, note « vide ») → done",
  statut(false, { length: 0 }, "aucune annonce en ligne", null, false) === "done");
check("0 annonce SANS note « vide » et couverture inconnue → failed (inchangé)",
  statut(false, { length: 0 }, null, "compteur absent", false) === "failed");
check("0 annonce, plateforme absente → absente (inchangé)",
  statut(true, { length: 0 }, null, "session", false) === "absente");
check("des annonces vues et une couverture partielle → done (inchangé)",
  statut(false, { length: 12 }, null, "couverture partielle", false) === "done");

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
