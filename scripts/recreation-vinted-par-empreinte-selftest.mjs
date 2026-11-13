// ═══════════════════════════════════════════════════════════════════════════
// VERROU — la copie d'une remise en ligne Vinted se reconnaît côté SERVEUR par son NUMÉRO ou l'EMPREINTE de ses
// photos, JAMAIS par son titre (13/11, lot du 13/11, décision K1 de Nico : « Passe les deux rattachements serveur
// restants (recreation-vinted-verifiee et la base) à l'empreinte des photos. Plus aucun rattachement par le titre. »)
//   npm run selftest:recreation-vinted-par-empreinte
// Fichiers : supabase/functions/_shared/recreation-vinted-verifiee.js (get-pending-jobs, garde avant tout nouvel
// essai), supabase/migrations/20261113190000_recreation_vinted_par_empreinte.sql (déclencheur
// inventaire_rattache_recreation_vinted, prod lue par pg_get_functiondef le 13/11, identique à 20261018170000).
// Le comportement SQL est prouvé sur un Postgres JETABLE : scripts/recreation-vinted-par-empreinte-banc.mjs.
//
// Cas RÉELS (heures UTC, relues en base le 13/11 en lecture seule ; titres remplacés par des titres d'essai) :
//   · compte 2189c4d8, tâche a4733d01 (25/10) et compte 02ca0f20, tâche 6b5f8dd1 (27/10) : la base a RETIRÉ une
//     « copie de plus » (10526669221, 10544108264) sur le seul accord titre + heure + boutique ;
//   · compte 2bde8576, tâche 74f1abc0 (06/11) : retrait 13:40:20, envois 13:40:20 et 13:40:36 ; le relevé de 17:47
//     importe 10688541821 (vue à 13:40:35, même titre), 10488183214 et 10484319220 (autres titres) ;
//   · compte 8a2eba68, tâche 46569b9d (11/11) : retrait 12:24:20 ; 10761740884 et 10761815139, vues à 12:29 et
//     12:34, sont les remises en ligne de DEUX AUTRES fiches (leurs propres tâches les ont créées) ; le compte
//     2bde8576 remet aussi en ligne par des tâches SANS fiche (74f1abc0, cc590cc1) ;
//   · compte 67a8b907, tâche 9138772c (24/10) : la copie 10514173498 est née sous un AUTRE titre que celui de la
//     fiche (le champ de Vinted avait retiré le saut de ligne) — un titre réécrit ne doit jamais faire un doublon.
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import * as M from "../supabase/functions/_shared/recreation-vinted-verifiee.js";

let ko = 0, verts = 0;
const ok = (c, nom, d = "") => {
  if (c) { verts++; console.log(`  ✓ ${nom}`); } else { ko++; console.error(`  ✗ ${nom}${d ? `\n      ${String(d).slice(0, 400)}` : ""}`); }
};
const lire = (p) => { try { return readFileSync(new URL(`../${p}`, import.meta.url), "utf8"); } catch { return ""; } };

// Empreintes d'essai : 64 bits tirés d'une graine (même graine = même photo ; deux graines ≈ 32 bits d'écart).
const bits64 = (graine) => [...crypto.createHash("sha256").update(String(graine)).digest()].slice(0, 8)
  .map((o) => o.toString(2).padStart(8, "0")).join("");
const ligneEmpreinte = (url, graine) => ({ url, dhash: bits64(`d:${graine}`), phash: bits64(`p:${graine}`), variantes: null });
const empreintesDe = (lignes) => { const m = new Map(lignes.map((l) => [l.url, l])); return (u) => m.get(u); };

const STO = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/essai/republish";
const CDN = (jeton, n) => `https://images1.vinted.net/tc/${jeton}/${n}.jpeg?s=essai`;
const JETON_A = "01_0aaa1_EssaiJetonNotreEnvoiA1";
const JETON_B = "01_0bbb2_EssaiJetonNotreEnvoiB2";

// ── Cas 74f1abc0 (compte 2bde8576, 06/11) ──────────────────────────────────────────────────────────────────────────
const TITRE_74 = "Robe pull laine essai T38";
const pf74 = {
  republish_step: "deleted", vinted_item_id: "9501765425", vinted_account_id: "12633044",
  suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-11-06T13:40:20.000Z" },
  deleted_at: "2026-11-06T13:40:20.000Z", recreation_envois: ["2026-11-06T13:40:20.000Z", "2026-11-06T13:40:36.430Z"],
  recreation_tentee: { n: 1, at: "2026-11-06T13:40:36.430Z" },
  depot_incertain: { at: "2026-11-06T13:40:50.000Z", motif: "redirection_profil_sans_copie_lue" },
  recreation_attente_releve: { depuis: "2026-11-06T13:41:51.509Z", essai: "2026-11-06T13:40:36.430Z", motif: "depot_incertain" },
  republish_snapshot: { titre: TITRE_74, photos: [`${STO}/9501765425/a_0.jpg`, `${STO}/9501765425/a_1.jpg`, `${STO}/9501765425/a_2.jpg`] },
};
const job74 = { id: "74f1abc0-0000-4000-8000-000000000001", platform: "vinted", action: "republish", status: "pending",
  inventaire_id: null, title: TITRE_74, photos: [], platform_fields: pf74 };
const cree74 = "2026-11-06T17:47:29.000Z";
const copie74 = { id: 1793987248782010, vinted_item_id: "10688541821", titre: TITRE_74, listed_at_guess: "2026-11-06T13:40:35Z",
  vinted_account_id: "12633044", created_at: cree74, photos: [CDN("01_0c74a_EssaiCopie74f1abcA", 1), CDN("01_0c74b_EssaiCopie74f1abcB", 2)] };
const autre74a = { id: 1793987248782009, vinted_item_id: "10488183214", titre: "Gilet coton essai", listed_at_guess: "2026-11-06T13:41:12Z",
  vinted_account_id: "12633044", created_at: cree74, photos: [CDN("01_0d74a_EssaiAutre74f1abcA", 3)] };
const autre74b = { id: 1793987248782008, vinted_item_id: "10484319220", titre: "Jupe plissée essai", listed_at_guess: "2026-11-06T13:46:13Z",
  vinted_account_id: "12633044", created_at: cree74, photos: [CDN("01_0e74a_EssaiAutre74f1abcB", 4)] };
const fiches74 = [copie74, autre74a, autre74b];
// Les photos des candidates ont leur empreinte (relevé du 06/11) ; celles de NOTRE copie (republish_snapshot) n'en ont aucune.
const empCandidates74 = [
  ligneEmpreinte(copie74.photos[0], "robe-1"), ligneEmpreinte(copie74.photos[1], "robe-2"),
  ligneEmpreinte(autre74a.photos[0], "gilet-1"), ligneEmpreinte(autre74b.photos[0], "jupe-1"),
];
const empSnapshot74 = pf74.republish_snapshot.photos.map((u, i) => ligneEmpreinte(u, ["robe-1", "robe-2", "robe-3"][i]));
const T74 = Date.parse("2026-11-06T18:00:00Z");
const releve74 = { id: "rv74", kind: "dressing", status: "done", declencheur: "bouton", started_at: "2026-11-06T17:45:00Z", items_vus: 312, total_entries: 312 };

console.log("A. 74f1abc0 (compte 2bde8576) — photos de NOTRE copie sans empreinte : le doute, jamais une décision au titre");
{
  const d = M.decisionVerificationRecreation(job74, { releves: [releve74], fiches: fiches74, maintenant: T74, pageUneAveugle: false,
    empreinte: empreintesDe(empCandidates74) });
  ok(d?.action === "retenir", "même titre, mais aucune empreinte de notre copie : RETENUE (attente), pas une question au titre", JSON.stringify(d?.action));
  ok(d?.platform_fields?.recreation_attente_releve?.motif === "copie_possible_photos_a_comparer",
    "motif vrai : une annonce apparue pendant nos envois, photos à comparer", JSON.stringify(d?.platform_fields?.recreation_attente_releve));
  const urls = d?.empreintes_a_calculer ?? [];
  ok(Array.isArray(urls) && urls.length > 0 && urls.length <= 5 && urls[0] === pf74.republish_snapshot.photos[0],
    "les photos de NOTRE copie sont demandées en premier (≤ 5 par appel)", JSON.stringify(urls));
  ok(d?.platform_fields?.recreation_empreintes_demandees?.n === urls.length, "la demande est tracée sur la tâche (une par 10 min au plus)");
  const d2 = M.decisionVerificationRecreation({ ...job74, platform_fields: d?.platform_fields ?? pf74 },
    { releves: [releve74], fiches: fiches74, maintenant: T74 + 3 * 60_000, pageUneAveugle: false, empreinte: empreintesDe(empCandidates74) });
  ok(d2?.action === "retenir" && !(d2?.empreintes_a_calculer ?? []).length, "3 min plus tard : toujours retenue, aucune nouvelle demande d'empreintes");
  const d3 = M.decisionVerificationRecreation(job74, { releves: [releve74], fiches: fiches74, maintenant: T74 + 2 * 60_000, pageUneAveugle: false,
    empreinte: empreintesDe([...empCandidates74, ...empSnapshot74]) });
  ok(d3?.action === "question" && /10688541821/.test(d3?.error ?? "") && !/10488183214|10484319220/.test(d3?.error ?? ""),
    "empreintes calculées : la copie aux photos de notre envoi est reconnue (la question), les deux autres sont écartées", d3?.error);
  ok(d3?.platform_fields?.recreation_deja_partie?.preuves?.[0]?.preuve === "photos_copie", "la preuve est tracée : photos de notre copie",
    JSON.stringify(d3?.platform_fields?.recreation_deja_partie));
  const d4 = M.decisionVerificationRecreation({ ...job74, platform_fields: { ...pf74, recreation_attente_releve: { ...pf74.recreation_attente_releve, depuis: "2026-11-06T11:00:00Z" } } },
    { releves: [releve74], fiches: fiches74, maintenant: T74, pageUneAveugle: false, empreinte: empreintesDe(empCandidates74) });
  ok(d4?.action === "question" && d4?.platform_fields?.needs_user_source === "recreation_deja_partie" && /10688541821/.test(d4?.error ?? ""),
    "6 h de doute sans empreinte : la question honnête (liens des annonces à regarder), jamais un redépôt", d4?.error);
}

console.log("B. Même titre, photos DIFFÉRENTES (deux articles d'un revendeur au même titre) : jamais une copie");
{
  const pfB = { ...pf74, depot_incertain: undefined, recreation_attente_releve: undefined };
  const jobB = { ...job74, platform_fields: pfB };
  const homonyme = { ...copie74, photos: [CDN("01_0f74a_EssaiHomonymeA", 9)] };
  const d = M.decisionVerificationRecreation(jobB, { releves: [releve74], fiches: [homonyme], maintenant: T74, pageUneAveugle: true,
    empreinte: empreintesDe([...empSnapshot74, ligneEmpreinte(homonyme.photos[0], "autre-article")]) });
  ok(d?.action === "servir", "photos prouvées différentes de notre copie : pas une copie — l'essai suivant part après le relevé de la personne", JSON.stringify(d?.action));
  ok((M.copiesProbables?.(jobB, [homonyme], { empreinte: empreintesDe([...empSnapshot74, ligneEmpreinte(homonyme.photos[0], "autre-article")]) }) ?? [1]).length === 0,
    "copiesProbables : un titre identique ne fait plus une copie");
}

console.log("C. 9138772c (compte 67a8b907) — copie née sous un AUTRE titre, à nos photos : reconnue, jamais un second envoi");
{
  const pfC = {
    republish_step: "deleted", vinted_item_id: "3532781567", vinted_account_id: "21011125",
    suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-10-24T16:52:54.000Z" },
    deleted_at: "2026-10-24T16:52:54.000Z", recreation_envois: ["2026-10-24T16:52:54.000Z", "2026-10-24T16:53:11.557Z"],
    depot_incertain: { at: "2026-10-24T16:53:20.000Z", motif: "redirection_profil_sans_copie_lue" },
    republish_snapshot: { titre: "Livre ancien essai\nTome premier", photos: [`${STO}/3532781567/c_0.jpg`] },
    recreation_photos_envoyees: { ids: [111222333], jetons: [JETON_A] },
  };
  const jobC = { id: "9138772c-0000-4000-8000-000000000002", platform: "vinted", action: "republish", status: "pending",
    inventaire_id: 1792328734917999, title: "Livre ancien essai\nTome premier", photos: [], platform_fields: pfC };
  const copieC = { id: 1792842213155002, vinted_item_id: "10514173498", titre: "Édition originale, livre ancien (réécrit sur Vinted)",
    listed_at_guess: "2026-10-24T16:53:11Z", vinted_account_id: "21011125", created_at: "2026-10-24T17:25:00Z", photos: [CDN(JETON_A, 7)] };
  const releveC = { id: "rvC", kind: "dressing", status: "done", declencheur: "bouton", started_at: "2026-10-24T17:20:00Z", items_vus: 312, total_entries: 312 };
  const d = M.decisionVerificationRecreation(jobC, { releves: [releveC], fiches: [copieC], maintenant: Date.parse("2026-10-24T17:40:00Z"), pageUneAveugle: false,
    empreinte: () => undefined });
  ok(d?.action === "question" && /10514173498/.test(d?.error ?? ""),
    "un jeton de photo de NOTRE envoi dans l'annonce : c'est la copie (la question), quel que soit son titre — avant : essai suivant = DEUX annonces", JSON.stringify(d?.action));
  ok(d?.platform_fields?.recreation_deja_partie?.preuves?.[0]?.preuve === "jeton_photo", "preuve tracée : jeton de photo");
  const copieNum = { ...copieC, photos: [CDN("01_0zzz9_EssaiSansJetonCommun", 8)] };
  const dN = M.decisionVerificationRecreation({ ...jobC, platform_fields: { ...pfC, copie_par_numero: { id: "10514173498", source: "onglet" } } },
    { releves: [releveC], fiches: [copieNum], maintenant: Date.parse("2026-10-24T17:40:00Z"), pageUneAveugle: false, empreinte: () => undefined });
  ok(dN?.action === "question" && dN?.platform_fields?.recreation_deja_partie?.preuves?.[0]?.preuve === "numero_vinted",
    "le numéro rendu par Vinted à notre envoi désigne la fiche : c'est la copie");
}

console.log("D. 46569b9d (compte 8a2eba68) — annonces créées par les tâches d'AUTRES fiches : ni copie ni doute (aucune régression)");
{
  const pfD = {
    republish_step: "deleted", vinted_item_id: "10541054198", old_vinted_item_id: "10541054198", vinted_account_id: "3147716342",
    suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-11-11T12:24:20.000Z" },
    deleted_at: "2026-11-11T12:24:20.000Z", recreation_envois: ["2026-11-11T12:24:20.000Z", "2026-11-11T12:24:36.491Z"],
    republish_snapshot: { titre: "Chemise lin essai", photos: [`${STO}/10541054198/d_0.jpg`] },
  };
  const jobD = { id: "46569b9d-0000-4000-8000-000000000003", platform: "vinted", action: "republish", status: "pending",
    inventaire_id: 1791219042952003, title: "Chemise lin essai", photos: [], platform_fields: pfD };
  const v1 = { id: 1791219051225007, vinted_item_id: "10761740884", titre: "Pantalon essai", listed_at_guess: "2026-11-11T12:29:51Z",
    vinted_account_id: "3147716342", created_at: "2026-10-05T16:50:53Z", photos: [CDN("01_0d469_EssaiVoisineA", 5)] };
  const v2 = { id: 1791219053054007, vinted_item_id: "10761815139", titre: "Veste essai", listed_at_guess: "2026-11-11T12:34:32Z",
    vinted_account_id: "3147716342", created_at: "2026-10-05T16:50:54Z", photos: [CDN("01_0d469_EssaiVoisineB", 6)] };
  const lignesDepots = [
    { id: "a4235888-0000-4000-8000-000000000004", inventaire_id: 1791219051225007, action: "republish", handler_build: "2026-11-10T14:10:14Z+ba13a51 · v0.6.186",
      platform_listing_id: "10761740884", new_id: "10761740884" },
    // Une remise en ligne SANS fiche (comme les tâches du compte 2bde8576) : sa copie n'est pas la nôtre non plus.
    { id: "b0000000-0000-4000-8000-000000000005", inventaire_id: null, action: "republish", handler_build: "v0.6.186", platform_listing_id: "9000000001", new_id: "10761815139" },
    { id: "68db9742-0000-4000-8000-000000000006", inventaire_id: 1791219051225007, action: "publish", handler_build: "2026-10-05T12:09:53Z+b7b756c · sync-dressing", platform_listing_id: "10761999999" },
  ];
  const deposes = (typeof M.numerosDeposes === "function") ? M.numerosDeposes(lignesDepots) : null;
  ok(deposes instanceof Map && deposes.has("10761740884") && deposes.has("10761815139") && !deposes.has("10761999999"),
    "numerosDeposes : les numéros créés par une tâche de dépôt comptent (avec ou sans fiche), un import (sync-dressing) jamais");
  const d = M.decisionVerificationRecreation(jobD, { releves: [], fiches: [v1, v2], maintenant: Date.parse("2026-11-11T12:45:00Z"),
    pageUneAveugle: false, empreinte: () => undefined, deposes: deposes ?? new Map() });
  ok(d === null, "deux annonces créées par d'AUTRES tâches (une autre fiche, une tâche sans fiche) : servie comme avant (ni doute ni question)", JSON.stringify(d));
  ok(typeof M.creeeParUneAutreTache === "function" && !M.creeeParUneAutreTache(jobD, "10761740884",
    M.numerosDeposes([{ id: "c1", inventaire_id: 1791219042952003, action: "republish", handler_build: "v0.6.180", new_id: "10761740884" }])),
    "une annonce créée par une tâche de la MÊME fiche reste candidate (c'est une annonce de cet article)");
  const dSans = M.decisionVerificationRecreation(jobD, { releves: [], fiches: [{ ...v1, vinted_item_id: "10541054100" }], maintenant: Date.parse("2026-11-11T12:45:00Z"),
    pageUneAveugle: false, empreinte: () => undefined, deposes: new Map() });
  ok(dSans === null, "une annonce au numéro PLUS ANCIEN que l'annonce retirée n'est jamais la copie (Vinted numérote dans l'ordre)", JSON.stringify(dSans));
}

console.log("E. Le jeton de photo : même lecture que l'extension 0.6.187 (background.js jetonPhotoVinted)");
{
  const bg = lire("chrome-extension/background.js");
  const src = bg.match(/function jetonPhotoVinted\(url\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  // deno-lint-ignore no-new-func
  const jetonExt = src ? new Function(`${src}; return jetonPhotoVinted;`)() : null;
  const echantillons = [CDN(JETON_A, 1), "https://images1.vinted.net/t/01_00c7b_EssaiJetonUpload000/f800/1699990000.jpeg?s=x",
    "https://images1.vinted.net/tc/court/1.jpeg", "", null, { url: CDN(JETON_B, 2) }];
  ok(typeof M.jetonPhotoVinted === "function" && jetonExt && echantillons.every((u) => M.jetonPhotoVinted(typeof u === "object" && u ? u.url : u) === jetonExt(typeof u === "object" && u ? u.url : u)),
    "jetonPhotoVinted (serveur) = jetonPhotoVinted (extension) sur les échantillons");
  const sql = lire("supabase/migrations/20261113190000_recreation_vinted_par_empreinte.sql");
  ok(sql.includes("'/(?:t|tc)/([A-Za-z0-9_-]{12,})/'"), "la base lit le jeton avec le même motif (/t/ ou /tc/, 12 caractères au moins)");
}

console.log("F. Plus aucun titre dans les rattachements serveur (module, get-pending-jobs, base)");
{
  const mod = lire("supabase/functions/_shared/recreation-vinted-verifiee.js");
  const code = mod.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
  ok(!/titre-copie-vinted|memeTitre|titreNorm|\.titre\b/.test(code), "recreation-vinted-verifiee.js : aucun titre comparé (ni memeTitre, ni titreNorm, ni .titre)",
    (code.match(/.*(memeTitre|titreNorm|\.titre\b).*/) ?? [""])[0]);
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const bloc = gpj.slice(gpj.indexOf("REMISE EN LIGNE VINTED : JAMAIS UN ESSAI DE PLUS"), gpj.indexOf("UNE REPUBLICATION BEEBS DONT LE LIEN ET LA COPIE"));
  ok(bloc.length > 0 && /from\("inventaire"\)\.select\("id, vinted_item_id, listed_at_guess, vinted_account_id"\)/.test(bloc)
    && /from\("inventaire"\)\.select\("id, photos"\)/.test(bloc) && !/select\("[^"]*titre/.test(bloc),
    "get-pending-jobs : les fiches sont lues sans leur titre, les photos des seules candidates ensuite");
  ok(/from\("photo_empreintes"\)/.test(bloc) && /numerosDeposes\(/.test(bloc) && /empreinte: \(u: string\) => /.test(bloc) && /deposes,/.test(bloc),
    "get-pending-jobs : empreintes et tâches de dépôt désignant les candidates passées au juge");
  ok(/functions\/v1\/empreintes-urls/.test(bloc) && /EdgeRuntime/.test(bloc) && /empreintes_a_calculer/.test(bloc),
    "get-pending-jobs : les photos à comparer sont empreintées (empreintes-urls, une demande par passage, sans bloquer)");
  const sql = lire("supabase/migrations/20261113190000_recreation_vinted_par_empreinte.sql");
  const debutFn = sql.search(/function public\.inventaire_rattache_recreation_vinted\(\)/i);
  const fn = debutFn >= 0 ? sql.slice(debutFn) : "";
  ok(fn.length > 100 && !/recreation_vinted_titre_norm\(/.test(fn) && /recreation_vinted_jetons_photos\(new\.photos\)/.test(fn)
    && /recreation_photos_envoyees/.test(fn) && /copie_par_numero/.test(fn),
    "migration : le déclencheur rattache (ou retire une copie de plus) par le numéro rendu par Vinted ou un jeton de photo de notre envoi, jamais par le titre");
  const inv = lire("supabase/rollbacks/20261113190000_recreation_vinted_par_empreinte_INVERSE.sql");
  ok(/recreation_vinted_titre_norm\(new\.titre\)/.test(inv) && /drop function if exists public\.recreation_vinted_jetons_photos\(jsonb\)/i.test(inv),
    "inverse : la définition de prod revient, la fonction neuve part");
  ok(existsSync(new URL("../scripts/recreation-vinted-par-empreinte-banc.mjs", import.meta.url)), "banc sur Postgres jetable présent");
}

console.log(`\n${verts}/${verts + ko} contrôles verts`);
if (ko) { console.error(`${ko} contrôle(s) en échec`); process.exit(1); }
console.log("Tous les contrôles passent.");
