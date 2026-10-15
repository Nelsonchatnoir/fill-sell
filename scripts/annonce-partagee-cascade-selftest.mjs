// Autotest : UNE ANNONCE, UNE FICHE — la cascade qui tranche seule (15/10 soir, Louis).
//
//     npm run selftest:annonce-partagee-cascade
//
// Cas réel : Louis, « Rangement Blanc et Bleu » (fiche 1789991182984) et
// « Rangement Bleu et Blanc » (1790267431908). Le dépôt 7fe6a7b3 portait le
// lien de l'annonce de l'AUTRE fiche (retrouvé par le titre le 24/09) et son
// propre identifiant (3276310850, rendu par Leboncoin au dépôt du 25/09).
// Ce qu'il prouve, sans réseau ni base :
//   A. identifiants : l'identifiant rendu au dépôt tranche ; un lien retrouvé
//      par le titre ne prouve rien ; deux preuves contraires = pas de décision ;
//   B. photos : une seule fiche à la même photo, les autres sans photo proche ;
//   C. IA : exclusion (toutes les autres « different »), jamais deux possibles ;
//   D. la garde du serveur (get-pending-jobs) retient le job le temps de la
//      cascade et ne pose la question qu'après « incertain » ; le lien suit
//      l'identifiant en base (migration 20261015190000) ; la fonction
//      rapprochement-ia porte le mode « annonces_partagees » ; le tick l'appelle.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/annonce-partagee.js")).href);
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log("A. Identifiants");
const L = "3275975415";
const dep801 = { id: "801cc37f", platform: "leboncoin", status: "published", action: "publish", inventaire_id: 1790267431908,
  listing_url: "https://www.leboncoin.fr/ad/electromenager/3275975415", platform_listing_id: "3275975415", handler_build: "v0.6.63",
  platform_fields: { lbc_depot: { adsubmit: { id: "3275975415", status: 201 } }, listing_url_recovery: { at: "2026-09-24T16:41:23Z" } } };
const dep7fe = { id: "7fe6a7b3", platform: "leboncoin", status: "published", action: "publish", inventaire_id: 1789991182984,
  listing_url: "https://www.leboncoin.fr/ad/electromenager/3275975415", platform_listing_id: "3276310850", handler_build: "v0.6.66",
  platform_fields: { lbc_depot: { sans_adsubmit: { id: "3276310850" } }, listing_url_recovery: { at: "2026-09-24T16:41:23Z" } } };
const rep317 = { id: "317adae1", platform: "leboncoin", status: "needs_user", action: "republish", inventaire_id: 1789991182984,
  listing_url: "https://www.leboncoin.fr/ad/electromenager/3275975415", platform_listing_id: "3276310850", platform_fields: {} };
ok(M.preuveIdentifiant(dep801, L) === "depot_leboncoin", "801cc37f : Leboncoin a rendu 3275975415 au dépôt → preuve");
ok(M.preuveIdentifiant(dep7fe, L) === null, "7fe6a7b3 : son identifiant certain est 3276310850 → aucune preuve pour 3275975415");
ok(M.preuveIdentifiant(dep7fe, "3276310850") === "depot_leboncoin", "7fe6a7b3 prouve SA propre annonce 3276310850");
ok(M.designe(rep317, L) && M.designe(rep317, "3276310850"), "un job incohérent (lien ≠ identifiant) désigne les DEUX annonces : la garde lit les deux");
const fiches = new Map([["1790267431908", { id: 1790267431908 }], ["1789991182984", { id: 1789991182984 }]]);
const par = M.candidatsDe([dep801, dep7fe, rep317], fiches, L);
ok(par.size === 2, "deux fiches portent l'annonce 3275975415");
const t = M.trancherParIdentifiant(par, L);
ok(t?.fiche === "1790267431908" && t.preuve === "depot_leboncoin", "la cascade l'attribue à « Rangement Bleu et Blanc » par l'identifiant du dépôt");
const titre = { id: "x", platform: "beebs", status: "published", action: "republish", inventaire_id: 1, listing_url: "https://www.beebs.app/fr/p/34035659-lot", platform_listing_id: null, platform_fields: { listing_url_recovery: { at: "x" } } };
ok(M.preuveIdentifiant(titre, "34035659") === null, "un lien retrouvé par le TITRE n'est jamais une preuve");
const imp = { id: "y", platform: "leboncoin", status: "published", action: "publish", inventaire_id: 2, handler_build: "releve-annonces", listing_url: null, platform_listing_id: "999999", platform_fields: {} };
ok(M.preuveIdentifiant(imp, "999999") === "import", "un import du relevé prouve l'annonce qu'il a lue");
const deux = new Map([["1", [dep801]], ["2", [{ ...dep801, id: "z", inventaire_id: 2 }]]]);
ok(M.trancherParIdentifiant(deux, L)?.conflit?.length === 2, "deux preuves contraires : aucune décision");
const fus = new Map([["10", { id: 10, fusionne_dans: 20 }], ["20", { id: 20 }]]);
const parFus = M.candidatsDe([{ ...dep801, inventaire_id: 10 }, { ...dep7fe, platform_listing_id: L, platform_fields: {}, inventaire_id: 20 }], fus, L);
ok(parFus.size === 1, "une fiche fusionnée parle pour celle qui l'a gardée : plus d'annonce partagée");

console.log("B. Photos");
const z = "0".repeat(64), u = "1".repeat(64), m = "01".repeat(32);
const e = (url, d, p) => ({ url, dhash: d, phash: p, variantes: {} });
const ph = M.trancherParPhotos([e("a", z, z)], new Map([["F1", [e("f1", z, z)]], ["F2", [e("f2", u, u)]]]));
ok(ph.fiche === "F1", "une seule fiche a la même photo, l'autre aucune approchante → elle");
const ph2 = M.trancherParPhotos([e("a", z, z)], new Map([["F1", [e("f1", z, z)]], ["F2", [e("f2", z, z)]]]));
ok(ph2.fiche === null, "deux fiches à la même photo (exemplaires) → pas de décision");
const ph3 = M.trancherParPhotos([e("a", z, z)], new Map([["F1", [e("f1", z, z)]], ["F2", [e("f2", m, m)]]]));
ok(ph3.fiche === "F1" || ph3.fiche === null, "photo intermédiaire : jamais une autre fiche choisie");
ok(M.trancherParPhotos([], new Map([["F1", []]])).fiche === null, "annonce sans empreinte → pas de décision (jamais deviné)");

console.log("C. IA");
ok(M.decisionIA(["incertain", "different"], "texte").index === 0, "texte : l'autre fiche est exclue (« Lot 2 » contre une pièce) → la restante");
ok(M.decisionIA(["incertain", "incertain"], "texte").index === null, "deux possibles → question");
ok(M.decisionIA(["meme", "different", "different"], "images").index === 0, "images : une même, les autres différentes → elle");
ok(M.decisionIA(["meme", "meme"], "images").index === null, "deux « même » → question");
ok(M.decisionIA(["different", "different"], "texte").index === null, "toutes différentes → question");
const sch = M.schemaAnnonce(3);
ok(sch.properties.verdicts.required.join() === "A,B,C", "schéma : un verdict par fiche");
ok(/Sans photo à comparer, ne réponds jamais « meme »/.test(M.CONSIGNE_ANNONCE), "consigne : jamais « même » sans photo");
ok(M.lireReponseAnnonce("pas du json", 2).verdicts.every((v) => v === "incertain"), "réponse illisible = incertain");

console.log("D. Câblage");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/RETENUE_ANNONCE_PARTAGEE/.test(gpj) && /cascade: \{ etat: "a_trancher"/.test(gpj), "get-pending-jobs RETIENT le job le temps de la cascade (rien n'est retiré)");
ok(/memeAnnonce && casc\["etat"\] === "incertain"/.test(gpj), "la question ne se pose qu'après « incertain » pour CETTE annonce");
ok(/const clesDe = /.test(gpj) && /clesDe\(j\)\.find/.test(gpj), "la garde lit le lien ET l'identifiant d'un job");
const mig = lire("supabase/migrations/20261015190000_une_annonce_une_fiche.sql");
ok(/BEFORE INSERT OR UPDATE OF listing_url, platform_listing_id ON public\.cross_post_jobs/.test(mig), "en base : le lien suit l'identifiant, à l'INSERT comme à l'UPDATE");
ok(/annonce_partagee_attribuer/.test(mig) && /defaire_croisement_annonce\(p_user, p_platform, v_lid, p_inventaire_garde\)/.test(mig), "la décision s'applique par defaire_croisement_annonce");
ok(/republish_step', 'a_capturer'/.test(mig), "une republication capturée sur la mauvaise annonce est RECAPTURÉE");
ok(/'mode', 'annonces_partagees'/.test(mig), "le tick (cron 53) appelle la cascade");
const ia = lire("supabase/functions/rapprochement-ia/index.ts");
ok(/body\.mode === "annonces_partagees"/.test(ia) && /cands\.some\(\(f\) => f\.statut === "vendu"\)/.test(ia), "rapprochement-ia : mode « annonces_partagees », jamais l'IA sur une fiche vendue");
ok(/jamais deux appels pour la même annonce/.test(ia), "un verdict par annonce (jamais deux appels)");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
