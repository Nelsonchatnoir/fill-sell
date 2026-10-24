// ═══════════════════════════════════════════════════════════════════════════
// MESURE « ZÉRO BLOCAGE » (lot du 24/10, Nico) — LECTURE SEULE
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/zero-blocage-mesure.mjs [--libelle avant|apres] [--depuis 2026-09-18] [--jours-actifs 14]
// Trois mesures, par cause (classement : supabase/functions/_shared/cause-blocage.js) :
//   1. ARRÊTS EN COURS — jobs needs_user / failed, et republications retenues en file
//      par une règle de notre fait, sur les comptes actifs (extension vue depuis
//      --jours-actifs jours) ;
//   2. HISTORIQUE depuis --depuis — chaque arrêt needs_user / failed (courant ou
//      archivé dans erreurs_archivees), y compris ceux que l'utilisateur a ensuite
//      abandonnés (comptés comme ÉCHECS de notre fait, jamais comme annulations) ;
//   3. BLOCAGES DE CHAMP À LA PUBLICATION — usage_logs « champ_requis_bloquant »
//      (encart affiché à l'écran Publier) des 7 derniers jours, par plateforme et champ.
// Résultat : docs/enquetes/zero-blocage-2410/mesure-<libelle>.json (chiffres + ids, aucun texte client).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };
const LIBELLE = String(arg("libelle", "avant"));
const DEPUIS = String(arg("depuis", "2026-09-18"));
const JOURS_ACTIFS = Number(arg("jours-actifs", 14));
if (!/^\d{4}-\d{2}-\d{2}$/.test(DEPUIS) || !Number.isFinite(JOURS_ACTIFS)) throw new Error("arguments invalides");
const { causeDuTexte, blocagesDuJob, ORIGINE } = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/cause-blocage.js")).href);

// Une requête = un fichier temporaire passé par -f (jamais de SQL dans la ligne de commande : guillemets).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-zero-blocage-"));
let nRequete = 0;
function sql(requete) {
  const f = path.join(TMP, `r${++nRequete}.sql`);
  fs.writeFileSync(f, requete);
  for (let essai = 1; ; essai++) {
    try {
      const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", `"${f}"`],
        { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
    } catch (e) {
      if (essai >= 3) throw e; // la CLI échoue parfois par intermittence : deux nouveaux essais
    }
  }
}

// 1. Arrêts en cours, comptes actifs.
const ACTIFS = `p.extension_last_seen_at > now() - interval '${JOURS_ACTIFS} days'`;
const enCours = sql(`
  select j.id, j.user_id, j.platform, j.action, j.status, j.error,
         j.platform_fields->>'needs_user_source' as source, j.platform_fields->>'republish_step' as etape
    from public.cross_post_jobs j join public.profiles p on p.id = j.user_id
   where ${ACTIFS}
     and ((j.status = 'needs_user' and j.created_at > now() - interval '60 days')
          or (j.status = 'failed' and j.created_at > now() - interval '7 days')
          or (j.status = 'pending' and j.action = 'republish' and j.error ~* 'n.est plus propos[ée]e par le menu'))`);

// 2. Historique depuis DEPUIS : seuls les champs utiles, jamais les textes de fiche.
const historique = sql(`
  select j.id, j.user_id, j.platform, j.action, j.status, j.error,
         jsonb_build_object(
           'needs_user_source', j.platform_fields->'needs_user_source',
           'abandon_utilisateur', j.platform_fields->'abandon_utilisateur',
           'erreurs_archivees', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                                   from jsonb_array_elements(case when jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array'
                                                                  then j.platform_fields->'erreurs_archivees' else '[]'::jsonb end) x
                                  where x->>'statut' in ('needs_user', 'failed'))) as platform_fields
    from public.cross_post_jobs j
   where j.created_at >= '${DEPUIS}'
     and (j.status in ('needs_user', 'failed')
          or (jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array'
              and exists (select 1 from jsonb_array_elements(j.platform_fields->'erreurs_archivees') x
                           where x->>'statut' in ('needs_user', 'failed'))))`);

// 3. Encarts « champ requis » affichés à l'écran Publier (7 jours).
const champs = sql(`
  select l.metadata->>'platform' as platform,
         coalesce(l.metadata->>'champ_cle', l.metadata->'champs'->>0) as champ,
         l.metadata->>'issue' as issue, count(*)::int as n, count(distinct l.user_id)::int as comptes
    from public.usage_logs l
   where l.feature = 'champ_requis_bloquant' and l.created_at > now() - interval '7 days'
   group by 1, 2, 3`);

const cle = (...xs) => xs.join(" · ");
const compter = (acc, k, user) => { acc[k] ??= { n: 0, comptes: new Set() }; acc[k].n++; acc[k].comptes.add(user); };
const aplatir = (acc) => Object.fromEntries(Object.entries(acc).sort((a, b) => b[1].n - a[1].n)
  .map(([k, v]) => [k, { n: v.n, comptes: v.comptes.size }]));

const parCauseEnCours = {};
const idsNous = {};
for (const j of enCours) {
  const c = causeDuTexte({ texte: j.error, source: j.source, platform: j.platform });
  compter(parCauseEnCours, cle(c.origine, c.cause, j.platform, j.action), j.user_id);
  if (c.origine === ORIGINE.NOUS) (idsNous[cle(c.cause, j.platform, j.action)] ??= []).push(j.id);
}
const parCauseHistorique = {};
const abandonsNous = {};
for (const j of historique) {
  const vus = new Set();
  for (const b of blocagesDuJob(j)) {
    const k = cle(b.origine, b.cause, j.platform, j.action);
    if (vus.has(k)) continue; // un job compte une fois par cause
    vus.add(k);
    compter(parCauseHistorique, k, j.user_id);
    if (b.origine === ORIGINE.NOUS && b.abandonne) compter(abandonsNous, cle(b.cause, j.platform, j.action), j.user_id);
  }
}
const affiches = champs.filter((r) => r.issue === "affiche" || r.issue === "bloque_au_clic")
  .sort((a, b) => b.n - a.n).map((r) => ({ platform: r.platform, champ: r.champ, issue: r.issue, n: r.n, comptes: r.comptes }));

const total = (o, origine) => Object.entries(o).filter(([k]) => k.startsWith(`${origine} ·`)).reduce((s, [, v]) => s + v.n, 0);
const resultat = {
  mesure: "zéro blocage", libelle: LIBELLE, fait_le: new Date().toISOString(), depuis: DEPUIS, jours_actifs: JOURS_ACTIFS,
  en_cours: { total_nous: total(aplatir(parCauseEnCours), ORIGINE.NOUS), par_cause: aplatir(parCauseEnCours), ids_nous: idsNous },
  historique: { jobs: historique.length, total_nous: total(aplatir(parCauseHistorique), ORIGINE.NOUS),
                par_cause: aplatir(parCauseHistorique), abandons_apres_echec_nous: aplatir(abandonsNous) },
  encarts_publication_7j: { total_affiches: affiches.filter((r) => r.issue === "affiche").reduce((s, r) => s + r.n, 0), lignes: affiches },
};
const dir = path.join(RACINE, "docs", "enquetes", "zero-blocage-2410");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `mesure-${LIBELLE}.json`), `${JSON.stringify(resultat, null, 1)}\n`);
console.log(`ARRÊTS EN COURS (comptes actifs) — de notre fait : ${resultat.en_cours.total_nous}`);
console.table(Object.fromEntries(Object.entries(resultat.en_cours.par_cause).slice(0, 40)));
console.log(`HISTORIQUE depuis ${DEPUIS} (${historique.length} jobs) — arrêts de notre fait : ${resultat.historique.total_nous}`);
console.table(Object.fromEntries(Object.entries(resultat.historique.par_cause).filter(([k]) => k.startsWith("nous")).slice(0, 40)));
console.log("Abandons après un échec de notre fait (comptés comme échecs) :");
console.table(resultat.historique.abandons_apres_echec_nous);
console.log(`ENCARTS « champ requis » affichés à la publication (7 j) : ${resultat.encarts_publication_7j.total_affiches}`);
console.table(affiches.slice(0, 30));
