// Autotest — un dépôt sans numéro est rattaché par le relevé : les photos de
// NOTRE copie — `npm run selftest:depot-sans-numero`
// (_shared/depot-sans-numero.js, beebs-lien).
// Données RELEVÉES en base le 15/10 (fixture) : nicolas.menar (39bfa95a), 6
// dépôts Beebs « publiés » sans numéro (30/09-01/10), 6 annonces en ligne
// reliées à rien. Les photos rattachent 3 dépôts ; les 3 autres (copie d'une
// seule photo, autre prise de vue) restent tels quels.
import { rattacherParPhotos, candidatesDuDepot, depotPublicationPeutEtrePartiDepuis } from "../supabase/functions/_shared/depot-sans-numero.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const F = JSON.parse(fs.readFileSync(new URL("./fixtures/depots-sans-numero-nicolas-menar-1510.json", import.meta.url), "utf8"));
const emp = (u) => (F.empreintes[u] ? { url: u, ...F.empreintes[u] } : undefined);

console.log("\n1. NICOLAS.MENAR : LES PHOTOS DE LA COPIE DÉSIGNENT L'ANNONCE");
const r = rattacherParPhotos({ depots: F.depots, lignes: F.lignes, empreinte: emp });
const attendu = { "80053a31": "34085142", "cc51213c": "34085194", "faa2b229": "34085172" };
ok(r.size === 3, "trois dépôts rattachés", JSON.stringify([...r]));
for (const [jid, c] of r) ok(attendu[jid.slice(0, 8)] === c.listing_id, `dépôt ${jid.slice(0, 8)} → annonce ${c.listing_id}`, JSON.stringify(c.photos));
ok(![...r.keys()].some((j) => /^(64a2ef50|de036ed3|8a66de4d)/.test(j)), "les dépôts dont les photos ne désignent rien restent tels quels");

console.log("\n2. JAMAIS LE TITRE, JAMAIS SANS PHOTO, JAMAIS DEUX DÉPÔTS POUR UNE ANNONCE");
const sansPhotos = rattacherParPhotos({ depots: F.depots, lignes: F.lignes, empreinte: () => undefined });
ok(sansPhotos.size === 0, "sans empreintes : rien n'est rattaché (le titre identique ne suffit pas)");
const d0 = F.depots.find((d) => d.id.startsWith("80053a31"));
const jumeau = { ...d0, id: "00000000-0000-0000-0000-000000000001" };
const r2 = rattacherParPhotos({ depots: [d0, jumeau], lignes: F.lignes, empreinte: emp });
ok(!r2.has(d0.id) && !r2.has(jumeau.id), "deux dépôts aux mêmes photos désignent la même annonce → aucun des deux (deux exemplaires)");
const reliee = F.lignes.map((a) => (a.listing_id === "34085142" ? { ...a, job_id: "autre-job" } : a));
ok(!rattacherParPhotos({ depots: [d0], lignes: reliee, empreinte: emp }).has(d0.id), "une annonce déjà reliée à un autre job n'est jamais prise");
const vueAvant = F.lignes.map((a) => (a.listing_id === "34085142" ? { ...a, created_at: "2026-09-01T00:00:00Z" } : a));
ok(candidatesDuDepot(d0, vueAvant).every((a) => a.listing_id !== "34085142"), "une annonce vue avant le dépôt n'est pas candidate");
const desactivee = F.lignes.map((a) => (a.listing_id === "34085142" ? { ...a, statut_plateforme: "desactivee" } : a));
ok(!rattacherParPhotos({ depots: [d0], lignes: desactivee, empreinte: emp }).has(d0.id), "une annonce désactivée n'est pas candidate");

console.log("\n3. BEEBS-LIEN L'APPLIQUE");
const bl = fs.readFileSync(new URL("../supabase/functions/beebs-lien/index.ts", import.meta.url), "utf8");
ok(/rattacherParPhotos\(/.test(bl), "beebs-lien appelle rattacherParPhotos");
ok(/lien_par_photos/.test(bl) && /\.is\("platform_listing_id", null\)/.test(bl), "trace lien_par_photos, écriture conditionnée (numéro encore vide)");


console.log("\n4. CIDDJY : JAMAIS UN DEUXIÈME DÉPÔT À L'AVEUGLE (traces relevées le 15/10)");
const pfC = { work_window_state: { at_start: { at: "2026-10-15T17:44:54.800Z" }, at_end: { at: "2026-10-15T17:49:55.530Z" }, fins: [{ at: "2026-10-15T17:49:55.530Z" }] },
  error_technique: { at: "2026-10-15T17:49:56.827Z", brut: "Timeout: pas de réponse du content script" } };
ok(depotPublicationPeutEtrePartiDepuis("beebs", pfC)?.at === "2026-10-15T17:49:55.530Z", "cee154c7 « Jogging 18 mois » : formulaire muet après 5 min → le clic a pu partir, relevé avant tout redépôt");
const pfD = { work_window_state: { at_start: { at: "2026-10-15T17:56:01.738Z" } } };
ok(!!depotPublicationPeutEtrePartiDepuis("beebs", pfD), "da40eadc « Pantalon 36 mois » : essai commencé, poste muet, aucune fin → retenu");
const pfJ = { work_window_state: { at_start: { at: "2026-10-15T17:50:27.818Z" }, at_end: { at: "2026-10-15T17:54:03.954Z" } },
  last_diagnostic: "[sonde beebs, dépôt non confirmé : AUCUNE capture — la soumission n'est jamais partie, ou est partie hors fetch/XHR du top frame]" };
ok(depotPublicationPeutEtrePartiDepuis("beebs", pfJ) === null, "7b37d91b : aucune requête partie (sonde) → un nouvel essai n'est pas à l'aveugle");
const pfCapt = { ...pfJ, last_diagnostic: "[sonde beebs, dépôt non confirmé : 1 capture(s) non-GET : /fr/listing → HTTP 200 · corps: …]" };
ok(!!depotPublicationPeutEtrePartiDepuis("beebs", pfCapt), "non confirmé AVEC une requête partie → retenu");
ok(depotPublicationPeutEtrePartiDepuis("beebs", { ...pfC, depot_verifie: { apres: "2026-10-15T17:49:55.530Z" } }) === null, "vérifié après l'essai (aucune annonce apparue) → servi");
ok(depotPublicationPeutEtrePartiDepuis("beebs", { ...pfC, depot_deja_parti: { le: "2026-10-15T20:00:00Z" }, derniere_relance_manuelle: "2026-10-15T20:05:00Z" }) === null,
  "question posée puis relance de la personne → sa réponse, jamais une boucle");
ok(depotPublicationPeutEtrePartiDepuis("leboncoin", pfC) === null, "Beebs seulement (Leboncoin a son propre circuit)");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/depotPublicationPeutEtrePartiDepuis\("beebs"/.test(gpj) && /declencheur: "serveur:verif_redepot"/.test(gpj) && /needs_user_source: "depot_deja_parti"/.test(gpj),
  "get-pending-jobs retient, demande un relevé, rattache par les photos ou pose la question");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
