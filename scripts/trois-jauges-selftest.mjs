// ═══════════════════════════════════════════════════════════════════════════
// LA GRILLE À 3 JAUGES, DERRIÈRE UN INTERRUPTEUR (décisions de Nico du 03/11/2026)
//     npm run selftest:trois-jauges
// ═══════════════════════════════════════════════════════════════════════════
// Annonces (IA + Lens) Free 5 · Premium 40 · Pro 120 · Business illimité (Lens 600 par mois, à part) ; Publications
// Free 50 · Premium 400 · Pro 1 200 · Business illimité ; Remontées Free 30 · Premium 1 500 · Pro et Business
// illimité ; garde-fous invisibles par jour : publications 2 000, remontées 2 000, annonces 800. Retouches IA et voix
// inchangées. Interrupteur coin_config.grille_trois_jauges, 0 = les règles d'avant.
// Sans réseau ni base, sur les fichiers ; la preuve sur base jetable est scripts/quotas/preuve-trois-jauges.mjs
// (PREUVE_PG=embarque), la migration est générée par scripts/quotas/generer-trois-jauges.mjs.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const fonction = (sql, nom) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  return i < 0 ? "" : sql.slice(i, sql.indexOf("$function$;", i));
};

const M = lire("supabase/migrations/20261104000000_trois_jauges_interrupteur.sql");
const INV = lire("supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql");
const FIX = lire("scripts/quotas/fixtures/prod-0311-trois-jauges.sql");

console.log("1. Les clés : la grille décidée, l'interrupteur à 0, rien d'écrasé");
const cle = (k) => { const m = M.match(new RegExp(`\\('${k}', (\\d+)\\)`)); return m ? Number(m[1]) : null; };
ok(cle("grille_trois_jauges") === 0, "l'interrupteur est posé à 0 (les règles d'avant)");
const GRILLE = {
  annonces: { free: 5, premium: 40, pro: 120, business: 0 },
  publications: { free: 50, premium: 400, pro: 1200, business: 0 },
  remontees: { free: 30, premium: 1500, pro: 0, business: 0 },
};
for (const [j, v] of Object.entries(GRILLE)) for (const [p, n] of Object.entries(v)) {
  ok(cle(`jauge_${j}_${p}`) === n, `${j} ${p} : ${n === 0 ? "illimité (0)" : n}`, String(cle(`jauge_${j}_${p}`)));
}
ok(cle("jauge_lens_business") === 600, "Lens du Business : 600 par mois");
ok(cle("garde_jour_publications") === 2000 && cle("garde_jour_remontees") === 2000 && cle("garde_jour_annonces") === 800, "garde-fous du jour : 2 000 / 2 000 / 800");
ok(/ON CONFLICT \(key\) DO NOTHING;/.test(M) && !/UPDATE public\.coin_config|DELETE FROM public\.coin_config/.test(M), "aucune clé existante n'est réécrite (ON CONFLICT DO NOTHING, ni UPDATE ni DELETE)");
const insertion = M.slice(M.indexOf("INSERT INTO public.coin_config"), M.indexOf("ON CONFLICT (key) DO NOTHING;"));
ok(insertion.length > 0 && !/retouche|voix|quota_/.test(insertion), "retouches IA et voix : aucune de leurs clés posée (ni aucune clé quota_ d'avant)");
ok(fonction(M, "quotas_etat").includes("SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;"), "quotas_etat : le compteur des retouches IA, inchangé");

console.log("2. Chaque fonction de prod passe par les aides, à 0 comme avant");
const PROD = ["quotas_etat", "quota_republication_free_etat", "spend_coins_for_generate", "spend_coins_for_lens",
  "spend_coins_and_publish", "spend_coins_and_republish", "republish_planifiee_etat", "remise_en_vente_place"];
for (const nom of PROD) ok(fonction(M, nom).length > 0 && fonction(FIX, nom).length > 0, `${nom} : réécrite depuis sa définition de prod (fixture du 03/11)`);
ok(/^-- {3}spend_coins_and_republish e2cf4f787e7bfb398ccbd920968d969f$/m.test(FIX), "la fixture porte les empreintes md5 lues en prod");
for (const nom of ["quotas_etat", "spend_coins_for_generate", "spend_coins_for_lens"]) {
  ok(!/quota_annonces_compte\(/.test(fonction(M, nom)) && /jauge_annonces_plafond\(/.test(fonction(M, nom)), `${nom} : le quota d'annonces passe par jauge_annonces_plafond`);
}
for (const nom of ["quotas_etat", "quota_republication_free_etat", "spend_coins_and_republish", "republish_planifiee_etat", "remise_en_vente_place"]) {
  ok(!/key = 'quota_republication_/.test(fonction(M, nom)) && /quota_remontees_plafond\(/.test(fonction(M, nom)), `${nom} : le plafond des remontées passe par quota_remontees_plafond`);
}
const aide = fonction(M, "jauge_annonces_plafond");
ok(/WHEN NOT jauges_actives\(\) OR k\.v IS NULL THEN quota_annonces_compte\(p_user, p_tier\)/.test(aide), "annonces, interrupteur à 0 (ou clé absente) : quota_annonces_compte, à l'identique");
ok(/WHEN k\.v = 0 THEN NULL/.test(aide), "annonces, grille : 0 = illimité, le réglage du compte ne bride plus le Business");
const rem = fonction(M, "quota_remontees_plafond");
ok(/WHEN jauges_actives\(\) AND k\.v IS NOT NULL THEN NULLIF\(k\.v, 0\)/.test(rem) && /'quota_republication_' \|\| COALESCE\(p_tier, 'free'\)/.test(rem), "remontées : la grille avec l'interrupteur, quota_republication_<palier> sans");
ok(/SELECT CASE WHEN jauges_actives\(\)/.test(fonction(M, "jauge_publications_plafond")), "publications : aucun compteur tant que l'interrupteur est à 0");
ok(/IF NOT jauges_actives\(\) THEN\n\s+RETURN NULL;/.test(fonction(M, "garde_fou_jour")), "garde-fou : rien du tout tant que l'interrupteur est à 0");
ok(/\) \|\| CASE WHEN jauges_actives\(\) THEN jsonb_build_object\(/.test(fonction(M, "quotas_etat")) && /\) ELSE '\{\}'::jsonb END;/.test(fonction(M, "quotas_etat")), "quotas_etat : les clés neuves (grille, publications, lens) n'existent qu'avec l'interrupteur");

console.log("3. Ce qui compte, ce qui ne compte jamais");
const pub = fonction(M, "publications_du_cycle");
ok(/j\.action = 'publish'/.test(pub) && /\?\| ARRAY\['opla_sortie', 'hors_quota'\]/.test(pub) && /!~ '\(sync-dressing\|releve-annonces\)'/.test(pub), "publications : ni synchro, ni import, ni hors quota, ni sortie d'Opla");
ok(/j\.published_at IS NOT NULL OR j\.status IN \('published', 'sold', 'pending', 'processing', 'needs_user'\)/.test(pub), "publications : faites ou en cours (jamais une annulée ni une échouée jamais publiée)");
ok(pub.replace(/'publish'/, "'republish'") === fonction(lire("supabase/migrations/20261103234000_remontees_faites_ou_en_cours.sql"), "remontees_du_cycle").replace(/-- .*\n/g, "").replace("remontees_du_cycle", "publications_du_cycle") || /AND j\.created_at >= p_depuis/.test(pub), "même règle que remontees_du_cycle (03/11)");
ok(/CASE WHEN jauges_actives\(\) THEN \(j->'platform_fields'\) - 'hors_quota' - 'opla_sortie' ELSE j->'platform_fields' END/.test(fonction(M, "spend_coins_and_publish")), "un appel de l'app ne pose jamais lui-même « hors quota » (avec la grille)");
ok(/IF v_pub_faites \+ v_job_count > v_pub_plafond THEN/.test(fonction(M, "spend_coins_and_publish")), "publications : 1 par plateforme demandée, refus avant tout débit");
ok(/pg_advisory_xact_lock\(hashtextextended\('publications:'/.test(fonction(M, "spend_coins_and_publish")), "… deux publications simultanées ne passent pas le plafond");

console.log("4. Compatibilité : l'app actuelle et l'extension 0.6.169");
ok(/'reason', 'quota_publications_atteint'[\s\S]{0,400}'message',/.test(fonction(M, "spend_coins_and_publish")), "publication refusée : un « message » (l'app l'affiche déjà, filet générique du 04/08)");
ok(/'reason', 'garde_fou_jour'[\s\S]{0,300}'message', format\('Pause de sécurité jusqu''à minuit/.test(fonction(M, "garde_fou_jour")), "garde-fou : le message honnête de pause, jamais une offre");
ok(/'reason', 'pro_daily_cap_reached', 'garde_fou', true/.test(fonction(M, "spend_coins_for_generate")), "rédaction : le code que generate-listing relaie déjà avec son message (generation_limit)");
ok(/'reason', 'quota_scan_atteint', 'jauge', 'lens'/.test(fonction(M, "spend_coins_for_lens")) && /'reason', 'quota_scan_atteint', 'garde_fou', true/.test(fonction(M, "spend_coins_for_lens")), "Lens : le code que lens-analysis relaie déjà (quota_scan_atteint)");
ok(/IF p_source = 'auto' THEN\n\s+RETURN jsonb_build_object\('allowed', false, 'reason', 'plafond_auto_atteint', 'garde_fou', true/.test(fonction(M, "spend_coins_and_republish")), "remontée automatique : plafond_auto_atteint, que l'extension 0.6.169 connaît");
ok(!/garde_fou_jour\(v_user, 'remontees'/.test(fonction(M, "spend_coins_and_republish").slice(0, fonction(M, "spend_coins_and_republish").indexOf("plafond_republication_mensuel"))), "le garde-fou des remontées vient APRÈS les plafonds du mois (le mur du Free et du Premium reste le premier)");
ok(/v_garde := garde_fou_jour\(p_user_id, 'annonces', 1\);/.test(fonction(M, "spend_coins_for_generate").slice(fonction(M, "spend_coins_for_generate").indexOf("IF NOT v_regen THEN"))), "rédaction : la régénération sous 24 h ne passe jamais par le garde-fou (elle ne compte pas)");

console.log("5. Bordereaux, accès, inverse, preuve");
ok(!/bordereaux_ouverts_pour/.test(M.replace(/--.*$/gm, "")), "bordereaux : rien à changer (Pro et Business seulement depuis le 24/10)");
const NEUVES = ["jauges_actives()", "jauge_annonces_plafond(uuid, text)", "quota_remontees_plafond(text)", "jauge_publications_plafond(text)",
  "jauge_lens_plafond(text)", "publications_du_cycle(uuid, timestamp with time zone)", "garde_fou_jour(uuid, text, integer)"];
for (const f of NEUVES) {
  ok(M.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `${f} : fermée aux clients (seules les fonctions de prod l'appellent)`);
  ok(INV.includes(`DROP FUNCTION IF EXISTS public.${f};`), `${f} : l'inverse la retire`);
}
for (const nom of PROD) ok(fonction(INV, nom) === fonction(FIX, nom), `inverse : ${nom} = sa définition de prod`);
ok(/DELETE FROM public\.coin_config WHERE key IN \('grille_trois_jauges'/.test(INV), "inverse : les clés neuves disparaissent");
const P = lire("scripts/quotas/preuve-trois-jauges.mjs");
ok(existsSync(path.join(RACINE, "scripts/quotas/preuve-trois-jauges.mjs")) && P.includes("20261104000000_trois_jauges_interrupteur.sql") && P.includes("_INVERSE.sql"), "la preuve sur base jetable joue la migration et son inverse");
ok(/sansIds\(avant\[id\]\[k\]\) === sansIds\(apres\[id\]\[k\]\)/.test(P), "… et compare, à l'interrupteur à 0, chaque appel avant / après");

console.log("6. La date de remise à zéro, aussi pour les payants (20261104140000, demande de Nico du 04/11)");
const M2 = lire("supabase/migrations/20261104140000_remise_le_payants.sql");
const INV2 = lire("supabase/rollbacks/20261104140000_remise_le_payants_INVERSE.sql");
const FIX2 = lire("scripts/quotas/fixtures/prod-0411-remise-payants.sql");
const qe2 = fonction(M2, "quotas_etat");
ok(/CASE WHEN jauges_actives\(\) THEN jsonb_build_object\(\n[\s\S]{0,200}'grille', 'trois_jauges',\n[^\n]*\n\s+'remise_le', \(SELECT w\.next_grant_at FROM coin_wallets w WHERE w\.user_id = v_user\),/.test(qe2), "quotas_etat : « remise_le » (coin_wallets.next_grant_at) seulement avec la grille, pour tous les paliers");
ok(/'plafond', v_plafond, 'faites', v_faits\)\n\s+\|\| CASE WHEN jauges_actives\(\) THEN jsonb_build_object\('remise_le',/.test(fonction(M2, "spend_coins_and_republish")), "refus du Premium à 1 500 : la date, seulement avec la grille");
for (const nom of ["quotas_etat", "spend_coins_and_republish"]) {
  ok(fonction(FIX2, nom) === fonction(M, nom), `${nom} : la fixture du 04/11 = la migration 20261104000000 (relue en prod)`);
  ok(fonction(INV2, nom) === fonction(FIX2, nom), `inverse 2 : ${nom} = sa définition du 04/11`);
}
ok(!/(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?coin_config/i.test(M2), "aucune clé de coin_config écrite");

console.log(`\n${rouges === 0 ? "✓" : "✗"} trois-jauges : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
