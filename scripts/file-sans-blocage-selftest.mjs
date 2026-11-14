// VERROU — 14/11/2026, urgence af37fa49 (Nico : « Une connexion qui échoue sur UNE plateforme ne doit jamais bloquer les
// tâches des autres plateformes »). Cas réel : plus aucune tâche faite depuis 14:59:36, ~400 en attente, poste Cloud vivant.
//   1. la file des republications Vinted gardait sa place unique « capturée » pour la copie RETENUE d'un article (sa
//      copie Beebs retirée le 11/11, jamais recréée) : chaque passage capturait un article de plus, aucun n'allait au bout ;
//   2. le tour des publications programmées tombait sur Beebs (non connectée au Cloud), servie puis écartée.
// Ce verrou casse si une republication retenue reprend la place de sa plateforme, ou si une plateforme qu'un poste Cloud
// ne peut pas exécuter reprend le tour. Données synthétiques.
import fs from "node:fs";
import { candidatRepublication, retenueActive, plateformesHorsDuPosteCloud, PLATEFORMES_POSTE } from "../supabase/functions/_shared/file-sans-blocage.js";
import { decisionProgrammee } from "../supabase/functions/_shared/publication-programmee.js";

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m, d === undefined ? "" : JSON.stringify(d).slice(0, 300)); } };
const T = Date.parse("2026-11-14T14:30:00Z");

console.log("1. La place unique d'une plateforme dans la file des republications");
const job = (id, cree, pf = {}) => ({ id, platform: "vinted", action: "republish", created_at: new Date(cree).toISOString(), platform_fields: { republish_step: "captured", ...pf } });
const place = (j) => Date.parse(j.created_at);
const retenue = job("vinted-retenue", T - 3 * 86_400_000, { retenue_hors_ligne: { job: "beebs-3382", titre: "Bottines", depuis: "2026-11-14T14:01:20Z" } });
const capturees = [retenue, job("capt-1", T - 2 * 86_400_000), job("capt-2", T - 86_400_000)];
ok(retenueActive(retenue.platform_fields) && !retenueActive(capturees[1].platform_fields), "la retenue « annonce hors ligne » se lit sur la ligne");
const avant = capturees.reduce((a, b) => (place(b) < place(a) ? b : a));
ok(avant.id === "vinted-retenue", "AVANT (cas du 14/11) : la plus ancienne capturée — la retenue — gardait la place");
const c = candidatRepublication(capturees, { placeDansLaFile: place });
ok(c?.id === "capt-1", "APRÈS : la retenue ne prend plus la place ; la plus ancienne capturée LIBRE part", c?.id);
ok(candidatRepublication([retenue], { placeDansLaFile: place }) === null, "seule une retenue en file : aucune place prise (la capture suivante reste possible)");
ok(candidatRepublication([job("x", T - 1), job("y", T - 2)], { placeDansLaFile: place, enAttente: (j) => j.id === "y" })?.id === "x", "une échéance pas encore venue ne prend pas la place non plus (comme avant)");

console.log("2. Le tour des publications programmées au poste Cloud");
const hors = plateformesHorsDuPosteCloud({ posteCloud: true, connectees: ["vinted", "leboncoin"] });
ok([...hors].sort().join() === "beebs,depop", "poste Cloud, Vinted et Leboncoin connectées : Beebs et Depop ne prennent pas le tour", [...hors]);
ok(plateformesHorsDuPosteCloud({ posteCloud: false, connectees: [] }).size === 0, "un ordinateur : rien de changé");
ok(!PLATEFORMES_POSTE.includes("ebay"), "eBay (API) n'est jamais compté parmi les plateformes d'un poste");
const reglage = { creneau: "perso", de: "00:00", a: "23:59", jours: [1, 2, 3, 4, 5, 6, 7], fuseau: "Europe/Paris", plafond_jour: null };
const prog = (id, platform) => ({ id, platform, action: "publish", status: "pending", platform_fields: { programmee: true } });
const enAttente = [prog("b1", "beebs"), prog("v1", "vinted"), prog("l1", "leboncoin")];
const sansRegle = decisionProgrammee({ enAttente, reglage, servies: 0, maintenant: T, dernierePlateforme: "leboncoin" });
const avecRegle = decisionProgrammee({ enAttente, reglage, servies: 0, maintenant: T, dernierePlateforme: "leboncoin", plateformesBloquees: hors });
ok(sansRegle.servir === "b1" && avecRegle.servir && avecRegle.servir !== "b1", "après Leboncoin, le tour allait à Beebs (non connectée) ; il la saute : une publication Vinted ou Leboncoin part", { sansRegle, avecRegle });

console.log("3. Le câblage dans get-pending-jobs");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/const cand = candidatRepublication\(filePipeline\.filter\(\(j\) => String\(j\.platform\) === pfm && stepOf\(j\) === etape\)/.test(gpj)
  && !/const cand = cands\.reduce\(\(a, b\) => \(placeDansLaFile\(b\) < placeDansLaFile\(a\) \? b : a\)\);/.test(gpj), "la file des republications choisit par candidatRepublication (jamais une retenue)");
ok(/if \(posteCloud\) \{[\s\S]{0,400}plateformesHorsDuPosteCloud\(\{ posteCloud, connectees:[\s\S]{0,200}plateformesBloquees\.add\(p\)/.test(gpj), "au poste Cloud, les plateformes non connectées rejoignent les plateformes bloquées du tour");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
