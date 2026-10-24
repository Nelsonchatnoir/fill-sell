// ═══════════════════════════════════════════════════════════════════════════
// RÉPARATION 24/10 soir (lot « zéro blocage », A2) — thibault : les copies Depop complétées, puis relancées
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/reparations/20261024_thibault_copies_depop.mjs            → écrit le SQL (essai à blanc : ROLLBACK)
//   node scripts/reparations/20261024_thibault_copies_depop.mjs --appliquer → écrit le SQL avec COMMIT
// Même règle que get-pending-jobs (_shared/copie-republication-depop.js, selftest copie-republication-depop) :
// chaque champ manquant vient du dépôt FillSell de la même annonce, puis de l'annonce en ligne relevée, puis de la
// fiche — jamais par-dessus une valeur de la copie (les ports que Thibault a saisis restent les siens). Une copie
// complète repasse en file (pending) ; une copie encore incomplète n'est PAS relancée (elle reste en pause).
// Le contrôle avant retrait de l'extension reste le filet : rien n'est retiré si la copie ne passe pas.
// Gardes SQL par job : même statut, même étape avant retrait, platform_fields inchangés depuis la lecture (md5).
// Sauvegarde _backup_2410_thibault_depop_copies ; inverse : 20261024_thibault_copies_depop_INVERSE.sql.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPLIQUER = process.argv.includes("--appliquer");
const { completerCopieDepop, champsManquantsCopieDepop, slugDepop } =
  await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/copie-republication-depop.js")).href);
const USER_EMAIL = "thibault.andrieux@live.fr";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-thibault-depop-"));
let nReq = 0;
function sql(requete) {
  const f = path.join(TMP, `r${++nReq}.sql`);
  fs.writeFileSync(f, requete);
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", `"${f}"`],
    { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
}
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const jobs = sql(`select j.id, j.user_id, j.inventaire_id, j.platform, j.action, j.status, j.error, j.description, j.platform_listing_id, j.listing_url,
    j.platform_fields, md5(j.platform_fields::text) as empreinte
  from public.cross_post_jobs j join auth.users u on u.id = j.user_id
  where u.email = ${lit(USER_EMAIL)} and j.platform = 'depop' and j.action = 'republish'
    and j.status in ('needs_user', 'pending')
    and coalesce(j.platform_fields ->> 'republish_step', 'a_capturer') in ('a_capturer', 'captured')
    and coalesce(j.platform_fields ->> 'needs_user_source', '') <> 'connexion'
    and not (j.platform_fields ? 'depop_interdit')`);
const aTraiter = jobs.filter((j) => champsManquantsCopieDepop(j).length);
const ids = [...new Set(aTraiter.map((j) => j.inventaire_id))];
const depots = ids.length ? sql(`select id, user_id, inventaire_id, platform, action, status, description, platform_listing_id, listing_url, published_at, created_at, platform_fields
  from public.cross_post_jobs where platform = 'depop' and action = 'publish' and inventaire_id in (${ids.join(",")})`) : [];
const slugs = [...new Set(aTraiter.map((j) => slugDepop(j.platform_listing_id) || slugDepop(j.listing_url)).filter(Boolean))];
const captures = slugs.length ? sql(`select listing_id, capture from public.annonces_plateforme where platform = 'depop' and listing_id in (${slugs.map(lit).join(",")})`) : [];
const fiches = ids.length ? sql(`select id, description, attributs from public.inventaire where id in (${ids.join(",")})`) : [];
const captureDe = new Map(captures.map((c) => [String(c.listing_id).toLowerCase(), c.capture]));
const ficheDe = new Map(fiches.map((f) => [String(f.id), { description: f.description, etat: f.attributs?.etat ?? null }]));

const maintenant = new Date().toISOString();
const blocs = [];
const bilan = { lus: jobs.length, a_completer: aTraiter.length, completes: 0, encore_incomplets: [] };
for (const j of aTraiter) {
  const slug = slugDepop(j.platform_listing_id) || slugDepop(j.listing_url);
  const r = completerCopieDepop({ job: j, depots: depots.filter((d) => String(d.inventaire_id) === String(j.inventaire_id)),
    capture: slug ? captureDe.get(slug) ?? null : null, fiche: ficheDe.get(String(j.inventaire_id)) ?? null, le: maintenant });
  if (!r || r.manquants.length) { bilan.encore_incomplets.push({ id: j.id.slice(0, 8), manquants: r ? r.manquants : champsManquantsCopieDepop(j) }); continue; }
  bilan.completes++;
  const pf = { ...r.platform_fields };
  for (const k of ["needs_user_source", "needsUserField", "needsUserAttempts", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "next_action_after", "processing_since", "republish_prevol_manquants"]) delete pf[k];
  const archives = Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees : [];
  pf.erreurs_archivees = [...archives, { le: maintenant, statut: j.status, erreur: String(j.error ?? "").trim().slice(0, 600) || "copie Depop incomplète (description / rayon / état / port)", par: "réparation (lot zéro blocage) — copie complétée" }];
  pf.relance_support = { le: maintenant, par: "Claude — lot « zéro blocage » (24/10 soir)", cause: "copie recopiée du job de suivi du relevé (vide) au lieu du dépôt FillSell", pose_par: "scripts/reparations/20261024_thibault_copies_depop.mjs" };
  const desc = r.description ? `description = ${lit(r.description)}, ` : "";
  blocs.push(`  UPDATE public.cross_post_jobs SET ${desc}status = 'pending', error = NULL, platform_fields = ${lit(JSON.stringify(pf))}::jsonb
   WHERE id = ${lit(j.id)} AND status = ${lit(j.status)} AND md5(platform_fields::text) = ${lit(j.empreinte)}
     AND coalesce(platform_fields ->> 'republish_step', 'a_capturer') IN ('a_capturer', 'captured');
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'job % : % ligne(s) — rien n''est fait', ${lit(j.id.slice(0, 8))}, n; END IF;`);
}
const idsSql = aTraiter.filter((j) => !bilan.encore_incomplets.some((x) => j.id.startsWith(x.id))).map((j) => lit(j.id)).join(", ");
const script = `-- GÉNÉRÉ par scripts/reparations/20261024_thibault_copies_depop.mjs le ${maintenant} — ${bilan.completes} copie(s) complétée(s).
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2410_thibault_depop_copies AS SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_thibault_depop_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_thibault_depop_copies FROM PUBLIC, anon, authenticated;
${idsSql ? `INSERT INTO public._backup_2410_thibault_depop_copies SELECT now(), c.* FROM public.cross_post_jobs c WHERE c.id IN (${idsSql});` : ""}
DO $$
DECLARE n integer; total integer := 0;
BEGIN
${blocs.join("\n")}
  RAISE NOTICE 'copies complétées et relancées : %', total;
END $$;
SELECT count(*) FILTER (WHERE status = 'pending') AS en_file, count(*) AS total,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = (SELECT id FROM auth.users WHERE email = ${lit(USER_EMAIL)}) AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs WHERE id IN (${idsSql || "NULL"});
${APPLIQUER ? "COMMIT;" : "ROLLBACK;"}
`;
const dest = path.join(RACINE, "scripts", "reparations", `20261024_thibault_copies_depop_${APPLIQUER ? "APPLIQUE" : "ESSAI"}.sql`);
fs.writeFileSync(dest, script);
console.log(JSON.stringify(bilan));
console.log(`SQL écrit : ${path.relative(RACINE, dest)}`);
