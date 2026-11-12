// VERROU (12/11/2026, point 4 de Nico) : LES PUBLICATIONS PROGRAMMÉES DISENT CE QUI VA RÉELLEMENT PARTIR, ET QUAND.
//
//     npm run selftest:programmees-verite
//
// Cas fondateur : compte 229c7b07 (Business, créneau du soir 19:00–22:00, tous les jours, sans plafond) — 3 lots relancés,
// 2 annulés : rien ne disait qu'ils attendaient 19:00. Règle de Nico (12/09) : jamais un chiffre théorique.
//   A. Le prochain créneau : « ce soir à partir de 19:00 », « en ce moment jusqu'à 22:00 », « demain soir », jours actifs.
//   B. Le rythme RÉEL : médiane des 3 derniers créneaux pleins (rejeu des vraies servies du compte, 01 → 11/11 : 39) ;
//      aucun créneau plein (compte 4cfb7afe : 1 servie le 11/11 à 19:02, poste éteint) → AUCUN chiffre ; plafond respecté.
//   C. La fin estimée sur les jours actifs (386 publications à 06:26 le jeudi 12/11 → vers le samedi 21/11).
//   D. Les phrases simples, à l'envoi du lot et dans « Ta file » ; l'app les affiche (lot, ligne « Programmé », fin de
//      l'envoi, file, suivi) ; ni le réglage ni le rythme ne changent (règle partagée intacte).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

let R = null;
try { R = await charger("src/utils/rythmeProgramme.js"); } catch { /* absent avant le correctif */ }
const PP = await charger("supabase/functions/_shared/publication-programmee.js");
const soir = PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "soir", jours: [1, 2, 3, 4, 5, 6, 7], plafond_jour: null, fuseau: "Europe/Paris" } });
const semaine = PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "soir", jours: [1, 2, 3, 4, 5], plafond_jour: null, fuseau: "Europe/Paris" } });
const t = (iso) => Date.parse(iso);
// Les 109 servies RÉELLES du compte 229c7b07 du 01 au 11/11 (instants programmee_servie_le, lus en prod le 12/11) —
// résumées par jour : nombre, heure de la dernière (Paris).
const JOURS_REELS = [["2026-11-01", 6, "21:58"], ["2026-11-02", 5, "21:58"], ["2026-11-03", 3, "20:10"], ["2026-11-08", 8, "21:40"],
  ["2026-11-09", 4, "20:02"], ["2026-11-10", 39, "21:58"], ["2026-11-11", 53, "21:58"]];
const servies = JOURS_REELS.flatMap(([d, k, fin]) => Array.from({ length: k }, (_, i) => {
  const [h, m] = fin.split(":").map(Number);
  const derniere = Date.parse(`${d}T${String(h - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`); // Paris = UTC+1
  return new Date(derniere - (k - 1 - i) * 4 * 60_000).toISOString();
}));

console.log("A. Le prochain créneau");
ok(!!R, "utils/rythmeProgramme.js existe");
if (R) {
  const matin = t("2026-11-12T05:26:00Z"); // jeudi 12/11, 06:26 Paris
  const p1 = R.prochainCreneau(soir, matin);
  ok(p1 && !p1.enCours && p1.decalage === 0 && p1.de === "19:00", "06:26 → le créneau de ce soir, à partir de 19:00", p1);
  ok(R.prochainCreneau(soir, t("2026-11-12T19:30:00Z")).enCours === true, "20:30 → le créneau est en cours");
  ok(R.prochainCreneau(soir, t("2026-11-12T21:30:00Z")).decalage === 1, "22:30 → demain soir");
  const sam = R.prochainCreneau(semaine, t("2026-11-14T10:00:00Z")); // samedi
  ok(sam.decalage === 2 && sam.jourIso === 1, "samedi, jours ouvrés seulement → lundi", sam);
  ok(R.quandCreneau(0, 4, "soir") === "ce soir" && R.quandCreneau(1, 5, "soir") === "demain soir" && R.quandCreneau(2, 1, "soir") === "lundi soir"
    && R.quandCreneau(0, 4, "matin") === "ce matin" && R.quandCreneau(0, 4, "perso") === "aujourd'hui", "les mots du moment : ce soir, demain soir, lundi soir, ce matin, aujourd'hui");

  console.log("B. Le rythme RÉEL du compte");
  const r = R.rythmeMesure(servies, soir, matin);
  ok(r.parCreneau === 39 && r.joursPleins === 3, "229c7b07 : médiane des 3 derniers créneaux pleins (8, 39, 53) → environ 39 par soir", r);
  ok(r.jours.find((j) => j.date === "2026-11-03")?.plein === false && r.jours.find((j) => j.date === "2026-11-09")?.plein === false,
    "un soir où la file s'est vidée avant la fin (dernière à 20:10, 20:02) ne compte pas : il dit ce qu'il y avait, pas ce que le compte peut");
  ok(R.rythmeMesure(["2026-11-11T18:02:00Z"], soir, matin).parCreneau === null, "4cfb7afe : une seule servie à 19:02 (poste éteint ensuite) → AUCUN chiffre");
  ok(R.rythmeMesure([], soir, matin).parCreneau === null, "aucune servie → aucun chiffre, jamais une constante");
  const aujourdhui = [...servies, ...Array.from({ length: 30 }, (_, i) => new Date(t("2026-11-12T18:00:00Z") + i * 60_000).toISOString())];
  ok(R.rythmeMesure(aujourdhui, soir, t("2026-11-12T20:59:00Z")).parCreneau === 39, "le soir en cours n'est jamais compté");
  const plaf = PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "soir", plafond_jour: 20, fuseau: "Europe/Paris" } });
  ok(R.rythmeMesure(servies, plaf, matin).parCreneau === 20, "un plafond du jour borne le rythme (20)");

  console.log("C. La fin estimée");
  const f = R.finEstimee({ aPartir: 386, parCreneau: 39, reglage: soir, maintenant: matin });
  ok(f && f.date === "2026-11-21" && f.creneaux === 10, "386 publications à 39 par soir, depuis ce soir → 10 soirs, le samedi 21/11", f);
  const fs5 = R.finEstimee({ aPartir: 100, parCreneau: 39, reglage: semaine, maintenant: t("2026-11-13T05:00:00Z") });
  ok(fs5 && fs5.date === "2026-11-17", "jours ouvrés : vendredi, lundi, mardi → le mardi 17/11 (le week-end ne compte pas)", fs5);
  const fc = R.finEstimee({ aPartir: 10, parCreneau: 39, reglage: soir, maintenant: t("2026-11-12T20:00:00Z") });
  ok(fc && fc.decalage === 0, "créneau en cours, il en reste assez : ce soir même", fc);

  console.log("D. Les phrases, et l'app qui les dit");
  const pe = R.phraseEnvoiProgramme({ reglage: soir, servies, dejaEnFile: 0, nouvelles: 386, maintenant: matin });
  ok(pe === "Elles partiront ce soir à partir de 19:00, une à la fois. À ton rythme habituel (environ 39 par soir), la dernière devrait partir vers le samedi 21/11.",
    "à l'envoi : quand, le rythme réel, la fin estimée", pe);
  const pe0 = R.phraseEnvoiProgramme({ reglage: soir, servies: ["2026-11-11T18:02:00Z"], dejaEnFile: 7, nouvelles: 0, maintenant: matin });
  ok(!/\d+ par soir|vers le/.test(pe0) && /premier créneau complet/.test(pe0), "sans créneau plein mesuré : ni chiffre ni date", pe0);
  const pa = R.phraseEnvoiProgramme({ reglage: soir, servies, dejaEnFile: 12, nouvelles: 10, maintenant: matin });
  ok(/les 12 déjà en attente passent avant/.test(pa), "les programmées déjà en attente sont comptées et dites", pa);
  ok(R.phraseAttenteProgrammee(soir, matin) === "Programmée : partira ce soir à partir de 19:00, une à la fois", "dans « Ta file » : partira ce soir à partir de 19:00");
  ok(/en ce moment, une à la fois, jusqu'à 22:00/.test(R.phraseAttenteProgrammee(soir, t("2026-11-12T19:30:00Z"))), "pendant le créneau : elle part en ce moment, jusqu'à 22:00");
  ok(!/créneau D4|decisionProgrammee|programmee_servie_le/.test(pe + pa + R.phraseAttenteProgrammee(soir, matin)), "aucun jargon dans les phrases");
  const F = await charger("src/utils/fileDesJobs.js");
  const s = F.situationJob({ status: "pending", action: "publish", platform: "beebs", platform_fields: { programmee: true } },
    { programmation: true, reglageProgrammation: soir, maintenant: matin });
  ok(s.motif === "programmee" && s.raison === "Programmée : partira ce soir à partir de 19:00, une à la fois", "« Ta file » le dit pour chaque publication programmée", s);
  const s0 = F.situationJob({ status: "pending", action: "publish", platform: "beebs", platform_fields: { programmee: true } }, { programmation: true, maintenant: matin });
  ok(s0.raison === "Programmée : elle partira dans ton créneau, une à la fois", "sans réglage reçu : la phrase d'avant (jamais une erreur)");
}
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/useRythmeProgramme\(userId, Boolean\(programmation\.reglage\)\)/.test(lot) && /phraseEnvoiProgramme\(\{ reglage: programmation\.reglage, servies: rythmeProg\.servies,/.test(lot)
  && /dejaEnFile: rythmeProg\.dejaEnFile, nouvelles: annoncesPretes/.test(lot), "le lot : la phrase vient du rythme LU du compte et compte ses publications");
ok(/programme && envoiProgrammeRef\.current \? \[envoiProgrammeRef\.current\]/.test(lot), "la fin de l'envoi redit quand ça part");
ok(/Programmé : partira \$\{q\} à partir de \$\{p\.de\}, une à la fois\./.test(lot), "la ligne « Programmé » du lot dit le moment réel");
const fj = lire("src/components/FileDesJobs.jsx"), es = lire("src/publication/EcranSuivi.jsx");
ok(/reglageProgrammation: contexte\?\.reglageProgrammation \?\? reglageProgrammation/.test(fj) && /programmee: Clock/.test(fj), "« Ta file » reçoit le réglage, une horloge (jamais le signe pause)");
ok(/reglageProgrammation: programmation\.reglage/.test(es), "le suivi de publication aussi");
const hook = existe("src/utils/useRythmeProgramme.js") ? lire("src/utils/useRythmeProgramme.js") : "";
ok(/\.range\(page \* 1000, page \* 1000 \+ 999\)/.test(hook) && !/setInterval/.test(hook) && /FRAICHEUR_MS = 5 \* 60_000/.test(hook),
  "la lecture : par pages de 1 000, jamais en boucle (5 min de fraîcheur)");
// Ni le réglage ni le rythme : la règle partagée est celle de main d'avant ce lot.
let intacte = false;
try {
  const avant = execFileSync("git", ["show", "5e88909:supabase/functions/_shared/publication-programmee.js"], { cwd: ROOT, encoding: "utf8" }).replace(/\r\n/g, "\n");
  intacte = avant === lire("supabase/functions/_shared/publication-programmee.js");
} catch { intacte = false; }
ok(intacte, "la règle partagée (créneau, une à la fois, tour, espacement, plafond) n'est pas touchée");

function existe(p) { return fs.existsSync(join(ROOT, p)); }
console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
