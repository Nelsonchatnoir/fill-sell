// Autotest — relevés de VEILLE au retour de la connexion (05/11, décision de Nico — A4) —
// `npm run selftest:releves-de-veille` (_shared/releves-de-veille.js, handler-watch).
// Rallumés pour Leboncoin, Beebs et Depop, en lecture seule ; eBay (API) et Opla (quittée) hors du code ; dressing Vinted
// toujours coupé ; jamais pendant une pause Leboncoin ; les gardes d'avant le 05/10 inchangées.
// ⛔ (11/11) VERROU de la boucle « reprise_connexion » du 09/11 14:09 (§ 6 à 11) : une garde de cron ne se calcule jamais
// sur une lecture non bornée ; un état non lu ne pose rien ; aucun candidat n'est privé de lecture.
// Rapport : docs/enquetes/reprise-connexion-boucle-1111/RAPPORT.md.
import fs from "node:fs";
import {
  CADENCE_PASSAGES_MS, CADENCE_REPRISE_MS, DECLENCHEUR_REPRISE_CONNEXION, FENETRE_ARRETS_MS, FRAICHEUR_SONDE_VEILLE_MS, PLAFOND_CANDIDATS_PAR_PASSAGE,
  PLAFOND_REPRISES_PAR_EPISODE, PLATEFORMES_VEILLE_REPRISE, STATUTS_ARRET_RELEVE, candidatsReleveDeVeille, cleReleveDeVeille,
  gardeReleveDeVeille, ligneReleveDeVeille, lireEtatReleveDeVeille, murConnexionVeille, pasDeTranche, relevesDeVeilleAReposer, trancheReleveDeVeille,
} from "../supabase/functions/_shared/releves-de-veille.js";
import { DECLENCHEURS_VEILLE } from "../src/utils/declencheursReleve.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const MAINTENANT = Date.parse("2026-11-05T14:00:00Z");
const iso = (minAvant) => new Date(MAINTENANT - minAvant * 60_000).toISOString();
const U = "u1";
const mur = (platform, minAvant = 120, o = {}) => ({ user_id: U, platform, status: "failed", finished_at: iso(minAvant), erreur: `session ${platform} : page de connexion`, ...o });
const profil = (o = {}) => new Map([[U, {
  extVue: iso(1),
  sessions: { leboncoin: true, beebs: true, depop: true, opla: true, ebay: true, checked_at_par_plateforme: { leboncoin: iso(10), beebs: iso(10), depop: iso(10), opla: iso(10), ebay: iso(10) } },
  ps: {}, ...o,
}]]);
const ouvert = new Map([[U, true]]);
const plateformes = (r) => r.map((x) => x.platform).sort().join(",");

// ── Faux PostgREST (modèle : `fauxServeur` de scripts/stock-ventes-en-entier-selftest.mjs) : `plafond` lignes AU PLUS,
//    SANS erreur ; sans `.order()`, l'ORDRE PHYSIQUE (celui du tableau : les plus anciennes d'abord). Les colonnes
//    demandées seulement ; un filtre que le faux serveur ne connaît pas lève (jamais un filtre ignoré en silence).
const COLONNES_DE_TEMPS = new Set(["started_at", "finished_at", "queued_at"]);
const micro = (v) => {   // à la microseconde, comme Postgres (« 2026-11-09T21:35:45.123456+00:00 »)
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(String(v));
  if (!m) throw new Error(`faux serveur : date illisible « ${v} »`);
  return BigInt(Date.parse(m[1] + m[3])) * 1000n + BigInt((m[2] ?? "").padEnd(6, "0"));
};
const comparer = (col, a, b) => {
  const [x, y] = COLONNES_DE_TEMPS.has(col) ? [micro(a), micro(b)] : [String(a), String(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};
function fauxServeur(lignes, { plafond = 1000, panne = null } = {}) {
  const etat = { lignes, lectures: 0, demandees: [], rendues: [] };
  const executer = async (q) => {
    await Promise.resolve();
    if (q.insere) {
      const l = q.insere;
      // L'index unique `vinted_sync_runs_un_seul_actif` : un seul relevé en file ou en cours par (compte, kind, plateforme).
      if (etat.lignes.some((r) => r.user_id === l.user_id && r.kind === l.kind && r.platform === l.platform && ["queued", "running"].includes(r.status))) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"vinted_sync_runs_un_seul_actif\"" } };
      }
      const ligne = { id: `pose-${etat.lignes.length + 1}`, erreur: null, finished_at: null, started_at: l.queued_at, ...l };
      etat.lignes.push(ligne);
      return { data: [{ id: ligne.id }], error: null };
    }
    const numero = ++etat.lectures;
    const p = panne ? panne(numero) : null;
    if (p === "jette") throw new Error("réseau coupé");
    if (p === "muet") return { data: null, error: null };
    if (p) return { data: null, error: { message: "lecture en panne" } };
    let rows = etat.lignes.filter((r) => q.filtres.every((f) => f(r)));           // ordre physique
    etat.demandees.push(rows.length);
    if (q.ordre.length) {
      rows = [...rows].sort((a, b) => {
        for (const [c, asc] of q.ordre) {
          const va = a[c], vb = b[c];
          if (va == null || vb == null) {                                          // Postgres : NULL en dernier en asc, d'abord en desc
            if (va == null && vb == null) continue;
            return (va == null ? 1 : -1) * (asc ? 1 : -1);
          }
          const d = comparer(c, va, vb);
          if (d) return asc ? d : -d;
        }
        return 0;
      });
    }
    rows = rows.slice(q.de, q.de + Math.min(q.lim ?? Infinity, plafond));
    etat.rendues.push(rows.length);
    return { data: rows.map((r) => (q.colonnes ? Object.fromEntries(q.colonnes.map((c) => [c, r[c] ?? null])) : { ...r })), error: null };
  };
  const client = {
    from(table) {
      if (table !== "vinted_sync_runs") throw new Error(`faux serveur : table inattendue « ${table} »`);
      const q = { filtres: [], ordre: [], lim: null, de: 0, colonnes: null, insere: null };
      const b = {
        select(cols = "*") { q.colonnes = cols === "*" ? null : String(cols).split(",").map((s) => s.trim()); return b; },
        eq(c, v) { q.filtres.push((r) => r[c] != null && String(r[c]) === String(v)); return b; },
        in(c, vs) { const s = new Set(vs.map(String)); q.filtres.push((r) => r[c] != null && s.has(String(r[c]))); return b; },
        gte(c, v) { q.filtres.push((r) => r[c] != null && comparer(c, r[c], v) >= 0); return b; },
        gt(c, v) { q.filtres.push((r) => r[c] != null && comparer(c, r[c], v) > 0); return b; },
        not(c, op, v) {
          if (op !== "is" || v !== null) throw new Error(`faux serveur : filtre not(${c}, ${op}, ${v}) inconnu`);
          q.filtres.push((r) => r[c] != null); return b;
        },
        order(c, { ascending = true } = {}) { q.ordre.push([c, ascending]); return b; },
        limit(k) { q.lim = k; return b; },
        range(de, a) { q.de = de; q.lim = a - de + 1; return b; },
        insert(ligne) { q.insere = ligne; return b; },
        then(resolve, reject) { return executer(q).then(resolve, reject); },
      };
      return b;
    },
  };
  return { client, etat };
}

// ── Un passage de la reprise sur des candidats, tel que handler-watch le fait : la tranche du passage, l'état EXACT de
//    chacun lu par clé (lireEtatReleveDeVeille), l'interrupteur demandé pour les seuls candidats qu'aucune garde ne
//    retient, la règle. Rend aussi la tranche, les états lus et les comptes dont l'interrupteur a été demandé.
async function decider(client, candidats, { ouverte, maintenant, plafond }) {
  const tranche = trancheReleveDeVeille(candidats, { maintenant, plafond });
  const etats = new Map();
  for (const c of tranche) etats.set(cleReleveDeVeille(c), await lireEtatReleveDeVeille(client, c, maintenant));
  const libres = tranche.filter((c) => gardeReleveDeVeille(c, etats.get(cleReleveDeVeille(c)), maintenant) === null);
  const demandes = [...new Set(libres.map((c) => c.user_id))];
  const interrupteur = new Map(demandes.map((u) => [u, ouverte.get(u) === true]));
  return { tranche, etats, demandes, aPoser: relevesDeVeilleAReposer({ candidats: tranche, etats, ouverte: interrupteur, maintenant }) };
}
// Les cas des § 1 à 4 : des arrêts et un historique donnés à la main ; l'historique est servi par le faux serveur
// (comme la base : kind 'annonces', started_at jamais vide).
const run = async ({ arrets = [], historique = [], profils = profil(), ouverte = ouvert, maintenant = MAINTENANT } = {}) => {
  const { client } = fauxServeur(historique.map((r) => ({ kind: "annonces", started_at: r.finished_at ?? r.queued_at ?? iso(0), ...r })));
  return (await decider(client, candidatsReleveDeVeille({ arrets, profils, maintenant }), { ouverte, maintenant })).aPoser;
};

console.log("1. Le périmètre de la décision");
ok(PLATEFORMES_VEILLE_REPRISE.join(",") === "leboncoin,beebs,depop", "Leboncoin, Beebs, Depop — et rien d'autre");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("opla"), "Opla retirée (quittée le 10/10)");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("ebay"), "eBay hors du code : il passe par son API");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("vinted"), "dressing Vinted : toujours coupé (hors de la décision)");
ok(plateformes(await run({ arrets: ["leboncoin", "beebs", "depop", "opla", "ebay", "vinted"].map((p) => mur(p)) })) === "beebs,depop,leboncoin",
  "un mur Opla, eBay ou Vinted ne pose jamais rien");

console.log("\n2. Lecture seule : un relevé de VEILLE, jamais un geste");
const ligne = ligneReleveDeVeille({ user_id: U, platform: "beebs" }, iso(0));
ok(ligne.declencheur === DECLENCHEUR_REPRISE_CONNEXION && ligne.kind === "annonces" && ligne.status === "queued", "la ligne posée : kind annonces, déclencheur reprise_connexion");
const migration = lire("supabase/migrations/20261105110000_releves_rouverts_republication_partie.sql");
const veilleSql = migration.slice(migration.indexOf("FUNCTION public.releve_est_veille"), migration.indexOf("$function$;", migration.indexOf("FUNCTION public.releve_est_veille")));
ok(veilleSql.includes(`'${DECLENCHEUR_REPRISE_CONNEXION}'`), "la base le range en VEILLE (releve_est_veille, 20261105110000)");
ok(DECLENCHEURS_VEILLE.includes(DECLENCHEUR_REPRISE_CONNEXION), "l'app aussi (src/utils/declencheursReleve.js)");
ok(!new RegExp("^(bouton|bouton_distant|app)(:redemande)?$").test(DECLENCHEUR_REPRISE_CONNEXION), "ce n'est pas un geste (releve_est_geste : bouton, bouton_distant, app) : aucun import, aucune création d'article");
ok(!/FUNCTION public.releve_est_geste/.test(migration.replace(/--.*$/gm, "")), "la migration ne touche pas releve_est_geste");

console.log("\n3. Les gardes d'avant le 05/10, inchangées");
ok((await run({ arrets: [mur("beebs")] })).length === 1, "mur Beebs, session revenue après le mur, sonde fraîche → un relevé de veille");
ok(murConnexionVeille("session beebs : page de connexion") && !murConnexionVeille("[défilement] 0 annonce") && !murConnexionVeille("accès Opla non accordé"),
  "le mur : « page de connexion » écrit par nos relevés, rien d'autre");
ok((await run({ arrets: [mur("beebs", 120, { erreur: "réseau coupé" })] })).length === 0, "un arrêt qui n'est pas un mur → rien");
ok((await run({ arrets: [mur("beebs", 120, { erreur: "réseau coupé" }), mur("beebs", 300)] })).length === 0, "le plus récent arrêt fait foi : non-mur après un mur → rien");
ok((await run({ arrets: [mur("beebs", 5)] })).length === 0, "sonde plus ancienne que le mur → rien de neuf, rien");
ok((await run({ arrets: [mur("beebs")], profils: profil({ sessions: { beebs: true, checked_at_par_plateforme: { beebs: iso(200) } } }) })).length === 0, "sonde de plus de 3 h → rien");
ok((await run({ arrets: [mur("beebs")], profils: profil({ sessions: { beebs: false, checked_at_par_plateforme: { beebs: iso(10) } } }) })).length === 0, "pas connecté → rien");
ok((await run({ arrets: [mur("beebs")], profils: profil({ extVue: null }) })).length === 0, "extension jamais vue → rien");
ok((await run({ arrets: [mur("beebs")], ouverte: new Map([[U, false]]) })).length === 0, "interrupteur serveur fermé → rien");
ok((await run({ arrets: [mur("beebs", 8 * 24 * 60)] })).length === 0, "mur de plus de 7 jours → rien");
ok((await run({ arrets: [mur("beebs")], historique: [{ user_id: U, platform: "beebs", status: "queued" }] })).length === 0, "un relevé déjà en file → rien");
ok((await run({ arrets: [mur("beebs")], historique: [{ user_id: U, platform: "beebs", status: "done", finished_at: iso(60) }] })).length === 0, "un relevé réussi après le mur → rien");
ok((await run({ arrets: [mur("beebs", 120)], historique: [{ user_id: U, platform: "beebs", status: "done", finished_at: iso(130) }] })).length === 1, "réussi AVANT le mur → la reprise part");
const reprisesFaites = (k) => Array.from({ length: k }, (_, i) => ({ user_id: U, platform: "beebs", status: "failed", declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(100 - i) }));
ok((await run({ arrets: [mur("beebs")], historique: reprisesFaites(PLAFOND_REPRISES_PAR_EPISODE - 1) })).length === 1, `${PLAFOND_REPRISES_PAR_EPISODE - 1} reprises dans l'épisode → encore une`);
ok((await run({ arrets: [mur("beebs")], historique: reprisesFaites(PLAFOND_REPRISES_PAR_EPISODE) })).length === 0, `${PLAFOND_REPRISES_PAR_EPISODE} reprises dans l'épisode → plus rien (jamais un martèlement)`);
ok(CADENCE_REPRISE_MS === 15 * 60_000, "cadence : 15 min après le dernier relevé réussi");

console.log("\n4. NEUF : jamais pendant une pause Leboncoin");
const pause = { leboncoin: { blocage_acces: { depuis: iso(600), signe: "acces_restreint" } } };
const r = await run({ arrets: [mur("leboncoin"), mur("beebs")], profils: profil({ ps: pause }) });
ok(plateformes(r) === "beebs", "Leboncoin en pause → pas de relevé Leboncoin ; Beebs du même compte part", plateformes(r));
const levee = { leboncoin: { blocage_acces: { depuis: iso(600), leve_le: iso(30) } } };
ok(plateformes(await run({ arrets: [mur("leboncoin")], profils: profil({ ps: levee }) })) === "leboncoin", "pause levée (reprise prudente) → la veille reprend");

console.log("\n5. handler-watch : branché, eBay et Opla hors du code, dressing Vinted coupé");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/from "\.\.\/_shared\/releves-de-veille\.js"/.test(hw) && /relevesDeVeilleAReposer\(\{/.test(hw) && /insert\(ligneReleveDeVeille\(c\)\)/.test(hw),
  "handler-watch pose la ligne de la règle, et elle seule");
ok(!/PF_RELEVE = \["leboncoin", "beebs", "ebay", "opla", "depop"\]/.test(hw), "l'ancienne liste (eBay, Opla) a disparu");
ok(/const RELANCE_AUTOMATIQUE_DRESSING_VINTED = false;/.test(hw) && /if \(RELANCE_AUTOMATIQUE_DRESSING_VINTED\) try \{/.test(hw), "le dressing Vinted reste coupé");
ok(!/RELANCE_AUTOMATIQUE_RELEVE\b/.test(hw), "plus aucun interrupteur global");

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE VERROU (11/11) — LA BOUCLE « reprise_connexion » DU 09/11 14:09
// ═══════════════════════════════════════════════════════════════════════════
// Le défaut : handler-watch lisait 30 jours de relevés de TOUS les comptes à mur en UNE requête `.limit(2000)`, sans tri
// ni pages. PostgREST n'en rend que 1 000, SANS erreur, dans l'ordre physique (les plus anciennes) : les gardes « déjà
// reparti », « 15 min » et « 3 par épisode » ne voyaient plus les relevés récents — un relevé reposé à chaque passage
// du cron (3 min), 1 543 en deux jours sur 12 comptes. Ce cas rejoue le parc du 11/11 à 11:03 (les chiffres de la prod,
// aucun nom) sur un faux serveur qui coupe comme le vrai. Il TOMBE si le défaut revient.
console.log("\n6. LE VERROU (11/11) : une lecture coupée à 1 000 lignes ne repose plus rien");

// ── Le parc du 11/11 à 11:03 (heure de Paris), en chiffres : 40 comptes ont eu un mur de connexion en 7 jours, leur
//    historique de 30 jours fait 2 935 lignes. Ordre physique = ordre d'écriture.
//      c01 : 182 relevés, mur il y a 36 h 27, puis 526 reprises RÉUSSIES (une toutes les 4 min) — navigateur ouvert ;
//      c02 : 150 relevés, mur il y a 36 h 30, 167 reprises réussies ;
//      c03 : inscrit du jour, mur il y a 56 min, 15 reprises réussies et une 16e EN COURS ;
//      c04 : mur il y a 35 min, 10 reprises réussies ;
//      c05 : la VRAIE reconnexion — mur il y a 20 min, session revenue il y a 2 min, aucune reprise encore ;
//      c06 à c40 : un mur dans la semaine, navigateur fermé (sonde de 5 h) — jamais candidats.
const T11 = Date.parse("2026-11-11T10:03:00Z");
const MIN = 60_000, HEURE = 60 * MIN, JOUR = 24 * HEURE;
const pg = (ms) => new Date(ms).toISOString().replace("Z", "456+00:00");   // l'écriture de Postgres, microsecondes comprises
function parcDu1111() {
  const lignes = [], profils = new Map();
  const ecrire = (user_id, platform, o) => lignes.push({ user_id, kind: "annonces", platform, declencheur: "cron", queued_at: null, erreur: null, ...o });
  const reussi = (u, pf, debut, declencheur = "cron") => ecrire(u, pf, {
    status: "done", declencheur, queued_at: declencheur === "cron" ? null : pg(debut), started_at: pg(debut), finished_at: pg(debut + 40_000),
  });
  const serie = (u, pf, nb, de, a, declencheur) => { for (let k = 0; k < nb; k++) reussi(u, pf, Math.round(de + (a - de) * (k / Math.max(1, nb - 1))), declencheur); };
  const compte = (u, pf, { avant, murIlYA, reprises = 0, dernierePoseeIlYA = 2 * MIN, sonde = MIN, apresLeMur = false }) => {
    const m = T11 - murIlYA;
    serie(u, pf, avant, T11 - 29 * JOUR, m - HEURE);
    ecrire(u, pf, { status: "failed", started_at: pg(m - 20_000), finished_at: pg(m), erreur: `session ${pf} : page de connexion` });
    if (reprises) serie(u, pf, reprises, m + 3 * MIN, T11 - dernierePoseeIlYA, DECLENCHEUR_REPRISE_CONNEXION);
    if (apresLeMur) reussi(u, pf, m + 2 * HEURE);
    profils.set(u, { extVue: pg(T11 - MIN), sessions: { [pf]: true, checked_at_par_plateforme: { [pf]: pg(T11 - sonde) } }, ps: {} });
  };
  compte("c01", "leboncoin", { avant: 182, murIlYA: 36 * HEURE + 27 * MIN, reprises: 526 });
  compte("c02", "leboncoin", { avant: 150, murIlYA: 36 * HEURE + 30 * MIN, reprises: 167 });
  compte("c03", "leboncoin", { avant: 3, murIlYA: 56 * MIN, reprises: 15, dernierePoseeIlYA: 6 * MIN });
  ecrire("c03", "leboncoin", { status: "running", declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: pg(T11 - 3 * MIN), started_at: pg(T11 - 3 * MIN), finished_at: null });
  compte("c04", "leboncoin", { avant: 30, murIlYA: 35 * MIN, reprises: 10 });
  compte("c05", "beebs", { avant: 25, murIlYA: 20 * MIN, sonde: 2 * MIN });
  for (let i = 0; i < 35; i++) {
    compte(`c${String(i + 6).padStart(2, "0")}`, i % 2 ? "beebs" : "leboncoin", {
      avant: i === 0 ? 266 : 38 + (i % 5) * 3, murIlYA: (1 + (i % 6)) * JOUR + i * 7 * MIN, sonde: 5 * HEURE, apresLeMur: i % 2 === 0,
    });
  }
  lignes.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  lignes.forEach((l, k) => { l.id = `r${String(k + 1).padStart(4, "0")}`; });
  return { lignes, profils, ouverte: new Map([...profils.keys()].map((u) => [u, true])) };
}
const cles = (l) => l.map((c) => `${c.user_id}|${c.platform}`).sort().join(", ");

// ── Les arrêts de 7 jours, comme handler-watch les lit : du plus récent au plus ancien, par pages de 1 000
//    (`lirePagesDisparues` ; une page en erreur lève).
async function lireArrets(client, maintenant) {
  const out = [];
  for (let de = 0; de < 5000; de += 1000) {
    const { data, error } = await client.from("vinted_sync_runs").select("id, user_id, platform, status, erreur, finished_at")
      .eq("kind", "annonces").in("status", [...STATUTS_ARRET_RELEVE]).in("platform", [...PLATEFORMES_VEILLE_REPRISE])
      .gte("finished_at", new Date(maintenant - FENETRE_ARRETS_MS).toISOString())
      .order("finished_at", { ascending: false }).order("id", { ascending: false }).range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}
// ── La lecture EN VRAC de l'historique, recopiée mot pour mot de handler-watch (index.ts, 4797-4817 au 11/11 matin).
async function lectureEnVrac(client, ids, maintenant) {
  const historique = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lot = ids.slice(i, i + 200);
    const { data: histo } = await client.from("vinted_sync_runs")
      .select("user_id, platform, status, declencheur, queued_at, started_at, finished_at")
      .eq("kind", "annonces").in("user_id", lot).in("platform", [...PLATEFORMES_VEILLE_REPRISE])
      .gte("started_at", new Date(maintenant - 30 * 24 * 60 * 60_000).toISOString()).limit(2000);
    historique.push(...(histo ?? []));
    const { data: enFile } = await client.from("vinted_sync_runs").select("user_id, platform, status")
      .eq("kind", "annonces").in("user_id", lot).in("status", ["queued", "running"]).limit(1000);
    historique.push(...(enFile ?? []));
  }
  return historique;
}
// ── Les candidats d'un passage, comme handler-watch les établit : les arrêts de 7 jours des comptes à mur.
async function candidatsDuPassage(client, { profils, maintenant }) {
  const arrets = await lireArrets(client, maintenant);
  const ids = [...new Set(arrets.filter((r) => murConnexionVeille(r.erreur)).map((r) => String(r.user_id)))];
  return candidatsReleveDeVeille({ arrets: arrets.filter((r) => ids.includes(String(r.user_id))), profils, maintenant });
}
// ── Un passage de la reprise, lecture comprise, tel que le fait le CODE (handler-watch + la règle du module) : les
//    arrêts, les candidats, l'état exact de chacun, la règle.
async function passage(client, { profils, ouverte, maintenant }) {
  const candidats = await candidatsDuPassage(client, { profils, maintenant });
  return (await decider(client, candidats, { ouverte, maintenant })).aPoser;
}
// ── Le même passage, insertion comprise (la ligne de la règle) : rend les relevés réellement posés.
async function passageComplet(client, opts) {
  const poses = [];
  for (const c of await passage(client, opts)) {
    const { data } = await client.from("vinted_sync_runs").insert(ligneReleveDeVeille(c, new Date(opts.maintenant).toISOString())).select("id");
    if (data?.length) poses.push(c);
  }
  return poses;
}
// ── L'état tel qu'il se calculait AVANT le 11/11 : sur l'historique REÇU (releves-de-veille.js, lignes 59 à 74 d'alors).
//    Une ligne absente de la lecture ouvrait la garde : jamais vue en file, jamais réussie, aucune reprise.
function etatsSurHistorique(historique) {
  const etats = new Map();
  const de = (cle) => { if (!etats.has(cle)) etats.set(cle, { lu: true, en_file: false, reussi_le: null, poseesLe: [] }); return etats.get(cle); };
  for (const r of historique) {
    const e = de(`${r.user_id}|${r.platform}`);
    if (r.status === "queued" || r.status === "running") { e.en_file = true; continue; }
    if (r.status === "done" && r.finished_at && (!e.reussi_le || Date.parse(r.finished_at) > Date.parse(e.reussi_le))) e.reussi_le = r.finished_at;
    if (r.declencheur === DECLENCHEUR_REPRISE_CONNEXION) e.poseesLe.push(Date.parse(r.queued_at ?? r.started_at));
  }
  for (const e of etats.values()) e.reprises = e.poseesLe.filter((q) => q > (e.reussi_le ? Date.parse(e.reussi_le) : 0)).length;
  return etats;
}
const jamaisVu = () => ({ lu: true, en_file: false, reussi_le: null, reprises: 0 });
// ── Le passage d'AVANT le 11/11 : la lecture en vrac, puis les mêmes gardes sur ce qu'elle a rendu.
async function passageDAvant(client, { profils, ouverte, maintenant }) {
  const candidats = await candidatsDuPassage(client, { profils, maintenant });
  const etats = etatsSurHistorique(await lectureEnVrac(client, [...profils.keys()], maintenant));
  for (const c of candidats) if (!etats.has(cleReleveDeVeille(c))) etats.set(cleReleveDeVeille(c), jamaisVu());
  return relevesDeVeilleAReposer({ candidats, etats, ouverte, maintenant });
}

{
  const { lignes, profils, ouverte } = parcDu1111();
  const reprises = lignes.filter((l) => l.declencheur === DECLENCHEUR_REPRISE_CONNEXION);
  ok(lignes.length === 2935 && profils.size === 40 && reprises.filter((l) => l.user_id === "c01" && l.status === "done").length === 526,
    "le parc du 11/11 : 2 935 lignes d'historique sur 30 jours, 40 comptes à mur, 526 reprises réussies après le mur du premier",
    `${lignes.length} lignes, ${profils.size} comptes`);
  // Le faux serveur coupe comme le vrai : la lecture en vrac demande 2 935 lignes, en reçoit 1 000, sans erreur.
  const temoin = fauxServeur(lignes);
  const vrac = await lectureEnVrac(temoin.client, [...profils.keys()], T11);
  ok(temoin.etat.demandees[0] === 2935 && temoin.etat.rendues[0] === 1000,
    "le faux serveur coupe comme le vrai : la lecture en vrac `.limit(2000)` demande 2 935 lignes, en reçoit 1 000, sans erreur",
    `demandées ${temoin.etat.demandees[0]}, rendues ${temoin.etat.rendues[0]}`);
  ok(!vrac.some((r) => r.declencheur === DECLENCHEUR_REPRISE_CONNEXION),
    `… et ce sont les plus anciennes : aucune des ${reprises.length} reprises n'est dans les 1 000 lignes rendues`);
  // LE VERROU : un passage sur ce parc ne repose QUE le relevé de la vraie reconnexion.
  const { client } = fauxServeur(lignes);
  const poses = await passage(client, { profils, ouverte, maintenant: T11 });
  ok(cles(poses) === "c05|beebs",
    "LE VERROU — un passage sur ce parc : rien pour les comptes dont le relevé a déjà réussi après le mur (c01, c02, c04), rien pour le relevé en cours (c03) ; seule la vraie reconnexion (c05) part",
    `reposés : ${cles(poses) || "aucun"}`);

  // Le défaut d'avant, reproduit sur le même parc : la lecture en vrac repose aussi les comptes en boucle.
  const avant = await passageDAvant(fauxServeur(lignes).client, { profils, ouverte, maintenant: T11 });
  ok(cles(avant) === "c01|leboncoin, c02|leboncoin, c04|leboncoin, c05|beebs",
    "le défaut d'avant, reproduit : sur les 1 000 lignes rendues, les mêmes gardes reposent aussi c01, c02 et c04 — à chaque passage",
    `reposés : ${cles(avant) || "aucun"}`);
  // La règle était juste : sur l'historique COMPLET, elle ne reposait que la vraie reconnexion.
  const candidats = await candidatsDuPassage(fauxServeur(lignes).client, { profils, maintenant: T11 });
  const verite = etatsSurHistorique(lignes);
  ok(candidats.map((c) => c.user_id).join(",") === "c05,c04,c03,c01,c02", "5 candidats (navigateur ouvert, session revenue après le mur), murs les plus récents d'abord",
    candidats.map((c) => c.user_id).join(","));
  ok(cles(relevesDeVeilleAReposer({ candidats, etats: verite, ouverte, maintenant: T11 })) === "c05|beebs",
    "sur l'historique COMPLET, la règle ne repose que c05 : c'est sa lecture qui était fausse, pas elle");
  // L'état lu par clé est EXACT, que le serveur coupe à 1 000 lignes, à 3 lignes, ou pas du tout. Le dernier relevé
  // réussi est lu d'abord : postérieur au mur (c01 à c04), rien d'autre n'est lu ni demandé.
  for (const [plafond, dit] of [[1000, "plafonné à 1 000 lignes"], [3, "plafonné à 3 lignes"], [Infinity, "sans plafond"]]) {
    const s = fauxServeur(lignes, { plafond });
    const { etats, aPoser, demandes } = await decider(s.client, candidats, { ouverte, maintenant: T11 });
    const ecarts = candidats.filter((c) => {
      const e = etats.get(cleReleveDeVeille(c)), v = verite.get(cleReleveDeVeille(c));
      const reparti = v.reussi_le != null && Date.parse(v.reussi_le) > Date.parse(c.mur_du);
      return !(e?.lu === true && e.reussi_le === v.reussi_le && (reparti
        ? e.en_file === null && e.reprises === null
        : e.en_file === v.en_file && e.reprises === Math.min(v.reprises, PLAFOND_REPRISES_PAR_EPISODE)));
    });
    ok(ecarts.length === 0 && cles(aPoser) === "c05|beebs" && s.etat.lectures === 7 && Math.max(...s.etat.rendues) <= PLAFOND_REPRISES_PAR_EPISODE && demandes.join(",") === "c05",
      `serveur ${dit} : l'état lu est celui de l'historique complet — 7 lectures pour 5 candidats (une par relevé déjà reparti, trois pour la vraie reconnexion), 3 lignes au plus chacune, l'interrupteur demandé pour c05 seul`,
      `écarts : ${cles(ecarts) || "aucun"} ; lectures ${s.etat.lectures} ; lignes rendues au plus ${Math.max(...s.etat.rendues)} ; interrupteur : ${demandes.join(",")}`);
  }
  const serveurC01 = fauxServeur(lignes);
  const lu = await lireEtatReleveDeVeille(serveurC01.client, candidats.find((c) => c.user_id === "c01"), T11);
  const vu = etatsSurHistorique(vrac).get("c01|leboncoin");
  ok(lu.lu === true && Date.parse(lu.reussi_le) === T11 - 2 * MIN + 40_000 && lu.en_file === null && lu.reprises === null && serveurC01.etat.lectures === 1
    && Date.parse(vu.reussi_le) < T11 - 36 * HEURE - 27 * MIN && vu.reprises === 0,
    "c01 : le dernier relevé réussi LU est le vrai (il y a 80 s, après le mur), en une seule lecture ; la lecture en vrac n'en voyait qu'un d'avant le mur, et aucune des 526 reprises",
    `lu ${JSON.stringify(lu)} en ${serveurC01.etat.lectures} lecture(s) ; vu en vrac ${vu.reussi_le}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. UN ÉTAT NON LU NE POSE RIEN
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n7. Un état non lu ne pose RIEN (jamais une permission par défaut)");
// Les lignes d'un compte, comme la base les rend ; les minutes se comptent AVANT `MAINTENANT` (négatif = après).
const releve = (o) => ({ user_id: U, kind: "annonces", platform: "leboncoin", declencheur: "cron", queued_at: null, erreur: null, ...o });
const reussiIlYA = (min, o = {}) => releve({ status: "done", started_at: iso(min + 1), finished_at: iso(min), ...o });
const murIlYA = (min, o = {}) => releve({ status: "failed", started_at: iso(min + 1), finished_at: iso(min), erreur: `session ${o.platform ?? "leboncoin"} : page de connexion`, ...o });
{
  // La vraie reconnexion : relevé réussi il y a 3 h, mur il y a 2 h, session revue il y a 10 min.
  const histoire = () => [reussiIlYA(180), murIlYA(120)];
  const candidat = { user_id: U, platform: "leboncoin", mur_du: iso(120) };
  const poser = (e) => relevesDeVeilleAReposer({ candidats: [candidat], etats: e === undefined ? new Map() : new Map([[cleReleveDeVeille(candidat), e]]), ouverte: ouvert, maintenant: MAINTENANT });
  const lecture = async (panne) => { const s = fauxServeur(histoire(), { panne }); return { e: await lireEtatReleveDeVeille(s.client, candidat, MAINTENANT), s }; };
  const sain = await lecture(null);
  ok(sain.e.lu === true && sain.e.en_file === false && sain.e.reussi_le === iso(180) && sain.e.reprises === 0 && sain.s.etat.lectures === 3 && poser(sain.e).length === 1
    && gardeReleveDeVeille(candidat, sain.e, MAINTENANT) === null,
    "témoin : les trois lectures passent → état lu (réussi il y a 3 h, avant le mur ; rien en file ; aucune reprise) et le relevé part", JSON.stringify(sain.e));
  for (const [k, quoi] of [[1, "« dernier relevé réussi »"], [2, "« en file »"], [3, "« reprises de l'épisode »"]]) {
    const rendus = [];
    for (const mode of [true, "muet", "jette"]) rendus.push((await lecture((numero) => (numero === k ? mode : null))).e);
    ok(rendus.every((e) => e.lu === false && typeof e.motif === "string" && e.motif.length > 0 && poser(e).length === 0 && gardeReleveDeVeille(candidat, e, MAINTENANT) === "état non lu"),
      `la lecture ${quoi} en erreur, sans réponse lisible ou interrompue → { lu: false } : rien n'est reposé`, JSON.stringify(rendus));
  }
  // Le dernier relevé réussi est lu D'ABORD : postérieur au mur, la décision est prise — une seule lecture.
  const reparti = fauxServeur([...histoire(), reussiIlYA(60)]);
  const eReparti = await lireEtatReleveDeVeille(reparti.client, candidat, MAINTENANT);
  ok(eReparti.lu === true && eReparti.reussi_le === iso(60) && eReparti.en_file === null && eReparti.reprises === null && reparti.etat.lectures === 1
    && gardeReleveDeVeille(candidat, eReparti, MAINTENANT) === "déjà reparti" && poser(eReparti).length === 0,
    "relevé réussi APRÈS le mur → une seule lecture (ni « en file » ni reprises lus), garde « déjà reparti », rien n'est reposé", `${JSON.stringify(eReparti)} en ${reparti.etat.lectures} lecture(s)`);
  ok(gardeReleveDeVeille(candidat, { lu: true, reussi_le: iso(180), en_file: null, reprises: null }, MAINTENANT) === "état non lu",
    "… un état arrêté à la première lecture ne vaut que pour « déjà reparti » : réussi AVANT le mur, il ne pose rien");
  // ⛔ `finished_at` non vide : un tri décroissant met les valeurs vides en tête (Postgres) — une ligne réussie sans
  //    fin masquerait le vrai dernier relevé réussi.
  const sansFin = releve({ status: "done", started_at: iso(30), finished_at: null });
  const masque = fauxServeur([...histoire(), reussiIlYA(60), sansFin]);
  const eMasque = await lireEtatReleveDeVeille(masque.client, candidat, MAINTENANT);
  const avantLeMur = fauxServeur([...histoire(), sansFin]);
  const eAvant = await lireEtatReleveDeVeille(avantLeMur.client, candidat, MAINTENANT);
  ok(eMasque.lu === true && eMasque.reussi_le === iso(60) && gardeReleveDeVeille(candidat, eMasque, MAINTENANT) === "déjà reparti"
    && eAvant.lu === true && eAvant.reussi_le === iso(180) && eAvant.en_file === false && poser(eAvant).length === 1,
    "une ligne réussie SANS date de fin ne masque pas le vrai dernier relevé réussi (les valeurs vides passent en tête d'un tri décroissant)",
    `${JSON.stringify(eMasque)} ; ${JSON.stringify(eAvant)}`);
  ok(poser(undefined).length === 0, "aucun état pour le candidat → rien");
  const bon = { lu: true, en_file: false, reussi_le: iso(180), reprises: 0 };
  const tordus = [
    { lu: false, motif: "lecture en panne" }, { lu: "true", en_file: false, reussi_le: null, reprises: 0 }, { en_file: false, reussi_le: null, reprises: 0 },
    { lu: true }, { lu: true, en_file: null, reussi_le: null, reprises: 0 }, { lu: true, reussi_le: null, reprises: 0 },
    { lu: true, en_file: false, reussi_le: "pas une date", reprises: 0 }, { lu: true, en_file: false, reussi_le: null },
    { lu: true, en_file: false, reussi_le: null, reprises: "0" }, { lu: true, en_file: false, reussi_le: null, reprises: -1 },
    { lu: true, en_file: false, reussi_le: null, reprises: 0.5 }, { lu: true, en_file: false, reussi_le: null, reprises: null },
  ];
  ok(poser(bon).length === 1 && tordus.every((e) => poser(e).length === 0),
    "état incomplet ou illisible (lu absent ou non booléen, « en file » inconnu, date illisible, reprises absentes ou non entières) → rien",
    JSON.stringify(tordus.filter((e) => poser(e).length !== 0)));
  const garde = (e) => gardeReleveDeVeille(candidat, e, MAINTENANT);
  ok(poser({ ...bon, reprises: PLAFOND_REPRISES_PAR_EPISODE - 1 }).length === 1 && poser({ ...bon, reprises: PLAFOND_REPRISES_PAR_EPISODE }).length === 0
    && poser({ ...bon, en_file: true }).length === 0 && poser({ ...bon, reussi_le: iso(60) }).length === 0 && poser({ ...bon, reussi_le: iso(121) }).length === 1
    && garde(bon) === null && garde({ ...bon, reussi_le: iso(60) }) === "déjà reparti" && garde({ ...bon, en_file: true }) === "en file"
    && garde({ ...bon, reussi_le: iso(125), reprises: PLAFOND_REPRISES_PAR_EPISODE }) === "plafond de l'épisode"
    && gardeReleveDeVeille({ ...candidat, mur_du: iso(5) }, { ...bon, reussi_le: iso(10) }, MAINTENANT) === "cadence",
    "sur un état lu, les gardes d'avant, chacune nommée : déjà reparti (réussi après le mur), en file, 15 min, 3 reprises par épisode");
  const hors = fauxServeur(histoire());
  const refus = [
    await lireEtatReleveDeVeille(hors.client, { user_id: U, platform: "vinted", mur_du: iso(120) }, MAINTENANT),
    await lireEtatReleveDeVeille(hors.client, { platform: "beebs", mur_du: iso(120) }, MAINTENANT),
    await lireEtatReleveDeVeille(hors.client, { user_id: U, platform: "beebs" }, MAINTENANT),
  ];
  ok(refus.every((e) => e.lu === false) && hors.etat.lectures === 0, "plateforme hors de la règle, compte absent ou mur sans date → non lu, aucune lecture faite");
  ok(relevesDeVeilleAReposer({ candidats: [{ user_id: U, platform: "vinted", mur_du: iso(120) }], etats: new Map([[`${U}|vinted`, bon]]), ouverte: ouvert, maintenant: MAINTENANT }).length === 0
    && relevesDeVeilleAReposer({ candidats: [candidat, candidat], etats: new Map([[cleReleveDeVeille(candidat), bon]]), ouverte: ouvert, maintenant: MAINTENANT }).length === 1,
    "la règle seule : jamais Vinted, eBay ni Opla ; un relevé au plus par (compte, plateforme)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LA VRAIE RECONNEXION CONTINUE DE PARTIR (garde-fou de Nico) — UNE FOIS
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n8. Une VRAIE reconnexion : un relevé ; rien après un réussi ; 2e et 3e si le mur revient, puis plus rien");
const MUR_LBC = "session leboncoin : page de connexion";
const profilSonde = (min) => profil({ sessions: { leboncoin: true, checked_at_par_plateforme: { leboncoin: iso(min) } } });
// Un passage complet de handler-watch (lecture, règle, insertion) `apres` minutes après MAINTENANT ; la session a été
// vue connectée `sonde` minutes avant MAINTENANT. Rend le nombre de relevés posés.
const tour = async (s, apres, sonde) => (await passageComplet(s.client, { profils: profilSonde(sonde), ouverte: ouvert, maintenant: MAINTENANT + apres * 60_000 })).length;
// L'extension termine le dernier relevé posé, `apres` minutes après MAINTENANT.
const finir = (s, apres, status, erreur = null) => Object.assign(s.etat.lignes.at(-1), { status, finished_at: iso(-apres), erreur });
{
  // Relevé réussi il y a 3 h, mur il y a 30 min, session revenue il y a 5 min.
  const s = fauxServeur([reussiIlYA(180), murIlYA(30)]);
  const premier = await tour(s, 0, 5);
  const posee = s.etat.lignes.at(-1);
  ok(premier === 1 && posee.declencheur === DECLENCHEUR_REPRISE_CONNEXION && posee.kind === "annonces" && posee.platform === "leboncoin" && posee.status === "queued",
    "mur, puis session revenue → UN relevé de veille posé (c'est voulu)");
  ok(await tour(s, 3, 5) === 0, "passage suivant, ce relevé encore en file → rien de plus");
  finir(s, 4, "done");
  const suite = [await tour(s, 6, 5), await tour(s, 9, 5), await tour(s, 30, -25), await tour(s, 180, -175), await tour(s, 24 * 60, -(24 * 60 - 5))];
  ok(suite.every((k) => k === 0) && s.etat.lignes.filter((l) => l.declencheur === DECLENCHEUR_REPRISE_CONNEXION).length === 1,
    "ce relevé a réussi → plus rien aux passages suivants (3 min, 6 min, 30 min, 3 h, 24 h après) : un seul relevé pour la reconnexion", suite.join(","));
}
{
  const s = fauxServeur([reussiIlYA(180), murIlYA(30)]);
  const r1 = await tour(s, 0, 5); finir(s, 1, "failed", MUR_LBC);
  const sansSondeNeuve = await tour(s, 3, 5);
  const r2 = await tour(s, 6, -5); finir(s, 7, "failed", MUR_LBC);
  const r3 = await tour(s, 12, -10); finir(s, 13, "failed", MUR_LBC);
  ok(r1 === 1 && sansSondeNeuve === 0 && r2 === 1 && r3 === 1,
    "le relevé retombe au mur : rien tant que la session n'est pas revue après ce mur, puis un 2e relevé, puis un 3e", [r1, sansSondeNeuve, r2, r3].join(","));
  const ensuite = [await tour(s, 18, -15), await tour(s, 21, -15), await tour(s, 60, -58), await tour(s, 24 * 60, -(24 * 60 - 2))];
  ok(ensuite.every((k) => k === 0) && s.etat.lignes.filter((l) => l.declencheur === DECLENCHEUR_REPRISE_CONNEXION).length === PLAFOND_REPRISES_PAR_EPISODE,
    "… puis plus rien, session revue ou non : 3 reprises par épisode, jamais un martèlement", ensuite.join(","));
  // Un relevé réussi clôt l'épisode ; un mur ultérieur ouvre un nouvel épisode.
  s.etat.lignes.push(reussiIlYA(-25 * 60), murIlYA(-26 * 60));
  ok(await tour(s, 26 * 60 + 6, -(26 * 60 + 5)) === 1, "un relevé réussi clôt l'épisode : au mur suivant, la reconnexion repose un relevé");
}
{
  // Relevé réussi il y a 10 min, mur il y a 5 min, session revue il y a 1 min.
  const s = fauxServeur([reussiIlYA(10), murIlYA(5)]);
  const tot = await tour(s, 0, 1), tard = await tour(s, 6, 1);
  ok(CADENCE_REPRISE_MS === 15 * 60_000 && tot === 0 && tard === 1, "relevé réussi il y a moins de 15 min → rien ; 6 min plus tard (16 min) → le relevé part", `${tot},${tard}`);
}
{
  // Un épisode ne remonte jamais au-delà de 30 jours — la fenêtre de l'historique que la règle recevait avant le 11/11.
  const J = 24 * 60;
  const reprisesAuMur = (jours) => jours.map((j) => murIlYA(j * J, { declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(j * J + 1) }));
  const vieux = fauxServeur([reussiIlYA(40 * J), ...reprisesAuMur([35, 34.9, 34.8]), murIlYA(120)]);
  const e = await lireEtatReleveDeVeille(vieux.client, { user_id: U, platform: "leboncoin", mur_du: iso(120) }, MAINTENANT);
  ok(e.lu === true && e.reussi_le === null && e.en_file === false && e.reprises === 0 && await tour(vieux, 0, 10) === 1,
    "un relevé réussi et 3 reprises vieux de plus de 30 jours ne retiennent pas la reconnexion d'aujourd'hui (comme avant)", JSON.stringify(e));
  const recent = fauxServeur([reussiIlYA(40 * J), ...reprisesAuMur([20, 19.9, 19.8]), murIlYA(120)]);
  ok(await tour(recent, 0, 10) === 0, "… 3 reprises d'il y a 20 jours, sans relevé réussi depuis, retiennent toujours : l'épisode court encore");
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LES CAS RÉELS DU 09/11
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n9. Les cas réels du 09/11 : deux comptes FillSell sur un même compte Leboncoin ; le premier relevé hors règle");
{
  // Deux comptes FillSell (fa, fb) branchés sur le MÊME compte Leboncoin : chacun son mur, chacun son état.
  const pour = (user_id, l) => ({ ...l, user_id, compte_plateforme: "lbc-partage" });
  const lignes = [
    pour("fa", reussiIlYA(300)), pour("fb", reussiIlYA(290)), pour("fa", murIlYA(120)), pour("fb", murIlYA(118)),
    pour("fa", reussiIlYA(89, { declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(90) })),      // fa : sa reprise a réussi
  ];
  const profils = new Map(["fa", "fb"].map((u) => [u, profilSonde(10).get(U)]));
  const ouverte = new Map([["fa", true], ["fb", true]]);
  const s = fauxServeur(lignes);
  const candidats = await candidatsDuPassage(s.client, { profils, maintenant: MAINTENANT });
  const { etats, aPoser, demandes } = await decider(s.client, candidats, { ouverte, maintenant: MAINTENANT });
  ok(cles(candidats) === "fa|leboncoin, fb|leboncoin" && cles(aPoser) === "fb|leboncoin" && demandes.join(",") === "fb"
    && etats.get("fa|leboncoin").reussi_le === iso(89) && etats.get("fb|leboncoin").reussi_le === iso(290),
    "chacun son état : le relevé réussi de l'un ne vaut pas pour l'autre — seul le compte sans relevé réussi après SON mur repart", cles(aPoser));
  lignes.push(pour("fb", reussiIlYA(-1, { declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(0) })));   // fb : sa reprise réussit aussi
  const apres = [await passage(s.client, { profils, ouverte, maintenant: MAINTENANT + 3 * 60_000 }), await passage(s.client, { profils, ouverte, maintenant: MAINTENANT + 60 * 60_000 })];
  ok(apres.every((l) => l.length === 0), "chacun a un relevé réussi après son mur → plus rien, ni pour l'un ni pour l'autre (3 min et 1 h après)");
}
{
  // 09/11 14:09:08 (heure de Paris) : mur Beebs du 08/11 à 00:39:23, relevé réussi le 09/11 à 11:56:52, navigateur ouvert.
  const maintenant = Date.parse("2026-11-09T13:09:08Z");
  const s = fauxServeur([
    releve({ platform: "beebs", status: "failed", started_at: "2026-11-07T23:39:00Z", finished_at: "2026-11-07T23:39:23Z", erreur: "session beebs : page de connexion" }),
    releve({ platform: "beebs", status: "done", started_at: "2026-11-09T10:56:10Z", finished_at: "2026-11-09T10:56:52Z" }),
  ]);
  const profils = profil({ extVue: "2026-11-09T13:08:00Z", sessions: { beebs: true, checked_at_par_plateforme: { beebs: "2026-11-09T13:05:00Z" } } });
  ok((await passage(s.client, { profils, ouverte: ouvert, maintenant })).length === 0,
    "le premier relevé hors règle de la boucle (09/11 à 14:09:09) : mur vieux de 2 jours, relevé déjà réussi 2 h plus tôt → rien");
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. AUCUN CANDIDAT PRIVÉ DE LECTURE : JAMAIS COUPÉS AVANT D'ÊTRE LUS
// ═══════════════════════════════════════════════════════════════════════════
// Un candidat reste candidat jusqu'à 7 jours après son mur (relevé « déjà reparti » compris). Couper la liste triée à ses
// N premiers priverait toujours les mêmes de lecture : le relevé voulu après une vraie reconnexion ne partirait jamais
// pour eux. Le plafond porte donc sur les LECTURES d'un passage, et la tranche lue tourne d'un passage à l'autre.
console.log("\n10. Aucun candidat privé de lecture : jamais coupés avant d'être lus ; au-delà du plafond, la tranche tourne");
{
  const nb = PLAFOND_CANDIDATS_PAR_PASSAGE + 5;
  const murs = Array.from({ length: nb }, (_, i) => ({ user_id: `m${String(i).padStart(2, "0")}`, platform: "beebs", status: "failed", finished_at: iso(60 + i * 10), erreur: "session beebs : page de connexion" }));
  const profils = new Map(murs.map((m) => [m.user_id, profil().get(U)]));
  const melange = [...murs.slice(nb >> 1), ...murs.slice(0, nb >> 1)].reverse();   // un ordre qui n'est pas celui de la lecture
  const tous = candidatsReleveDeVeille({ arrets: melange, profils, maintenant: MAINTENANT });
  ok(tous.length === nb && tous.map((x) => x.user_id).join(",") === murs.map((m) => m.user_id).join(","),
    `${nb} murs → ${nb} candidats : aucun n'est coupé, murs les plus récents d'abord`, tous.map((x) => x.user_id).join(","));
  const sans = (arrets) => candidatsReleveDeVeille({ arrets, profils: profil(), maintenant: MAINTENANT }).length;
  ok(sans([mur("beebs", 300), mur("beebs", 120, { erreur: "réseau coupé" })]) === 0 && sans([mur("beebs", 120, { erreur: "réseau coupé" }), mur("beebs", 300)]) === 0
    && sans([mur("beebs", 300, { erreur: "réseau coupé" }), mur("beebs", 120)]) === 1,
    "le plus récent arrêt fait foi, quel que soit l'ordre dans lequel les arrêts arrivent");

  // La tranche d'un passage.
  const noms = (k) => Array.from({ length: k }, (_, i) => `k${i}`);
  ok(PLAFOND_CANDIDATS_PAR_PASSAGE === 30 && CADENCE_PASSAGES_MS === 3 * 60_000
    && trancheReleveDeVeille(noms(30), { maintenant: MAINTENANT }).join(",") === noms(30).join(",") && trancheReleveDeVeille([], { maintenant: MAINTENANT }).length === 0
    && trancheReleveDeVeille(noms(9), { maintenant: MAINTENANT + 7 * CADENCE_PASSAGES_MS }).join(",") === noms(9).join(","),
    "sous le plafond (30 par passage du cron de 3 min) : tous les candidats sont lus à chaque passage, dans l'ordre");
  const jamaisLus = [];
  for (const [combien, plafond] of [[31, 30], [35, 30], [61, 30], [100, 30], [7, 3]]) {
    const liste = noms(combien), passages = Math.ceil(combien / plafond);
    for (let depart = 0; depart < 2 * combien; depart++) {
      const lus = new Set();
      for (let k = 0; k < passages; k++) {
        const lue = trancheReleveDeVeille(liste, { maintenant: MAINTENANT + (depart + k) * CADENCE_PASSAGES_MS, plafond });
        if (lue.length !== plafond || new Set(lue).size !== plafond) jamaisLus.push(`${combien}/${plafond} : tranche de ${lue.length} dont ${new Set(lue).size} distincts`);
        for (const x of lue) lus.add(x);
      }
      if (lus.size !== combien) jamaisLus.push(`${combien}/${plafond}, départ ${depart} : ${combien - lus.size} jamais lus en ${passages} passages`);
    }
  }
  ok(jamaisLus.length === 0,
    "au-delà du plafond (31, 35, 61, 100 candidats pour 30 ; 7 pour 3) : chaque passage en lit un plafond, et CHACUN est lu en ceil(n / plafond) passages consécutifs, quel que soit le passage de départ",
    jamaisLus.slice(0, 4).join(" | "));
  const unPassage = trancheReleveDeVeille(noms(31), { maintenant: MAINTENANT + 1000 });
  ok(unPassage.join(",") === trancheReleveDeVeille(noms(31), { maintenant: MAINTENANT + 170_000 }).join(",")
    && unPassage.join(",") !== trancheReleveDeVeille(noms(31), { maintenant: MAINTENANT + CADENCE_PASSAGES_MS + 1000 }).join(","),
    "la tranche est celle du passage (même tranche dans les 3 min, la suivante au passage suivant)");
}
{
  // Le cas qui ne doit jamais se perdre : 31 candidats — 30 dont le relevé a déjà réussi après le mur, et le 31e, au mur
  // le PLUS ANCIEN, qui est une vraie reconnexion. Passage choisi le plus défavorable : sa tranche (30) ne le contient pas
  // (un passage dont le numéro est multiple de 31 lit les 30 premiers).
  const N = PLAFOND_CANDIDATS_PAR_PASSAGE + 1;
  const T = Math.ceil(Math.floor(MAINTENANT / CADENCE_PASSAGES_MS) / N) * N * CADENCE_PASSAGES_MS;
  const ilYA = (min) => new Date(T - min * 60_000).toISOString();
  const ligne = (user_id, o) => releve({ user_id, platform: "beebs", ...o });
  const lignes = [ligne("vrai", { status: "done", started_at: ilYA(301), finished_at: ilYA(300) })];
  const profils = new Map(), ouverte = new Map();
  const brancher = (u) => { profils.set(u, { extVue: ilYA(1), sessions: { beebs: true, checked_at_par_plateforme: { beebs: ilYA(10) } }, ps: {} }); ouverte.set(u, true); };
  lignes.push(ligne("vrai", { status: "failed", started_at: ilYA(201), finished_at: ilYA(200), erreur: "session beebs : page de connexion" }));
  brancher("vrai");
  for (let i = 0; i < PLAFOND_CANDIDATS_PAR_PASSAGE; i++) {
    const u = `d${String(i).padStart(2, "0")}`;
    lignes.push(ligne(u, { status: "failed", started_at: ilYA(61 + i), finished_at: ilYA(60 + i), erreur: "session beebs : page de connexion" }));
    lignes.push(ligne(u, { status: "done", started_at: ilYA(56 + i), finished_at: ilYA(55 + i) }));
    brancher(u);
  }
  const s = fauxServeur(lignes);
  const candidats = await candidatsDuPassage(s.client, { profils, maintenant: T });
  const premiere = trancheReleveDeVeille(candidats, { maintenant: T });
  ok(candidats.length === N && candidats.at(-1).user_id === "vrai" && premiere.length === PLAFOND_CANDIDATS_PAR_PASSAGE && !premiere.some((c) => c.user_id === "vrai"),
    "31 candidats, la vraie reconnexion a le mur le plus ancien ; la tranche de ce passage (30) ne la contient pas");
  const p1 = await passageComplet(s.client, { profils, ouverte, maintenant: T });
  const p2 = await passageComplet(s.client, { profils, ouverte, maintenant: T + CADENCE_PASSAGES_MS });
  const p3 = await passageComplet(s.client, { profils, ouverte, maintenant: T + 2 * CADENCE_PASSAGES_MS });
  ok(p1.length === 0 && cles(p2) === "vrai|beebs" && p3.length === 0,
    "plus de candidats que le plafond : la vraie reconnexion reçoit SON relevé en 2 passages au plus (jamais privée de lecture), une seule fois",
    `passage 1 : ${cles(p1) || "rien"} ; passage 2 : ${cles(p2) || "rien"} ; passage 3 : ${cles(p3) || "rien"}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. STATIQUE : PLUS AUCUNE LECTURE EN VRAC DANS LA REPRISE
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n11. handler-watch et le module : plus aucune lecture en vrac dans la reprise des relevés");
// Chaque accès à vinted_sync_runs d'un source : la chaîne d'appels, et les 80 caractères qui la précèdent.
const accesSyncRuns = (src) => {
  const out = [];
  for (let i = src.indexOf('.from("vinted_sync_runs")'); i !== -1; i = src.indexOf('.from("vinted_sync_runs")', i + 1)) {
    let fin = i, prof = 0;
    for (; fin < src.length; fin++) {
      const ch = src[fin];
      if (ch === "(") prof++;
      else if (ch === ")") { if (--prof < 0) break; }
      else if (ch === ";" && prof === 0) break;
    }
    out.push({ avant: src.slice(Math.max(0, i - 80), i), chaine: src.slice(i, fin) });
  }
  return out;
};
{
  const debut = hw.indexOf("LE RELEVÉ AUSSI REPART TOUT SEUL"), fin = hw.indexOf("LE RELEVÉ VINTED REPART AUSSI");
  ok(debut > 0 && fin > debut, "handler-watch : le bloc de la reprise des relevés est trouvé (entre ses deux titres)");
  const bloc = hw.slice(debut, fin).replace(/^\s*\/\/.*$/gm, "");
  const acces = accesSyncRuns(bloc);
  const lectures = acces.filter((a) => !/\.(insert|update|delete|upsert)\(/.test(a.chaine));
  const bornee = (a) => /\.order\(/.test(a.chaine) && (/\.range\(/.test(a.chaine) || /lirePagesDisparues\(\(\) => supabase\s*$/.test(a.avant));
  ok(lectures.length >= 1 && lectures.every(bornee),
    "handler-watch : toute lecture de vinted_sync_runs du bloc est triée ET lue par pages (les arrêts de 7 jours)",
    lectures.filter((a) => !bornee(a)).map((a) => a.chaine.replace(/\s+/g, " ").slice(0, 160)).join(" | "));
  ok(!lectures.some((a) => /\.in\("user_id"/.test(a.chaine)),
    "handler-watch : aucune lecture de vinted_sync_runs par .in(\"user_id\") — l'historique de plusieurs comptes n'est plus jamais lu d'un coup",
    lectures.filter((a) => /\.in\("user_id"/.test(a.chaine)).map((a) => a.chaine.replace(/\s+/g, " ").slice(0, 160)).join(" | "));
  const limites = [...bloc.matchAll(/\.limit\(([^)]*)\)/g)].map((m) => m[1].trim());
  ok(limites.every((a) => /^\d[\d_]*$/.test(a) && Number(a.replaceAll("_", "")) < 1000), "handler-watch : aucun .limit de 1 000 ou plus dans le bloc (PostgREST coupe à 1 000 sans erreur)", limites.join(","));
  ok(/candidatsReleveDeVeille\(\{/.test(bloc) && /lireEtatReleveDeVeille\(supabase, c, maintenant\)/.test(bloc)
    && /relevesDeVeilleAReposer\(\{ candidats: tranche, etats, ouverte, maintenant \}\)/.test(bloc) && /insert\(ligneReleveDeVeille\(c\)\)/.test(bloc),
    "handler-watch : les candidats, puis l'état de chacun lu par clé, puis la règle, puis la ligne de la règle");
  ok(/const tranche = trancheReleveDeVeille\(candidats, \{ maintenant \}\);/.test(bloc) && /for \(const c of tranche\) \{\s*const etat = await lireEtatReleveDeVeille\(/.test(bloc)
    && !/candidats\.slice\(|PLAFOND_CANDIDATS_PAR_PASSAGE/.test(bloc),
    "handler-watch : les candidats ne sont jamais coupés avant d'être lus — la tranche du passage vient de trancheReleveDeVeille (elle tourne)");
  const iEtat = bloc.indexOf("lireEtatReleveDeVeille(supabase, c, maintenant)"), iRpc = bloc.indexOf('rpc("sync_multi_ouverte_pour"');
  ok(/const libres = tranche\.filter\(\(c\) => gardeReleveDeVeille\(c, etats\.get\(cleReleveDeVeille\(c\)\), maintenant\) === null\);/.test(bloc)
    && /for \(const uid of new Set\(libres\.map\(\(c\) => c\.user_id\)\)\)/.test(bloc) && !/for \(const uid of (ids|new Set\((candidats|tranche)\.map)/.test(bloc)
    && (bloc.match(/rpc\("sync_multi_ouverte_pour"/g) ?? []).length === 1 && iEtat > 0 && iRpc > iEtat,
    "handler-watch : l'état est lu AVANT l'interrupteur, qui n'est demandé que pour les candidats qu'aucune garde ne retient (aucun appel pour un relevé déjà reparti)");
  ok(/relevés de veille : \$\{candidatsVus\} candidat\(s\), \$\{relevesRepris\} reposé\(s\), \$\{etatsIllisibles\} état\(s\) illisible\(s\)/.test(bloc)
    && /retenus : \$\{parGarde\}/.test(bloc) && /plafond du passage atteint/.test(bloc) && /interrupteur\(s\) fermé\(s\)/.test(bloc)
    && /arrêts lus coupés à 5 000/.test(bloc),
    "handler-watch : un journal par passage — candidats, reposés, états illisibles, la garde qui retient chacun, interrupteurs fermés, plafond, coupe des arrêts");
  // Les lignes de la colle qu'un défaut réintroduit ferait tomber (relecture du 11/11 : six mutations restaient vertes
  // quand le verrou ne lisait que des présences) — le § 12 les EXÉCUTE ; ici, leur forme exacte.
  ok((bloc.match(/etats\.set\(/g) ?? []).length === 1 && /etats\.set\(cleReleveDeVeille\(c\), etat\);/.test(bloc),
    "handler-watch : l'état d'un candidat est rangé tel quel (un seul etats.set, jamais une permission par défaut)");
  ok(/ouverte\.set\(uid, eOuverte \? false : data === true\);/.test(bloc) && !/ouverte\.set\(uid, true\)/.test(bloc)
    && /catch \(e\) \{\s*ouverte\.set\(uid, false\);\s*etatsIllisibles\+\+;/.test(bloc),
    "handler-watch : l'interrupteur n'est ouvert que sur un « vrai » lu sans erreur ; interrompu = fermé et compté");
  ok(/candidatsReleveDeVeille\(\{ arrets: arrets\.filter\(\(r\) => ids\.includes\(String\(r\.user_id\)\)\), profils, maintenant \}\)/.test(bloc)
    && /\.in\("status", \[\.\.\.STATUTS_ARRET_RELEVE\]\)/.test(bloc) && /\.order\("id", \{ ascending: false \}\)/.test(bloc),
    "handler-watch : la règle reçoit TOUS les arrêts des comptes à mur (un arrêt plus récent qui n'est pas un mur l'emporte), tous statuts d'arrêt, ordre total");
  const mod = lire("supabase/functions/_shared/releves-de-veille.js");
  const d = mod.indexOf("export async function lireEtatReleveDeVeille(");
  const corps = mod.slice(d, mod.indexOf("\n}\n", d));
  const nb = (re) => (corps.match(re) ?? []).length;
  ok(d > 0 && nb(/\.from\("vinted_sync_runs"\)/g) === 3 && nb(/\.eq\("user_id", user_id\)/g) === 3 && nb(/\.eq\("platform", platform\)/g) === 3
    && nb(/\.limit\(/g) === 3 && nb(/\.limit\(1\)/g) === 2 && nb(/\.limit\(PLAFOND_REPRISES_PAR_EPISODE\)/g) === 1 && !/\.in\("user_id"|\.range\(/.test(corps)
    && nb(/\.gte\("started_at", depuis\)/g) === 2,
    "le module : trois lectures au plus, chacune par clé (compte, plateforme) et bornée (1, 1 et 3 lignes ; 30 jours pour le dernier réussi et les reprises) — jamais une lecture de plusieurs comptes");
  const iReussi = corps.indexOf('.eq("status", "done")'), iArret = corps.indexOf("en_file: null, reprises: null"), iFile = corps.indexOf('.in("status", ["queued", "running"])'), iEpisode = corps.indexOf('.eq("declencheur", DECLENCHEUR_REPRISE_CONNEXION)');
  ok(iReussi > 0 && iArret > iReussi && iFile > iArret && iEpisode > iFile && /if \(reussi_le != null && dejaReparti\(t\(reussi_le\), arret\)\) return \{ lu: true,/.test(corps)
    && nb(/\.not\("finished_at", "is", null\)/g) === 1 && /\.not\("finished_at", "is", null\)\s*\.order\("finished_at", \{ ascending: false \}\)\.limit\(1\)/.test(corps),
    "le module : le dernier relevé réussi est lu D'ABORD (date de fin non vide, tri décroissant) ; postérieur au mur, la lecture s'arrête là — sinon « en file », puis les reprises");
  const dc = mod.indexOf("export function candidatsReleveDeVeille("), dt = mod.indexOf("export function trancheReleveDeVeille(");
  ok(dc > 0 && dt > dc && !/\.slice\(|plafond/.test(mod.slice(dc, mod.indexOf("\n}\n", dc))) && /% n/.test(mod.slice(dt, mod.indexOf("\n}\n", dt))),
    "le module : candidatsReleveDeVeille ne coupe jamais (ni plafond ni slice) ; la tranche d'un passage tourne (trancheReleveDeVeille)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. LE VRAI BLOC DE HANDLER-WATCH, EXÉCUTÉ (relecture du 11/11)
// ═══════════════════════════════════════════════════════════════════════════
// Les § 6 à 10 rejouent le passage avec une copie de la colle (decider, lireArrets) ; la relecture a montré que six
// défauts réintroduits dans handler-watch restaient alors verts. Ici, le bloc « LE RELEVÉ AUSSI REPART TOUT SEUL » est
// DÉCOUPÉ dans index.ts, débarrassé de ses types (typescript, comme annonce-publiee-disparue) et EXÉCUTÉ sur le faux
// serveur, avec les vraies fonctions du module — lecture des arrêts par pages, profils, état de chaque candidat,
// interrupteur, insertion, journal.
console.log("\n12. Le vrai bloc de handler-watch, exécuté sur le faux serveur");
{
  const ts = (await import("typescript")).default;
  const regle = await import("../supabase/functions/_shared/releves-de-veille.js");
  const iDebut = hw.indexOf("  let relevesRepris = 0;");
  const iTitre = hw.indexOf("LE RELEVÉ VINTED REPART AUSSI");
  const iFin = hw.lastIndexOf("// ═", iTitre);   // la ligne de ═ qui ouvre la section suivante
  const iPages = hw.indexOf("async function lirePagesDisparues(");
  const finPages = hw.indexOf("\n}\n", iPages) + 3;
  ok(iDebut > 0 && iFin > iDebut && iPages > 0, "le bloc et lirePagesDisparues sont découpés dans handler-watch");
  const noms = ["FENETRE_ARRETS_MS", "STATUTS_ARRET_RELEVE", "PLATEFORMES_VEILLE_REPRISE", "murConnexionVeille", "candidatsReleveDeVeille",
    "trancheReleveDeVeille", "lireEtatReleveDeVeille", "cleReleveDeVeille", "gardeReleveDeVeille", "relevesDeVeilleAReposer", "ligneReleveDeVeille"];
  const source = `export async function bloc(supabase, Date, console, deps) {
  const { ${noms.join(", ")} } = deps;
  ${hw.slice(iPages, finPages)}
  ${hw.slice(iDebut, iFin)}
  return relevesRepris;
}`;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { bloc: executerBloc } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

  // Le client du bloc : le faux serveur de vinted_sync_runs, plus profiles et l'interrupteur.
  const clientDuBloc = (s, profils, { interrupteur = () => true, profilsEnPanne = false, refuserInsert = false } = {}) => ({
    from(table) {
      if (table === "profiles") {
        const rows = [...profils].map(([id, p]) => ({ id, extension_sessions: p.sessions, extension_last_seen_at: p.extVue, platform_settings: p.ps }));
        return { select() { return { in(_c, ids) { const s2 = new Set(ids.map(String)); return Promise.resolve(profilsEnPanne
          ? { data: null, error: { message: "profils en panne" } } : { data: rows.filter((r) => s2.has(String(r.id))), error: null }); } }; } };
      }
      const b = s.client.from(table);
      if (refuserInsert) b.insert = () => ({ select: () => Promise.resolve({ data: null, error: { message: "insertion refusée" } }) });
      return b;
    },
    async rpc(nom, { p_user }) {
      if (nom !== "sync_multi_ouverte_pour") throw new Error(`rpc inattendue ${nom}`);
      const r = interrupteur(p_user);
      if (r === "jette") throw new Error("réseau coupé");
      if (r === "erreur") return { data: null, error: { message: "interrupteur en panne" } };
      return { data: r, error: null };
    },
  });
  // Un passage du VRAI bloc à l'instant `quand` : rend les relevés posés, le journal et les erreurs.
  const executer = async (s, profils, quand, opts = {}) => {
    const journal = [], erreurs = [];
    const FauxDate = class extends Date { constructor(...a) { if (a.length) super(...a); else super(quand); } static now() { return quand; } };
    const avant = s.etat.lignes.length;
    const reposes = await executerBloc(clientDuBloc(s, profils, opts), FauxDate,
      { log: (m) => journal.push(String(m)), error: (...a) => erreurs.push(a.join(" ")) },
      { ...regle, ligneReleveDeVeille: (c) => regle.ligneReleveDeVeille(c, new Date(quand).toISOString()) });
    const poses = s.etat.lignes.slice(avant).map((l) => `${l.user_id}|${l.platform}`).sort().join(", ");
    return { reposes, poses, journal: journal.find((l) => l.includes("relevés de veille :")) ?? "", erreurs };
  };

  const { lignes, profils } = parcDu1111();
  const copie = () => fauxServeur(lignes.map((l) => ({ ...l })));
  {
    const s = copie();
    const p1 = await executer(s, profils, T11);
    ok(p1.poses === "c05|beebs" && p1.reposes === 1 && /5 candidat\(s\), 1 reposé\(s\), 0 état\(s\) illisible\(s\)/.test(p1.journal) && /retenus : 4 déjà reparti/.test(p1.journal),
      "LE VRAI BLOC sur le parc du 11/11 : seule la vraie reconnexion (c05) est reposée ; le journal dit 5 candidats, 4 retenus « déjà reparti »",
      `posés : ${p1.poses || "aucun"} ; journal : ${p1.journal} ; erreurs : ${p1.erreurs.join(" | ")}`);
    const p2 = await executer(s, profils, T11 + CADENCE_PASSAGES_MS);
    ok(p2.poses === "" && /retenus : .*1 en file/.test(p2.journal),
      "… et au passage suivant, rien : le relevé de c05 est en file", `posés : ${p2.poses || "aucun"} ; journal : ${p2.journal}`);
  }
  {
    // Un état non lu ne pose rien — toutes les lectures d'état en panne (la lecture des arrêts, la 1re, passe).
    const s = fauxServeur(lignes.map((l) => ({ ...l })), { panne: (k) => (k >= 2 ? "erreur" : null) });
    const r = await executer(s, profils, T11);
    ok(r.poses === "" && /0 reposé\(s\), 5 état\(s\) illisible\(s\)/.test(r.journal),
      "LE VRAI BLOC : chaque état en panne → rien de posé, 5 états illisibles dits au journal", `posés : ${r.poses || "aucun"} ; journal : ${r.journal}`);
    const s2 = fauxServeur(lignes.map((l) => ({ ...l })), { panne: (k) => (k >= 2 ? "jette" : null) });
    const r2 = await executer(s2, profils, T11);
    ok(r2.poses === "" && /5 état\(s\) illisible\(s\)/.test(r2.journal), "LE VRAI BLOC : lectures interrompues → rien de posé, dit au journal", r2.journal);
  }
  {
    const r = await executer(copie(), profils, T11, { interrupteur: () => false });
    ok(r.poses === "" && /1 interrupteur\(s\) fermé\(s\)/.test(r.journal), "LE VRAI BLOC : interrupteur fermé → rien de posé, compté au journal", r.journal);
    const j = await executer(copie(), profils, T11, { interrupteur: () => "jette" });
    ok(j.poses === "" && /1 état\(s\) illisible\(s\) \(interrupteur interrompu/.test(j.journal), "LE VRAI BLOC : interrupteur interrompu → fermé, compté et nommé", j.journal);
    const e = await executer(copie(), profils, T11, { interrupteur: () => "erreur" });
    ok(e.poses === "" && /1 état\(s\) illisible\(s\) \(interrupteur : interrupteur en panne\)/.test(e.journal), "LE VRAI BLOC : interrupteur en erreur → fermé, compté et nommé", e.journal);
  }
  {
    const r = await executer(copie(), profils, T11, { profilsEnPanne: true });
    ok(r.poses === "" && r.erreurs.some((x) => /profils illisibles/.test(x)), "LE VRAI BLOC : profils illisibles → rien de posé, et c'est dit", r.erreurs.join(" | "));
    const i = await executer(copie(), profils, T11, { refuserInsert: true });
    ok(i.poses === "" && i.reposes === 0 && /1 non écrit\(s\) par la base \(insertion refusée\)/.test(i.journal), "LE VRAI BLOC : une insertion refusée est comptée et nommée", i.journal);
  }
  {
    // Un arrêt PLUS RÉCENT que le mur, qui n'est pas un mur (expiré), l'emporte : plus de candidat — tous statuts d'arrêt lus.
    const avecExpire = [...lignes.map((l) => ({ ...l })), { id: "r9999", user_id: "c05", kind: "annonces", platform: "beebs", declencheur: "cron", status: "expired",
      queued_at: null, started_at: pg(T11 - 10 * MIN), finished_at: pg(T11 - 9 * MIN), erreur: "délai dépassé" }];
    const r = await executer(fauxServeur(avecExpire), profils, T11);
    ok(r.poses === "" && /^\[handler-watch\] relevés de veille : 4 candidat\(s\)/.test(r.journal),
      "LE VRAI BLOC : un arrêt « expired » plus récent que le mur l'emporte — c05 n'est plus candidat", r.journal);
  }
  {
    // 5 000 arrêts ou plus : lus du plus récent au plus ancien, la coupe est DITE au journal.
    const beaucoup = Array.from({ length: 5000 }, (_, k) => ({ id: `z${String(k).padStart(5, "0")}`, user_id: `z${k % 50}`, kind: "annonces", platform: "beebs",
      declencheur: "cron", status: "failed", queued_at: null, started_at: pg(T11 - (k + 2) * MIN), finished_at: pg(T11 - (k + 1) * MIN), erreur: "réseau coupé" }));
    const r = await executer(fauxServeur(beaucoup), new Map(), T11);
    ok(r.poses === "" && /arrêts lus coupés à 5 000/.test(r.journal), "LE VRAI BLOC : une lecture des arrêts coupée à 5 000 est dite au journal", r.journal);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. COMPLÉMENTS DE LA RELECTURE (11/11)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n13. Compléments de la relecture : gardes exercées sur le faux serveur, constantes, murs non reconnus, rotation");
{
  // Un relevé EN COURS (running), aucun réussi après le mur → rien.
  const enCours = fauxServeur([reussiIlYA(300), murIlYA(60), releve({ status: "running", started_at: iso(5), finished_at: null, declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(5) })]);
  ok((await tour(enCours, 0, 2)) === 0, "un relevé EN COURS sans réussi après le mur : rien (garde « en file » exercée)");
  // Même compte : mur Leboncoin ; un relevé Beebs réussi APRÈS ne vaut pas « déjà reparti » pour Leboncoin.
  const autre = fauxServeur([reussiIlYA(300), murIlYA(60), reussiIlYA(30, { platform: "beebs" })]);
  ok((await tour(autre, 0, 2)) === 1, "un relevé réussi d'une AUTRE plateforme du même compte ne vaut pas « déjà reparti » : le relevé Leboncoin part");
  // Fraîcheur de la sonde : 3 h, des deux côtés.
  ok(FRAICHEUR_SONDE_VEILLE_MS === 3 * HEURE, "la sonde vaut 3 h (constante de la règle, inchangée)");
  const frais = fauxServeur([reussiIlYA(400), murIlYA(200)]);
  ok((await tour(frais, 0, 170)) === 1, "une sonde de 2 h 50, postérieure au mur : le relevé part");
  const vieille = fauxServeur([reussiIlYA(400), murIlYA(200)]);
  ok((await tour(vieille, 0, 190)) === 0, "une sonde de 3 h 10 : rien");
  // Les murs que la règle ne reconnaît PAS aujourd'hui (décision de Nico en attente, 11/11) : le texte réel de Depop
  // sur ordinateur et celui de la copie Cloud. Aujourd'hui : rien n'est posé pour eux.
  ok(!murConnexionVeille("Connexion Depop requise : ouvre depop.com et connecte-toi") && !murConnexionVeille("Vinted demande une reconnexion")
    && !murConnexionVeille("accès Depop non accordé"),
    "murs NON reconnus aujourd'hui (décision de Nico en attente) : « Connexion Depop requise… », « … demande une reconnexion » (Cloud), « accès Depop non accordé »");
  ok(plateformes(await run({ arrets: [mur("depop", 120, { erreur: "Connexion Depop requise : ouvre depop.com et connecte-toi" })] })) === "",
    "Depop sur ordinateur (texte réel) : aucun relevé de veille posé aujourd'hui");
  // L'ancien contrat lève au lieu de rendre [] en silence.
  let leve = false;
  try { relevesDeVeilleAReposer({ arrets: [], historique: [], profils: new Map(), ouverte: ouvert }); } catch { leve = true; }
  ok(leve, "relevesDeVeilleAReposer appelée à l'ancienne ({ arrets, historique, … }) lève — jamais [] en silence");
  // La rotation n'oublie personne quelle que soit la cadence : k passages sautés (1 à 30), n de 31 à 120.
  const oublis = [];
  for (let nb = 31; nb <= 120; nb++) {
    const liste = Array.from({ length: nb }, (_, i) => i);
    for (let k = 1; k <= 30; k++) {
      const lus = new Set();
      for (let j = 0; j < nb; j++) for (const x of trancheReleveDeVeille(liste, { maintenant: (1000 + j * k) * CADENCE_PASSAGES_MS })) lus.add(x);
      if (lus.size !== nb) oublis.push(`n=${nb}, un passage sur ${k} : ${nb - lus.size} jamais lus`);
    }
  }
  ok(oublis.length === 0, "rotation : aucun candidat oublié, même si le cron ne passe qu'une fois sur k (k de 1 à 30, n de 31 à 120)", oublis.slice(0, 3).join(" | "));
  ok(pasDeTranche(31) === 30 && pasDeTranche(35) === 29 && pasDeTranche(60) === 29 && pasDeTranche(100) === 29 && pasDeTranche(7, 3) === 3,
    "le pas de la tranche est le plus grand entier ≤ plafond premier avec n (31 → 30, 35 → 29, 60 → 29, 100 → 29)");
  const cron = lire("supabase/migrations/20260716110000_handler_watch_cron.sql");
  ok(/'\*\/3 \* \* \* \*'/.test(cron) && CADENCE_PASSAGES_MS === 3 * MIN, "la cadence des passages (3 min) est celle du cron handler-watch-3min ('*/3 * * * *')");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — relevés de veille`);
process.exit(ko ? 1 : 0);
