// ═══════════════════════════════════════════════════════════════════════════
// BEEBS EN ARRIÈRE-PLAN (25/10 soir, 0.6.145 — pilote 48 h sur le poste de Nico) — `npm run selftest:lecture-fond-beebs`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ (supabase/functions/_shared/lecture-fond.js § Beebs : qui lit, quoi, à quel rythme) et la règle
// pure de l'extension (motifLectureBeebs : un refus de Beebs est TOUJOURS « antirobot »), puis vérifie le branchement :
// get-pending-jobs (servi aux postes ≥ 0.6.145, refus et plafond comptés PAR plateforme), l'extension (jamais de
// navigation vers l'annonce, arrêt 12 h au premier refus, jamais pendant un relevé), ops-digest (par pages, par plateforme).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const lf = await import("../supabase/functions/_shared/lecture-fond.js");

let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Qui lit, et à quel rythme (Beebs)");
{
  const NICO = lf.LECTURE_FOND_PILOTES[0];
  const AUTRE = "00000000-0000-0000-0000-000000000001";
  const R = lf.LECTURE_FOND_BEEBS_RYTHME;
  const t = Date.parse("2026-10-25T19:00:00Z");
  const base = { versionOk: true, luesAujourdhui: 0, dernierRefusMs: null, maintenant: t, rythme: R };
  ok(lf.LECTURE_FOND_BEEBS_VERSION_MIN === "0.6.145" && lf.LECTURE_FOND_BEEBS_MODE_DEFAUT === 1, "Beebs : extension ≥ 0.6.145, mode par défaut 1 (le pilote seul)");
  ok(R.par_cycle === 2 && R.ecart_s.join("-") === "30-60" && R.par_jour === 120 && R.pause_refus_h === 12, "rythme Beebs : 2 pages par poll, 30 à 60 s d'écart, 120 par jour, 12 h de coupure");
  ok(lf.modeLectureFond(undefined, lf.LECTURE_FOND_BEEBS_MODE_DEFAUT) === 1 && lf.modeLectureFond(2, 1) === 2 && lf.modeLectureFond("x", 1) === 1, "lecture_fond_mode_beebs : absent → 1, lu de 0 à 3");
  const p = lf.regleLectureFond({ ...base, userId: NICO, mode: 1 });
  ok(p.actif && p.mode === "mesure" && p.par_cycle === 2 && p.ecart_s.join("-") === "30-60" && p.par_jour === 120, "mode 1 : le poste pilote MESURE au rythme Beebs", JSON.stringify(p));
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 1, payant: true }).actif === false, "mode 1 : personne d'autre");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 2, payant: true }).mode === "rattrapage", "mode 2 : les payants rattrapent");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, dernierRefusMs: t - 11 * 3600_000 }).raison === "refus_recent", "un refus de Beebs il y a 11 h : coupé (12 h)");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, dernierRefusMs: t - 13 * 3600_000 }).actif === true, "13 h après : rouvert");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, luesAujourdhui: 120 }).raison === "plafond_du_jour", "120 pages dans la journée : plafond");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, luesAujourdhui: 119 }).par_cycle === 1, "le plafond est tenu à la page près");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, pauseAntirobot: true }).raison === "pause_antirobot", "un job Beebs du compte en attente anti-robot : rien");
  const v = lf.regleLectureFond({ userId: AUTRE, mode: 3, versionOk: true, maintenant: t, dernierRefusMs: t - 7 * 3600_000 });
  ok(v.actif === true && v.par_cycle === 3 && v.par_jour === 300, "Vinted inchangé (rythme par défaut : 3 par poll, 300 par jour, 6 h)", JSON.stringify(v));
}

console.log("2. Quoi lire (Beebs)");
{
  const t = Date.parse("2026-10-25T19:00:00Z");
  const a = (o = {}) => ({ listing_id: "34092066", url: "https://www.beebs.app/fr/p/34092066", inventaire_id: 1791804493818, created_at: "2026-10-14T08:00:00Z",
    capture_le: null, capture_photos: null, fiche_au_stock: true, fiche_manque: true, page_beebs_lue: null, ...o });
  ok(lf.aLireEnFondBeebs(a(), t) === true, "fiche au stock à une photo, jamais capturée : lue (fiche 1791804493818, 34092066 — vue au relevé le 14/10, jamais capturée)");
  ok(lf.aLireEnFondBeebs(a({ capture_le: "2026-10-20T10:00:00Z", capture_photos: 2 }), t) === false, "déjà capturée avec plusieurs photos : les déclencheurs complètent la fiche, rien à relire");
  ok(lf.aLireEnFondBeebs(a({ capture_le: "2026-10-20T10:00:00Z", capture_photos: 1 }), t) === true, "capturée avec UNE photo : relue");
  ok(lf.aLireEnFondBeebs(a({ fiche_manque: false }), t) === false, "fiche complète : rien");
  ok(lf.aLireEnFondBeebs(a({ fiche_au_stock: false }), t) === false, "fiche vendue, fusionnée ou absente : rien");
  ok(lf.aLireEnFondBeebs(a({ page_beebs_lue: { at: "2026-10-15T10:00:00Z" } }), t) === false, "lue il y a 10 jours : pas avant 30 jours");
  ok(lf.aLireEnFondBeebs(a({ page_beebs_lue: { at: "2026-10-15T10:00:00Z", echec: "introuvable" } }), t) === true, "échec il y a 10 jours : relue (7 jours)");
  ok(lf.aLireEnFondBeebs(a({ page_beebs_lue: { at: "2026-10-23T10:00:00Z", echec: "introuvable" } }), t) === false, "échec il y a 2 jours : pas encore");
  ok(lf.aLireEnFondBeebs(a({ url: "https://evil.example/fr/p/34092066" }), t) === false && lf.aLireEnFondBeebs(a({ listing_id: "abc" }), t) === false,
    "jamais une autre adresse que www.beebs.app, jamais un identifiant illisible");
  const annonces = [
    a({ listing_id: "1", url: "https://www.beebs.app/fr/p/1", created_at: "2026-10-20T00:00:00Z" }),
    a({ listing_id: "2", url: "https://www.beebs.app/fr/p/2", created_at: "2026-10-24T00:00:00Z" }),
    a({ listing_id: "3", url: "https://www.beebs.app/fr/p/3", created_at: "2026-10-22T00:00:00Z", fiche_manque: false }),
    a({ listing_id: "4", url: "https://www.beebs.app/fr/p/4", created_at: "2026-10-23T00:00:00Z", capture_le: "2026-10-23T01:00:00Z", capture_photos: 2 }),
  ];
  const rat = lf.listeLectureFondBeebs(annonces, { actif: true, mode: "rattrapage", par_cycle: 2 }, t);
  ok(rat.map((x) => x.listing_id).join(",") === "2,1" && rat.every((x) => x.plateforme === "beebs" && x.ecrire === undefined && x.url.startsWith("https://www.beebs.app/")),
    "rattrapage : seulement les annonces à lire, les plus récentes d'abord, 2 par poll", JSON.stringify(rat));
  const mes = lf.listeLectureFondBeebs(annonces.map((x) => ({ ...x, fiche_manque: false })), { actif: true, mode: "mesure", par_cycle: 2 }, t);
  ok(mes.length === 2 && mes.every((x) => x.ecrire === false), "mesure (pilote, tout complet) : une rotation sur ses annonces, rien d'écrit", JSON.stringify(mes));
  const mes2 = lf.listeLectureFondBeebs(annonces, { actif: true, mode: "mesure", par_cycle: 2 }, t);
  ok(mes2[0]?.ecrire === true && mes2[0]?.listing_id === "2", "mesure : les vraies annonces à lire du pilote d'abord (écrites)", JSON.stringify(mes2));
  ok(lf.listeLectureFondBeebs(annonces, { actif: false }, t).length === 0, "règle fermée : rien servi");
  ok(lf.refusAntirobotBeebs("HTTP 403") && lf.refusAntirobotBeebs("HTTP 429") && lf.refusAntirobotBeebs("anti-robot") && lf.refusAntirobotBeebs(null, 403)
    && !lf.refusAntirobotBeebs("HTTP 404") && !lf.refusAntirobotBeebs("page rendue : une autre adresse"), "serveur : 403, 429, page de vérification = refus ; 404 n'en est pas un");
}

console.log("3. L'extension (0.6.145)");
{
  const bg = lire("chrome-extension/background.js");
  const manifest = JSON.parse(lire("chrome-extension/manifest.json"));
  ok(manifest.version === "0.6.145", `manifest en 0.6.145 (lu : ${manifest.version})`);
  const extraire = (nom) => { const i = bg.indexOf(`function ${nom}(`); return i < 0 ? "" : bg.slice(i, bg.indexOf("\n}\n", i) + 2); };
  const motifLectureBeebs = new Function(`${extraire("motifLectureBeebs")}\nreturn motifLectureBeebs;`)();
  ok(motifLectureBeebs("HTTP 403").motif === "antirobot" && motifLectureBeebs("HTTP 429").http === 429 && motifLectureBeebs("anti-robot").motif === "antirobot",
    "403 / 429 / page de vérification → « antirobot » (jamais « HTTP 403 » tout court, qui ne coupait rien)");
  ok(motifLectureBeebs("HTTP 404").motif === "introuvable" && motifLectureBeebs("page rendue : une autre adresse").motif === "page_sans_annonce"
    && motifLectureBeebs("page sans données d'annonce").motif === "page_sans_annonce", "404 → introuvable ; redirection ou page sans annonce → page_sans_annonce");
  const lecture = extraire("lirePageBeebsSansNaviguer");
  ok(lecture && !/chrome\.tabs\.update/.test(lecture) && /func: lireHtmlMemeOrigine/.test(lecture) && /getOrCreateWorkTab\("beebs", "https:\/\/www\.beebs\.app\/"\)/.test(lecture),
    "la page est lue par une requête de même origine ; l'onglet n'est jamais envoyé vers l'annonce (réveillé sur l'accueil seulement)");
  const fond = extraire("lireFondBeebs");
  ok(/if \(releveEnCours\) return;/.test(fond) && /lectureFondBeebsEnPause\(\)/.test(fond), "jamais pendant un relevé du poste, jamais pendant la pause");
  ok(/r\?\.motif === "antirobot"[\s\S]{0,200}poserPauseLectureFondBeebs\(12\);\s*return;/.test(fond), "premier refus de Beebs : arrêt 12 h, tout de suite");
  ok(/regle\.mode === "mesure" && l\.ecrire !== true\) continue;/.test(fond), "mesure : rien d'écrit (sauf les vraies annonces à lire du pilote)");
  ok(/plateforme: "beebs"/.test(extraire("tracerLectureFondBeebs")), "chaque lecture se trace avec sa plateforme (« beebs »)");
  ok(/lectureFondBeebsServie = rep\.lecture_fond_beebs && typeof rep\.lecture_fond_beebs === "object"/.test(bg), "le poll lit ce que le serveur ouvre (lecture_fond_beebs)");
  const iVinted = bg.indexOf("await lireFondVinted(session)");
  const iBeebs = bg.indexOf("await lireFondBeebs(session)");
  ok(iVinted > 0 && iBeebs > iVinted, "lue après la lecture de fond Vinted, dans le poll (sous le verrou de flux)");
  ok(/lecturesFondBeebsDuCycle\.clear\(\);/.test(bg), "jamais deux fois la même annonce dans un cycle");
  ok(/page_beebs_lue: \{ v: at, source: "beebs_page", at/.test(extraire("marquerLectureBeebs")), "la fiche garde la date de sa lecture (relue au plus tôt à 30 jours, 7 après un échec)");
}

console.log("4. Le serveur (get-pending-jobs, ops-digest)");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/versionAuMoins\(version, LECTURE_FOND_BEEBS_VERSION_MIN\)/.test(gpj) && /lecture_fond_beebs: lectureFondBeebs/.test(gpj), "servi aux seuls postes ≥ 0.6.145, sous `lecture_fond_beebs`");
  ok(/\.eq\("key", "lecture_fond_mode_beebs"\)/.test(gpj) && /modeLectureFond\(cfgLb\.data\?\.value, LECTURE_FOND_BEEBS_MODE_DEFAUT\)/.test(gpj), "son propre interrupteur (coin_config.lecture_fond_mode_beebs)");
  ok(/\.eq\("metadata->>plateforme", "beebs"\)\.eq\("metadata->>resultat", "antirobot"\)/.test(gpj), "refus Beebs comptés à part");
  ok((gpj.match(/\.or\("metadata->>plateforme\.is\.null,metadata->>plateforme\.eq\.vinted"\)/g) ?? []).length >= 2,
    "Vinted : un refus ou une lecture Beebs ne coupe pas la lecture Vinted (refus et plafond du jour comptés par plateforme)");
  ok(/\.limit\(200\)/.test(gpj.slice(gpj.indexOf("BEEBS EN ARRIÈRE-PLAN")))
    && /capture_photo2:capture->photos->1/.test(gpj), "lectures bornées (200 annonces ; la 2e photo seulement, jamais tout le tableau)");
  const dg = lire("supabase/functions/ops-digest/index.ts");
  ok(/\.range\(page \* 1000, page \* 1000 \+ 999\)/.test(dg) && /metadata\?\.plateforme \?\? "vinted"/.test(dg), "ops-digest : le journal lu par pages (plus de coupure à 1 000) et par plateforme");
}

console.log(`\n${rouges ? "✗" : "✓"} lecture-fond-beebs : ${verts} verts, ${rouges} ratés`);
if (rouges) process.exit(1);
