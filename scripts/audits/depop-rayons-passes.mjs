// Audit des rayons Depop PASSÉS (11/10/2026, mission de Nico, point 3).
//
//   node scripts/audits/depop-rayons-passes.mjs
//
// LECTURE SEULE. Pour chaque job Depop qui a déposé ou devait déposer
// (publication, republication — les retraits n'ont pas de rayon), relit le
// rayon PARTI ou PRÉVU (depop_rayon_avant quand le moteur l'a déjà remplacé),
// le rejuge avec le moteur (_shared/depop-rayon.js : IA resolve-categorie en
// REJEU — rien n'est écrit dans categorie_journal —, garde-fous) et dit, quand
// ils diffèrent, la CAUSE (vêtement en chaussures, chaussure en vêtement, robe
// par défaut d'un titre non reconnu…). Rien n'est modifié en base.
// Le secret de cron est lu en mémoire, jamais affiché.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resoudreRayonDepop, jugerRayonDepop, indicesAgeGenre, familleObjetDepop, departementsDepop, texteRayonDepop } from "../../supabase/functions/_shared/depop-rayon.js";
import { horsModeDepop } from "../../src/utils/depopCategories.js";
import { detectObjectIcon } from "../../src/utils/shared.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "audit-depop-"));
const sql = (q) => {
  const f = path.join(tmp, "q.sql");
  fs.writeFileSync(f, q);
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", f], { cwd: RACINE, shell: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
};
let secret;
try { secret = sql("select public.cron_secret() s;")[0].s; } catch { console.error("lecture du secret impossible"); process.exit(1); }
const URL_IA = "https://tojihnuawsoohlolangc.supabase.co/functions/v1/resolve-categorie";
const demanderIA = async (corps) => {
  const r = await fetch(URL_IA, { method: "POST", headers: { "content-type": "application/json", "x-cron-secret": secret }, body: JSON.stringify({ ...corps, rejeu: true }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const jobs = sql(`
  select j.id, p.username, j.action, j.status, j.handler_build, to_char(j.created_at at time zone 'Europe/Paris','DD/MM HH24:MI') cree,
    j.title, j.description, j.platform_fields->'depopCategoryPath' chemin, j.platform_fields->'depop_rayon_avant'->>'id' avant,
    j.platform_fields->>'categorie_source' source, j.platform_fields->>'genre' genre, j.platform_fields->>'taille' taille,
    j.platform_fields->'depop_rayon'->>'version' version, j.listing_url,
    i.titre fiche_titre, i.description fiche_description, i.type fiche_type, i.attributs
  from cross_post_jobs j join profiles p on p.id = j.user_id left join inventaire i on i.id = j.inventaire_id
  where j.platform = 'depop' and j.action in ('publish', 'republish')
  order by j.created_at;`);

const valeur = (x) => (x && typeof x === "object" ? x.v : x);
const lignes = [];
for (const j of jobs) {
  const import_ = /releve-annonces|sync-dressing/.test(String(j.handler_build ?? ""));
  const parti = j.avant ?? (Array.isArray(j.chemin) ? j.chemin.join("/") : null);
  const titre = String(j.title || j.fiche_titre || "");
  const description = String(j.description || j.fiche_description || "");
  const attrs = j.attributs ?? {};
  const origine = Array.isArray(attrs?.categorie_vinted?.chemin) ? attrs.categorie_vinted.chemin : null;
  const ctx = {
    titre, description, genre: String(j.genre ?? valeur(attrs.genre) ?? ""), origine,
    objet: String(valeur(attrs.objet) ?? ""), horsMode: horsModeDepop(detectObjectIcon(titre, description, j.fiche_type ?? null)),
    taille: String(j.taille ?? valeur(attrs.taille) ?? ""), marque: String(valeur(attrs.marque) ?? ""),
  };
  let verdict = "—", cause = "", juste = null;
  if (import_) { verdict = "import (rayon lu chez Depop)"; juste = true; }
  else if (!parti) { verdict = "aucun rayon"; }
  else {
    const r = await resoudreRayonDepop(ctx, demanderIA);
    const garde = jugerRayonDepop(parti, { indices: indicesAgeGenre(ctx), famille: familleObjetDepop(ctx), departements: null });
    if (r.id && r.id === parti) { verdict = "juste"; juste = true; }
    else if (r.id) { verdict = `faux → ${texteRayonDepop(r.id)}`; juste = false; }
    else { verdict = `doute (${r.motif}) → question`; juste = garde.ok ? null : false; }
    if (!garde.ok) cause = garde.detail;
    else if (juste === false && j.source !== "choix_humain") {
      const icone = detectObjectIcon(titre, description, j.fiche_type ?? null);
      cause = `table icône → rayon (icône ${icone}, genre « ${ctx.genre || "—"} ») : le moteur range ailleurs`;
    }
  }
  lignes.push({ id: String(j.id).slice(0, 8), compte: j.username, action: j.action, statut: j.status, cree: j.cree, titre: titre.slice(0, 60),
    parti: parti ? texteRayonDepop(parti) ?? parti : "—", source: j.source ?? "—", verdict, cause, juste });
}
for (const l of lignes) {
  console.log(`${l.juste === false ? "✗" : l.juste ? "✓" : "?"} ${l.id} ${l.compte} ${l.action}/${l.statut} ${l.cree} « ${l.titre} »\n    parti/prévu : ${l.parti} (source ${l.source}) — ${l.verdict}${l.cause ? `\n    cause : ${l.cause}` : ""}`);
}
const faux = lignes.filter((l) => l.juste === false);
console.log(`\n${lignes.length} jobs Depop (publication, republication) ; ${faux.length} rayon(s) faux ; ${lignes.filter((l) => l.juste === null).length} doute(s).`);
fs.rmSync(tmp, { recursive: true, force: true });
