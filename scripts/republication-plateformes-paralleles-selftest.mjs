// Autotest — LES PLATEFORMES AVANCENT ENSEMBLE (08/11, point 1 de Nico) —
// `npm run selftest:republication-plateformes-paralleles`
// Cas fondateur : Joséphine (josephinecerni, Pro), 874 republications lancées le 04/11 22:07 (Beebs, Leboncoin,
// Vinted). Le 08/11 : 47 republications en 5 h 30, UNE par cycle de poll toutes plateformes confondues — l'espacement
// de 2 min entre deux gestes (extension) et la pause de respiration (50 d'affilée → 2 h, serveur) étaient COMMUNS aux
// plateformes. Désormais : chaque plateforme compte SES 2 minutes et SA pause ; le rythme d'une plateforme ne change pas.
// Rejoue le VRAI code : les fonctions de background.js extraites et exécutées, _shared/pause-respiration.js,
// _shared/avancement-republication.js, _shared/etat-job.js.
import fs from "node:fs";
import vm from "node:vm";
import { sequenceEtFinPause, pauseParPlateforme, pauseDEnsemble } from "../supabase/functions/_shared/pause-respiration.js";
import { avancementRepublication, rythmeConstate, dureeEstimee, phraseAvancement } from "../supabase/functions/_shared/avancement-republication.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");

// Extrait une déclaration de haut niveau (fonction ou const) de background.js, telle quelle.
function extraire(debut) {
  const i = bg.indexOf(debut);
  if (i < 0) throw new Error(`introuvable : ${debut}`);
  let j = bg.indexOf("\n}\n", i);
  if (debut.startsWith("const ") || debut.startsWith("let ")) j = bg.indexOf(";\n", i) - 2;
  return bg.slice(i, j + 3);
}

console.log("\n1. EXTENSION : L'ESPACEMENT ENTRE GESTES EST COMPTÉ PAR PLATEFORME");
{
  ok(!/dernierGesteRepublishAt/.test(bg), "plus aucun minuteur global (dernierGesteRepublishAt)");
  const portes = bg.match(/if \(espacementRepublishEnCours\(job\.platform\)\) \{\n\s+return \{ status: "skipped", error: "espacement entre gestes de republication" \};/g) ?? [];
  ok(portes.length === 2, `les deux portes (Vinted, autres plateformes) lisent l'espacement de LA plateforme du job (${portes.length})`);
  const notes = bg.match(/noterGesteRepublish\(job\.platform\);/g) ?? [];
  ok(notes.length === 6, `chaque geste (retrait, recréation) est noté pour SA plateforme (${notes.length} endroits, les 6 d'avant)`);
  ok(/const REPUBLISH_ESPACEMENT_MS = 2 \* 60 \* 1000;/.test(bg), "le rythme d'une plateforme ne change pas : 2 min entre deux gestes");
  // Les vraies fonctions, exécutées avec une horloge de test.
  const src = [
    "const REPUBLISH_ESPACEMENT_MS = 2 * 60 * 1000;",
    "const dernierGesteRepublishParPlateforme = new Map();",
    extraire("function noterGesteRepublish(platform) {"),
    extraire("function espacementRepublishEnCours(platform) {"),
    "this.noter = noterGesteRepublish; this.enCours = espacementRepublishEnCours;",
  ].join("\n");
  let t = Date.parse("2026-11-08T13:34:31Z");
  const sb = { Date: { now: () => t }, Map, String };
  vm.runInNewContext(src, sb);
  sb.noter("leboncoin");
  ok(sb.enCours("leboncoin") === true, "un geste Leboncoin : Leboncoin attend ses 2 min");
  ok(sb.enCours("vinted") === false && sb.enCours("beebs") === false && sb.enCours("depop") === false,
    "… Vinted, Beebs et Depop n'attendent PAS (avant : les trois attendaient)");
  t += 119_000;
  ok(sb.enCours("leboncoin") === true, "Leboncoin 1 min 59 après : attend encore (rythme d'une plateforme inchangé)");
  t += 2_000;
  ok(sb.enCours("leboncoin") === false, "Leboncoin 2 min 01 après : repart");
}

console.log("\n2. UN CYCLE DE POLL : UNE REPUBLICATION PAR PLATEFORME, PLUS UNE SEULE POUR TOUTES");
{
  // Le serveur sert déjà, PAR PLATEFORME, 1 « captured » + 1 « a_capturer » (get-pending-jobs, 02/10) : 6 tâches chez
  // Joséphine. Modèle du cycle : la boucle séquentielle, la porte d'espacement de chaque plateforme.
  const cycle = (parPlateforme) => {
    const dernier = new Map();
    let global = 0;
    let faites = 0;
    let t = 0;
    for (const pf of ["vinted", "leboncoin", "beebs"]) {
      const libre = parPlateforme ? t - (dernier.get(pf) ?? -1e9) >= 120_000 : t - global >= 120_000 || global === 0;
      if (!libre) continue;
      faites++;
      t += 60_000; // un retrait + une recréation ≈ 1 min
      if (parPlateforme) dernier.set(pf, t); else global = t;
      t += 14_000; // JOB_DELAY_MS + jitter moyen
    }
    return faites;
  };
  ok(cycle(false) === 1, "avant (minuteur commun) : 1 republication par cycle, toutes plateformes confondues");
  ok(cycle(true) === 3, "après (minuteur par plateforme) : 1 par plateforme et par cycle — Vinted, Leboncoin et Beebs avancent ensemble");
  ok(/let retraitPasseDevant = false;/.test(bg) && /if \(i > 0 && job\.action !== "delete"\) \{\n\s+const neuf = await retraitNeDepuisLeCycle\(/.test(bg),
    "un cycle plus long : un retrait (vente) né pendant le cycle est vérifié entre deux tâches");
  ok(/if \(retraitPasseDevant\) \{\n\s+await cleanupOrphanWorkTabs\(\)\.catch\(\(\) => \{\}\);\n\s+return;\n\s+\}/.test(bg),
    "… et coupe le cycle : pas de maintenance de fond, un poll repart tout de suite");
}

console.log("\n3. UN RETRAIT NÉ PENDANT LE CYCLE LE COUPE UNE FOIS, JAMAIS EN BOUCLE");
{
  const src = [
    "let debutDernierPoll = 0;",
    extraire("const retraitsQuiOntCoupe = new Set();").replace(/\n[\s\S]*$/, ""),
    "let retraitNeLuLe = 0;",
    extraire("async function retraitNeDepuisLeCycle(token, idsDuCycle) {"),
    "this.f = retraitNeDepuisLeCycle; this.poser = (t) => { debutDernierPoll = t; };",
  ].join("\n");
  let t = Date.parse("2026-11-08T14:00:00Z");
  let reponse = [];
  let requetes = [];
  const sb = { Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => t }), Math, Number, Set, String, Array, encodeURIComponent,
    restRequest: async (q) => { requetes.push(q); return reponse; } };
  sb.Date.prototype = Date.prototype;
  vm.runInNewContext(src, sb);
  sb.poser(t - 60_000);
  reponse = [{ id: "r-vente" }];
  const premier = await sb.f("tok", new Set(["a", "b"]));
  ok(premier === "r-vente", "un retrait né depuis le début du cycle, absent du cycle : il coupe le cycle");
  ok(/action=eq\.delete&status=eq\.pending&created_at=gt\./.test(requetes[0] ?? ""), "lecture bornée : retraits en attente nés depuis le début du poll");
  t += 50_000;
  ok(await sb.f("tok", new Set(["a"])) === null, "le même retrait (retenu par le serveur, encore en attente) ne coupe JAMAIS un second cycle");
  t += 10_000;
  reponse = [{ id: "r2" }];
  ok(await sb.f("tok", new Set()) === null, "au plus une lecture toutes les 45 s");
  t += 46_000;
  ok(await sb.f("tok", new Set(["r2"])) === null, "un retrait déjà dans le cycle ne le coupe pas (il passe en tête, rang −1)");
}

console.log("\n4. SERVEUR : LA PAUSE DE RESPIRATION SE COMPTE PAR PLATEFORME (mêmes 50, mêmes 2 h)");
{
  const fin = Date.parse("2026-11-08T15:00:00Z");
  const serie = (pf, n, pasMin) => Array.from({ length: n }, (_, i) => ({ platform: pf, published_at: new Date(fin - i * pasMin * 60_000).toISOString() }));
  const cfg = { pauseApres: 50, pauseDureeMs: 120 * 60_000, maintenant: fin + 60_000 };
  const lignes = [...serie("vinted", 50, 3), ...serie("leboncoin", 20, 7), ...serie("beebs", 20, 7)];
  const parPf = pauseParPlateforme(lignes, cfg);
  ok(parPf.vinted.retenue === true && parPf.vinted.sequence === 50, "50 Vinted d'affilée : Vinted en pause");
  ok(parPf.leboncoin.retenue === false && parPf.beebs.retenue === false, "Leboncoin et Beebs (20 chacune) continuent");
  ok(parPf.vinted.reprise === new Date(fin + 120 * 60_000).toISOString(), "Vinted reprend 2 h après SA dernière republication");
  // Avant le 08/11 : la même série comptée toutes plateformes confondues arrêtait les trois.
  const toutes = sequenceEtFinPause(lignes.map((l) => Date.parse(l.published_at)), cfg);
  ok(toutes.finPause !== null && toutes.sequence === 90, "(avant : les 90 comptées ensemble mettaient TOUTES les plateformes en pause)");
  const ens = pauseDEnsemble(parPf, ["vinted", "leboncoin", "beebs"]);
  ok(ens.retenue === false && ens.reprise === null, "forme d'ensemble (applis installées) : pas « en pause » tant qu'une plateforme avance");
  ok(pauseDEnsemble(parPf, ["vinted"]).retenue === true, "… « en pause » quand la seule plateforme en file l'est");
  const trou = [...serie("vinted", 30, 3), ...serie("vinted", 30, 3).map((l) => ({ ...l, published_at: new Date(Date.parse(l.published_at) - 5 * 3600_000).toISOString() }))];
  ok(pauseParPlateforme(trou, cfg).vinted.retenue === false, "un trou de plus de 2 h (poste éteint) clôt la séquence, comme avant");
  ok(pauseParPlateforme(lignes, { ...cfg, pauseApres: 0 }).vinted.retenue === false, "réglage absent ou 0 : aucune pause (jamais une retenue que Nico n'a pas posée)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/pauseParPlateforme\(lignesFaites,/.test(gpj) && /\.select\("published_at, platform"\)/.test(gpj), "get-pending-jobs lit la plateforme avec l'heure et compte par plateforme");
  ok(/!pfEnPause\.has\(String\(j\.platform\)\) \|\|/.test(gpj), "seules les republications des plateformes en pause sont retenues");
  ok(/if \(parPfLue && parPfLue\[String\(j\.platform\)\]\?\.retenue !== true\) return true;/.test(gpj),
    "la trace « pause » d'une plateforme qui avance se lève (y compris l'ancienne trace commune)");
}

console.log("\n5. L'APP : L'ÉTAT D'UNE REPUBLICATION SUIT LA PAUSE DE SA PLATEFORME");
{
  const E = await import("../supabase/functions/_shared/etat-job.js");
  const job = (pf) => ({ id: pf, action: "republish", status: "pending", platform: pf, platform_fields: { republish_step: "a_capturer" }, created_at: "2026-11-04T21:07:43Z" });
  const ctx = { extension: { etat: "active" }, plafond: { retenue: false, motif: null, par_plateforme: { vinted: { retenue: true, reprise: "2026-11-08T17:00:00Z" }, leboncoin: { retenue: false } } } };
  const sv = E.etatJob(job("vinted"), ctx);
  const sl = E.etatJob(job("leboncoin"), ctx);
  ok(sv.motif === "rythme", `Vinted en pause de respiration : « ${sv.etat} / ${sv.motif} »`);
  ok(sl.motif !== "rythme", `Leboncoin n'est pas dite en pause : « ${sl.etat} / ${sl.motif} »`);
  const ancien = E.etatJob(job("leboncoin"), { extension: { etat: "active" }, plafond: { retenue: true, motif: "pause" } });
  ok(ancien.motif === "rythme", "réponse d'un serveur d'avant (sans par_plateforme) : lue comme avant");
}

console.log("\n6. LA FILE AVANCE : PASSÉES, RESTANTES, RYTHME CONSTATÉ, FIN ESTIMÉE (décision de Nico du 08/11)");
{
  const maintenant = Date.parse("2026-11-08T14:55:00Z");
  const enFile = [
    ...Array.from({ length: 253 }, () => ({ platform: "beebs", created_at: "2026-11-04T21:07:43Z", status: "pending" })),
    ...Array.from({ length: 275 }, () => ({ platform: "leboncoin", created_at: "2026-11-04T21:07:44Z", status: "pending" })),
    ...Array.from({ length: 268 }, () => ({ platform: "vinted", created_at: "2026-11-04T21:07:45Z", status: "pending" })),
  ];
  // 18 Beebs le 08/11 entre 10:06 et 14:53 (heure de Paris), puis un trou d'une nuit avant.
  const beebs = Array.from({ length: 18 }, (_, i) => ({ platform: "beebs", created_at: "2026-11-04T21:07:43Z", published_at: new Date(maintenant - 2 * 60_000 - i * 16 * 60_000).toISOString() }));
  const a = avancementRepublication({ enFile, faites: beebs, faitesLotParPf: { beebs: 29, leboncoin: 22, vinted: 29 }, maintenant, pauseApres: 50, pauseDureeMin: 120 });
  ok(a.total.restantes === 796 && a.total.faites === 80, `Client-essai-1 : 80 faites, 796 restantes (${a.total.faites} / ${a.total.restantes})`);
  ok(a.plateformes.beebs.rythme_h === 3.8, `Beebs : rythme constaté ${a.plateformes.beebs.rythme_h}/h (une toutes les 16 min)`);
  const attendu = 253 / (60 / 16) + 5 * 2;
  ok(Math.abs(a.plateformes.beebs.fin_estimee_h - attendu) < 0.2, `fin Beebs ≈ ${a.plateformes.beebs.fin_estimee_h} h de poste allumé (pauses de 2 h toutes les 50 comprises)`);
  ok(a.plateformes.vinted.rythme_h === null && a.plateformes.vinted.fin_estimee_h === null, "Vinted sans republication constatée : AUCUNE estimation (on ne devine pas)");
  const pb = phraseAvancement(a.plateformes.beebs, { lang: "fr" });
  ok(/^29 faites · 253 restantes · ≈ 3,8 par heure$/.test(pb.texte), `phrase : « ${pb.texte} »`);
  ok(/^fin dans environ \d+ jours? d'ordinateur allumé$/.test(pb.fin), `fin : « ${pb.fin} » — en temps de poste allumé, jamais une heure d'horloge`);
  ok(phraseAvancement(a.plateformes.beebs, { lang: "fr", cloud: true }).fin.endsWith("de FillSell Cloud"), "compte Cloud : « de FillSell Cloud »");
  ok(phraseAvancement(a.plateformes.vinted, { lang: "fr" }).fin === "fin estimée dès les premières republications", "sans rythme : la fin viendra, aucune durée");
  const trous = [0, 3, 6, 9, 70, 73, 76].map((m) => new Date(maintenant - m * 60_000).toISOString());
  ok(Math.abs(rythmeConstate(trous, { maintenant }) - 20) < 0.01, "un écart de plus de 45 min (ordinateur éteint, pause) n'est pas compté dans le rythme");
  ok(dureeEstimee(0.4) === "moins d'une heure" && dureeEstimee(5.4) === "environ 5 h" && dureeEstimee(80) === "environ 3 jours", "durées dites simplement");
  ok(avancementRepublication({ enFile: [], faites: [] }) === null, "rien en file : rien d'affiché");
  const fdj = lire("src/components/FileDesJobs.jsx");
  ok(/<AvancementRepublication avancement=\{retenues\?\.avancement \?\? null\}/.test(fdj) && /avancement: data\?\.avancement_republication \?\? null/.test(fdj),
    "« Ta file » affiche l'avancement servi par le serveur (avancement_republication)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/avancement_republication: avancement/.test(gpj), "get-pending-jobs (plafond_only) sert l'avancement");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ les plateformes avancent ensemble, chacune à son rythme ; la file dit qu'elle avance");
process.exit(ko ? 1 : 0);
