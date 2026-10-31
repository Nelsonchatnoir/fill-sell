// ═══════════════════════════════════════════════════════════════════════════
// 31/10 (décision 7a de Nico) — UNE ANNONCE VISÉE PAR UNE REPUBLICATION ENGAGÉE N'EST JAMAIS DATÉE DISPARUE
// `npm run selftest:republication-engagee-numero`
// ═══════════════════════════════════════════════════════════════════════════
// La migration 20261031150000 (appliquée le 31/10 à 14:45) ajoute la garde PAR NUMÉRO aux trois chemins de relevé, sans
// rien changer d'autre. Ce selftest relit la migration et son inverse : la fonction neuve (mêmes étapes que
// republication_engagee, toutes les clés du numéro visé), les trois appels, et que l'inverse rend exactement les
// fonctions d'avant (même texte, ligne pour ligne, hors les lignes ajoutées).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}`); } };

const M = lire("supabase/migrations/20261031150000_republication_engagee_par_numero.sql");
const I = lire("supabase/rollbacks/20261031150000_republication_engagee_par_numero_INVERSE.sql");

console.log("1. La fonction : la republication ENGAGÉE dont l'annonce visée porte ce numéro");
const f = M.slice(M.indexOf("create or replace function public.republication_engagee_numero"), M.indexOf("$function$;") + 11);
ok(/stable security definer/.test(f) && /set search_path to 'public', 'pg_temp'/.test(f), "stable, security definer, search_path fixé");
ok(/j\.action = 'republish' and j\.status in \('pending', 'processing', 'needs_user'\)/.test(f), "republication non terminale");
ok(/coalesce\(j\.platform_fields ->> 'republish_step', ''\) in \('captured', 'deleted'\)\s*\n\s*or public\.republication_retrait_engage\(j\.platform_fields\)/.test(f),
  "engagée = captured, deleted ou retrait engagé (exactement republication_engagee) ; a_capturer exclue");
for (const cle of ["nullif(btrim(j.platform_listing_id), '')", "j.platform_fields ->> 'old_platform_listing_id'",
  "j.platform_fields #>> '{republish_snapshot,platform_listing_id}'", "j.platform_fields ->> 'vinted_item_id'",
  "public.annonce_id_de_job(j.platform_listing_id, j.listing_url)"]) ok(f.includes(cle), `numéro visé lu dans ${cle}`);
ok(/nullif\(btrim\(p_numero\), ''\) is not null and j\.user_id = p_user and j\.platform = p_platform/.test(f), "même compte, même plateforme ; jamais un numéro vide");
ok(/revoke all on function public\.republication_engagee_numero\(uuid, text, text\) from public, anon, authenticated;/.test(M), "aucun droit pour l'app");

console.log("2. Les trois chemins de relevé : la garde par fiche ET par numéro");
ok(/AND public\.republication_engagee\(r\.user_id, ap\.inventaire_id, r\.platform\) IS NULL\n.*\n\s*AND public\.republication_engagee_numero\(r\.user_id, r\.platform, ap\.listing_id\) IS NULL/.test(M),
  "constater_absences_releve : ni la fiche, ni le numéro de l'annonce");
ok(/v_rep := coalesce\(public\.republication_engagee\(new\.user_id, new\.inventaire_id, new\.platform\),\s*\n\s*public\.republication_engagee_numero\(new\.user_id, new\.platform, public\.annonce_id_de_job\(new\.platform_listing_id, new\.listing_url\)\)\);/.test(M),
  "cross_post_jobs_alerte_tenue : signal neuf effacé si la fiche OU le numéro est en republication engagée");
ok(/v_rep := coalesce\(public\.republication_engagee\(new\.user_id, new\.id, 'vinted'\),\s*\n\s*public\.republication_engagee_numero\(new\.user_id, 'vinted', new\.vinted_item_id::text\)\);/.test(M),
  "inventaire_disparu_garde_republication : la fiche OU son numéro Vinted");

console.log("3. L'inverse rend exactement les fonctions d'avant");
const sans = (txt) => txt.split("\n").filter((l) => !/republication_engagee_numero|décision 7a de Nico|^\s*public\.republication_engagee_numero/.test(l)).join("\n");
for (const nom of ["constater_absences_releve", "cross_post_jobs_alerte_tenue", "inventaire_disparu_garde_republication"]) {
  const bloc = (t) => { const d = t.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return t.slice(d, t.indexOf("$function$;", t.indexOf("AS $function$", d) + 13) + 11); };
  const avant = bloc(I), apres = bloc(M);
  const apresSans = sans(apres).replace("v_rep := coalesce(public.republication_engagee(", "v_rep := public.republication_engagee(")
    .replace(/(public\.republication_engagee\(new\.user_id, new\.inventaire_id, new\.platform\)),/, "$1;").replace(/(public\.republication_engagee\(new\.user_id, new\.id, 'vinted'\)),/, "$1;");
  ok(avant.length > 300 && apresSans === avant, `${nom} : migration = inverse + les seules lignes de la garde par numéro`);
}
ok(/drop function if exists public\.republication_engagee_numero\(uuid, text, text\);/.test(I), "l'inverse retire la fonction ajoutée");

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
