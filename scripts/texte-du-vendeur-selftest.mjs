// Le texte du vendeur, repris là où l'article est en ligne (03/10/2026) —
// décision de Nico : « le texte du vendeur fait foi, quelle que soit la
// plateforme ». Exécute le code LIVRÉ :
//   · supabase/functions/_shared/texte-depuis-html.js (la description eBay
//     rendue par l'API Browse, remise en texte, servie par ebay-account) ;
//   · src/publication/texteDuVendeur.js (le chemin unique, stepper et lot),
//     sur une base factice : relevé, capture Vinted, détail Vinted, eBay.
//
//     npm run selftest:texte-du-vendeur
import { texteDepuisHtml, DESCRIPTION_REPRISE_MAX } from "../supabase/functions/_shared/texte-depuis-html.js";
import {
  aCompleter, choisirDescriptionEnLigne, marqueurReleve, completerTexteDuVendeur,
} from "../src/publication/texteDuVendeur.js";

let verts = 0, rouges = 0;
const ok = (cond, quoi, detail = "") => {
  if (cond) { verts++; console.log(`  ok   ${quoi}`); }
  else { rouges++; console.log(`  RATÉ ${quoi}${detail ? `  ← ${detail}` : ""}`); }
};

// ── 1. HTML → texte ───────────────────────────────────────────────────────
console.log("HTML eBay → texte");
ok(texteDepuisHtml("Pull en laine, taille M.\nTrès bon état.") === "Pull en laine, taille M.\nTrès bon état.", "un texte brut passe tel quel");
ok(texteDepuisHtml("<p>Robe <b>fleurie</b>&nbsp;bleue</p><p>Taille 38</p>") === "Robe fleurie bleue\n\nTaille 38", "paragraphes séparés d'une ligne vide, balises et &nbsp; retirés",
  JSON.stringify(texteDepuisHtml("<p>Robe <b>fleurie</b>&nbsp;bleue</p><p>Taille 38</p>")));
ok(texteDepuisHtml("<div>Ligne A</div><div>Ligne B</div>") === "Ligne A\nLigne B", "un bloc = une fin de ligne (pas de cascade de vides)",
  JSON.stringify(texteDepuisHtml("<div>Ligne A</div><div>Ligne B</div>")));
ok(texteDepuisHtml("<div>Pull\n   en laine</div>") === "Pull en laine", "dans du HTML, un retour du code source n'est qu'un espace");
ok(texteDepuisHtml("Ligne 1<br>Ligne 2<br/>Ligne 3") === "Ligne 1\nLigne 2\nLigne 3", "<br> → retour à la ligne");
ok(texteDepuisHtml("<ul><li>Coton</li><li>Lavable</li></ul>") === "• Coton\n• Lavable", "les puces restent des puces", JSON.stringify(texteDepuisHtml("<ul><li>Coton</li><li>Lavable</li></ul>")));
ok(texteDepuisHtml("<style>.x{color:red}</style><script>alert(1)</script><div>Vrai texte</div>") === "Vrai texte", "feuilles de style et scripts du gabarit écartés");
ok(texteDepuisHtml("Prix &amp; état : &eacute;l&eacute;gant &#233;t&#xE9; &euro;") === "Prix & état : élégant été €", "entités nommées et numériques décodées");
ok(texteDepuisHtml("<p></p><div>   </div>") === "", "rien de lisible → vide");
ok(texteDepuisHtml("Bonjour 👋 <i>merci</i>") === "Bonjour 👋 merci", "émojis gardés (aucune reformulation)");
ok(texteDepuisHtml("a".repeat(DESCRIPTION_REPRISE_MAX + 1)) === "", "un gabarit géant n'est pas repris (rien plutôt que coupé)");
ok(texteDepuisHtml("<p>A</p>\n\n\n\n<p>B</p>") === "A\n\nB", "pas plus d'une ligne vide d'affilée");

// ── 2. Les règles pures ────────────────────────────────────────────────────
console.log("Règles pures");
ok(aCompleter({ id: 1, description: "" }) === true, "sans description → à compléter");
ok(aCompleter({ id: 1, description: "  " }) === true, "description blanche → à compléter");
ok(aCompleter({ id: 1, description: "Texte" }) === false, "avec description → rien à faire");
ok(aCompleter({ id: 1, description: "Texte", origine: "vinted_sync", vinted_item_id: 9, vinted_catalog_id: null }) === true,
  "dressing sans catégorie → relu (règle du 05/08), même avec sa description");
ok(aCompleter({ id: 1, description: "Texte", origine: "vinted_sync", vinted_item_id: 9, vinted_catalog_id: 1234 }) === false, "dressing complet → rien à faire");
ok(choisirDescriptionEnLigne([]) === null, "aucun relevé → rien");
ok(choisirDescriptionEnLigne([{ platform: "leboncoin", capture: {}, statut_plateforme: "en_ligne" }]) === null, "relevé sans texte → rien");
{
  const c = choisirDescriptionEnLigne([
    { platform: "leboncoin", capture: { description: "Texte LBC ancien" }, capture_le: "2026-09-20T10:00:00Z", statut_plateforme: "en_ligne" },
    { platform: "beebs", capture: { description: "Texte Beebs récent" }, capture_le: "2026-10-01T10:00:00Z", statut_plateforme: "en_ligne" },
    { platform: "ebay", capture: { description: "Texte eBay hors ligne plus récent" }, capture_le: "2026-10-02T10:00:00Z", statut_plateforme: "hors_ligne" },
  ]);
  ok(c?.platform === "beebs" && c?.description === "Texte Beebs récent", "en ligne d'abord, la plus récente gagne (même règle que le moteur)", JSON.stringify(c));
}
{
  const m = marqueurReleve("leboncoin", "2026-10-03T00:00:00Z");
  ok(m.description_source?.v === "releve_leboncoin" && m.description_source?.source === "releve_leboncoin",
    "marqueur releve_<plateforme> : reconnu comme le texte du vendeur (texteDuVendeurFiche, generate-listing)");
}

// ── 3. Le chemin complet, sur une base factice ─────────────────────────────
// Chaque requête est rendue par `repondre(table, op, filtres, patch)` ; les
// écritures sont notées pour être relues.
function baseFactice(repondre) {
  const ecritures = [];
  const from = (table) => {
    const etat = { table, op: "select", filtres: [], patch: null };
    const b = {
      select() { return b; },
      update(patch) { etat.op = "update"; etat.patch = patch; return b; },
      eq(k, v) { etat.filtres.push(["eq", k, v]); return b; },
      is(k, v) { etat.filtres.push(["is", k, v]); return b; },
      gte(k, v) { etat.filtres.push(["gte", k, v]); return b; },
      in(k, v) { etat.filtres.push(["in", k, v]); return b; },
      or(f) { etat.filtres.push(["or", f]); return b; },
      order() { return b; },
      limit() { return b; },
      then(res, rej) {
        if (etat.op === "update") ecritures.push({ table, patch: etat.patch, filtres: etat.filtres });
        return Promise.resolve(repondre(table, etat.op, etat.filtres, etat.patch) ?? { data: [], error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { from, ecritures };
}
const filtre = (filtres, k) => filtres.find((f) => f[1] === k)?.[2];

console.log("Chemin complet");
{
  // 3a. Une annonce Leboncoin relevée porte le texte : la fiche le reçoit.
  const db = baseFactice((table, op, f) => {
    if (table === "annonces_plateforme" && op === "select" && !filtre(f, "platform")) {
      return { data: [{ platform: "leboncoin", capture: { description: "Mon texte Leboncoin" }, capture_le: "2026-10-01T00:00:00Z", statut_plateforme: "en_ligne" }], error: null };
    }
    return { data: [], error: null };
  });
  let ebayAppele = false;
  const r = await completerTexteDuVendeur({ id: 11, description: "", origine: null }, {
    supabase: db, userId: "u1", lireEbay: async () => { ebayAppele = true; return null; },
  });
  ok(r.item.description === "Mon texte Leboncoin" && r.source === "releve_leboncoin", "relevé Leboncoin → description reprise", JSON.stringify(r));
  const w = db.ecritures.find((e) => e.table === "inventaire");
  ok(w && w.patch.description === "Mon texte Leboncoin" && w.patch.attributs?.description_source?.v === "releve_leboncoin", "écrite avec son marqueur");
  ok(w && w.filtres.some((x) => x[0] === "or" && /description\.is\.null/.test(x[1])), "écrite SEULEMENT si la fiche est encore vide (jamais écraser)");
  ok(!ebayAppele, "texte trouvé : aucune lecture eBay inutile");
}
{
  // 3b. Une fiche qui a sa description n'est jamais touchée.
  const db = baseFactice(() => { throw new Error("aucune requête attendue"); });
  const r = await completerTexteDuVendeur({ id: 12, description: "Le texte de la personne" }, { supabase: db, userId: "u1" });
  ok(r.item.description === "Le texte de la personne" && db.ecritures.length === 0 && r.lectures.length === 0, "fiche complète : zéro requête, zéro écriture");
}
{
  // 3c. Dressing Vinted, capture de republication fraîche : zéro lecture réseau.
  const db = baseFactice((table, op) => {
    if (table === "annonces_plateforme") return { data: [], error: null };
    if (table === "vinted_republish_captures" && op === "select") {
      return { data: [{ captured_at: new Date().toISOString(), libelles: { taille: "M" }, payload: { titre: "Pull rouge", natif: { title: "Pull rouge", description: "Texte Vinted capturé", catalog_id: 77, price: { amount: "12.0" } } } }], error: null };
    }
    return { data: [], error: null };
  });
  let detailDemande = false;
  const r = await completerTexteDuVendeur({ id: 13, title: "Pull rouge", sell: 12, description: "", origine: "vinted_sync", vinted_item_id: 555, vinted_catalog_id: null }, {
    supabase: db, userId: "u1", extensionVinted: true, lireDetailVinted: async () => { detailDemande = true; return null; },
  });
  ok(r.item.description === "Texte Vinted capturé" && r.item.vinted_catalog_id === 77 && r.source === "capture", "capture fraîche → description et catégorie", JSON.stringify(r.item));
  ok(!detailDemande && r.lectures.length === 0, "le cache avant le réseau : aucune lecture Vinted");
}
{
  // 3d. Dressing Vinted sans capture : le détail, lu par l'extension (une fois).
  const db = baseFactice(() => ({ data: [], error: null }));
  const avant = [];
  const r = await completerTexteDuVendeur({ id: 14, title: "Jean", sell: 20, description: "", origine: "vinted_sync", vinted_item_id: 777, vinted_catalog_id: null }, {
    supabase: db, userId: "u1", extensionVinted: true,
    avantLecture: (pf) => { avant.push(pf); },
    lireDetailVinted: async (id) => ({ success: true, vintedItemId: id, description: "Texte du détail Vinted", natif: { catalog_id: 88, description: "Texte du détail Vinted" }, libelles: { taille: "W32" } }),
  });
  ok(r.item.description === "Texte du détail Vinted" && r.item.vinted_catalog_id === 88 && r.source === "vinted_detail", "détail Vinted → description et catégorie", JSON.stringify(r));
  ok(avant.join() === "vinted" && r.lectures.join() === "vinted", "UNE lecture Vinted, annoncée avant (le lot y règle son rythme)");
}
{
  // 3e. Dressing Vinted sur un téléphone (pas d'extension) : rien lu, on le dit.
  const db = baseFactice(() => ({ data: [], error: null }));
  const r = await completerTexteDuVendeur({ id: 15, title: "Veste", description: "", origine: "vinted_sync", vinted_item_id: 999, vinted_catalog_id: 5 }, {
    supabase: db, userId: "u1", extensionVinted: false, lireEbay: async () => null,
  });
  ok(r.item.description === "" && r.note === "vinted_sans_extension" && r.lectures.length === 0, "sans extension : comportement de l'unité, note « se lit depuis l'ordinateur »");
}
{
  // 3f. Réponse Vinted absente (délai) : note d'échec, rien d'écrit en faux.
  const db = baseFactice(() => ({ data: [], error: null }));
  const r = await completerTexteDuVendeur({ id: 16, title: "Sac", description: "", origine: "vinted_sync", vinted_item_id: 1001, vinted_catalog_id: 5 }, {
    supabase: db, userId: "u1", extensionVinted: true, lireDetailVinted: async () => null,
  });
  ok(r.note === "vinted_echec" && db.ecritures.filter((e) => e.patch?.description).length === 0, "lecture ratée : note d'échec, aucune description écrite");
}
{
  // 3g. Article relevé sur eBay seulement : la voie API.
  const db = baseFactice((table, op, f) => {
    if (table === "annonces_plateforme" && filtre(f, "platform") === "ebay") return { data: [{ listing_id: "123456789012" }], error: null };
    return { data: [], error: null };
  });
  const appels = [];
  const r = await completerTexteDuVendeur({ id: 17, description: "", origine: "releve_ebay" }, {
    supabase: db, userId: "u1", lireEbay: async (id) => { appels.push(id); return { description: "Texte eBay lu par l'API" }; },
  });
  ok(r.item.description === "Texte eBay lu par l'API" && r.source === "releve_ebay" && appels.join() === "17", "eBay : UNE lecture API, texte repris", JSON.stringify(r));
}
{
  // 3h. Aucune annonce eBay relevée : l'API n'est pas appelée.
  const db = baseFactice(() => ({ data: [], error: null }));
  let appele = false;
  const r = await completerTexteDuVendeur({ id: 18, description: "" }, { supabase: db, userId: "u1", lireEbay: async () => { appele = true; return null; } });
  ok(!appele && r.item.description === "" && r.source === null, "rien en ligne : aucune lecture, comportement d'avant");
}
{
  // 3i. eBay répond sans texte / en erreur : comportement d'avant, jamais d'exception.
  const db = baseFactice((table, op, f) => (table === "annonces_plateforme" && filtre(f, "platform") === "ebay" ? { data: [{ listing_id: "1" }], error: null } : { data: [], error: null }));
  const r = await completerTexteDuVendeur({ id: 19, description: "" }, { supabase: db, userId: "u1", lireEbay: async () => { throw new Error("HTTP 500"); } });
  ok(r.item.description === "" && r.lectures.join() === "ebay", "eBay en erreur : rien repris, rien cassé");
}

console.log(`\ntexte-du-vendeur : ${verts} contrôles verts, ${rouges} rouges`);
if (rouges) process.exit(1);
