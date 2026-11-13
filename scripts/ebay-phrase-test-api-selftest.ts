// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : eBAY PAR L'API ÉCRIT LA PHRASE DE TEST AU SERVICE.
//
//     npm run selftest:ebay-phrase-test-api        (deno)
//
// Décision de Nico : la date de test est une DONNÉE de la fiche (inventaire.attributs.teste_le) et la phrase est
// écrite À CHAQUE ENVOI selon le modèle du vendeur (src/utils/blocsDescription.js, rendreDescriptionAuService). Les
// plateformes servies par l'extension la reçoivent de get-pending-jobs ; eBay par l'API (ebay-api-worker, publier()
// — publication ET republication) envoyait `descriptionEbay(job.description)`, le texte copié de la fiche à la
// création de la tâche : ni consignes, ni date de test, ni phrase réécrite.
// Cas réels, compte de63ca45 (≈ 85 publications eBay par l'API en 30 jours, lecture seule du 13/11) :
//   · tâche 70c6910c (fiche 1793628394932), publiée sur eBay le 03/11 à 11:10 avec « Jeu testé aujourd’hui, le
//     2 novembre 2026, et fonctionnel. » — « aujourd’hui » le lendemain ;
//   · la réparation préparée (scripts/reparations/20261113_de63ca45_date_de_test.sql) sort la phrase du texte et range
//     la date dans attributs.teste_le : sans ce correctif, ses fiches réparées partiraient sur eBay SANS phrase.
// Pour tous les comptes : sans modèle de phrase ni date de test, la description envoyée à eBay est la même, à l'octet.
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = Deno.env.get("FILLSELL_RACINE") ? path.resolve(Deno.env.get("FILLSELL_RACINE")!) : path.resolve(ICI, "..");
// deno-lint-ignore no-explicit-any
const imp = async (p: string): Promise<any> => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
const lire = (p: string) => { try { return fs.readFileSync(path.join(RACINE, p), "utf8"); } catch { return ""; } };
let ko = 0, n = 0;
const ok = (c: unknown, m: string, d?: unknown) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const S = await imp("supabase/functions/_shared/ebay-description-servie.ts");
const P = await imp("supabase/functions/_shared/ebay-publication.ts");
const B = await imp("src/utils/blocsDescription.js");
const C = await imp("src/utils/consignesRedaction.js");
const fx = JSON.parse(fs.readFileSync(path.join(ICI, "fixtures/redaction-de63ca45/sept-fiches.json"), "utf8"));
const consignes = fx.consignes;
const texteDe = (id: string) => String(fx.fiches.find((f: { inventaire_id: string }) => f.inventaire_id === id)?.texte_publie ?? "");
const gta = texteDe("1793616052050"); // tâche eBay 13e5abc8, publiée le 02/11 à 13:18 : le texte de la fiche, phrase figée
const t70c = texteDe("1793628394932"); // tâche eBay 70c6910c, publiée le 03/11 à 11:10
const FIGEE = "Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.";
const DATEE = "Jeu testé le 2 novembre 2026 et fonctionnel.";
const FIN_HTML = "<p>Vendu comme sur les photos.</p><p>📍 Remise en main propre possible.</p><p>🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées.</p>";
const TESTE_LE = { teste_le: { v: "2026-11-02", source: "manuel", at: "2026-11-13T12:00:00Z", origine: "reparation_20261113_date_de_test" } };
// Ce que le worker envoyait (product.description ET listingDescription) : le texte du job, tel quel.
const avant = (description: string, titre: string) => P?.descriptionEbay?.(description ?? "", titre ?? "") ?? null;
// Ce qu'il envoie : la description SERVIE (la même fonction pour les deux champs).
// deno-lint-ignore no-explicit-any
const servie = (description: string, titre: string, opts: any) => S?.descriptionEbayServie?.({ description, title: titre }, opts) ?? null;

console.log("1. Le cas réel : la tâche 70c6910c, publiée le 03/11 (test du 02/11)");
{
  ok(t70c.includes(FIGEE) && avant(t70c, "x")?.includes(FIGEE), "avant : eBay recevait « testé aujourd’hui, le 2 novembre » le 03/11 (texte de la fiche copié tel quel)");
  const r = servie(t70c, "x", { consignes, attributs: null, aujourdhui: "2026-11-03" });
  ok(r && r.html.includes(`<p>${DATEE}</p>`) && !r.html.includes("aujourd’hui"), "après : « Jeu testé le 2 novembre 2026 et fonctionnel. » (la phrase du modèle, remise au jour de l'envoi)", r?.html?.slice(-330));
  ok(r && r.html === avant(t70c.replace(FIGEE, DATEE), "x"), "rien d'autre ne change dans son texte (HTML à l'octet près, phrase mise à part)");
  ok(r && r.html.endsWith(FIN_HTML), "ses phrases finales restent les dernières, mot pour mot, émojis compris");
  const le02 = servie(gta, "x", { consignes, attributs: null, aujourdhui: "2026-11-02" });
  ok(le02 && le02.html === avant(gta, "x"), "tâche 13e5abc8 publiée le 02/11 (jour du test) : la description est celle d'avant, à l'octet");
}

console.log("2. La fiche RÉPARÉE (phrase sortie du texte, date dans attributs.teste_le)");
{
  const repare = gta.replace(`${FIGEE}\n\n`, "");
  ok(!repare.includes("testé") && repare.endsWith("12 heures ouvrées."), "simulation de la réparation : plus de phrase dans le texte");
  ok(!avant(repare, "x")?.includes("testé"), "avant : eBay recevait le texte SANS phrase de test (le trou)");
  const r = servie(repare, "x", { consignes, attributs: TESTE_LE, aujourdhui: "2026-11-13" });
  ok(r && r.html === avant(gta.replace(FIGEE, DATEE), "x"), "après, envoyée le 13/11 : la phrase datée revient à sa place, avant les phrases finales", r?.html?.slice(-330));
  ok(r && r.html.endsWith(`<p>${DATEE}</p>${FIN_HTML}`), "… et les phrases finales restent les dernières, mot pour mot");
  const meme = servie(repare, "x", { consignes, attributs: TESTE_LE, aujourdhui: "2026-11-02" });
  ok(meme && meme.html.includes(`<p>${FIGEE}</p>`), "envoyée le jour du test : « testé aujourd’hui, le 2 novembre 2026 »");
  ok(r && r.rendu?.date === "2026-11-02" && r.rendu?.modifie === true && r.rendu?.omise === false, "le rendu dit la date et la phrase écrites (diagnostic de la tâche)", r?.rendu);
  // Même texte que get-pending-jobs servirait à l'extension pour eBay (voie formulaire) : une seule règle.
  const gpj = B?.rendreDescriptionAuService?.(repare, { plateforme: "ebay", lues: C?.lireConsignes?.(consignes), testeLe: "2026-11-02", aujourdhui: "2026-11-13" });
  ok(r && gpj && r.rendu.texte === gpj.texte, "même texte que get-pending-jobs pour eBay par l'extension (rendreDescriptionAuService)");
}

console.log("3. Pour tous les comptes : sans modèle ni date de test, eBay reçoit la même description, à l'octet");
{
  const cas: Array<[string, string, string]> = [
    ["texte de63ca45, compte sans consignes", gta, "🎮 GTA V Xbox One"],
    ["texte simple", "Pull en laine bleu, taille M.\n\nEnvoi rapide.", "Pull bleu"],
    ["description vide (le titre la remplace)", "", "Lampe Accolay"],
    ["contenu actif (08/11, 8d59f147)", "• Album : Compilation de la collection Expression (PolyGram).\nEnvoi rapide (sous 24h/48h).", "CD"],
    ["« testé aujourd’hui » tapé sans modèle", gta.replace(FIGEE, "Testé aujourd’hui, le 2 novembre 2026, et fonctionnel."), "x"],
    ["espaces et lignes en trop", "  Livre de poche.\n\n\n\nBon état.  \n", "Livre"],
  ];
  for (const [nom, d, t] of cas) {
    const r = servie(d, t, { consignes: null, attributs: null, aujourdhui: "2026-11-13" });
    ok(r && r.html === avant(d, t) && r.rendu?.modifie === false, nom, r?.html?.slice(0, 160));
  }
  const autre = "📦 Lot de 3 porte-clés.\n\n✨ État : bon état.\n\nVendu comme sur les photos.\n\n📍 Remise en main propre possible.\n\n🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées.";
  const r2 = servie(autre, "x", { consignes, attributs: { couleur: { v: "noir" } }, aujourdhui: "2026-11-13" });
  ok(r2 && r2.html === avant(autre, "x"), "compte AVEC consignes, objet sans test (ni phrase ni date) : à l'octet");
  const r3 = servie(gta, "x", { consignes: null, attributs: { teste_le: "2026-11-02" }, aujourdhui: "2026-11-13" });
  ok(r3 && r3.html === avant(gta, "x"), "une date de test mal formée (pas {v}) n'est pas lue : rien ne bouge (même lecture que get-pending-jobs)");
}

console.log("4. Le worker envoie la description servie, aux deux champs, publication et republication");
{
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(!/descriptionEbay\(job\.description/.test(w), "plus aucun descriptionEbay(job.description …) : le texte brut du job ne part plus");
  ok(/description: descriptionServie\.html,/.test(w) && /listingDescription: descriptionServie\.html,/.test(w), "product.description et listingDescription = la description servie");
  ok(/const descriptionServie = await descriptionEbayDuJob\(admin, job, attributs\)/.test(w), "calculée dans publier() avec les attributs de la fiche (republier() passe par publier())");
  ok(/consignesDuCompte\(admin, job\.user_id\)/.test(w), "consignes du compte de la tâche (profiles.platform_settings.redaction.consignes)");
  ok(/phrase_de_test: descriptionServie\.diagnostic/.test(w), "la phrase écrite est notée dans le diagnostic de la publication");
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) Deno.exit(1);
