// ═══════════════════════════════════════════════════════════════════════════
// APRÈS UNE SUPPRESSION GROUPÉE : LES RETRAITS, PLATEFORME PAR PLATEFORME — SELFTEST « VERROU »
// (16/11/2026 après-midi, point 5 de Nico — Marc, thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Marc a supprimé 753 articles entre 11:42 et 12:07 ; à 13:57, rien ne lui disait où en étaient ses retraits
// (Beebs « 0/138 » vu par Nico, alors que 26 étaient retirées et 3 envoyées). Ce verrou tient :
//   1. le classement d'un retrait : retirée / en vérification / en examen chez la plateforme / en file / à toi ;
//      un doublon annulé (ou un retrait annulé sans objet) n'est JAMAIS compté ;
//   2. le regroupement : la marque de lot (platform_fields.lot_suppression), sinon la fenêtre de la suppression
//      journalisée (usage_logs suppression_article), sinon tous les retraits des 72 h ; deux lots à moins de 30 min
//      = une seule suppression ;
//   3. les phrases FR + EN, une ligne par plateforme, AUCUNE durée promise (règle aucune-estimation) ;
//   4. la lecture bornée : 72 h, colonnes minimales, pages de 1 000, 5 pages au plus, journal toléré en panne ;
//   5. le câblage : la marque posée par la suppression groupée (App.jsx), le bloc « Retraits en cours » de « Ta file »
//      relu par relectureBornee (jamais setInterval), le bouton « Suivre les retraits » en fin de suppression.
// ROUGE sur le code d'avant (module absent, rien de câblé) ; VERT après.
//   node --import ./scripts/loader-ext.mjs scripts/retraits-lot-avancement-selftest.mjs
import fs from "node:fs";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const lire = (p) => { try { return fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };

let A = null;
try { A = await import("../src/utils/avancementRetraits.js"); } catch (e) { ok(false, "src/utils/avancementRetraits.js existe", String(e?.message ?? e).slice(0, 120)); }

// ── L'état de Marc à 13:57 (heure de Paris), reconstitué sur les chiffres lus en base (lecture seule) ─────────
const iso = (s) => new Date(s).toISOString();
const MAINTENANT = Date.parse("2026-11-16T12:57:33Z"); // 13:57:33 à Paris
const LOTS = [
  { lot: "f9d2d149", n: 138, de: "2026-11-16T10:42:29.510Z", a: "2026-11-16T10:45:30.832Z" },
  { lot: "fa5b7cf3", n: 328, de: "2026-11-16T10:47:30.434Z", a: "2026-11-16T10:50:37.180Z" },
  { lot: "41bdd187", n: 276, de: "2026-11-16T11:04:46.768Z", a: "2026-11-16T11:06:03.570Z" },
  { lot: "2ff69329", n: 11, de: "2026-11-16T11:07:28.433Z", a: "2026-11-16T11:07:30.499Z" },
  { lot: "b1e1887c", n: 1, de: "2026-11-16T12:02:13.405Z", a: "2026-11-16T12:02:13.405Z" },
];
const journalMarc = LOTS.flatMap(({ lot, n, de, a }) => Array.from({ length: n }, (_, k) =>
  ({ lot, created_at: iso(Date.parse(de) + (n > 1 ? Math.round((Date.parse(a) - Date.parse(de)) * k / (n - 1)) : 0)) })));
// Les retraits n'ont PAS de marque (créés avant ce correctif) : ils tombent dans les fenêtres journalisées.
let seq = 0;
const fenetres = LOTS.slice(0, 3);
const quand = () => { const f = fenetres[seq % 3]; seq++; return iso(Date.parse(f.de) + 1500 + (seq % 50) * 1000); };
const r = (platform, status, pf = {}, extra = {}) => ({ id: `j${seq}`, platform, status, created_at: quand(), error: null, platform_fields: pf, ...extra });
const fois = (n, f) => Array.from({ length: n }, f);
const retraitsMarc = [
  ...fois(26, () => r("beebs", "deleted")),
  ...fois(3, () => r("beebs", "pending", { beebs_suppression_envoyee: { le: "2026-11-16T12:24:34Z" } }, { error: "Suppression envoyée à Beebs, mais l'annonce est encore dans « Mes annonces » deux minutes après — vérification au prochain passage, rien d'autre n'est fait." })),
  ...fois(1, () => r("beebs", "pending", { beebs_en_moderation: { n: 2 } }, { error: "L'annonce n'est pas encore visible sur Beebs (Beebs l'examine encore) : FillSell la retirera dès qu'elle apparaît." })),
  ...fois(107, () => r("beebs", "pending")),
  ...fois(1, () => r("beebs", "processing")),
  ...fois(30, () => r("leboncoin", "deleted")),
  ...fois(104, () => r("leboncoin", "pending")),
  ...fois(24, () => r("depop", "deleted")),
  ...fois(44, () => r("depop", "pending", { next_action_after: "2026-11-16T13:10:00Z" })),
  ...fois(255, () => r("vinted", "deleted")),
  ...fois(29, () => r("vinted", "pending", { retenue_serveur: { garde: "origine_inconnue", motif: "boutique_origine_inconnue" } })),
  ...fois(274, () => r("ebay", "deleted")),
  ...fois(208, () => r("ebay", "cancelled", { retrait_doublon_de: "x" }, { error: "Doublon : un retrait est déjà en cours pour cette annonce." })),
  // Un retrait Beebs d'AVANT la suppression (15/11 00:47, en modération) : hors de la fenêtre, jamais dans ce lot.
  { id: "ancien", platform: "beebs", status: "pending", created_at: "2026-11-15T23:47:21Z", error: null, platform_fields: { beebs_en_moderation: { n: 3 } } },
];

if (A) {
  console.log("\n1. Le classement d'un retrait");
  const c = (status, pf = {}, platform = "beebs", error = null) => A.classerRetrait({ platform, status, created_at: iso(MAINTENANT), error, platform_fields: pf });
  ok(c("deleted") === "retirees", "deleted → retirée");
  ok(c("cancelled", { retrait_doublon_de: "x" }) === null, "doublon annulé → jamais compté");
  ok(c("cancelled") === null, "retrait annulé sans objet → jamais compté");
  ok(c("needs_user") === "a_toi" && c("failed") === "a_toi", "needs_user / failed → à toi");
  ok(c("pending", { retenue_serveur: { motif: "boutique_origine_inconnue" } }, "vinted") === "a_toi", "Vinted retenu par la garde de boutique (origine non prouvée) → à toi");
  ok(c("pending", { attente_session: { depuis: "x" } }, "leboncoin") === "a_toi", "en attente de connexion → à toi");
  ok(c("pending", { beebs_en_moderation: { n: 1 } }) === "plateforme", "Beebs l'examine encore → en examen chez la plateforme");
  ok(c("pending", { beebs_suppression_envoyee: { le: "x" } }) === "verification", "suppression envoyée, preuve attendue → en vérification");
  ok(c("pending") === "en_file" && c("processing") === "en_file", "pending sans marque / processing → en file");

  console.log("\n2. L'état de Marc à 13:57 (sans marque de lot : la fenêtre de la suppression journalisée)");
  const groupes = A.avancementRetraits({ retraits: retraitsMarc, journal: journalMarc, maintenant: MAINTENANT });
  ok(groupes.length === 1, "une seule suppression (4 lots à moins de 30 min l'un de l'autre), le lot de 13:02 sans retrait n'apparaît pas", String(groupes.length));
  const g = groupes[0] ?? {};
  ok(g.articles === 753, "753 articles dans la suppression", String(g.articles));
  const pfs = (g.plateformes ?? []).map(([p]) => p);
  ok(JSON.stringify(pfs) === JSON.stringify(["beebs", "leboncoin", "depop", "vinted", "ebay"]), "plateformes : ce qui reste à faire d'abord", pfs.join(","));
  const lignesFr = (g.plateformes ?? []).map(([p, cpt]) => A.ligneAvancementPlateforme(p, cpt, "fr"));
  const lignesEn = (g.plateformes ?? []).map(([p, cpt]) => A.ligneAvancementPlateforme(p, cpt, "en"));
  const attenduFr = [
    "Beebs : 26 retirées · 3 en vérification · 1 en examen chez Beebs · 108 en file",
    "Leboncoin : 30 retirées · 104 en file",
    "Depop : 24 retirées · 44 en file",
    "Vinted : 255 retirées · 29 à toi de jouer",
    "eBay : 274 retirées",
  ];
  const attenduEn = [
    "Beebs: 26 removed · 3 being checked · 1 under review at Beebs · 108 queued",
    "Leboncoin: 30 removed · 104 queued",
    "Depop: 24 removed · 44 queued",
    "Vinted: 255 removed · 29 need you",
    "eBay: 274 removed",
  ];
  attenduFr.forEach((l, i) => ok(lignesFr[i] === l, `FR « ${l} »`, lignesFr[i]));
  attenduEn.forEach((l, i) => ok(lignesEn[i] === l, `EN « ${l} »`, lignesEn[i]));
  ok(g.plateformes?.find(([p]) => p === "ebay")?.[1]?.total === 274, "eBay : les 208 doublons annulés ne comptent jamais (274 au total)");
  ok(g.ouverts === 112 + 104 + 44 + 29, "ouverts = 289", String(g.ouverts));
  ok(A.titreAvancementRetraits(g, "fr") === "Retraits en cours · suppression du 16/11 à 11:42 · 753 articles", "titre FR, heure de Paris", A.titreAvancementRetraits(g, "fr"));
  ok(A.titreAvancementRetraits(g, "en") === "Removals in progress · deletion of 16/11 at 11:42 · 753 items", "titre EN", A.titreAvancementRetraits(g, "en"));

  console.log("\n3. La marque de lot, la fusion à 30 min, le repli sur 72 h");
  const t0 = Date.parse("2026-11-20T09:00:00Z");
  const m = (lot, minutes, status = "pending", platform = "vinted") => ({ id: `${lot}${minutes}${status}`, platform, status, created_at: iso(t0 + minutes * 60_000), error: null, platform_fields: { lot_suppression: lot } });
  const gm = A.avancementRetraits({ retraits: [m("A", 0), m("A", 2, "deleted"), m("B", 20), m("C", 60)], journal: [], maintenant: t0 + 65 * 60_000 });
  ok(gm.length === 2, "A et B (20 min d'écart) = une suppression ; C (40 min après B) = une autre", String(gm.length));
  ok(gm[0]?.debut === t0 + 60 * 60_000, "la plus récente d'abord");
  ok(gm[1]?.total?.retirees === 1 && gm[1]?.ouverts === 2, "A+B : 1 retirée, 2 ouvertes", JSON.stringify(gm[1]?.total));
  // Un retrait marqué B, créé dans la fenêtre journalisée d'un lot voisin X : compté UNE fois, dans la même suppression.
  const gx = A.avancementRetraits({ retraits: [m("B", 1)], journal: [{ lot: "X", created_at: iso(t0) }, { lot: "X", created_at: iso(t0 + 120_000) }], maintenant: t0 + 5 * 60_000 });
  ok(gx.length === 1 && gx[0].total?.total === 1 && gx[0].articles === 2, "retrait marqué dans la fenêtre d'un lot voisin : compté une seule fois, même suppression", JSON.stringify(gx.map((x) => [x.cle, x.articles, x.total?.total])));
  // Marqué, sans journal (journal illisible) : sa suppression existe quand même.
  const gs = A.avancementRetraits({ retraits: [m("S", 0), m("S", 1, "deleted")], journal: [], maintenant: t0 + 5 * 60_000 });
  ok(gs.length === 1 && gs[0].type === "lot" && gs[0].cle === "S" && gs[0].total?.total === 2, "marque de lot sans journal : la suppression est retrouvée", JSON.stringify(gs.map((x) => [x.type, x.cle])));
  // Repli : ni marque ni journal → tous les retraits des 72 h, un seul bloc, seulement s'il en reste à faire.
  const libre = (status, minutes) => ({ id: `l${minutes}`, platform: "leboncoin", status, created_at: iso(t0 + minutes * 60_000), error: null, platform_fields: {} });
  const g72 = A.avancementRetraits({ retraits: [libre("pending", 0), libre("deleted", 300)], journal: [], maintenant: t0 + 400 * 60_000 });
  ok(g72.length === 1 && g72[0].type === "72h", "sans marque ni journal : un bloc « 3 derniers jours »", JSON.stringify(g72.map((x) => x.type)));
  ok(A.titreAvancementRetraits(g72[0] ?? {}, "fr") === "Retraits en cours · 3 derniers jours", "titre du repli", A.titreAvancementRetraits(g72[0] ?? {}, "fr"));
  ok(A.avancementRetraits({ retraits: [libre("deleted", 0)], journal: [], maintenant: t0 + 60_000 }).length === 0, "repli sans retrait ouvert : rien d'affiché");
  // Un lot fini : montré 2 h (le temps de « Suivre les retraits »), plus ensuite.
  const fini = [m("F", 0, "deleted", "ebay"), m("F", 1, "deleted", "ebay")];
  const gf = A.avancementRetraits({ retraits: fini, journal: [], maintenant: t0 + 30 * 60_000 });
  ok(gf.length === 1 && A.titreAvancementRetraits(gf[0], "fr").startsWith("Retraits terminés · suppression du"), "lot fini depuis 30 min : « Retraits terminés »", gf[0] ? A.titreAvancementRetraits(gf[0], "fr") : "");
  ok(A.avancementRetraits({ retraits: fini, journal: [], maintenant: t0 + 3 * 3600_000 }).length === 0, "lot fini depuis 3 h : plus affiché");
  ok(A.avancementRetraits({ retraits: [m("D", 0, "cancelled")], journal: [], maintenant: t0 }).length === 0, "un lot dont tout est annulé n'est jamais affiché");

  console.log("\n4. Aucune durée promise (règle aucune-estimation)");
  const textes = [...lignesFr, ...lignesEn, A.titreAvancementRetraits(g, "fr"), A.titreAvancementRetraits(g, "en"),
    A.titreAvancementRetraits(g72[0] ?? {}, "en"), A.piedAvancementRetraits("fr"), A.piedAvancementRetraits("en")];
  const promesse = /\b(vers|environ|d'ici|within|about|around)\b|\bdans (\d|quelques|plusieurs|un |une )|\d+\s*(min|minutes?|h|heures?|hours?|sec|secondes?)\b|estim|bientôt|soon/i;
  const fautifs = textes.filter((t) => promesse.test(String(t)));
  ok(fautifs.length === 0, "aucune heure, aucune durée, aucune estimation", fautifs.join(" | "));
  ok(typeof A.piedAvancementRetraits("fr") === "string" && A.piedAvancementRetraits("fr").length > 0, "une phrase de pied FR");

  console.log("\n5. La lecture bornée (72 h, colonnes minimales, pages de 1 000, 5 au plus)");
  const appels = [];
  const fauxClient = ({ parPage = () => 1000, panneJournal = false, panneRetraits = false } = {}) => ({
    from(table) {
      const q = { table, filtres: [], select: null, range: null };
      appels.push(q);
      const b = {
        select(c) { q.select = c; return b; },
        eq(k, v) { q.filtres.push(["eq", k, v]); return b; },
        gte(k, v) { q.filtres.push(["gte", k, v]); return b; },
        not(k, o, v) { q.filtres.push(["not", k, o, v]); return b; },
        order() { return b; },
        range(a, z) {
          q.range = [a, z];
          const page = Math.round(a / 1000);
          const panne = (table === "usage_logs" && panneJournal) || (table === "cross_post_jobs" && panneRetraits);
          const n = panne ? 0 : parPage(table, page);
          return Promise.resolve(panne ? { data: null, error: { message: "panne" } }
            : { data: Array.from({ length: n }, (_, k) => (table === "usage_logs" ? { lot: "L", created_at: iso(MAINTENANT - k) } : { id: `${page}-${k}`, platform: "vinted", status: "deleted", created_at: iso(MAINTENANT - k) })), error: null });
        },
      };
      return b;
    },
  });
  let lu = null;
  try { lu = await A.lireRetraitsRecents(fauxClient({ parPage: (t, p) => (t === "cross_post_jobs" ? (p === 0 ? 1000 : 10) : 3) }), "u1", MAINTENANT); } catch (e) { ok(false, "lecture sans erreur", String(e?.message ?? e)); }
  const lj = appels.filter((q) => q.table === "cross_post_jobs");
  ok(lj.length === 2 && lu?.retraits?.length === 1010, "s'arrête à la première page incomplète (2 pages, 1 010 retraits)", `${lj.length} / ${lu?.retraits?.length}`);
  const f0 = lj[0]?.filtres ?? [];
  ok(f0.some(([o, k, v]) => o === "eq" && k === "user_id" && v === "u1") && f0.some(([o, k, v]) => o === "eq" && k === "action" && v === "delete"), "ses retraits seulement (user_id, action = delete)");
  ok(f0.some(([o, k, v]) => o === "gte" && k === "created_at" && v === iso(MAINTENANT - 72 * 3600_000)), "72 h exactement");
  ok(lj[0]?.range?.[0] === 0 && lj[0]?.range?.[1] === 999 && lj[1]?.range?.[0] === 1000, "pages de 1 000 (range)");
  const cols = String(lj[0]?.select ?? "");
  ok(cols && !/\*/.test(cols) && !/(^|,\s*)platform_fields\s*(,|$)/.test(cols) && !/photos|description|title|listing_url/.test(cols),
    "colonnes minimales : jamais *, jamais platform_fields entier, ni photos, texte, titre, lien", cols.slice(0, 120));
  ok(/lot_suppression/.test(cols) && /retrait_doublon_de/.test(cols) && /beebs_suppression_envoyee/.test(cols), "les seules clés lues : lot, doublon, envoi Beebs…");
  const lu2 = appels.filter((q) => q.table === "usage_logs");
  ok(lu2.length >= 1 && (lu2[0]?.filtres ?? []).some(([o, k, v]) => o === "eq" && k === "feature" && v === "suppression_article")
    && (lu2[0]?.filtres ?? []).some(([o, k]) => o === "not" && /lot/.test(k)), "journal : suppression_article avec un lot, 72 h");
  appels.length = 0;
  let lu5 = null;
  try { lu5 = await A.lireRetraitsRecents(fauxClient({ parPage: () => 1000 }), "u1", MAINTENANT); } catch { /* vérifié plus bas */ }
  ok(appels.filter((q) => q.table === "cross_post_jobs").length === 5 && lu5?.partiel === true, "5 pages au plus, et la lecture se dit partielle", String(appels.filter((q) => q.table === "cross_post_jobs").length));
  let lu6 = null;
  try { lu6 = await A.lireRetraitsRecents(fauxClient({ parPage: () => 2, panneJournal: true }), "u1", MAINTENANT); } catch { /* */ }
  ok(lu6?.retraits?.length === 2 && Array.isArray(lu6?.journal) && lu6.journal.length === 0, "journal en panne : les retraits restent lus (repli 72 h)");
  let jete = false;
  try { await A.lireRetraitsRecents(fauxClient({ panneRetraits: true }), "u1", MAINTENANT); } catch { jete = true; }
  ok(jete, "retraits illisibles : la lecture échoue (la relecture bornée double son attente)");
}

console.log("\n6. Le câblage");
const app = lire("src/App.jsx");
const corps = (app.match(/async function executerSuppression\(item,plan,\{alsoDeleteSale=false,lot=null\}=\{\}\)\{[\s\S]*?\n {2}\}\n/) ?? [""])[0];
ok(/platform_fields:lot\?\{lot_suppression:String\(lot\)\}:\{\}/.test(corps), "App.jsx executerSuppression : la marque de lot sur chaque retrait armé par la suppression groupée (rien pour un article seul)");
ok((app.match(/lot_suppression/g) ?? []).length === 1, "App.jsx : la marque n'est posée qu'à cet endroit");
const file = lire("src/components/FileDesJobs.jsx");
ok(/from "\.\.\/utils\/avancementRetraits"/.test(file) && /<AvancementRetraits\b/.test(file), "« Ta file » : bloc « Retraits en cours » (AvancementRetraits)");
const hook = (file.match(/function useAvancementRetraits\([\s\S]*?\n\}\n/) ?? [""])[0];
ok(hook && /demarrerRelecture\(/.test(hook) && !/setInterval\(/.test(hook) && /arreter\(\)/.test(hook), "« Ta file » : relu par demarrerRelecture (relectureBornee), jamais setInterval, arrêté à la fermeture");
const sl = lire("src/stock/SuppressionLot.jsx");
ok(/data-suivre-retraits/.test(sl) && /onSuivreRetraits\(\)/.test(sl) && /phase === 'fin' && onSuivreRetraits/.test(sl), "SuppressionLot : « Suivre les retraits » à la fin, quand des retraits sont partis");
const stock = lire("src/tabs/StockTab.jsx");
ok(/<SuppressionLot[\s\S]{0,400}onSuivreRetraits=\{\(\)=>\{setSuppressionLotIds\(null\);setFileOuverte\(true\);\}\}/.test(stock), "Stock : « Suivre les retraits » ferme la suppression et ouvre « Ta file »");

console.log(`\n${echecs ? `✗ ${echecs} échec(s)` : "✓ retraits d'une suppression groupée : avancement par plateforme, lecture bornée, câblage"}`);
process.exit(echecs ? 1 : 0);
