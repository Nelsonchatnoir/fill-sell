// ═══════════════════════════════════════════════════════════════════════════
// Selftest « L'ÉTAT, PAS "RETIRE OU DÉCOCHE" » (2026-09-23, cas Louis 20:32)
//   node scripts/etats-publication-selftest.mjs
//
// Louis, kit « Rangement Blanc et Noir » : un dépôt Leboncoin en attente du
// champ « Produit », un dépôt Opla en attente de l'autorisation — rien en
// ligne. L'écran disait « Déjà en ligne (ou en file) sur : Leboncoin, Opla.
// Retire d'abord cette annonce… ou décoche la plateforme. »
//
// Ce test fige, sur les jobs RÉELS de Louis (23/09) :
//   · attentesParPlateforme : Leboncoin = attente d'un champ (« Produit »),
//     Opla = attente d'autorisation, Beebs = rien (publié, c'est
//     computeRemovalInfo qui le dit) ; les deux attentes BLOQUENT ;
//   · phraseEtat : la phrase nomme l'attente, jamais « en ligne » ;
//   · messageRefusPublication : le geste qui débloque, jamais « retire » ni
//     « décoche » pour une attente ; « retire d'abord » seulement pour une
//     annonce réellement en ligne ;
//   · l'alerte de ressemblance (jumeauxEnLigne.verdictJumeau) : les kits
//     d'autres couleurs ne sont plus des jumeaux, la photo prouve, et
//     « 2 mots + même prix » ne suffit plus.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { attentesParPlateforme, phraseEtat, messageRefusPublication, natureAttente } =
  await import(pathToFileURL(join(ROOT, "src/utils/etatsPublication.js")).href);
const { verdictJumeau, estUnJumeau, motsDuTitre, motsCommuns } =
  await import(pathToFileURL(join(ROOT, "src/utils/jumeauxEnLigne.js")).href);

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Les trois jobs du kit 1790184183728 (cross_post_jobs, 23/09), tels qu'en base.
const JOBS_LOUIS = [
  { id: "616080af", platform: "beebs", action: "publish", status: "published", created_at: "2026-09-23T17:23:03Z", error: null, platform_fields: {} },
  { id: "d1cda4e0", platform: "leboncoin", action: "publish", status: "needs_user", created_at: "2026-09-23T18:06:56Z",
    error: "Leboncoin demande : Produit (« Veuillez choisir un type de produit »). Renseigne-le dans FillSell (fiche de l'article, bouton « ✋ Compléter »), puis relance la publication.",
    platform_fields: { needsUserField: { field_key: "furniture_type", field_label: "Produit", input_type: "dropdown", target: { key: "furniture_type", root: "lbcAspects" } } } },
  { id: "2fbd4363", platform: "opla", action: "publish", status: "needs_user", created_at: "2026-09-23T18:06:56Z",
    error: "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension. On réessaie tout seuls, il n'y a rien à faire de ton côté.",
    platform_fields: { needs_user_source: "opla_acces" } },
];

console.log("\n[1] Les attentes de Louis, lues dans ses jobs");
const a = attentesParPlateforme(JOBS_LOUIS);
ok("Leboncoin : attente d'un champ « Produit », bloquante", a.leboncoin?.kind === "attente_champ" && a.leboncoin.champ === "Produit" && a.leboncoin.bloque === true, JSON.stringify(a.leboncoin));
ok("Opla : attente d'autorisation, bloquante", a.opla?.kind === "attente_autorisation" && a.opla.bloque === true, JSON.stringify(a.opla));
ok("Beebs (publié) : pas une attente — c'est le verrou « en ligne » qui parle", a.beebs === undefined, JSON.stringify(a.beebs));
ok("le job porté est celui de l'attente", a.leboncoin?.job?.id === "d1cda4e0");

console.log("\n[2] Les autres natures");
ok("eBay « Connecte ton compte eBay » → attente de connexion", natureAttente({ platform: "ebay", error: "Connecte ton compte eBay…", platform_fields: { needs_user_source: "ebay_connexion_requise" } }).kind === "attente_connexion");
ok("eBay REAUTH → connexion, motif reauth_ebay", natureAttente({ platform: "ebay", error: "REAUTH VENTE eBay : …", platform_fields: {} }).motif === "reauth_ebay");
ok("« Connexion Vinted requise » → connexion", natureAttente({ platform: "vinted", error: "Connexion Vinted requise : …", platform_fields: {} }).kind === "attente_connexion");
ok("needs_user sans champ ni source → attente simple", natureAttente({ platform: "vinted", error: "…", platform_fields: {} }).kind === "attente");
ok("champs_a_completer (republication) → attente d'un champ", natureAttente({ platform: "vinted", error: "…", platform_fields: { champs_a_completer: ["taille"] } }).champ === "taille");
{
  const r = attentesParPlateforme([{ platform: "leboncoin", action: "publish", status: "failed", created_at: "2026-09-23T10:00:00Z", error: "refus", platform_fields: {} }]);
  ok("dernier dépôt failed → « refusee », NON bloquant", r.leboncoin?.kind === "refusee" && r.leboncoin.bloque === false, JSON.stringify(r));
  const r2 = attentesParPlateforme([
    { platform: "leboncoin", action: "publish", status: "failed", created_at: "2026-09-23T12:00:00Z", error: "refus", platform_fields: {} },
    { platform: "leboncoin", action: "publish", status: "needs_user", created_at: "2026-09-23T10:00:00Z", error: "…", platform_fields: { needs_user_source: "opla_acces" } },
  ]);
  ok("un needs_user plus ancien bloque quand même (le RPC le compte)", r2.leboncoin?.bloque === true, JSON.stringify(r2));
  ok("un retrait (delete) n'est jamais une attente de publication", Object.keys(attentesParPlateforme([{ platform: "opla", action: "delete", status: "needs_user", created_at: "2026-09-23T10:00:00Z", platform_fields: { needs_user_source: "opla_acces" } }])).length === 0);
}

console.log("\n[3] Les phrases");
ok("champ : « en attente d'un champ (Produit) »", phraseEtat("leboncoin", a.leboncoin, "fr") === "en attente d'un champ (Produit)", phraseEtat("leboncoin", a.leboncoin, "fr"));
ok("autorisation : « en attente de ton autorisation Opla »", phraseEtat("opla", a.opla, "fr") === "en attente de ton autorisation Opla");
ok("connexion eBay (en) : « waiting for you to sign in to eBay »", phraseEtat("ebay", { kind: "attente_connexion" }, "en") === "waiting for you to sign in to eBay");

console.log("\n[4] Le refus serveur, plateforme par plateforme");
{
  const msg = messageRefusPublication(["leboncoin", "opla"], { publiees: new Set(), enFile: new Set(), attentes: a, lang: "fr" });
  ok("Leboncoin → « attend « Produit » — complète-le »", /Leboncoin : une publication attend « Produit » — complète-le/.test(msg), msg);
  ok("Opla → « appuie sur « Autoriser Opla » »", /Opla : une publication attend ton autorisation — appuie sur « Autoriser Opla »/.test(msg), msg);
  ok("jamais « retire » ni « décoche » pour une attente", !/retire|décoche/i.test(msg), msg);
  ok("les autres peuvent partir", /les autres peuvent partir/.test(msg));
  const enLigne = messageRefusPublication(["beebs"], { publiees: new Set(["beebs"]), enFile: new Set(), attentes: {}, lang: "fr" });
  ok("en ligne → « retire d'abord » (et seulement là)", /Beebs : déjà en ligne — retire d'abord/.test(enLigne), enLigne);
  const file = messageRefusPublication(["vinted"], { publiees: new Set(), enFile: new Set(["vinted"]), attentes: {}, lang: "fr" });
  ok("en file → « déjà en cours — rien à refaire »", /Vinted : une publication est déjà en cours — rien à refaire/.test(file), file);
}

console.log("\n[5] L'alerte de ressemblance : la couleur exclut, la photo prouve");
{
  const titre = "Rangement Blanc et Noir 12 pour 12 pots et 12 couvercles pour yaourtière Multidélices";
  const mots = motsDuTitre(titre);
  const gris = { titre: "Rangement Blanc et Gris pour 12 pots et 12 couvercles pour yaourtière Multidélices", prix: 10, mots: motsCommuns(mots, "Rangement Blanc et Gris pour 12 pots et 12 couvercles pour yaourtière Multidélices") };
  ok("l'ancienne règle citait le kit gris (≥ 4 mots)", estUnJumeau(gris.mots, 10, 10) === true);
  ok("désormais : autre couleur → jamais, même avec la photo identique", verdictJumeau({ titre, prix: 10, candidat: gris, photo: { verdict: "identique", dhash: 0, phash: 0 } }) === null);
  const meme = { titre: "Rangement Blanc et Noir pour 12 pots et 12 couvercles pour yaourtière Multidélices", prix: 10, mots: motsCommuns(mots, "Rangement Blanc et Noir pour 12 pots et 12 couvercles pour yaourtière Multidélices") };
  ok("même couleur, titre entier, même prix → jumeau (texte)", verdictJumeau({ titre, prix: 10, candidat: meme, photo: null }) === "texte");
  ok("même couleur, photo identique → jumeau (photo), preuve la plus forte", verdictJumeau({ titre, prix: 10, candidat: meme, photo: { verdict: "identique", dhash: 1, phash: 0 } }) === "photo");
  const court = { titre: "Rangement yaourtière", prix: 10, mots: motsCommuns(mots, "Rangement yaourtière") };
  ok("2 mots + même prix, sans photo → plus jamais un jumeau", verdictJumeau({ titre, prix: 10, candidat: court, photo: null }) === null);
  ok("2 mots + photo identique → jumeau (photo)", verdictJumeau({ titre, prix: 10, candidat: court, photo: { verdict: "identique", dhash: 0, phash: 0 } }) === "photo");
  const identique = { titre: "Rangement Blanc et Noir 12 pour 12 pots et 12 couvercles pour yaourtière Multidélices", prix: 12, mots: motsCommuns(mots, titre) };
  ok("titre normalisé identique, autre prix → jumeau (titre)", verdictJumeau({ titre, prix: 10, candidat: identique, photo: null }) === "titre");
}

console.log(ko === 0 ? "\n[selftest:etats-publication] OK\n" : `\n[selftest:etats-publication] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
