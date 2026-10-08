// ═══════════════════════════════════════════════════════════════════════════
// Selftest « boucles fermées » (2026-10-08, matin)
//   node scripts/boucles-fermees-selftest.mjs
//
// LES CAS :
//   · Nadège (8a2eba68) : 8 954 fois « attache / job / NULL » pour UNE annonce
//     Opla, 07/10 21:26 → 22:32 UTC (moteur v2 : job sans article, boucle sans
//     contrôle de progrès, filet d'une minute) ;
//   · 44310spgl : 166 relevés Opla du veilleur en 7 jours (jusqu'à 30/h) ;
//     choupette06 : 14 relevés Beebs en une nuit ;
//   · xxewwer, josephinecerni : 117 marques effacées puis recomplétées (388
//     écritures en trop en 7 jours).
// Ce test lit les SOURCES (fonction edge, migrations, ops-digest) : chaque
// verrou doit rester en place. Les preuves en base (transactions annulées) :
// docs/reprise/terminal-boucles-0810.md.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── 1. La fonction edge : une passe qui n'aboutit pas ne repart pas sans fin ──
console.log("\n[1] rapprochement (v12) : passes inachevées comptées, arrêt borné");
const fn = lire("supabase/functions/rapprochement/index.ts");
const nombre = (nom) => Number((fn.match(new RegExp(`const ${nom} = (\\d+)`)) ?? [])[1]);
ok("PASSES_INACHEVEES_MAX = 3", nombre("PASSES_INACHEVEES_MAX") === 3, String(nombre("PASSES_INACHEVEES_MAX")));
ok("un geste en rouvre trois de plus, pas davantage (6)", nombre("PASSES_INACHEVEES_MAX_GESTE") === 6);
ok("RELANCES_MAX borné (12)", nombre("RELANCES_MAX") === 12);
const iCompte = fn.indexOf("passages: -(inachevees + 1)");
const iLire = fn.indexOf('admin.rpc("rapprochement_v3_lire"');
ok("le compteur est écrit AVANT la lecture et la passe (une invocation tuée reste comptée)", iCompte > 0 && iLire > 0 && iCompte < iLire, `${iCompte} / ${iLire}`);
ok("valeurs négatives seulement (les ≥ 0 du moteur v2 valent 0)", /Number\(compte\?\.passages\) < 0 \? -Number\(compte\?\.passages\) : 0/.test(fn));
ok("arrêt = « termine » + bilan.arret, jamais une passe de plus", /etat: "termine"[\s\S]{0,200}arret: \{ motif: "passes_inachevees"/.test(fn));
ok("l'arrêt ne vaut pas en réparation ni en simulation", /if \(!reparer && !simuler && inachevees >= PASSES_INACHEVEES_MAX\)/.test(fn));
ok("une passe qui écrit (ou n'a rien à écrire) remet le compteur à 0", /const progres = decisions\.length === 0 \|\| lotsEcrits > 0;/.test(fn) && /passages: progres \? 0 : -\(inachevees \+ 1\)/.test(fn));
ok("des photos envoyées ne sont pas une passe (compteur repris)", /passages_photos: passages, passages: -inachevees/.test(fn));
ok("aucune boucle `while (true)` dans la fonction", !/while\s*\(\s*true\s*\)/.test(fn));
ok("gestes = les déclencheurs de releve_est_geste", /DECLENCHEURS_GESTE = \["bouton", "bouton_distant", "app", "bouton:redemande", "bouton_distant:redemande", "app:redemande"\]/.test(fn));

// ── 2. Migration 20261008100000 : la même décision ne s'écrit pas en boucle ──
console.log("\n[2] migration 20261008100000 : job sans article, moteur v2, garde de la base");
const m1 = lire("supabase/migrations/20261008100000_rapprochement_jamais_la_meme_decision.sql");
ok("la bande « job » exige un article", /IF v_bande = 'job' AND v_inv IS NOT NULL THEN/.test(m1));
ok("le moteur v2 rend « obsolete »", /rapprochement_avancer[\s\S]{0,400}'etat', 'obsolete'/.test(m1));
ok("trigger BEFORE INSERT sur rapprochements", /CREATE TRIGGER rapprochements_jamais_repete\s+BEFORE INSERT ON public\.rapprochements/.test(m1));
ok("compare à la DERNIÈRE ligne de l'annonce, sur 24 h", /ORDER BY r\.created_at DESC\s+LIMIT 1;[\s\S]{0,120}interval '24 hours'/.test(m1));
ok("même décision, même auteur, même article, même job, même motif", ["d.decision = NEW.decision", "d.par = NEW.par", "d.inventaire_id IS NOT DISTINCT FROM NEW.inventaire_id", "(d.detail ->> 'job_id') IS NOT DISTINCT FROM", "(d.detail ->> 'motif') IS NOT DISTINCT FROM"].every((s) => m1.includes(s)));
ok("répétition sautée ET comptée (rapprochements_repetes)", /INSERT INTO rapprochements_repetes[\s\S]{0,400}RETURN NULL;/.test(m1));
ok("table des répétitions fermée (RLS, aucun accès anon/authenticated)", /ALTER TABLE public\.rapprochements_repetes ENABLE ROW LEVEL SECURITY/.test(m1) && /REVOKE ALL ON public\.rapprochements_repetes FROM PUBLIC, anon, authenticated/.test(m1));
ok("inverse prêt", fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261008100000_rapprochement_jamais_la_meme_decision_INVERSE.sql")));

// ── 3. Migration 20261008101000 : cadence plancher des relevés automatiques ──
console.log("\n[3] migration 20261008101000 : plancher des relevés automatiques");
const m2 = lire("supabase/migrations/20261008101000_releve_auto_plancher.sql");
ok("seuls veilleur et cron sont retenus", /NOT IN \('veilleur', 'cron'\)/.test(m2));
ok("jamais un geste (bouton, bouton_distant, app)", !/'bouton'|'app'|'bouton_distant'/.test(m2.split("CREATE OR REPLACE FUNCTION")[1] ?? ""));
ok("relevés « annonces » seulement (jamais le dressing Vinted)", /NEW\.kind IS DISTINCT FROM 'annonces'/.test(m2));
ok("par compte ET par plateforme", /s\.user_id = NEW\.user_id/.test(m2) && /s\.platform IS NOT DISTINCT FROM NEW\.platform/.test(m2));
ok("plancher réglable, 360 min par défaut, 0 = coupé", /'releve_auto_plancher_min', 360/.test(m2) && /COALESCE\(v_min, 0\) <= 0 THEN RETURN NEW/.test(m2));
ok("refus silencieux compté (releves_auto_refuses), aucune exception", /RETURN NULL;/.test(m2) && !/RAISE EXCEPTION/.test(m2));
ok("table des refus fermée (RLS, aucun accès anon/authenticated)", /ALTER TABLE public\.releves_auto_refuses ENABLE ROW LEVEL SECURITY/.test(m2) && /REVOKE ALL ON public\.releves_auto_refuses FROM PUBLIC, anon, authenticated/.test(m2));
ok("inverse prêt", fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261008101000_releve_auto_plancher_INVERSE.sql")));
// L'extension crée le run AVANT de toucher la plateforme : un refus ne coûte aucune requête chez elle.
const bg = lire("chrome-extension/background.js");
const iPost = bg.indexOf('restRequest("vinted_sync_runs", token, {');
const iReleve = bg.indexOf("await releverAnnoncesPlateforme(platform, { token, userId })");
ok("extension : le run est créé avant la lecture de la plateforme, et « run non créé » s'arrête là", iPost > 0 && iReleve > iPost && /if \(!run\) return \{ ok: false, reason: "run_non_cree" \}/.test(bg));

// ── 4. Migration 20261008102000 : une synchro n'efface pas une marque ──
console.log("\n[4] migration 20261008102000 : marque jamais effacée par une synchro");
const m3 = lire("supabase/migrations/20261008102000_marque_jamais_effacee_par_synchro.sql");
ok("seulement quand la synchro avance last_synced_at", /NEW\.last_synced_at IS DISTINCT FROM OLD\.last_synced_at/.test(m3));
ok("seulement pour VIDER une marque non vide", /NULLIF\(btrim\(COALESCE\(NEW\.marque, ''\)\), ''\) IS NULL/.test(m3) && /NULLIF\(btrim\(COALESCE\(OLD\.marque, ''\)\), ''\) IS NOT NULL/.test(m3));
ok("BEFORE UPDATE OF marque", /BEFORE UPDATE OF marque ON public\.inventaire/.test(m3));
ok("inverse prêt", fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261008102000_marque_jamais_effacee_par_synchro_INVERSE.sql")));

// ── 5. L'ops-digest les montre ──
console.log("\n[5] ops-digest : arrêts, répétitions, relevés retenus");
const od = lire("supabase/functions/ops-digest/index.ts");
ok("rapprochements arrêtés (passages ≤ -3)", /\.from\("rapprochement_comptes"\)\.select\("user_id, passages, bilan, maj_le"\)\.lte\("passages", -3\)/.test(od));
ok("décisions répétées (rapprochements_repetes)", /\.from\("rapprochements_repetes"\)/.test(od));
ok("relevés retenus par le plancher (releves_auto_refuses)", /\.from\("releves_auto_refuses"\)/.test(od));
ok("comptés dans le total du digest", /rapprochements_arretes: arretsRapprochement\.length/.test(od) && /decisions_repetees: decisionsRepetees\.length/.test(od));

console.log(ko ? `\n❌ ${ko} contrôle(s) en échec.` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
