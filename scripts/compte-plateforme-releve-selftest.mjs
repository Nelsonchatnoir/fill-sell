// Autotest — LE COMPTE LEBONCOIN RELEVÉ EST CONNU (08/11 soir, point 3 de Nico — ayadi007) —
// `npm run selftest:compte-plateforme-releve`. La preuve SQL de bout en bout (Postgres jetable, schéma de prod) :
// `PREUVE_PG=embarque node scripts/preuve-compte-plateforme-0811.mjs` (21/21 le 08/11 ; demande `pg` et `embedded-postgres`).
import fs from "node:fs";
import vm from "node:vm";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");

console.log("\n1. EXTENSION (0.6.182) : LE COMPTE LU EST CELUI QUE LA PAGE DONNE À SON API");
{
  const i = bg.indexOf("function compteLeboncoinValide(v) {");
  const src = bg.slice(i, bg.indexOf("\n}\n", i) + 3);
  const sb = { String };
  vm.runInNewContext(`${src}\nthis.f = compteLeboncoinValide;`, sb);
  ok(sb.f("b06ad7a1-4c3e-4b8f-9a2d-1c2b3a4d5e6f") === "b06ad7a1-4c3e-4b8f-9a2d-1c2b3a4d5e6f" && sb.f(" 12345678 ") === "12345678",
    "un identifiant de compte (forme UUID ou numéro) est gardé, espaces retirés");
  ok(sb.f("") === null && sb.f(null) === null && sb.f("ab") === null && sb.f("x".repeat(81)) === null && sb.f("1; DROP") === null,
    "vide, trop court, trop long ou caractères inattendus : jamais écrit");
  ok(/compte: uid,\n {4}\};\n {2}\}, \[LBC_API_PAGE, LBC_API_PAGES_MAX\]\);/.test(bg), "le relevé par l'adresse rend le compte dont il a lu les annonces (owner.user_id)");
  ok(/compte: compteLeboncoinValide\(api\.compte\),/.test(bg), "le résultat du relevé le porte (validé)");
  const iPatch = bg.indexOf("method: \"PATCH\", body: JSON.stringify({ compte_plateforme: comptePlateforme, updated_at: maintenant() }),");
  const iRpc = bg.indexOf("/rest/v1/rpc/rapprocher_releve");
  ok(iPatch > 0 && iRpc > iPatch, "le compte est écrit sur le relevé AVANT le rapprochement (le serveur le lit pour juger les absences)");
  ok(/\.\.\.\(comptePossible \? \{ compte_plateforme: comptePlateforme \} : \{\}\),/.test(bg)
     && /annonces_plateforme\?select=compte_plateforme&limit=1/.test(bg) && /vinted_sync_runs\?select=compte_plateforme&limit=1/.test(bg),
    "chaque annonce vue le porte — seulement si la base a les colonnes (sinon l'upsert entier serait refusé)");
  ok(/const comptePlateforme = platform === "leboncoin" \? compteLeboncoinValide\(lu\.compte\) : null;/.test(bg), "Leboncoin seulement");
}

console.log("\n2. SERVEUR (migration 20261108190000) : DEUX COMPTES NE SE MÉLANGENT JAMAIS");
{
  const m = lire("supabase/migrations/20261108190000_compte_plateforme_releve.sql");
  const inv = lire("supabase/rollbacks/20261108190000_compte_plateforme_releve_INVERSE.sql");
  ok(/IF md5\(v_d\) <> 'c21ea346968770991dad85ea9c36b70e'/.test(m), "garde : réécrite depuis la définition de prod (md5 du 08/11 18:20)");
  ok(/ALTER TABLE public\.vinted_sync_runs ADD COLUMN IF NOT EXISTS compte_plateforme text;/.test(m)
     && /ALTER TABLE public\.annonces_plateforme ADD COLUMN IF NOT EXISTS compte_plateforme text;/.test(m), "deux colonnes NULL (aucune donnée réécrite)");
  ok(/AND \(v_compte IS NULL OR NULLIF\(btrim\(s\.compte_plateforme\), ''\) IS NULL OR s\.compte_plateforme = v_compte\)/.test(m),
    "deux relevés de comptes différents ne forment jamais une paire");
  ok((m.match(/AND \(v_compte IS NULL OR NULLIF\(btrim\(ap\.compte_plateforme\), ''\) IS NULL OR ap\.compte_plateforme = v_compte\)/g) ?? []).length === 2,
    "une annonce d'un autre compte connu n'est ni comptée ni datée (heuristique et boucle)");
  ok(/'releve_autre_compte'/.test(m), "une trace par relevé (usage_logs releve_autre_compte)");
  ok(/IF v_cand>=5 AND NOT EXISTS/.test(m), "l'heuristique du 08/11 midi (compte changé ou vidé, au moins 5) reste, pour les comptes inconnus");
  ok(/DROP COLUMN IF EXISTS compte_plateforme/.test(inv) && /CREATE OR REPLACE FUNCTION public\.constater_absences_releve/.test(inv), "inverse : la définition d'avant, colonnes retirées");
  ok(fs.existsSync(new URL("./preuve-compte-plateforme-0811.mjs", import.meta.url)), "preuve sur Postgres jetable présente");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ le compte Leboncoin relevé est connu ; deux comptes ne se mélangent jamais");
process.exit(ko ? 1 : 0);
