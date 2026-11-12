// VERROU (12/11/2026, point 2 de Nico) : UNE VENTE ARRÊTE AUSSI LES TÂCHES NON PUBLIÉES DE SA PLATEFORME, ET UN ARTICLE
// ÉPUISÉ NE PART JAMAIS.
//
//     npm run selftest:vente-arrete-meme-plateforme
//
// Cas fondateur (compte 6e3d92b3) : vente Vinted le 11/11 23:06 ; la republication Vinted fac6fdef de l'annonce vendue
// reste « pending » (la cascade écartait la plateforme de la vente), seule dans tout le parc.
//   A. La règle pure (_shared/article-epuise.js) : épuisé = « vendu » ou quantité ≤ 0, la définition de la garde de
//      service de get-pending-jobs ; une quantité restante n'est jamais bloquée ; seul le démarrage est gardé.
//   B. La garde d'exécution est en place, au bon endroit : update-job-status (avant la prise du Cloud, 409, le « failed
//      de repli » ignoré) et ebay-api-worker (avant tout appel eBay).
//   C. La règle « sans objet » de handler-watch (_shared/questions-tranchees.ts), jouée sur un faux client : la tâche EN
//      ATTENTE d'une fiche vendue avec sa vente est arrêtée (écriture conditionnée à « pending ») ; une quantité 0 sans
//      vente, une vente seulement signalée, une republication engagée, une quantité restante : jamais.
//   D. La cascade en base, sur un Postgres JETABLE (décor de prod du 12/11) : avant la migration 20261112140000 la
//      republication Vinted de l'annonce vendue reste en attente ; après, elle est arrêtée — et rien d'autre ne change.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const existe = (p) => fs.existsSync(join(ROOT, p));
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };

// ── A. La règle pure ─────────────────────────────────────────────────────────
console.log("A. La règle : épuisé, démarrage");
let R = null;
try { R = await charger("supabase/functions/_shared/article-epuise.js"); } catch { /* absente avant le correctif */ }
ok(!!R, "_shared/article-epuise.js existe");
if (R) {
  ok(R.ficheEpuisee({ statut: "vendu", quantite: 0 }) && R.ficheEpuisee({ statut: "vendu", quantite: 1 }), "fiche « vendu » : épuisée (quantité 0, ou quantité vendue d'une vente saisie)");
  ok(R.ficheEpuisee({ statut: "stock", quantite: 0 }) && R.ficheEpuisee({ statut: "stock", quantite: "0" }) && R.ficheEpuisee({ statut: "stock", quantite: -1 }), "quantité ≤ 0 : épuisée (vente supprimée, quantité à 0)");
  ok(!R.ficheEpuisee({ statut: "stock", quantite: 2 }) && !R.ficheEpuisee({ statut: "stock", quantite: 1 }), "plusieurs exemplaires, quantité restante : JAMAIS bloquée");
  ok(!R.ficheEpuisee({ statut: "stock", quantite: null }) && !R.ficheEpuisee(null) && !R.ficheEpuisee(undefined), "quantité inconnue ou fiche illisible : rien n'est décidé (comme la garde de service)");
  ok(R.demarrageAGarder({ action: "republish", statutEnBase: "pending", statutDemande: "processing", inventaireId: 1 })
    && R.demarrageAGarder({ action: "publish", statutEnBase: "pending", statutDemande: "processing", inventaireId: 1 })
    && R.demarrageAGarder({ action: null, statutEnBase: "pending", statutDemande: "processing", inventaireId: 1 }), "le démarrage d'une publication ou d'une republication est gardé");
  ok(!R.demarrageAGarder({ action: "delete", statutEnBase: "pending", statutDemande: "processing", inventaireId: 1 }), "un RETRAIT n'est jamais gardé (c'est lui qui protège de la double vente)");
  ok(!R.demarrageAGarder({ action: "republish", statutEnBase: "processing", statutDemande: "processing", inventaireId: 1 })
    && !R.demarrageAGarder({ action: "publish", statutEnBase: "pending", statutDemande: "published", inventaireId: 1 }), "une écriture en cours de route ou un « publié » : jamais refusés (une annonce partie est suivie)");
  ok(!R.demarrageAGarder({ action: "publish", statutEnBase: "pending", statutDemande: "processing", inventaireId: null }), "une tâche sans fiche : hors de la règle");
  const pf = R.champsArticleVendu({ processing_since: "x", republish_step: "a_capturer" }, { statut: "vendu", quantite: 0 }, "essai", "2026-11-12T10:00:00Z");
  ok(pf.needs_user_source === "article_vendu" && pf.article_vendu.pose_par === "essai" && !("processing_since" in pf) && pf.republish_step === "a_capturer", "retenue « article vendu » : même forme que la garde de service, étape gardée, marque de travail retirée");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/f\.statut === "vendu" \|\| \(f\.quantite != null && Number\(f\.quantite\) <= 0\)/.test(gpj), "même définition que la garde de service de get-pending-jobs (statut « vendu » OU quantité ≤ 0)");
  ok(gpj.includes(R.messageArticleVendu({ statut: "vendu" }).slice(0, 60).replace(/ : on ne le publie.*/, "")), "même message que la garde de service");
}

// ── B. La garde d'exécution en place ─────────────────────────────────────────
console.log("B. La garde au démarrage");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const iGarde = ujs.indexOf("GARDE D'EXÉCUTION : UN ARTICLE ÉPUISÉ NE DÉMARRE JAMAIS");
const iCloud = ujs.indexOf("L'EXÉCUTANT CLOUD PREND SES JOBS PAR LA PRISE ATOMIQUE");
const iReserv = ujs.indexOf('adminReservation.rpc("controler_job_extension"');
ok(iGarde > 0 && iReserv > 0 && iReserv < iGarde && iGarde < iCloud, "update-job-status : la garde après la réservation, AVANT la prise du Cloud");
const blocGarde = iGarde > 0 ? ujs.slice(iGarde, iCloud) : "";
ok(/status === "processing" && reservation\.statut === "pending"/.test(blocGarde) && /demarrageAGarder\(/.test(blocGarde) && /ficheEpuisee\(fD\)/.test(blocGarde)
  && /\.eq\("status", "pending"\)/.test(blocGarde) && /MESSAGE_DEMARRAGE_ARTICLE_VENDU \}, 409\)/.test(blocGarde), "update-job-status : démarrage d'un article épuisé → retenu « article vendu » (écriture conditionnée à « pending ») + 409");
ok(/\["livres_isbn_garde", "republish_couleur_garde", SOURCE_ARTICLE_VENDU\]\.includes/.test(ujs), "update-job-status : le « failed de repli » de l'extension n'écrase jamais la retenue");
const eaw = lire("supabase/functions/ebay-api-worker/index.ts");
const iPub = eaw.indexOf("async function publier(");
const iGardeE = eaw.indexOf("UN ARTICLE ÉPUISÉ NE PART JAMAIS", iPub);
const iInv = eaw.indexOf("const inv = await lireInventaire(admin, job.inventaire_id);", iPub);
ok(iPub > 0 && iGardeE > iPub && iGardeE < iInv && /ficheEpuisee\(fE\)/.test(eaw.slice(iGardeE, iInv)) && /issue: "needs_user", motif: "article_vendu"/.test(eaw.slice(iGardeE, iInv)),
  "ebay-api-worker : publier() retient un article épuisé AVANT tout appel eBay");

// ── C. La règle « sans objet » de handler-watch ──────────────────────────────
console.log("C. handler-watch arrête la tâche en attente d'un article vendu");
/** Un faux client supabase-js : les seules lectures et écritures de trancherQuestions, sur un état en mémoire. */
function fauxClient(etat) {
  const ecritures = [];
  const valeur = (ligne, col, table) => {
    if (table === "cross_post_jobs" && col.startsWith("inventaire.")) return etat.inventaire.find((f) => f.id === ligne.inventaire_id)?.[col.split(".")[1]];
    if (col.includes("->>")) { const [a, b] = col.split("->>"); return (ligne[a] ?? {})[b] ?? null; }
    if (col.includes("->")) { const parts = col.split(/->>?/); let v = ligne; for (const p of parts) v = v?.[p]; return v ?? null; }
    return ligne[col];
  };
  const from = (table) => {
    const q = { table, f: [], op: "select", patch: null, sel: "" };
    const lignes = () => (etat[table] ?? []).filter((l) => q.f.every(([op, c, v]) => {
      const x = valeur(l, c, table);
      if (op === "eq") return String(x) === String(v);
      if (op === "in") return v.map(String).includes(String(x));
      if (op === "is") return v === null ? x == null : x === v;
      return true;
    }));
    const api = {
      select(s) { if (q.op === "select") q.sel = s ?? ""; else q.retour = true; return api; },
      eq(c, v) { q.f.push(["eq", c, v]); return api; }, in(c, v) { q.f.push(["in", c, v]); return api; },
      is(c, v) { q.f.push(["is", c, v]); return api; }, not() { return api; }, gt() { return api; }, lt() { return api; },
      gte() { return api; }, lte() { return api; }, like() { return api; }, ilike() { return api; }, or() { return api; },
      order() { return api; }, limit() { return api; }, maybeSingle() { q.un = true; return api; },
      update(p) { q.op = "update"; q.patch = p; return api; },
      then(res, rej) {
        try {
          let data;
          if (q.op === "update") {
            const touchees = lignes();
            for (const l of touchees) { Object.assign(l, q.patch); ecritures.push({ table, id: l.id, patch: q.patch, filtres: q.f }); }
            data = touchees.map((l) => ({ id: l.id }));
          } else {
            data = lignes().map((l) => (table === "cross_post_jobs" && /inventaire!inner/.test(q.sel)
              ? { ...l, inventaire: { statut: etat.inventaire.find((f) => f.id === l.inventaire_id)?.statut } } : { ...l }));
          }
          return Promise.resolve({ data: q.un ? (data[0] ?? null) : data, error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), ecritures };
}
const { trancherQuestions } = await charger("supabase/functions/_shared/questions-tranchees.ts");
const etat = {
  inventaire: [
    { id: 1, statut: "vendu", quantite: 0 }, { id: 2, statut: "stock", quantite: 0 }, { id: 3, statut: "vendu", quantite: 0 },
    { id: 4, statut: "vendu", quantite: 0 }, { id: 5, statut: "vendu", quantite: 0 }, { id: 6, statut: "stock", quantite: 2 },
  ],
  ventes: [{ inventaire_id: 1, date: "2026-11-11", created_at: "2026-11-11T22:06:22Z" }, { inventaire_id: 3, date: "2026-11-11" }, { inventaire_id: 5, date: "2026-11-10" }],
  profiles: [],
  cross_post_jobs: [
    { id: "j1", user_id: "u", platform: "vinted", action: "republish", status: "pending", inventaire_id: 1, created_at: "2026-11-09", platform_fields: { republish_step: "a_capturer", vinted_item_id: "10563073310" } },
    { id: "j2", user_id: "u", platform: "leboncoin", action: "publish", status: "pending", inventaire_id: 2, created_at: "2026-11-09", platform_fields: {} },
    { id: "j3", user_id: "u", platform: "vinted", action: "republish", status: "pending", inventaire_id: 3, created_at: "2026-11-09", platform_fields: { republish_step: "deleted", deleted_at: "2026-11-11" } },
    { id: "j4", user_id: "u", platform: "beebs", action: "publish", status: "pending", inventaire_id: 4, created_at: "2026-11-09", platform_fields: {} },
    { id: "j5", user_id: "u", platform: "vinted", action: "publish", status: "needs_user", inventaire_id: 5, created_at: "2026-11-09", platform_fields: { needs_user_source: "article_vendu", article_vendu: { pose_par: "get-pending-jobs" } } },
    { id: "j6", user_id: "u", platform: "ebay", action: "publish", status: "pending", inventaire_id: 6, created_at: "2026-11-09", platform_fields: {} },
  ],
};
const sb = fauxClient(etat);
const nT = await trancherQuestions(sb);
const j = (id) => etat.cross_post_jobs.find((x) => x.id === id);
ok(j("j1").status === "cancelled" && /^Article vendu le 11\/11 : cette republication sur Vinted n'a plus d'objet\. Rien n'a été retiré ni publié\.$/.test(j("j1").error ?? "")
  && j("j1").platform_fields?.sans_objet?.motif === "article_vendu_vente_enregistree", "LE CAS : la republication Vinted EN ATTENTE de l'article vendu est arrêtée, sans attendre son ordinateur", j("j1"));
const eJ1 = sb.ecritures.find((e) => e.id === "j1");
ok(!!eJ1 && eJ1.filtres.some(([op, c, v]) => op === "eq" && c === "status" && v === "pending"), "écriture conditionnée au statut lu (« pending ») : une tâche prise entre-temps n'est jamais touchée", eJ1?.filtres);
ok(j("j2").status === "pending", "quantité 0 sans vente (fiche « stock ») : jamais arrêtée ici (la question reste à la garde de service)");
ok(j("j3").status === "pending", "republication engagée (annonce déjà retirée) : jamais arrêtée ici");
ok(j("j4").status === "pending", "fiche « vendu » sans vente enregistrée (seulement signalée) : jamais arrêtée");
ok(j("j5").status === "cancelled", "la retenue « article vendu » existante (needs_user) est arrêtée comme avant");
ok(j("j6").status === "pending", "plusieurs exemplaires, quantité restante : jamais touchée");
ok(nT.vendu === 2 && sb.ecritures.filter((e) => e.table === "cross_post_jobs").length === 2, "deux arrêts, aucune autre écriture", { n: nT, e: sb.ecritures.map((e) => e.id) });

// ── D. La cascade en base (Postgres jetable) ─────────────────────────────────
console.log("D. La cascade de la vente, sur un Postgres jetable");
if (!existe("supabase/migrations/20261112140000_vente_arrete_meme_plateforme.sql")) {
  ok(false, "la migration 20261112140000 existe");
} else {
  const B = await charger("scripts/essais/20261112140000_banc.mjs");
  const { base, c, d } = await B.preparer({ port: 56000 + Math.floor(Math.random() * 1500) });
  try {
    ok(d.echecs.length === 0, `décor de prod du 12/11 (${d.nf} fonctions, ${d.nt} déclencheurs)`, d.echecs.slice(0, 3));
    const avant = await B.jouer(c);
    ok(avant.taches.r1.status === "pending", "AVANT (prod) : la republication Vinted de l'annonce vendue reste en attente — le défaut reproduit");
    const m = (await B.md5Base(c))[B.SIG];
    await c.query(B.migrationPourLaBase(B.lire(B.MIGRATION), m));
    const apres = await B.jouer(c);
    ok(apres.taches.r1.status === "cancelled" && apres.taches.r1.error === B.MESSAGE_ARRET, "APRÈS : elle est arrêtée par la vente (« Cet exemplaire a été vendu ; cette publication est arrêtée. »)", apres.taches.r1);
    ok(apres.taches.r3.status === "pending" && apres.taches.x4.status === "published" && apres.taches.r6.status === "pending",
      "APRÈS : quantité restante, autre annonce publiée, rattachement au titre seul — intacts");
  } finally { await c.end().catch(() => {}); await base.arreter(); }
}

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
