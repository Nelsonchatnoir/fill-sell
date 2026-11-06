// Remise en ordre des photos des annonces eBay (voie API) déjà en ligne — 06/11 soir, feu vert de Nico (ordre des photos).
//   node scripts/reparations/20261106_remise_ordre_photos_ebay.mjs            → SIMULATION (lecture eBay, rien écrit)
//   node scripts/reparations/20261106_remise_ordre_photos_ebay.mjs --executer → remise en ordre sur place
// Périmètre (mesure du 06/11, docs/enquetes/ordre-photos-0611/RAPPORT.md § 4) : les annonces eBay API en ligne dont les
// photos communes avec l'article sont dans un autre ordre, HORS the_closet72 (remises par la personne elle-même) et hors
// choix fait pour eBay. La fonction remise-ordre-photos-ebay lit l'ordre RÉELLEMENT en ligne chez eBay d'abord : déjà bon
// → rien ; différent de notre dépôt → rien (jamais une modification de la personne écrasée). Une annonce à la fois.
// Inverse : remettre l'ordre d'avant = même fonction après avoir remis l'ancien ordre sur la fiche (trace
// platform_fields.remise_ordre_photos + modifications_ebay sur la tâche).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const URL_PROJET = "https://tojihnuawsoohlolangc.supabase.co";
const CLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!CLE) { console.error("SUPABASE_SERVICE_ROLE_KEY absente de .env"); process.exit(2); }
const executer = process.argv.includes("--executer");

// Le périmètre, relu à l'instant (pas une liste figée) : eBay API, en ligne, même jeu de photos que l'article, autre ordre.
const THE_CLOSET72 = "8ac5bbda-0947-4612-82fd-effdaa3ca84a";
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" };
const jobs = await (await fetch(`${URL_PROJET}/rest/v1/cross_post_jobs?select=id,user_id,inventaire_id,platform_listing_id,photos,platform_fields&platform=eq.ebay&voie=eq.api&status=eq.published&sold_at=is.null&action=in.(publish,republish)&user_id=neq.${THE_CLOSET72}&limit=1000`, { headers: entetes })).json();
const cle = (p) => { const u = typeof p === "string" ? p : p?.url; return typeof u === "string" ? u.trim().split("?")[0] || null : null; };
const ids = [...new Set(jobs.map((j) => j.inventaire_id).filter((x) => x != null))];
const fiches = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const lot = await (await fetch(`${URL_PROJET}/rest/v1/inventaire?select=id,photos,statut&id=in.(${ids.slice(i, i + 100).join(",")})`, { headers: entetes })).json();
  for (const f of lot) fiches.set(String(f.id), f);
}
const perimetre = jobs.filter((j) => {
  const f = fiches.get(String(j.inventaire_id));
  if (!f || f.statut === "vendu" || j.platform_fields?.photos_choisies === true) return false;
  const jp = (j.photos ?? []).map(cle), ip = (f.photos ?? []).map(cle);
  const jc = jp.filter((u) => ip.includes(u)), ic = ip.filter((u) => jp.includes(u));
  return jc.length > 1 && jc.join("\n") !== ic.join("\n");
});
console.log(`${perimetre.length} annonce(s) eBay API dans le périmètre ${executer ? "— EXÉCUTION" : "— simulation"}`);
for (const j of perimetre) {
  const r = await fetch(`${URL_PROJET}/functions/v1/remise-ordre-photos-ebay`, { method: "POST", headers: entetes, body: JSON.stringify({ job_id: j.id, executer }) });
  const t = await r.json().catch(() => ({}));
  console.log(`  ${j.id.slice(0, 8)} annonce ${j.platform_listing_id} → HTTP ${r.status} ${JSON.stringify(t).slice(0, 400)}`);
  if (!r.ok || t.ok === false) { console.log("  arrêt au premier refus."); break; }
}
