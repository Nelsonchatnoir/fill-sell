// Autotest VERROU : LA RETOUCHE EST RÉSERVÉE AVANT D'ÊTRE LANCÉE ; UNE « DESCRIPTION » « $17b » N'EST NI UN TEXTE NI UNE
// LECTURE (21/11/2026, décisions de Nico, points 1 à 3)
//
//     node --import ./scripts/loader-ext.mjs scripts/retouche-reservee-2111-selftest.mjs
//
// Cas réels (lus en base le 21/11) :
//   · compte 0c97dc8b (quota Pro de 20) : 22 retouches le 20/11 de 23:28 à 23:32 — generate-listing comptait, lançait
//     l'appel image, n'écrivait la ligne qu'à la fin : les retouches 20, 21 et 22 sont parties quand 19 étaient comptées ;
//   · compte 52f5dc70 : 5 fiches lues avec la « description » « $17b », « $17d » (référence du flux Next.js de Vinted),
//     l'IA a rédigé à la place du vendeur, 6 publications en file avec ce texte.
// Ce qu'il prouve :
//   1. generate-listing réserve la retouche (reserver_retouche) AVANT l'appel image, complète la MÊME ligne à la fin,
//      garde le décompte d'avant si la réservation est indisponible (et n'y compte jamais une retouche rendue) ;
//   2. la migration : un seul décompte (retouches_consommees) lu par quotas_etat et la réservation, verrou par compte,
//      réservée au serveur ; le script qui rend les 22 retouches (sauvegarde, inverse, gardes) ;
//   3. « $17b » : ni texte (descriptionIllisible), ni lecture (lectureOrigineEnAttente attend), jamais écrite par l'app ;
//      la réparation des 8 fiches (sauvegarde, inverse, lecture redemandée).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

console.log("1. generate-listing réserve la retouche");
{
  const gl = lire("supabase/functions/generate-listing/index.ts");
  const iResa = gl.indexOf('adminClient.rpc("reserver_retouche"');
  const iImage = gl.indexOf("// ── Step 1 & 2: Photo processing");
  ok(iResa > 0 && iResa < iImage, "la réservation passe AVANT tout appel image");
  ok(/p_user: user\.id, p_quota: quotaRetouche, p_depuis: borne,/.test(gl), "… avec le quota et la borne de toujours (palier du profil, quotas_retouche_depuis)");
  ok(/reservationRetoucheId = String\(\(resa as Record<string, unknown>\)\.id \?\? ""\) \|\| null;/.test(gl), "la ligne réservée est retenue");
  ok(/reservationRetoucheId\s*\n\s*\? adminClient\.from\("usage_logs"\)\.update\(\{ metadata: ligneRetouche\.metadata \}\)\.eq\("id", reservationRetoucheId\)\.eq\("user_id", user\.id\)\s*\n\s*: adminClient\.from\("usage_logs"\)\.insert\(ligneRetouche\)/.test(gl),
    "à la fin : la MÊME ligne est complétée (livrée ou non), jamais deux ; sans réservation, l'insertion d'avant");
  ok(/reserver_retouche : \$\{resaErr\?\.message \?\? "réponse vide"\} — décompte d'avant/.test(gl) && /\.is\("metadata->>hors_quota", null\)/.test(gl),
    "réservation indisponible : le décompte d'avant, sans les retouches rendues");
  ok(/if \(retouchesFaites !== -1 && \(retouchesFaites \?\? 0\) >= quotaRetouche\) \{\s*\n\s*await refundGenerateFn\?\.\("quota_retouche"\);/.test(gl), "quota atteint : le refus nommé d'avant (quota_retouche_atteint)");
}

console.log("2. la migration et le script des retouches rendues");
{
  const m = lire("supabase/migrations/20261121120000_retouche_reservee.sql");
  ok(/^BEGIN;$/m.test(m) && /^COMMIT;$/m.test(m), "une seule transaction");
  ok(/FUNCTION public\.retouches_consommees\(p_user uuid, p_depuis timestamp with time zone\)/.test(m)
    && /\(u\.metadata->>'delivered'\) IS DISTINCT FROM 'false'/.test(m) && /NOT \(u\.metadata \? 'hors_quota'\)/.test(m)
    && /interval '10 minutes'/.test(m), "un seul décompte : livrées (règle du 01/10) + réservées en cours, jamais une rendue ni une réservation sans suite (10 min)");
  ok(/pg_advisory_xact_lock\(hashtextextended\('reserver_retouche:' \|\| p_user::text, 0\)\)/.test(m) && /RAISE EXCEPTION 'réservé au serveur' USING ERRCODE = '42501'/.test(m),
    "une réservation à la fois par compte ; jamais une session de l'app");
  ok((m.match(/REVOKE ALL ON FUNCTION public\.(reserver_retouche|retouches_consommees)\([^)]*\) FROM PUBLIC, anon, authenticated;/g) ?? []).length === 2
    && (m.match(/GRANT EXECUTE ON FUNCTION public\.(reserver_retouche|retouches_consommees)\([^)]*\) TO service_role;/g) ?? []).length === 2, "EXECUTE : service_role seulement");
  ok(/v_cr := retouches_consommees\(v_user, GREATEST\(v_cycle,/.test(m) && !/SELECT count\(\*\)::int INTO v_cr/.test(m), "quotas_etat lit le même décompte");
  const prod = lire("scripts/quotas/fixtures/prod-2111-quotas-etat.sql");
  const inv = lire("supabase/rollbacks/20261121120000_retouche_reservee_INVERSE.sql");
  const corps = (t) => t.slice(t.indexOf("CREATE OR REPLACE FUNCTION public.quotas_etat"), t.indexOf("$function$;", t.indexOf("CREATE OR REPLACE FUNCTION public.quotas_etat")));
  ok(corps(inv).length > 4000 && corps(inv) === corps(prod), "l'inverse = quotas_etat de prod relue le 21/11 (md5 91ce0ea8…)");
  const s = lire("scripts/reparations/20261121_retouches_rendues_0c97dc8b.sql");
  const si = lire("scripts/reparations/20261121_retouches_rendues_0c97dc8b_INVERSE.sql");
  ok(/_backup_2111_retouches_0c97dc8b/.test(s) && /<> 22 THEN RAISE EXCEPTION/.test(s) && /retouches_consommees\(uuid,timestamp with time zone\)'\) IS NULL/.test(s)
    && /'hors_quota', jsonb_build_object\(\s*\n?\s*'motif', 'retouche_non_demandee_lot'/.test(s), "22 retouches rendues : sauvegarde, gardes (migration passée, 22 exactement), lignes gardées (hors_quota)");
  ok(/SET metadata = b\.metadata FROM public\._backup_2111_retouches_0c97dc8b b/.test(si), "… et son inverse");
}

console.log("3. « $17b » n'est ni un texte ni une lecture");
{
  const C = await charger("supabase/functions/_shared/contenu-fiche.js");
  ok(C.descriptionIllisible("$17b") && C.descriptionIllisible(" $17d ") && C.descriptionIllisible("$178"), "« $17b », « $17d », « $178 » : illisibles");
  ok(!C.descriptionIllisible("Porté deux fois.") && !C.descriptionIllisible("$20 le lot de deux") && !C.descriptionIllisible(""), "un vrai texte (même commençant par « $ ») : lisible");
  const f = { origine: "vinted_sync", description: "$17b", photos: ["a", "b"], attributs: {} };
  const a = C.lectureOrigineEnAttente(f, [], { descriptionLueLe: "2026-11-20T22:20:52Z", origineLueLe: "2026-11-20T22:15:25Z" });
  ok(a?.plateforme === "vinted" && a.manque.includes("description"), "fiche Vinted « $17b », pourtant « lue » : elle ATTEND une vraie lecture (get-pending-jobs retient, generate-listing refuse)");
  ok(C.lectureOrigineEnAttente({ ...f, description: "Mug neuf avec étiquette." }, [], { descriptionLueLe: "x" }) === null, "un vrai texte lu : rien à attendre (inchangé)");
  ok(C.lectureOrigineEnAttente({ ...f, disparu_le: "2026-11-21" }, [], {}) === null, "annonce disparue : rien à lire (inchangé)");
  ok(C.lectureOrigineEnAttente({ ...f, attributs: { description_sans_lecture: { v: "redigee", at: "x" } } }, [], { descriptionLueLe: "x" }) === null, "« Faire rédiger » choisi : on n'attend plus (inchangé)");
  ok(C.contenuAImposer({ platform: "beebs", description: "Mug de l'IA", created_at: "2026-11-20T22:23:00Z" }, { ...f }, { descriptionLueLe: "2026-11-20T22:30:00Z" }).description === undefined,
    "« $17b » n'est jamais imposé à une copie");
  const T = await charger("src/publication/texteDuVendeur.js");
  ok(T.aCompleter({ origine: "vinted_sync", vinted_item_id: "1", vinted_catalog_id: 5, description: "$17b" }), "l'app relit une fiche « $17b »");
  const ecrits = [];
  const sb = { from: () => { const q = { update: (p) => { ecrits.push(p); return q; }, select: () => q, eq: () => q, or: () => q, is: () => q, gte: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }), then: (r) => Promise.resolve({ data: [] }).then(r) }; return q; }, rpc: () => Promise.resolve({}) };
  const r = await T.completerTexteDuVendeur({ id: 7, origine: "vinted_sync", vinted_item_id: "123", vinted_catalog_id: 5, description: "" },
    { supabase: sb, userId: "u", extensionVinted: true, lireDetailVinted: async () => ({ success: true, source: "page_publique", description: "$17d", natif: {}, publique: {} }) });
  ok(!ecrits.some((p) => "description" in p) && r.note === "vinted_echec" && r.motif === "description_illisible" && !r.vintedLue,
    "une extension ≤ 0.6.195 qui rend « $17d » : rien d'écrit, « vinted_echec » (motif description_illisible), la demande d'origine reste ouverte");
  const tv = lire("src/publication/texteDuVendeur.js");
  ok(/\.or\("description\.is\.null,description\.eq\.,description\.match\.\^\\\\s\*\\\\\$\[0-9a-zA-Z\]\*\\\\s\*\$"\)/.test(tv), "le vrai texte relu remplace une fiche « $17b » (filtre de l'écriture)");
  const bg = lire("chrome-extension/background.js");
  ok(/description\.match\.\$\{encodeURIComponent\("\^\\\\s\*\\\\\$\[0-9a-zA-Z\]\*\\\\s\*\$"\)\}/.test(bg), "l'extension aussi (ecrireLecturePagePublique)");
  const rep = lire("scripts/reparations/20261121_description_reference_vinted.sql");
  const repi = lire("scripts/reparations/20261121_description_reference_vinted_INVERSE.sql");
  ok(/_backup_2111_description_reference/.test(rep) && /_backup_2111_lecture_reference/.test(rep) && /<> 8 THEN RAISE EXCEPTION/.test(rep)
    && /SET description = NULL, attributs = i\.attributs - 'description_source'/.test(rep) && /SET faite_le = NULL/.test(rep),
    "réparation des 8 fiches : sauvegardes, garde (8 exactement), fiche sans description, lecture redemandée — rien d'autre");
  ok(/NULLIF\(btrim\(i\.description\), ''\) IS NULL/.test(repi) && /DROP TABLE public\._backup_2111_description_reference;/.test(repi), "… et son inverse (jamais par-dessus un texte écrit depuis)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
