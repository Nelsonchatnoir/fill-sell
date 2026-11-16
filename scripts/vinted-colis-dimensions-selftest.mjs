// ═══════════════════════════════════════════════════════════════════════════
// VINTED EXIGE LES DIMENSIONS DU COLIS : LE MESSAGE VRAI, JAMAIS UNE BOUCLE — SELFTEST « VERROU »
// (16/11/2026, lot du matin, point 3 — carhoa, job 7dd1a5de ; ayadi007, job 43b69049)
// ═══════════════════════════════════════════════════════════════════════════
// « Après-ski Decathlon noir taille 38 », rangé en « Skis alpins » (4733) : Vinted y refuse tout format standard et
// exige hauteur, largeur et longueur (400 parcel_dimensions_*). L'extension le disait (« FillSell ne sait pas encore
// les renseigner ») ; le serveur le reclassait « la page n'a pas affiché les formats… C'est un aléa de Vinted, rien à
// faire de ton côté » et le reprenait toutes les 30 min, sans fin (12 reprises, puis l'annulation par la personne).
// Rouge sur le code d'avant, vert après :
//   1. le refus réel → la personne (needs_user, « relancer »), jamais une reprise, message vrai qui nomme les
//      dimensions et le rayon, sans « aléa » ni « rien à faire » ni « nouvel essai » ;
//   2. même avec 11 reprises déjà faites, en publication comme en republication ;
//   3. le texte d'ayadi007 (0.6.176) suit la même règle ;
//   4. non-régression : un refus de FORMAT seul garde sa règle (colis_non_affiche, colis_non_propose,
//      colis_refuse_meme_envoye).
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};

// Refus RÉEL de carhoa (7dd1a5de, 0.6.186), tel que l'extension l'envoie.
const BRUT_CARHOA = "Vinted exige les dimensions du colis (hauteur, largeur, longueur) pour ce rayon, et FillSell ne sait pas encore les renseigner : rien n'a été publié. Choisis un autre rayon Vinted pour cet article, ou publie-le toi-même sur Vinted. [sonde réseau : /api/v2/item_upload/items → HTTP 400 · prix ENVOYÉ = \"7\" · réponse : {\"code\":99,\"message\":\"Erreurs trouvées\",\"message_code\":\"validation_error\",\"errors\":[{\"field\":\"package_size\",\"value\":\"Ces dimensions sont supérieures aux limites maximales autorisées\"},{\"field\":\"parcel_dimensions_height\",\"value\":\"Ajoute une hauteur\"},]";
// Refus d'ayadi007 (43b69049, 0.6.176) : le code des champs seulement.
const BRUT_AYADI = "Champ exigé par Vinted : package_size (Ces dimensions sont supérieures aux limites maximales autorisées), parcel_dimensions_width (Ajoute une largeur), parcel_dimensions_length (Ajoute une longueur) [HTTP 400]";
const BUILD = "2026-11-10T14:10:14Z+ba13a51 · v0.6.186";
const PF = { categoryPath: ["Sport", "Sports d'hiver", "Matériel de ski", "Skis alpins"], vinted_ids: { catalog_id: 4733 } };
const classe = (action, brut, reprises = 0, pf = PF) => classerEchec({ platform: "vinted", action, brut, reecrit: brut, essais: 0, pf, build: BUILD, reprises });

console.log("\n1. Le refus réel de carhoa : la personne, avec le message vrai");
{
  const s = classe("publish", BRUT_CARHOA);
  ok(s.statut === "needs_user" && s.motif === "vinted_dimensions_colis", "needs_user, motif vinted_dimensions_colis", JSON.stringify({ statut: s.statut, motif: s.motif }));
  ok(!s.dansMinutes && s.verdict !== "reprise", "jamais de reprise automatique (le même mur)");
  ok(/dimensions du colis/.test(s.message) && /hauteur, largeur et longueur/.test(s.message), "le message nomme les dimensions", s.message);
  ok(/« Skis alpins »/.test(s.message), "et le rayon", s.message);
  ok(!/aléa|rien à faire de ton côté|nouvel essai/i.test(s.message), "jamais « aléa », « rien à faire », « nouvel essai »", s.message);
  ok(/Rien n'a été publié/.test(s.message), "dit que rien n'a été publié");
}

console.log("\n2. Jamais de boucle, même après 11 reprises ; en republication aussi");
{
  const s11 = classe("publish", BRUT_CARHOA, 11);
  ok(s11.statut === "needs_user" && !s11.dansMinutes, "11 reprises déjà faites : toujours la personne, aucune reprise");
  const r = classe("republish", BRUT_CARHOA, 0, { ...PF, republish_step: "deleted" });
  ok(r.statut === "needs_user" && !r.dansMinutes, "republication : pas de boucle", JSON.stringify({ statut: r.statut, d: r.dansMinutes }));
  ok(/déjà retirée, n'est pas encore revenue en ligne/.test(r.message) && !/aléa|dès que possible/i.test(r.message), "republication retirée : le message le dit (jamais « remise en ligne dès que possible »)", r.message);
  const r2 = classe("republish", BRUT_CARHOA, 0, { ...PF, republish_step: "captured" });
  ok(/intacte/.test(r2.message), "republication pas encore retirée : « ton annonce est intacte »", r2.message);
}

console.log("\n3. Le texte d'ayadi007 (ancien poste) suit la même règle");
{
  const s = classe("publish", BRUT_AYADI, 0, { categoryPath: ["Maison", "Outils", "Chariots à outils"] });
  ok(s.motif === "vinted_dimensions_colis" && s.statut === "needs_user", "needs_user, motif vinted_dimensions_colis", JSON.stringify({ statut: s.statut, motif: s.motif }));
  ok(/« Chariots à outils »/.test(s.message), "le rayon nommé");
}

console.log("\n4. Non-régression : un refus de FORMAT seul garde sa règle");
{
  const formatSeul = "Champ exigé par Vinted : package_size (Choisis un format de colis) [HTTP 400]";
  const s = classe("publish", formatSeul);
  ok(s.motif === "colis_non_affiche" && s.statut === "pending", "poste récent, format absent : colis_non_affiche (règle du 06/10)", JSON.stringify({ motif: s.motif, statut: s.statut }));
  const ancien = classerEchec({ platform: "vinted", action: "publish", brut: formatSeul, reecrit: formatSeul, essais: 0, pf: {}, build: "2026-09-20T10:00:00Z+abc · v0.6.70", reprises: 0 });
  ok(ancien.motif === "colis_non_propose", "ancien poste : colis_non_propose (attend la mise à jour)", ancien.motif);
  const envoye = "Champ exigé par Vinted : package_size [HTTP 400] — package_size_id POSÉ dans le corps par la sonde (1)";
  ok(classe("publish", envoye).motif === "colis_refuse_meme_envoye", "format envoyé et refusé : colis_refuse_meme_envoye");
  const lbc = classerEchec({ platform: "leboncoin", action: "publish", brut: BRUT_CARHOA, reecrit: BRUT_CARHOA, essais: 0, pf: {}, build: BUILD, reprises: 0 });
  ok(lbc.motif !== "vinted_dimensions_colis", "hors Vinted : jamais cette règle");
}

console.log("\n5. La cause amont : un « après-ski » est une botte, jamais du matériel de ski");
{
  const { detectObjectKeywordDetail } = await import("../src/utils/shared.js");
  const ic = (t) => detectObjectKeywordDetail(t, "")?.icon ?? null;
  ok(ic("Après-ski Decathlon noir taille 38") === "👢", "« Après-ski Decathlon noir taille 38 » → 👢 (était 🎿 « Skis alpins »)", String(ic("Après-ski Decathlon noir taille 38")));
  ok(ic("Après ski enfant 32 mixte peppers") === "👢" && ic("apres ski enfants") === "👢", "« Après ski enfant… », « apres ski » → 👢");
  ok(ic("Manteau Veste Sherpa Vintage Après-Ski Oversize – Motif Flocons & Velours") === "🧥", "un manteau « style après-ski » reste un vêtement");
  ok(ic("Skis Rossignol 160 cm") === "🎿" && ic("Snowboard Burton") === "🎿", "des skis restent des skis (inchangé)");
  ok(ic("Combinaison de ski enfant 8 ans") === "🧥", "une combinaison de ski reste un vêtement (inchangé)");
}

console.log("\n6. La question « Format du colis » sans réponse possible (ayadi007, 9c7d4951) reçoit le message vrai (handler-watch)");
{
  const fs = await import("node:fs");
  const qt = fs.readFileSync(new URL("../supabase/functions/_shared/questions-tranchees.ts", import.meta.url), "utf8");
  ok(/\.like\("field_key", "parcel_dimensions_%"\)/.test(qt), "les rayons où Vinted a exigé les dimensions sont relus (platform_category_aspects)");
  ok(/messageDimensionsColisVinted\(j\.action, pf, "Rien n'a été publié\."\)/.test(qt), "la question est remplacée par le message vrai");
  ok(/pf\.vinted_dimensions_colis\) continue;/.test(qt) && /colisPubTous\.filter\(\(j\) => !colisDimensionsDites\.has/.test(qt),
    "une fois par tâche (jamais une boucle), et la question n'est plus tranchée par le format dominant");
  ok(qt.indexOf("10 bis.") > 0 && qt.indexOf("10 bis.") < qt.indexOf("const depuis = new Date(Date.now() - 90 * 86400_000)"), "avant la règle du format dominant du rayon");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
