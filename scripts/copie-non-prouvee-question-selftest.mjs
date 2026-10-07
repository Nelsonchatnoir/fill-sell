// ═══════════════════════════════════════════════════════════════════════════
// Selftest « COPIE NON PROUVÉE APRÈS UNE VENTE = UNE QUESTION » (06/10, Nico)
//   node --import ./scripts/loader-ext.mjs scripts/copie-non-prouvee-question-selftest.mjs
//
// Une copie encore en ligne, liée à la fiche vendue par le seul titre, ne reste
// plus en ligne en silence : elle devient la question « Déjà vendu ? » (même
// table, même RPC, même écran que le 30/09), une par copie. Prouvé ici :
//   1. l'app montre la question avec le texte demandé, une par copie (Wii Sports
//      eBay ET Leboncoin), et désigne l'annonce qu'un « oui » retirera ;
//   2. le serveur : rien ne se retire sans le « oui » (armer_retrait_job_pour,
//      toutes gardes comprises), « non » n'est jamais reposé, deux annonces
//      vivantes sur une plateforme = pas de question, la plateforme de la vente
//      n'est jamais visée, une erreur de question ne bloque jamais les retraits
//      prouvés.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = await import(pathToFileURL(join(ROOT, "src/utils/doublons.js")).href);
const mig = fs.readFileSync(join(ROOT, "supabase/migrations/20261006120100_copie_non_prouvee_devient_question.sql"), "utf8");
const ecran = fs.readFileSync(join(ROOT, "src/annonces/EcranDoublons.jsx"), "utf8");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

console.log("[1] L'app : les questions de XEWER et d'Ornella");
const vendu = (id, title) => ({ id, title, statut: "vendu" });
const items = [
  vendu(1789717153245001, "Syphon Filter 2 Platinum PS1 PAL FR"),
  vendu(1789717144944003, "Wii Sports Nintendo Wii PAL"),
  vendu(1789669878434007, "Lot 2 pantalons hiver enfant 36 mois"),
  { id: 42, title: "En stock", statut: "stock" },
];
const q = (id, garde, platform, vendu_sur, annonce_id) => ({ id, garde, absorbe: garde, motif: "copie_non_prouvee", niveau: "probable",
  preuves: { job: `job-${id}`, annonce_id, platform, vendu_sur, url: `https://exemple/${id}` } });
const doublons = [
  q("syphon", 1789717153245001, "leboncoin", "vinted", "20ac68a4-db39-4481-9125-abadd701862b"),
  q("wii-ebay", 1789717144944003, "ebay", "ailleurs", "9d455781-7fbe-4dfc-a6cc-c800c3e4b088"),
  q("wii-lbc", 1789717144944003, "leboncoin", "ailleurs", "9d545985-a878-4513-979f-112f8d433dc9"),
  q("pantalons", 1789669878434007, "leboncoin", "ailleurs", "ca96b315-9cf4-4247-9ea4-ca1ea3dbbd11"),
  q("fiche-en-stock", 42, "leboncoin", "vinted", "x"),   // fiche pas vendue : pas de question
];
const affichees = D.pairesAffichables(doublons, items).filter(D.estQuestionDejaVendu);
ok("4 questions montrées (une par copie, Wii Sports = 2), aucune sur une fiche en stock",
  affichees.map((d) => d.id).join(",") === "syphon,wii-ebay,wii-lbc,pantalons", affichees.map((d) => d.id).join(","));
ok("elles vivent dans « Déjà vendu ? » (À régler), jamais parmi les paires de la synchro",
  affichees.every(D.estQuestionCopie) && D.pairesAffichables(doublons, items).filter((d) => !D.estQuestionDejaVendu(d)).length === 0);
const syphon = affichees.find((d) => d.id === "syphon");
ok("texte : plateforme de la vente, plateforme de la copie, titre, tutoiement",
  D.texteQuestionCopie(syphon, true) === "« Syphon Filter 2 Platinum PS1 PAL FR » s'est vendu sur Vinted. Ton annonce Leboncoin du même nom, c'est le même article ?",
  D.texteQuestionCopie(syphon, true));
ok("vendu « ailleurs » : on ne nomme pas de plateforme",
  D.texteQuestionCopie(affichees.find((d) => d.id === "wii-ebay"), true) === "« Wii Sports Nintendo Wii PAL » est vendu. Ton annonce eBay du même nom, c'est le même article ?");
const aRetirer = D.annonceARetirer(syphon);
ok("l'annonce qu'un « oui » retirera est désignée (montrée avant le geste)",
  aRetirer?.id === "20ac68a4-db39-4481-9125-abadd701862b" && aRetirer?.plateforme === "leboncoin" && !!aRetirer?.url);
ok("les deux boutons demandés", /'Oui, la retirer'/.test(ecran) && /"Non, c'est un autre exemplaire"/.test(ecran));
ok("une question homonyme_vendu (deux fiches) garde son écran", /\{!copie && \(?\s*<CarteFiche item=\{paire\.b\}/.test(ecran));

console.log("\n[2] Le serveur");
const poser = mig.match(/FUNCTION public\.poser_questions_copies_non_prouvees[\s\S]*?\$function\$;/)?.[0] ?? "";
const decider = mig.match(/FUNCTION public\.inventaire_doublon_decider[\s\S]*?\$function\$;/)?.[0] ?? "";
const armer = mig.match(/FUNCTION public\.armer_retraits_copies[\s\S]*?\$function\$;/)?.[0] ?? "";
const branche = decider.match(/IF d\.motif = 'copie_non_prouvee' THEN[\s\S]*?\n  END IF;\n/)?.[0] ?? "";
ok("une question seulement pour une copie NON prouvée, encore en ligne", /AND NOT public\.retrait_job_prouve\(j\.id\)/.test(poser) && /a\.disparu_le IS NULL AND a\.retiree_le IS NULL/.test(poser));
ok("jamais deux exemplaires confondus (deux annonces vivantes = pas de question)", /fiche_annonces_vivantes\(v_inv\.id, j\.platform\) < 2/.test(poser));
ok("jamais la plateforme de la vente", /v_vendu_sur <> lower\(j\.platform\)/.test(poser) && /lower\(COALESCE\(NULLIF\(v_inv\.plateforme, ''\), ''\)\) <> lower\(j\.platform\)/.test(poser));
ok("une question par copie, jamais reposée (index unique par dépôt, tous statuts)",
  /CREATE UNIQUE INDEX IF NOT EXISTS inventaire_doublons_copie[\s\S]*?\(user_id, \(\(preuves ->> 'job'\)\)\)[\s\S]*?WHERE motif = 'copie_non_prouvee';/.test(mig) && /ON CONFLICT DO NOTHING/.test(poser));
ok("l'unicité des paires est gardée pour tous les autres motifs",
  /CREATE UNIQUE INDEX inventaire_doublons_paire[\s\S]*?LEAST\(garde, absorbe\), GREATEST\(garde, absorbe\)\)[\s\S]*?WHERE motif IS DISTINCT FROM 'copie_non_prouvee';/.test(mig));
ok("posée après les retraits prouvés, une erreur ne les empêche jamais",
  /v_q := public\.poser_questions_copies_non_prouvees[\s\S]*?exception when others then/.test(armer)
  && armer.indexOf("poser_questions_copies_non_prouvees") > armer.indexOf("public.armer_retrait_job(v_pub.id"));
ok("« non » : refusée, rien d'autre", /IF p_decision = 'non' THEN\s+UPDATE inventaire_doublons SET statut = 'refusee'[^;]*;\s+RETURN/.test(branche));
ok("« oui » sans l'annonce montrée : refusé", /p_annonce_montree IS NULL OR p_annonce_montree::text IS DISTINCT FROM \(d\.preuves ->> 'annonce_id'\)/.test(branche));
ok("« oui » : le retrait passe par armer_retrait_job_pour avec le geste (chemin existant)",
  /armer_retrait_job_pour\(v_job, 'copie_confirmee_vendue', interval '0', true\)/.test(branche));
ok("« oui » sans retrait armé : rien n'est écrit (exception, question ouverte)",
  /RAISE EXCEPTION USING ERRCODE = 'P0R01'/.test(branche) && /EXCEPTION WHEN SQLSTATE 'P0R01' THEN/.test(branche)
  && branche.indexOf("UPDATE cross_post_jobs") > branche.indexOf("BEGIN"));
ok("le « oui » prouve le lien de CETTE copie seulement", /'par', 'utilisateur', 'motif', 'meme_article_confirme'/.test(branche) && /WHERE id = v_job;/.test(branche));
ok("la question sur une copie n'est pas déclarée caduque parce que la fiche est vendue",
  /AND d\.motif IS DISTINCT FROM 'copie_non_prouvee'/.test(mig.match(/FUNCTION public\.rapprochement_photos_decider[\s\S]*?\$function\$;/)?.[0] ?? ""));
ok("la porte de la question est fermée aux comptes connectés",
  /REVOKE ALL ON FUNCTION public\.poser_questions_copies_non_prouvees\(bigint, uuid, text, text\) FROM PUBLIC, anon, authenticated;/.test(mig));

console.log(ko ? `\n${ko} contrôle(s) en échec.` : "\nTous les contrôles passent : une copie non prouvée se demande, rien ne part sans le oui.");
process.exit(ko ? 1 : 0);
