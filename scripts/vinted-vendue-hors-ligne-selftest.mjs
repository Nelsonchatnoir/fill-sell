// ── AUTOTEST : UNE ANNONCE VINTED VENDUE N'EST PLUS « EN VENTE » (05/10) ────
// Louis (Business) : « 12 adaptateurs Jaune » (quantité 9998) gardait le logo
// Vinted alors que son annonce était vendue — la présence de vinted_item_id
// suffisait. Règle (src/utils/publicationState.js, vintedPresenceArticle) :
// l'annonce de la fiche est morte si disparue, 'sold'/'closed', ou vendue par
// un job ; un job 'published' ne la ressuscite que pour une AUTRE annonce ou
// une mise en ligne POSTÉRIEURE au constat.
//
//   node --import ./scripts/loader-ext.mjs scripts/vinted-vendue-hors-ligne-selftest.mjs
import { vintedPresenceArticle, annoncesEncoreEnLigne } from "../src/utils/publicationState.js";
import { entreDansFiltreRapide } from "../src/stock/regles.js";

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — vu : ${JSON.stringify(detail)}` : ""}`); }
};
const job = (id, extra = {}) => ({
  id: `j-${id}`, platform: "vinted", action: "publish", status: "published",
  platform_listing_id: String(id), listing_url: `https://www.vinted.fr/items/${id}`,
  created_at: "2026-10-01T10:00:00Z", published_at: "2026-10-01T10:01:00Z", ...extra,
});
const vinted = (item, jobs) => vintedPresenceArticle(item, jobs);

console.log("\n── Cas réels de Louis (05/10) ─────────────────────────────────");
// Jaune : job vendu pour 10238384500, fiche encore 'active' (statut périmé).
{
  const item = { id: 1, vinted_item_id: "10238384500", vinted_status: "active", last_synced_at: "2026-10-04T14:41:20Z" };
  const jobs = [job(10238384500, { status: "sold", sold_at: "2026-10-05T07:36:09Z", published_at: "2026-10-04T10:57:59Z" })];
  const v = vinted(item, jobs);
  ok("Jaune : annonce vendue → ni occupée ni visible", !v.occupee && !v.visible, v);
  ok("Jaune : pas « encore en ligne »", !annoncesEncoreEnLigne(item, jobs).some((a) => a.platform === "vinted"));
}
// Vert : vendue, vinted_status 'sold'.
{
  const item = { id: 2, vinted_item_id: "10137249387", vinted_status: "sold", last_synced_at: "2026-10-04T14:41:22Z" };
  const jobs = [job(10137249387, { status: "sold" })];
  ok("Vert : vendue → hors ligne", !vinted(item, jobs).occupee);
}
// Rouge : vendue le 04/10 (10152002902), remise en ligne le 05/10 (10251765273),
// la fiche suit le nouveau numéro mais dit encore 'sold' (relevé du 04/10).
{
  const item = { id: 3, vinted_item_id: "10251765273", vinted_status: "sold", last_synced_at: "2026-10-04T14:41:21Z" };
  const jobs = [
    job(10152002902, { status: "sold", published_at: "2026-09-27T10:54:19Z" }),
    job(10251765273, { created_at: "2026-10-05T07:50:38Z", published_at: "2026-10-05T07:51:54Z" }),
  ];
  const v = vinted(item, jobs);
  ok("Rouge : nouvelle annonce mise en ligne après le relevé → en vente", v.occupee && v.visible, v);
}

console.log("\n── Ce qui ne doit pas bouger ─────────────────────────────────");
{
  const item = { id: 4, vinted_item_id: "999", vinted_status: "active", last_synced_at: "2026-10-04T10:00:00Z" };
  const v = vinted(item, []);
  ok("import du dressing actif sans job → en vente", v.occupee && v.visible, v);
}
{
  const item = { id: 5, vinted_item_id: "999", vinted_status: "hidden", last_synced_at: "2026-10-04T10:00:00Z" };
  const v = vinted(item, []);
  ok("masquée → occupée mais pas visible", v.occupee && !v.visible, v);
}
{
  const item = { id: 6, vinted_item_id: "999", disparu_le: "2026-10-03T10:00:00Z" };
  const v = vinted(item, [job(999)]);
  ok("disparue, job de la même annonce plus ancien → hors ligne", !v.occupee, v);
}
{
  const item = { id: 7, vinted_item_id: "999", vinted_status: "closed", disparu_le: "2026-10-03T10:00:00Z", last_synced_at: "2026-10-02T10:00:00Z" };
  const v = vinted(item, [job(1000, { created_at: "2026-10-04T10:00:00Z", published_at: "2026-10-04T10:05:00Z" })]);
  ok("retirée puis republiée sous un autre numéro → en vente", v.occupee && v.visible, v);
}
{
  const item = { id: 8, vinted_item_id: null };
  const v = vinted(item, [job(1001)]);
  ok("publiée par FillSell, fiche sans numéro → en vente", v.occupee, v);
}
{
  const item = { id: 9, vinted_item_id: "1002", vinted_status: "sold", last_synced_at: "2026-10-04T10:00:00Z" };
  const v = vinted(item, [job(1002, { published_at: "2026-10-01T10:00:00Z" })]);
  ok("relevé 'sold' plus récent que le job 'published' du même numéro → hors ligne", !v.occupee, v);
}
{
  const item = { id: 10, vinted_item_id: "1003" };
  const v = vinted(item, [job(1003), job(1003, { id: "j-bis", status: "sold" })]);
  ok("job 'sold' du même numéro que le job publié → hors ligne", !v.occupee, v);
}
ok("filtre « En ligne » suit la règle (vendu=false, enLigne=false)", !entreDansFiltreRapide("en_ligne", { vendu: false, enLigne: false }));

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
