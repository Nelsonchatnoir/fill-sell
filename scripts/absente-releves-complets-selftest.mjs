// Verrou — bloc C1 (13/11) : une annonce ABSENTE DE DEUX RELEVÉS COMPLETS ET CONCORDANTS n'est plus « en ligne », et l'app
// ne propose plus « Remonter / Republier » quand le serveur le refusera. `npm run selftest:absente-releves-complets`.
// Cas réel (compte 7153db13, Premium) : annonce Leboncoin plus vue depuis le 05/11, constat posé le 09/11 par
// constater_absences_releve (deux relevés probants du même compte), job resté « published » ; la carte la disait
// « En ligne », « Republier » était proposé puis refusé (13/11 17:42, 17:49, 19:21 — annonce_introuvable:annonce_partie).
// Données SYNTHÉTIQUES uniquement (aucun numéro, titre ni pseudo d'un client).
//
// Rouge sur le code d'avant (etatPlateformes la compte en ligne, repubEtatPlateforme rend « ok », la carte n'a aucune
// branche), vert après. Les garde-fous (doute seul, relevé qui la revoit, veille qui la relit en ligne, autre numéro,
// relevé unique, Vinted, en vérification, vendue, deux annonces) sont verts avant ET après : ils disent ce qui ne bouge pas.
import fs from "node:fs";
import { etatPlateformes } from "../src/utils/stockFiltres.js";
import { repubEtatPlateforme, plateformesRepubliables } from "../src/utils/republication.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Le module de la règle (absent du code d'avant : chaque cas qui en dépend est alors compté rouge, sans planter).
let R = null;
try { R = await import("../src/utils/absenteDesReleves.js"); } catch { R = null; }
const sur = (f, ...a) => (R && typeof R[f] === "function" ? R[f](...a) : undefined);

// ── Fixtures ────────────────────────────────────────────────────────────────
const NUM = "1000000001";
const FIN_RUN = "2026-11-09T16:54:48.853Z";   // unavailable_since = finished_at du second relevé
const LE = "2026-11-09T16:54:48.908Z";        // absence_releves.le = now() du constat
const constat = (o = {}) => ({ premier: "run-aaaa", second: "run-bbbb", listing_id: NUM, le: LE, ...o });
const lbc = (o = {}, pf = undefined) => ({
  id: "job-lbc", inventaire_id: 1, platform: "leboncoin", action: "publish", status: "published",
  created_at: "2026-10-31T12:07:12Z", published_at: "2026-10-31T12:07:12Z",
  listing_url: `https://www.leboncoin.fr/ad/rayon/${NUM}`, platform_listing_id: NUM,
  platform_fields: pf ?? { source: "releve", sale_signal: "unavailable", unavailable_since: FIN_RUN, absence_releves: constat() },
  ...o,
});
const ebay = (o = {}) => ({ id: "job-ebay", inventaire_id: 1, platform: "ebay", action: "publish", status: "published",
  created_at: "2026-10-31T12:07:12Z", published_at: "2026-10-31T12:07:12Z", listing_url: "https://www.ebay.fr/itm/2000000002",
  platform_listing_id: "2000000002", platform_fields: { source: "releve" }, ...o });
const item = { id: 1, statut: "stock", disparu_le: null };
const OUVERTES = { multiOuverte: true, plateformesOuvertes: ["vinted", "leboncoin", "beebs", "ebay", "depop"], plateformesFermees: [] };
const enLigne = (jobs) => etatPlateformes(jobs, "fr", item).enLigne;
const absentes = (jobs) => sur("plateformesAbsentesDesReleves", jobs) ?? {};

console.log("A) Le cas réel (synthétique) : Leboncoin absente de deux relevés complets, eBay en ligne");
{
  const jobs = [lbc(), ebay()];
  const e = etatPlateformes(jobs, "fr", item);
  ok(!e.enLigne.includes("leboncoin"), "Leboncoin n'est plus « en ligne » (Stock, filtres, dates)", JSON.stringify(e.enLigne));
  ok(e.enLigne.includes("ebay"), "eBay, vue en ligne, le reste");
  ok(e.occupees.includes("leboncoin"), "Leboncoin reste OCCUPÉE : jamais un 2e dépôt (garde serveur already_published)");
  ok(Array.isArray(e.absentesDesReleves) && e.absentesDesReleves.join() === "leboncoin", "la liste « absentes des relevés » est rendue", JSON.stringify(e.absentesDesReleves));
  ok(repubEtatPlateforme(item, jobs, "leboncoin") === "ineligible", "jamais « Remonter » : le serveur refuse (annonce_partie)", repubEtatPlateforme(item, jobs, "leboncoin"));
  ok(!plateformesRepubliables(item, jobs, OUVERTES).includes("leboncoin"), "la feuille, le lot et « Remonter mes annonces » ne la proposent plus");
  const a = absentes(jobs);
  ok(a.leboncoin?.depuis === FIN_RUN && a.leboncoin?.numero === NUM && !a.ebay, "plateformesAbsentesDesReleves : { leboncoin: depuis, numéro } seulement", JSON.stringify(a));
  ok(sur("phraseAbsenteDesReleves", "leboncoin", FIN_RUN, "fr") === "Plus vue en ligne sur Leboncoin depuis le 09/11 (absente de deux relevés complets) : vendue ou retirée ?",
    "la phrase reprend le vocabulaire existant (« Plus vue en ligne… : vendue ou retirée ? »)", String(sur("phraseAbsenteDesReleves", "leboncoin", FIN_RUN, "fr")));
  ok(sur("phraseAbsenteDesReleves", "leboncoin", FIN_RUN, "en") === "No longer seen online on Leboncoin since 09/11 (missing from two complete syncs): sold or removed?", "… et en anglais");
}

console.log("\nB) Garde-fous : rien ne change sans deux relevés complets ET concordants");
{
  // 1. Le doute seul (la veille a lu la page « indisponible ») ne conclut jamais rien.
  const doute = [lbc({}, { sale_signal: "unavailable", unavailable_since: FIN_RUN })];
  ok(enLigne(doute).includes("leboncoin") && repubEtatPlateforme(item, doute, "leboncoin") === "ok", "doute seul (sans constat) : en ligne, republiable — comme avant");
  // 2. Constat d'un SEUL relevé, ou deux fois le même relevé : rien.
  for (const [nom, c] of [["un seul relevé", constat({ second: "" })], ["date du constat illisible", constat({ le: "?" })]]) {
    const j = [lbc({}, { sale_signal: "unavailable", unavailable_since: FIN_RUN, absence_releves: c })];
    ok(enLigne(j).includes("leboncoin") && repubEtatPlateforme(item, j, "leboncoin") === "ok", `${nom} : en ligne, republiable`);
  }
  //    Le même relevé deux fois (jamais écrit par constater_absences_releve : precedent ≠ r) : jamais « hors ligne » ; le
  //    serveur, lui, ne vérifie pas que les deux diffèrent — l'app reflète son refus plutôt que de proposer un geste refusé.
  const meme = [lbc({}, { sale_signal: "unavailable", unavailable_since: FIN_RUN, absence_releves: constat({ second: "run-aaaa" }) })];
  ok(enLigne(meme).includes("leboncoin") && !absentes(meme).leboncoin, "le même relevé deux fois : jamais « hors ligne »");
  ok(repubEtatPlateforme(item, meme, "leboncoin") === "ineligible", "… et le geste suit le serveur (refus)");
  // 3. Constat d'une AUTRE annonce (recopié d'une ancienne) : rien sur celle-ci.
  const autre = [lbc({}, { sale_signal: "unavailable", unavailable_since: FIN_RUN, absence_releves: constat({ listing_id: "1000000999" }) })];
  ok(enLigne(autre).includes("leboncoin") && repubEtatPlateforme(item, autre, "leboncoin") === "ok", "constat d'un autre numéro : en ligne, republiable");
  // 4. Un relevé l'a REVUE en ligne depuis (alerte_lever_revues_plateformes : unavailable_since effacé, marque posée).
  const revue = [lbc({}, { absence_releves: constat(), revue_en_ligne_par_releve: { at: "2026-11-10T08:00:00Z", par: "alerte_lever_revues_plateformes" } })];
  ok(enLigne(revue).includes("leboncoin") && repubEtatPlateforme(item, revue, "leboncoin") === "ok", "revue par un relevé après le constat : en ligne, republiable (le serveur aussi)");
  // 5. La veille a relu la page EN LIGNE après le constat (unavailable_since effacé, vu_en_ligne_le) : discordance.
  //    Affichage : jamais « hors ligne » sur des sources discordantes. Republication : le serveur la refuse encore (il ne
  //    lit que les relevés) — l'app ne la propose donc pas (aucun geste refusé).
  const veille = [lbc({ vu_en_ligne_le: "2026-11-10T13:29:30Z" }, { absence_releves: constat() })];
  ok(enLigne(veille).includes("leboncoin"), "veille qui la relit en ligne après le constat : JAMAIS dite hors ligne (discordance)");
  ok(!absentes(veille).leboncoin, "… et pas dans la liste des absentes");
  ok(repubEtatPlateforme(item, veille, "leboncoin") === "ineligible", "… mais « Remonter » n'est pas proposé tant que le serveur le refuse (constat non démenti par un relevé)");
  // 6. L'alerte effacée puis reposée par la veille plus tard (unavailable_since bien après le constat) : pas concordant.
  const repose = [lbc({}, { sale_signal: "unavailable", unavailable_since: "2026-11-11T09:00:00Z", absence_releves: constat() })];
  ok(enLigne(repose).includes("leboncoin") && !absentes(repose).leboncoin, "alerte reposée après coup par la veille : pas « hors ligne »");
  // 7. Écart d'horloge du poste (finished_at après now() du constat, ≤ 61 s mesurés le 13/11) : toujours concordant.
  const ecart = [lbc({}, { sale_signal: "unavailable", unavailable_since: "2026-11-09T16:55:48Z", absence_releves: constat() })];
  ok(!enLigne(ecart).includes("leboncoin") && absentes(ecart).leboncoin, "écart d'horloge d'une minute : absente quand même");
  // 8. Preuve de vente (« Vendue sur Leboncoin ») : son état à elle, pas cette règle.
  const vendue = [lbc({}, { sale_signal: "sold", unavailable_since: FIN_RUN, absence_releves: constat() })];
  ok(!absentes(vendue).leboncoin, "sale_signal « sold » : jamais rangée ici (la question « Vendue sur X » a son état)");
  // 9. En vérification (pas_encore_visible) : la règle « X vérifie ton annonce » garde la main.
  const verif = [lbc({}, { pas_encore_visible: { regle: "test" }, sale_signal: "unavailable", unavailable_since: FIN_RUN, absence_releves: constat() })];
  const ev = etatPlateformes(verif, "fr", item);
  ok(!absentes(verif).leboncoin && ev.enVerification.includes("leboncoin") && !ev.enLigne.includes("leboncoin"), "en vérification : dite « vérifie ton annonce », pas « plus vue »");
  // 10. Deux annonces Leboncoin sur la fiche (republiée : la nouvelle est en ligne) : la plateforme reste en ligne.
  const neuve = lbc({ id: "job-lbc-2", action: "republish", platform_listing_id: "1000000002", listing_url: "https://www.leboncoin.fr/ad/rayon/1000000002",
    created_at: "2026-11-10T10:00:00Z", published_at: "2026-11-10T10:05:00Z" }, { source: "republication" });
  const deux = [lbc(), neuve];
  ok(enLigne(deux).includes("leboncoin") && !absentes(deux).leboncoin, "deux annonces, la plus récente en ligne : Leboncoin reste en ligne");
  ok(repubEtatPlateforme(item, deux, "leboncoin") === "ok", "… et republiable (le serveur republie la plus récente)");
  //     L'inverse : la plus récente est l'absente → le serveur refuse ; l'ancienne, jamais jugée, garde l'affichage.
  const ancienneEnLigne = lbc({ id: "job-lbc-0", platform_listing_id: "1000000000", listing_url: "https://www.leboncoin.fr/ad/rayon/1000000000",
    created_at: "2026-10-01T10:00:00Z", published_at: "2026-10-01T10:05:00Z" }, { source: "releve" });
  const inverse = [ancienneEnLigne, lbc()];
  ok(enLigne(inverse).includes("leboncoin"), "deux annonces, une seule absente : jamais « hors ligne » pour la plateforme");
  ok(repubEtatPlateforme(item, inverse, "leboncoin") === "ineligible", "… mais la plus récente (celle que le serveur republierait) est refusée : pas de « Remonter »");
  // 11. Une republication en vol : l'affichage appartient à la republication.
  const enVol = [lbc(), { id: "rep", inventaire_id: 1, platform: "leboncoin", action: "republish", status: "pending", created_at: "2026-11-13T10:00:00Z", platform_fields: { republish_step: "a_capturer" } }];
  ok(!absentes(enVol).leboncoin && repubEtatPlateforme(item, enVol, "leboncoin") === "vivant", "republication en vol : ni « plus vue », ni nouvelle republication");
  // 12. Vinted : sa règle est celle de l'article (disparu_le du relevé du dressing) — jamais celle-ci.
  const vinted = [lbc({ id: "v", platform: "vinted", listing_url: `https://www.vinted.fr/items/${NUM}` })];
  ok(!absentes(vinted).vinted, "Vinted : jamais par cette règle (inventaire.disparu_le)");
  // 13. Depop et eBay : même constat serveur, même règle.
  const depop = [lbc({ id: "d", platform: "depop", listing_url: `https://www.depop.com/products/x-${NUM}/` })];
  ok(!enLigne(depop).includes("depop") && repubEtatPlateforme(item, depop, "depop") === "ineligible", "Depop : même règle");
  const ebayAbs = [lbc({ id: "e", platform: "ebay", listing_url: `https://www.ebay.fr/itm/${NUM}` })];
  ok(!enLigne(ebayAbs).includes("ebay") && absentes(ebayAbs).ebay, "eBay : même règle (affichage ; eBay n'est jamais republiée)");
  // 14. Une publication déjà en route sur la plateforme : on ne conclut rien.
  const pubEnRoute = [lbc(), { id: "p2", inventaire_id: 1, platform: "leboncoin", action: "publish", status: "pending", created_at: "2026-11-13T10:00:00Z", platform_fields: {} }];
  ok(!absentes(pubEnRoute).leboncoin, "dépôt en route sur Leboncoin : rien n'est conclu");
}

console.log("\nC) Le constat que l'app lit est celui des relevés complets, concordants, du même compte (garde du serveur)");
{
  const m = lire("supabase/migrations/20261108190000_compte_plateforme_releve.sql");
  const i = m.search(/CREATE OR REPLACE FUNCTION public\.constater_absences_releve/i);
  const corps = i >= 0 ? m.slice(i) : "";
  ok(/IF NOT releve_preuve_absence\(p_run\) THEN RETURN/.test(corps), "le relevé qui conclut est probant (releve_preuve_absence)");
  ok(/AND releve_preuve_absence\(s\.id\)/.test(corps) && /s\.finished_at<=r\.started_at/.test(corps), "… le précédent aussi, distinct et sans recouvrement");
  ok(/s\.compte_plateforme = v_compte/.test(corps) && /ap\.compte_plateforme = v_compte/.test(corps), "jamais un relevé ni une annonce d'un AUTRE compte de la plateforme");
  ok(/r\.platform='beebs' THEN RETURN jsonb_build_object\('disparues',0,'motif','moderation_beebs'\)/.test(corps), "Beebs : jamais de constat par relevé (modération)");
  ok(/'absence_releves',jsonb_build_object\('premier',precedent\.id,'second',r\.id,'listing_id',a\.listing_id,'le',now\(\)\)/.test(corps), "le constat écrit premier, second, numéro, date — ce que lit l'app");
  const p = lire("supabase/migrations/20260928104620_point_a_absences_releve_prouvees.sql");
  ok(/r\.status<>'done'/.test(p) && /\[incomplet\]%/.test(p) && /r\.items_vus<r\.total_entries/.test(p), "un relevé probant est fini, complet (lus ≥ annoncés), jamais « incomplet »");
}

console.log("\nD) Le Stock câblé sur la règle (carte, pastille, logos)");
{
  const st = lire("src/tabs/StockTab.jsx");
  ok(/import \{ plateformesAbsentesDesReleves, phraseAbsenteDesReleves \} from "\.\.\/utils\/absenteDesReleves\.js";/.test(st), "StockTab importe la règle unique");
  ok(/const absentesReleves=plateformesAbsentesDesReleves\(jobsAll\);/.test(st), "la carte lit les absentes sur les jobs de l'article");
  ok(/const pasAchetable=p=>enVerification\.includes\(p\)\|\|p==="opla"\|\|!!absentesReleves\[p\];/.test(st), "une absente ne rend jamais la pastille verte ni le compteur « En ligne (n/N) »");
  ok(/genre: 'hors_ligne', date: dateCourte\(a\.depuis, lang\)/.test(st) && /plusEnLigne\.ouvrirQuestion\(a\.job\.id\);setGesteOuvert\('plus_en_ligne'\)/.test(st),
    "pastille « Hors ligne · date » (vocabulaire existant) ; un appui ouvre LA question « Annonce plus en ligne — Vendue ? »");
  ok(/cle: `absente-releves-\$\{p\}`/.test(st), "en ligne ailleurs : une ligne « Plus vue en ligne sur X… » sous la carte");
  ok(/plusVue: !!d\.absentesReleves\?\.\[p\]/.test(st), "le logo de la plateforme absente est atténué");
  const carte = lire("src/stock/Carte.jsx");
  ok(/Plus vue en ligne sur/.test(carte) && /!etats\[p\]\?\.plusVue/.test(carte), "les logos ne disent plus « En ligne sur X » pour une absente");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — absente de deux relevés complets : plus jamais « en ligne », plus jamais « Remonter » refusé`);
process.exit(ko ? 1 : 0);
