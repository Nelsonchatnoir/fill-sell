// Auto-test du nettoyage « aucune mention d'un autre site » pour Leboncoin
// (2026-09-09) — supabase/functions/_shared/description-leboncoin.ts, exécuté
// TEL QUEL par Node (types retirés à la volée, Node ≥ 23).
//
// Chaque cas vient d'une description RÉELLE de la base ou de la mesure faite
// sur le compte de Nico le 09/09 (POST adsubmit/v2/classifieds → 403 sur
// « #VintedStyle », accepté sur « Robe Shein »). Le test verrouille :
//   · ce qui part (hashtag entier, phrase entière, adresse web seule) ;
//   · ce qui RESTE intact (les défauts, « Envoi rapide 📦 », les marques
//     comme Shein, « leboncoin ») ;
//   · le fail-safe (tout effacé → original rendu, vide=true) ;
//   · l'idempotence (nettoyer deux fois = une fois).
//
//   node scripts/description-leboncoin-selftest.mjs
//
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/description-leboncoin.ts")).href);
const { nettoyerDescriptionLeboncoin: n, TERMES_SITES_LEBONCOIN } = mod;

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.error(`  ✗ ${nom}${extra ? ` — ${extra}` : ""}`); }
};
const egal = (nom, a, b) => check(nom, a === b, `\n      obtenu : ${JSON.stringify(a)}\n      attendu: ${JSON.stringify(b)}`);

console.log("▸ liste fermée");
check("« shein » n'est PAS dans la liste (accepté par Leboncoin, 148 articles en base)", !TERMES_SITES_LEBONCOIN.includes("shein"));
check("« leboncoin » n'est PAS dans la liste", !TERMES_SITES_LEBONCOIN.some((t) => /leboncoin/.test(t)));
check("« vinted » y est (prouvé : 403)", TERMES_SITES_LEBONCOIN.includes("vinted"));

console.log("▸ la description de Nico (job 8fea6e80) : seul #VintedStyle part, les défauts restent");
const nico = "Je vends un sweat Tommy Jeans bleu marine, taille M.\n\nCoupe classique, col rond, matière épaisse et confortable.\nPetit logo Tommy Jeans brodé sur la poitrine 🔴⚪🔵\nCouleur bleu marine profonde, facile à assortir.\n\nIdéal pour un look casual / streetwear, se porte aussi bien avec jean que jogging.\n\n✔ Marque : Tommy Jeans\n✔ Taille : M\n✔ Couleur : Bleu marine\n✔ État : Très bon \n⚠️ Attention léger petit accroc devant voir photos \n\nenvoi rapide 📦\n\n\n#TommyJeans\n#TommyHilfiger\n#SweatHomme\n#TailleM\n#Streetwear\n#CasualStyle\n#LookUrbain\n#VetementHomme\n#BleuMarine\n#ModeHomme\n#BasicPremium\n#VintedStyle";
{
  const r = n(nico);
  check("modifiée", r.modifiee);
  egal("termes", JSON.stringify(r.termes), JSON.stringify(["vinted"]));
  egal("1 retrait", r.retires, 1);
  check("#VintedStyle absent", !/vinted/i.test(r.texte));
  check("le défaut est intact", r.texte.includes("⚠️ Attention léger petit accroc devant voir photos"));
  check("les autres hashtags sont intacts", r.texte.includes("#BasicPremium") && r.texte.includes("#TommyJeans"));
  check("le drapeau 🔴⚪🔵 est intact", r.texte.includes("🔴⚪🔵"));
  egal("idempotent", n(r.texte).texte, r.texte);
}

console.log("▸ hashtags");
egal("hashtag seul en fin de ligne", n("Sweat en très bon état. #VintedStyle").texte, "Sweat en très bon état.");
egal("ligne de hashtags : seul le mauvais part", n("#zara #vintedfrance #occasion #videdressing #mango").texte, "#zara #occasion #mango");
egal("#vinted en milieu de ligne de hashtags", n("#neuf #etiquette #vinted #mode").texte, "#neuf #etiquette #mode");

console.log("▸ phrases (pictogrammes = puces)");
egal("puce ❌ : la ligne entière part, la suivante reste", n("❌ Pas d'envoi via Vinted Go\nEnvoi rapide 📦").texte, "Envoi rapide 📦");
egal("📦 avant la phrase reste avec Mondial Relay", n("Envoi rapide, je privilégie Mondial Relay 📦 pas d'envoi via Vinted Go.").texte, "Envoi rapide, je privilégie Mondial Relay 📦");
egal("phrase au milieu d'une ligne à points", n("Envoi soigné. Paiement sécurisé via Vinted. Offres bienvenues !").texte, "Envoi soigné. Offres bienvenues !");
egal("« Prix dégressifs » reste, seule la dernière phrase part", n("Prix dégressifs activés 🎁 Plus tu prends d'articles, plus le prix baisse 😉 Envoi rapide, je privilégie Mondial Relay 📦\n\nTrès bon état ✨\n\n❌ Je n'envoie pas via Vinted Go.").texte, "Prix dégressifs activés 🎁 Plus tu prends d'articles, plus le prix baisse 😉 Envoi rapide, je privilégie Mondial Relay 📦\n\nTrès bon état ✨");
egal("« 📲 Mon profil Vinted : X » : la ligne part", n("Top en soie.\n📲 Mon profil Vinted : Ornella-vend\nEnvoi rapide.").texte, "Top en soie.\nEnvoi rapide.");
egal("⚠️ … ✨ : les deux pictogrammes partent avec la phrase", n("Jolie robe.\n⚠️ Évite Vinted GO si possible, pour une livraison plus fiable ✨\nTaille 38.").texte, "Jolie robe.\nTaille 38.");
egal("sous-chaîne : « VintedStyle » sans hashtag part avec sa phrase", n("Look VintedStyle assuré. Taille M.").texte, "Taille M.");

console.log("▸ adresses web");
egal("domaine seul retiré, la phrase reste", n("Voir monsite.fr pour plus de photos.").texte, "Voir pour plus de photos.");
egal("http retiré", n("Photos ici https://monsite.example/album et là.").texte, "Photos ici et là.");
egal("www retiré", n("Voir www.monsite pour plus de photos.").texte, "Voir pour plus de photos.");
check("leboncoin.fr n'est pas une adresse à retirer", !n("Vu sur leboncoin.fr et sur leboncoin").modifiee);

console.log("▸ ce qui ne bouge pas");
check("Shein (marque) intact", !n("Robe Shein en très bon état, taille M, envoi rapide.").modifiee);
check("« vide dressing » en deux mots intact", !n("Vide dressing personnel, articles bien entretenus.").modifiee);
check("Mondial Relay intact (transporteur, pas un site)", !n("Envoi via Mondial Relay ou point relais.").modifiee);
check("« mon dressing » intact (rien à voir avec un site)", !n("Voir mon dressing pour d'autres articles.").modifiee);
check("texte sans mention : identique, modifiee=false", !n(nico.replace("\n#VintedStyle", "")).modifiee);

console.log("▸ fail-safe");
{
  const r = n("Marque Vintedo, taille M.");
  check("tout effacé → original rendu", r.texte === "Marque Vintedo, taille M." && r.vide === true && r.modifiee === false);
  check("null/undefined → chaîne vide, sans exception", n(null).texte === "" && n(undefined).modifiee === false);
}

if (echecs) { console.error(`\n[selftest:description-leboncoin] ÉCHEC — ${echecs} cas.`); process.exit(1); }
console.log("\n[selftest:description-leboncoin] OK — ce qui part, ce qui reste et le fail-safe sont verrouillés.");
