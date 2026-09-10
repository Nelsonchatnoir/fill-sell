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
const { nettoyerDescriptionLeboncoin: n, nettoyerSeulement: propre, TERMES_SITES_LEBONCOIN } = mod;

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
  check("les autres hashtags : plafonnés à 5 (règle du 10/09), #VintedStyle parti", (r.texte.match(/#[^\s#]+/g) ?? []).length === 5 && !/VintedStyle/.test(r.texte), r.texte);
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
// Jugé sur le NETTOYAGE SEUL : ce qu'il reste (« Taille M. ») fait 9
// caractères, donc le minimum de 10 le viderait. Ce sont deux règles
// distinctes — ici on juge la PROPRETÉ du texte, pas sa longueur (le minimum
// a sa propre section plus bas).
egal("sous-chaîne : « VintedStyle » sans hashtag part avec sa phrase", propre("Look VintedStyle assuré. Taille M.").texte, "Taille M.");

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
check("texte sans mention et ≤ 5 hashtags : identique, modifiee=false", !n("Jolie robe, taille 38.\n#robe #ete #zara #mango #occasion").modifiee);

console.log("▸ fail-safe");
{
  const r = n("Marque Vintedo, taille M.");
  check("tout effacé → original rendu", r.texte === "Marque Vintedo, taille M." && r.vide === true && r.modifiee === false);
  check("null/undefined → chaîne vide, sans exception", n(null).texte === "" && n(undefined).modifiee === false);
}

console.log("▸ marque tierce + plafond de 5 (page de correction Leboncoin, 10/09)");
{
  const tommy = "Sweat Tommy Jeans bleu marine, très bon état.\n#TommyJeans #TommyHilfiger #SweatHomme #TailleM #Streetwear #CasualStyle #LookUrbain #VetementHomme #BleuMarine #ModeHomme #BasicPremium #VintedStyle";
  const ctx = { titre: "Sweat Tommy Jeans bleu marine – Taille M", marque: "Tommy Jeans" };
  const r = n(tommy, ctx);
  const tags = r.texte.match(/#[^\s#]+/g) ?? [];
  check("12 hashtags → 5 au plus", tags.length <= 5, tags.join(" "));
  check("#TommyHilfiger (marque tierce) parti, #TommyJeans (marque de l'article) resté", !tags.includes("#TommyHilfiger") && tags.includes("#TommyJeans"), tags.join(" "));
  check("#VintedStyle parti (règle des sites, indépendante du compte)", !tags.includes("#VintedStyle"));
  check("les spécifiques du titre gardés avant les génériques", tags.includes("#SweatHomme") && tags.includes("#TailleM") && tags.includes("#BleuMarine") && !tags.includes("#ModeHomme") && !tags.includes("#BasicPremium"), tags.join(" "));
  check("le texte vendeur est intact", r.texte.startsWith("Sweat Tommy Jeans bleu marine, très bon état."));
  check("trace : marques + plafonnés", r.marques.includes("tommyhilfiger") && r.plafonnes >= 1);
  check("conforme (≤ 5, aucune tierce) → IDENTIQUE", !n("Jolie robe.\n#Zara #RobeEte #TailleM", { titre: "Robe Zara", marque: "Zara" }).modifiee);
  check("#ZaraKids sur un article Zara reste (dérivé de la marque)", !n("Tee-shirt.\n#ZaraKids", { titre: "Tee-shirt Zara Kids", marque: "Zara" }).modifiee);
  check("#Zara sur un article Mango part", n("Robe.\n#Mango #Zara", { titre: "Robe Mango", marque: "Mango" }).texte === "Robe.\n#Mango");
  check("« façon Zara » en texte libre reste", !n("Robe façon Zara, taille M.", { titre: "Robe", marque: "H&M" }).modifiee);
  check("sans contexte : plafond seul, aucune marque devinée", (n("#a #b #c #d #e #f #g").texte.match(/#/g) ?? []).length === 5);
}

// ⚠️ LE VERDICT EST TOUT EN BAS DU FICHIER, jamais ici. Il y était, et les
// sections ajoutées ensuite (le minimum de 10 caractères, 2026-09-10) ne
// pouvaient donc PAS faire échouer le script : elles s'exécutaient après le
// process.exit(1) conditionnel, leurs échecs n'étaient plus lus. Un test qui
// ne peut pas échouer ne protège rien. Toute section future s'ajoute AVANT le
// verdict final.

// ═══════════════════════════════════════════════════════════════════════════
// LE MINIMUM DE 10 CARACTÈRES (2026-09-10, Pantalon de Choupette)
// ═══════════════════════════════════════════════════════════════════════════
// MESURE, 45 j, tout le parc — la coupure ne souffre aucune exception :
//    0 caractère ....  8 jobs, 8 PUBLIÉS   (champ vide = facultatif, accepté)
//    9 caractères ... 11 jobs, 0 publié    (« Peu porté » ×10, « Taille 44 » ×1)
//   10 et plus ...... 15 jobs, 15 PUBLIÉS
// Leboncoin refuse CÔTÉ NAVIGATEUR : aucune requête, aucun message dans nos
// sélecteurs, l'aperçu reste affiché. C'est le « clic avalé » qui a coûté une
// journée — le Pantalon a échoué 3 fois pendant que le Jean (534 caractères)
// passait ENTRE deux de ses tentatives, même compte, même session, même build.
console.log("▸ minimum de 10 caractères — les deux cas RÉELS");
{
  // Choupette, job 658fbe73 : « Taille 44 » (9), état « Très bon état ».
  const r = n("Taille 44", { titre: "Camaïeu Pantalon rose pâle 7/8ème zips chevilles taille 44",
                             marque: "Camaïeu", etat: "Très bon état", taille: "XL" });
  check("« Taille 44 » (9) passe la barre des 10", r.texte.length >= 10, `→ ${r.texte.length} : « ${r.texte} »`);
  check("le texte de la vendeuse est CONSERVÉ en tête", r.texte.startsWith("Taille 44"), `→ « ${r.texte} »`);
  check("ce qui est ajouté est VRAI (un champ du job)", r.texte.includes("Très bon état"), `→ « ${r.texte} »`);
  check("la trace dit ce qui a été ajouté", Array.isArray(r.complete) && r.complete.length > 0, JSON.stringify(r.complete));
  check("le champ n'est pas vidé", r.videe_trop_courte !== true);

  // Joséphine, 10 jobs : « Peu porté » (9).
  const j = n("Peu porté", { titre: "Pull La Halle fille rose 10 ans", marque: "La Halle",
                             etat: "Très bon état", taille: "10 ans" });
  check("« Peu porté » (9) passe la barre des 10", j.texte.length >= 10, `→ ${j.texte.length} : « ${j.texte} »`);
  check("« Peu porté » conservé", j.texte.startsWith("Peu porté"), `→ « ${j.texte} »`);
}

console.log("▸ ce qu'on ne touche PAS");
{
  check("0 caractère : servi tel quel (prouvé 8/8 publiés)", n("").texte === "" && n("").videe_trop_courte !== true);
  check("exactement 10 : intact", n("Très léger").texte === "Très léger");
  check("11 : intact", n("Assez léger").texte === "Assez léger");
  check("une longue description : intacte",
    n("Je vends ce jean brut neuf, jamais porté car la coupe ne me convient pas.").texte
      === "Je vends ce jean brut neuf, jamais porté car la coupe ne me convient pas.");
}

console.log("▸ on n'invente RIEN — sans faits connus, champ VIDE");
{
  const r = n("Peu porté", {});
  check("aucun fait sur le job → champ servi VIDE", r.texte === "" && r.videe_trop_courte === true, `→ « ${r.texte} »`);
  const c = n("Peu porté", { etat: "", marque: "   ", taille: "" });
  check("faits vides ou blancs → champ servi VIDE", c.texte === "" && c.videe_trop_courte === true);
  const t = n("Court", { titre: "Un titre qui ne doit RIEN apporter à la description" });
  check("le TITRE n'est jamais recopié dans la description", t.texte === "" && t.videe_trop_courte === true, `→ « ${t.texte} »`);
}

console.log("▸ jamais de répétition d'un fait déjà écrit");
{
  const r = n("Très bon", { etat: "Très bon état", marque: "Kiabi" });
  check("un état déjà présent n'est pas répété tel quel",
    (r.texte.match(/Très bon état/g) ?? []).length <= 1, `→ « ${r.texte} »`);
  const m = n("Kiabi !", { marque: "Kiabi", etat: "Bon état" });
  check("la marque déjà écrite n'est pas répétée", (m.texte.match(/Kiabi/gi) ?? []).length === 1, `→ « ${m.texte} »`);
}

console.log("▸ le minimum s'applique APRÈS le nettoyage, pas avant");
{
  // 30 caractères AVANT nettoyage, mais tout part avec les hashtags de sites :
  // c'est le texte SERVI qui doit passer la barre.
  const r = n("Top #Vinted #VintedStyle", { etat: "Bon état", marque: "Zara" });
  check("une description vidée par le nettoyage est reprise par le minimum",
    r.texte === "" || r.texte.length >= 10, `→ ${r.texte.length} : « ${r.texte} »`);
}

// ── VERDICT (toujours en dernier, cf. la note plus haut) ────────────────────
if (echecs) { console.error(`\n[selftest:description-leboncoin] ÉCHEC — ${echecs} cas.`); process.exit(1); }
console.log("\n[selftest:description-leboncoin] OK — nettoyage, plafond, marques tierces ET minimum de 10 caractères verrouillés.");
