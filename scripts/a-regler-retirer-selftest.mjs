// ═══════════════════════════════════════════════════════════════════════════
// « À RÉGLER » : RETIRER UNE LIGNE DE LA LISTE — ELLE NE REVIENT QUE SUR UN FAIT NOUVEAU (07/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 07/11 : la personne retire ELLE-MÊME toute ligne « À régler », quels que soient la plateforme et le motif,
// sans toucher à l'article ni à ses autres plateformes ; la ligne ne revient que sur un fait nouveau (nouvel échec
// sur une nouvelle tentative, autre numéro, autre erreur) et se ferme seule quand sa cause disparaît.
// Cas : compte d'Ornella (f8aa02a5), tâche Beebs 68427585 (publish, failed, numéro 34232802, refus à la
// vérification) — la fenêtre n'offrait que « Change d'abord… » (désactivé) et « Fermer » ; l'abandon la refuse.
// Sans réseau. Prouve :
//   1. ligne d'une TÂCHE : retirer → la ligne disparaît ; même état → reste retirée ; autre erreur, autre numéro,
//      autre statut, une relance de plus → revient ; tâche plus récente → revient ; relance → clé supprimée ;
//      marque recopiée sur une autre tâche → ne vaut rien ; la pastille de l'onglet (App) suit ;
//   2. ligne qui n'est PAS une tâche : signature identique → retirée ; élément nouveau ou statut changé → revient ;
//      élément réglé → reste retirée ; grand ensemble borné par une date ; purge 90 jours et 200 lignes ;
//   3. fermeture seule : fiche hors du stock ; fiche jumelle d'un compte relié déjà en ligne ; ⛔ l'annonce plus
//      ancienne de la MÊME fiche n'éteint rien (cas « A? » laissé à Nico) ;
//   4. le câblage (StockTab, EcranARegler) : gestes, relectures, gardes, aucune écriture hors de la RPC.
//
//   node --import ./scripts/loader-ext.mjs scripts/a-regler-retirer-selftest.mjs
import fs from "node:fs";
import {
  CLE_RETRAIT_TACHE, CLE_REGLAGE_RETRAITS, RETRAITS_LIGNES_MAX, ELEMENTS_MAX, retraitTachePossible,
  marqueRetraitTache, champsApresRetraitTache, sansRetraitTache, tacheRetireeDeARegler, elementJob, signatureLigne,
  ligneRetiree, aUneEntree, patchRetraitLigne, patchRemettreLignes, cleLigneValide, empreinteTexte,
  phraseRetraitLigne, phraseRetraitTache,
} from "../src/utils/retraitARegler.js";
import {
  causeARegler, articlesARegler, indexSelonARegler, indexSansPublicationsJumelles, publicationSansObjet,
} from "../src/utils/erreursVisibles.js";
import { abandonPossible } from "../src/utils/abandonPlateforme.js";
import { indexEtatStock } from "../src/utils/stockFiltres.js";

let verts = 0;
const rouges = [];
function ok(nom, cond, detail = "") {
  if (cond) { verts++; console.log(`  ✓ ${nom}`); }
  else { rouges.push(nom); console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ""}`); }
}
const lire = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const MAINTENANT = new Date("2026-11-07T12:00:00Z");

// La tâche d'Ornella, telle que relue (formes de la base, identifiants réels raccourcis là où rien n'en dépend).
const REFUS = "Beebs a refusé ton annonce à sa vérification : elle n'est pas en ligne. La reproposer à l'identique serait refusé de même.";
const ornella = {
  id: "68427585-ce92-4e46-b8d2-e6e0e9de8d89", inventaire_id: "1792932819386", platform: "beebs", action: "publish",
  status: "failed", error: REFUS, listing_url: null, platform_listing_id: "34232802", created_at: "2026-10-28T09:00:00Z",
  platform_fields: { refus_verification_beebs: { le: "2026-10-29T10:00:00Z" }, relances_manuelles: 1, vu_en_ligne_le: null },
};
const retiree = (j, quand = MAINTENANT) => ({ ...j, platform_fields: champsApresRetraitTache(j, quand) });

console.log("\n[1] La ligne d'une TÂCHE (marque sur la tâche, platform_fields.retire_de_a_regler)");
{
  ok("précondition : la tâche d'Ornella est « À régler » (échec) et l'abandon la refuse (numéro 34232802)",
    causeARegler(ornella) === "echec" && abandonPossible(ornella).ok === false && abandonPossible(ornella).motif === "annonce_en_ligne");
  ok("le retrait, lui, est possible (tâche arrêtée, numéro compris)", retraitTachePossible(ornella).ok === true);
  ok("jamais sur un retrait, jamais sur une tâche en vol ou publiée",
    !retraitTachePossible({ ...ornella, action: "delete" }).ok && !retraitTachePossible({ ...ornella, status: "pending" }).ok
    && !retraitTachePossible({ ...ornella, status: "processing" }).ok && !retraitTachePossible({ ...ornella, status: "published" }).ok);
  const m = marqueRetraitTache(ornella, MAINTENANT);
  ok("la marque : le, par 'utilisateur', la tâche, le statut, le numéro, l'empreinte courte de l'erreur, les relances",
    m.le === "2026-11-07T12:00:00.000Z" && m.par === "utilisateur" && m.job === ornella.id && m.statut === "failed"
    && m.numero === "34232802" && m.erreur === empreinteTexte(REFUS) && /^[0-9a-z]{1,7}$/.test(m.erreur) && m.relances === 1, JSON.stringify(m));
  const pf = champsApresRetraitTache(ornella, MAINTENANT);
  ok("le platform_fields RELU est complété, jamais écrasé (refus_verification_beebs, relances gardés)",
    pf.refus_verification_beebs?.le === "2026-10-29T10:00:00Z" && pf.relances_manuelles === 1 && pf[CLE_RETRAIT_TACHE]?.job === ornella.id);
  const r = retiree(ornella);
  ok("retirer → la ligne disparaît (causeARegler null)", tacheRetireeDeARegler(r) && causeARegler(r) === null
    && causeARegler(r, { jobsDeLArticle: [r] }) === null);
  ok("rien d'autre ne bouge : statut, erreur, numéro, lien, article", r.status === "failed" && r.error === REFUS
    && r.platform_listing_id === "34232802" && r.listing_url === null && r.inventaire_id === ornella.inventaire_id);
  ok("même état relu plus tard (espaces et casse de l'erreur) → reste retirée",
    causeARegler({ ...r, error: `  ${REFUS.toUpperCase()}  ` }) === null);
  ok("autre erreur (fait nouveau) → revient", causeARegler({ ...r, error: "Beebs : connexion requise." }) === "echec");
  ok("autre numéro → revient", causeARegler({ ...r, platform_listing_id: "34299999" }) === "echec");
  ok("autre statut (needs_user) → revient", causeARegler({ ...r, status: "needs_user" }) === "completer");
  ok("une relance de plus (même d'une ancienne app qui garde la clé) → revient",
    causeARegler({ ...r, platform_fields: { ...r.platform_fields, relances_manuelles: 2 } }) === "echec");
  const nouvelle = { ...ornella, id: "nouvelle", created_at: "2026-11-08T09:00:00Z", platform_fields: {} };
  ok("une tâche plus récente sur la ligne (nouvelle tentative) → revient ; la retirée reste hors de « À régler »",
    causeARegler(nouvelle, { jobsDeLArticle: [r, nouvelle] }) === "echec" && causeARegler(r, { jobsDeLArticle: [r, nouvelle] }) === null);
  const copie = { ...nouvelle, platform_fields: { ...r.platform_fields } };
  ok("une marque recopiée sur une AUTRE tâche (copie, recréation) ne vaut rien", causeARegler(copie) === "echec");
  const relancee = { ...r, status: "pending", error: null, platform_fields: sansRetraitTache(r.platform_fields) };
  ok("relance → la clé est supprimée (sansRetraitTache), le reste gardé",
    !(CLE_RETRAIT_TACHE in relancee.platform_fields) && relancee.platform_fields.refus_verification_beebs != null);
  ok("relancée puis re-bloquée à l'identique → revient (plus de marque)",
    causeARegler({ ...relancee, status: "failed", error: REFUS }) === "echec");
  const nu = { id: "nu1", inventaire_id: 7, platform: "vinted", action: "publish", status: "needs_user", error: "Choisis la taille.",
    created_at: "2026-11-01T10:00:00Z", platform_fields: { needsUserField: { field_key: "size", field_label: "Taille" } } };
  const nuR = retiree(nu);
  ok("à compléter : même règle (retirée → null ; autre question → revient)",
    causeARegler(nu) === "completer" && causeARegler(nuR) === null && causeARegler({ ...nuR, error: "Choisis la couleur." }) === "completer");
  // La pastille de l'onglet (App) : la ligne lue n'a ni numéro ni lien (select id,…,error,created_at,platform_fields).
  const lueParApp = (j) => { const { listing_url, platform_listing_id, ...reste } = j; void listing_url; void platform_listing_id; return reste; };
  ok("la pastille de l'onglet suit (App ne lit ni le numéro ni le lien) : retirée → plus comptée",
    articlesARegler([lueParApp(nu)]).size === 1 && articlesARegler([lueParApp(nuR)]).size === 0
    && articlesARegler([lueParApp({ ...nuR, error: "Autre chose." })]).size === 1);
  const republication = { ...ornella, id: "rp", action: "republish", platform: "vinted", platform_listing_id: null,
    platform_fields: { republish_step: "deleted", deleted_at: "2026-11-01T10:00:00Z" } };
  ok("une republication arrêtée après le retrait se retire de même (rien n'est recréé ni annulé)",
    causeARegler(republication) === "echec" && causeARegler(retiree(republication)) === null);
  ok("la carte et le filtre suivent (indexSelonARegler) : l'échec retiré ne compte plus",
    (() => {
      const item = { id: "1792932819386", statut: "stock" };
      const avant = indexSelonARegler(indexEtatStock([item], { [item.id]: [ornella] }, "fr"), { [item.id]: [ornella] });
      const apres = indexSelonARegler(indexEtatStock([item], { [item.id]: [r] }, "fr"), { [item.id]: [r] });
      return avant.get(item.id).enEchec.length === 1 && apres.get(item.id).enEchec.length === 0;
    })());
  ok("la phrase dit ce que le geste ne fait pas (FR et EN)",
    /Rien n'est supprimé ni annulé/.test(phraseRetraitTache("Beebs", "fr", { numero: true })) && /rien n'est retiré chez Beebs/.test(phraseRetraitTache("Beebs", "fr", { numero: true }))
    && /autres plateformes ne bougent pas/.test(phraseRetraitTache("Beebs", "fr")) && /Nothing is deleted or cancelled/.test(phraseRetraitTache("Beebs", "en")));
}

console.log("\n[2] Les lignes qui ne sont PAS une tâche (platform_settings.a_regler_retires, signature)");
{
  const j1 = { id: "d1", status: "needs_user", created_at: "2026-11-01T10:00:00Z" };
  const j2 = { id: "d2", status: "needs_user", created_at: "2026-11-02T10:00:00Z" };
  const elements = [elementJob(j1, "vinted", "connexion"), elementJob(j2, "beebs", "a_retirer")];
  const p = patchRetraitLigne(null, "vendu:42", elements, MAINTENANT);
  ok("le patch vise platform_settings.a_regler_retires par la RPC (chemin, patch, supprimer)",
    p.chemin.length === 1 && p.chemin[0] === CLE_REGLAGE_RETRAITS && Object.keys(p.patch).join() === "vendu:42" && Array.isArray(p.supprimer) && p.supprimer.length === 0);
  const reglage = { ...p.patch };
  ok("signature identique → retirée", aUneEntree(reglage, "vendu:42", MAINTENANT) && ligneRetiree(reglage, "vendu:42", elements, MAINTENANT));
  ok("élément nouveau (une autre tâche) → revient",
    !ligneRetiree(reglage, "vendu:42", [...elements, elementJob({ id: "d3", status: "needs_user", created_at: "2026-11-05T10:00:00Z" }, "ebay", "connexion")], MAINTENANT));
  ok("statut changé (le retrait passe en échec) → revient",
    !ligneRetiree(reglage, "vendu:42", [elementJob({ ...j1, status: "failed" }, "vinted", "connexion"), elements[1]], MAINTENANT));
  ok("un élément réglé (le retrait est fait) → reste retirée", ligneRetiree(reglage, "vendu:42", [elements[1]], MAINTENANT));
  ok("une autre ligne n'est pas touchée", !ligneRetiree(reglage, "vendu:43", elements, MAINTENANT) && !aUneEntree(reglage, "retraits", MAINTENANT));
  ok("une ligne vide ne se retire pas (rien à écrire)", patchRetraitLigne(null, "prix", [], MAINTENANT) === null);
  ok("une clé avec virgule n'est jamais écrite (la RPC la refuserait à la purge)", patchRetraitLigne(null, "a,b", ["x"], MAINTENANT) === null && !cleLigneValide("a,b") && cleLigneValide("non_surveillee:vinted"));
  // Grand ensemble (prix d'achat d'un gros stock) : les plus anciens couverts par une date.
  const vieux = Array.from({ length: 1000 }, (_, i) => ({ cle: `i:${i}`, ts: Date.parse("2026-01-01T00:00:00Z") + i * 3600_000 }));
  const sig = signatureLigne(vieux);
  ok(`au-delà de ${ELEMENTS_MAX} éléments : ${ELEMENTS_MAX} empreintes (6 caractères) et une date « avant »`,
    sig.n === 1000 && sig.e.length === ELEMENTS_MAX * 6 && typeof sig.avant === "string", `${sig.e.length} ${sig.avant}`);
  const grand = patchRetraitLigne(null, "prix", vieux, MAINTENANT).patch;
  ok("grand ensemble : même état → retirée ; des prix complétés → reste retirée", ligneRetiree(grand, "prix", vieux, MAINTENANT) && ligneRetiree(grand, "prix", vieux.slice(0, 400), MAINTENANT));
  ok("grand ensemble : un article sans prix NOUVEAU (daté d'aujourd'hui) → revient ; sans date → revient aussi",
    !ligneRetiree(grand, "prix", [...vieux, { cle: "i:neuf", ts: MAINTENANT.getTime() }], MAINTENANT) && !ligneRetiree(grand, "prix", [...vieux, "i:sans-date"], MAINTENANT));
  ok("taille bornée : une ligne de 1 000 éléments pèse moins de 2 Ko", JSON.stringify(grand).length < 2048, String(JSON.stringify(grand).length));
  // Purge : plus de 90 jours, et 200 lignes au plus (la nouvelle comprise).
  const vieilles = {};
  for (let i = 0; i < 250; i += 1) vieilles[`vendu:${i}`] = { le: new Date(MAINTENANT.getTime() - i * 3600_000).toISOString(), n: 1, e: "000000", h: "x" };
  vieilles["vendu:tres-vieux"] = { le: "2026-07-01T00:00:00Z", n: 1, e: "000000", h: "x" };
  const pp = patchRetraitLigne(vieilles, "retraits", ["a"], MAINTENANT);
  ok(`purge : la plus de 90 jours part, et au-delà des ${RETRAITS_LIGNES_MAX} plus récentes (la nouvelle comprise)`,
    pp.supprimer.includes("vendu:tres-vieux") && pp.supprimer.length === 1 + (250 - (RETRAITS_LIGNES_MAX - 1))
    && !pp.supprimer.includes("vendu:0") && pp.supprimer.includes("vendu:249"), `${pp.supprimer.length}`);
  ok("une entrée de plus de 90 jours ne vaut plus rien, même avant la purge",
    !ligneRetiree({ x: { le: "2026-07-01T00:00:00Z", ...signatureLigne(["a"]) } }, "x", ["a"], MAINTENANT)
    && ligneRetiree({ x: { le: "2026-10-01T00:00:00Z", ...signatureLigne(["a"]) } }, "x", ["a"], MAINTENANT));
  ok("remettre des lignes : leurs clés seules, supprimées par la RPC", (() => {
    const r = patchRemettreLignes(["prix", "vendu:42", "a,b"]);
    return r.patch === null && r.supprimer.join() === "prix,vendu:42" && patchRemettreLignes([]) === null;
  })());
  ok("les phrases : article vendu (les retraits continuent ; l'accord attendu = risque dit), boutique non surveillée",
    /retraits déjà demandés continuent/.test(phraseRetraitLigne("vendus", "fr")) && /risque de double vente/.test(phraseRetraitLigne("vendus", "fr", { aRetirer: true }))
    && !/risque/.test(phraseRetraitLigne("vendus", "fr")) && /non surveillée/.test(phraseRetraitLigne("non_surveillee", "fr"))
    && /Rien n'est supprimé ni annulé/.test(phraseRetraitLigne("prix", "fr")) && /Nothing is deleted/.test(phraseRetraitLigne("prix", "en")));
}

console.log("\n[3] Fermeture seule (cause disparue)");
{
  const echecLbc = { id: "f1", inventaire_id: "A", platform: "leboncoin", action: "publish", status: "failed", error: "Leboncoin a refusé l'annonce.", created_at: "2026-11-01T10:00:00Z", platform_fields: {} };
  ok("la fiche jumelle d'un compte relié est déjà en ligne sur cette plateforme → la publication n'a plus d'objet",
    publicationSansObjet(echecLbc, ["leboncoin"]) && causeARegler(echecLbc, { jumelles: ["leboncoin"] }) === null && causeARegler(echecLbc, { jumelles: ["beebs"] }) === "echec");
  ok("jamais pour un retrait ni une republication (seule une PUBLICATION arrêtée)",
    !publicationSansObjet({ ...echecLbc, action: "delete" }, ["leboncoin"]) && !publicationSansObjet({ ...echecLbc, action: "republish" }, ["leboncoin"]));
  const fiche = { id: "A", statut: "stock", copies_jumelles: [{ platform: "leboncoin", listing_id: "9", url: null, statut: "active" }] };
  const idx = indexSansPublicationsJumelles(indexSelonARegler(indexEtatStock([fiche], { A: [echecLbc] }, "fr"), { A: [echecLbc] }), [fiche]);
  ok("la carte et le filtre aussi (indexSansPublicationsJumelles)", idx.get("A").enEchec.length === 0);
  const ficheSeule = { id: "A", statut: "stock" };
  const idx2 = indexSansPublicationsJumelles(indexSelonARegler(indexEtatStock([ficheSeule], { A: [echecLbc] }, "fr"), { A: [echecLbc] }), [ficheSeule]);
  ok("sans fiche jumelle : l'échec reste", idx2.get("A").enEchec.length === 1);
  const enLigne = { ...echecLbc, id: "p0", status: "published", created_at: "2026-10-01T10:00:00Z", listing_url: "https://www.leboncoin.fr/ad/x/1" };
  ok("⛔ l'annonce plus ancienne de la MÊME fiche n'éteint rien (cas « A? » laissé à Nico, c3e07ca8)",
    causeARegler(echecLbc, { jobsDeLArticle: [enLigne, echecLbc] }) === "echec");
  const st = lire("src/tabs/StockTab.jsx");
  const app = lire("src/App.jsx");
  ok("fiche vendue ou supprimée : la ligne d'une tâche exige la fiche EN STOCK (fichesParId ← stock, statut « stock »)",
    /if \(!fichesParId\.has\(String\(j\.inventaire_id\)\)\) continue;/.test(st)
    && /const fichesParId = useMemo\(\(\) => new Map\(\(stock \?\? \[\]\)\.map\(\(i\) => \[String\(i\.id\), i\]\)\), \[stock\]\);/.test(st)
    && /const stock=useMemo\(\(\)=>items\.filter\(i=>i\.statut==="stock"\),\[items\]\);/.test(app));
  ok("« À régler » applique la règle des fiches jumelles à ses lignes de tâche",
    /\.filter\(\(l\) => !publicationSansObjet\(l\.job, plateformesJumelles\(fichesParId\.get\(String\(l\.job\.inventaire_id\)\)\)\)\);/.test(st));
  ok("la carte aussi (indexSansPublicationsJumelles autour de l'index d'état)",
    /indexSansPublicationsJumelles\(indexSelonARegler\(indexEtatStock\(stockFiltre, jobsByInventaire, lang\), jobsByInventaire, \{ plateformesHorsJeu: horsJeu \}\), stockFiltre\)/.test(st));
}

console.log("\n[4] Le câblage (StockTab, EcranARegler)");
{
  const st = lire("src/tabs/StockTab.jsx");
  const ec = lire("src/stock/EcranARegler.jsx");
  const i = st.indexOf("async function retirerTacheDeARegler(job)");
  const geste = i > 0 ? st.slice(i, i + 3200) : "";
  ok("la tâche est RELUE juste avant d'écrire (statut, erreur, numéro, lien, platform_fields)",
    /\.select\('id, inventaire_id, platform, action, status, error, listing_url, platform_listing_id, platform_fields, created_at'\)/.test(geste));
  ok("l'écriture : platform_fields seul (relu + marque), garde du statut LU, .select() (0 ligne = « a changé d'état »)",
    /const pf = champsApresRetraitTache\(lu, new Date\(\)\);/.test(geste) && /\.update\(\{ platform_fields: pf \}\)/.test(geste)
    && /\.eq\('id', lu\.id\)\.eq\('user_id', user\.id\)\.eq\('status', lu\.status\)/.test(geste) && /if \(!data\?\.length\) return echec\(bouge\);/.test(geste));
  ok("rien d'autre n'est écrit sur la tâche (ni statut, ni erreur, ni lien) et rien n'est retiré",
    !/\.update\(\{[^}]*status:/.test(geste) && !/listing_url: null/.test(geste) && !/action: 'delete'/.test(geste) && !/arret_utilisateur/.test(geste));
  ok("la trace (usage_logs « retrait_a_regler ») et le patch local de la tâche", /feature: 'retrait_a_regler'/.test(geste) && /platform_fields: pf \}/.test(geste));
  const rel = st.slice(st.indexOf("async function relancerJobEchoue"), st.indexOf("async function relancerJobEchoue") + 4000);
  ok("relancerJobEchoue (même tâche remise en file) supprime la clé", /const pf = \{ \.\.\.pfFrais \};[\s\S]{0,300}delete pf\[CLE_RETRAIT_TACHE\];/.test(rel));
  ok("le mini-éditeur (répondre = relancer), la saisie d'une republication et la republication sans confirmation aussi",
    /delete newPf\[CLE_RETRAIT_TACHE\];/.test(st) && /delete pfNext\[CLE_RETRAIT_TACHE\];/.test(st) && /delete pf\[CLE_RETRAIT_TACHE\]; \/\/ \(07\/11\) la tâche repart/.test(st));
  ok("une relance par copie ne recopie pas la marque (RELANCE_COPIE_CLES_RETIREES)", /const RELANCE_COPIE_CLES_RETIREES = \[\n[^\]]*CLE_RETRAIT_TACHE,/.test(st));
  ok("la fenêtre d'échec (« Beebs — non publiée ») propose le geste, sur toute tâche de « À régler »",
    /if\(!retraitTachePossible\(failJobModal\)\.ok\)return null;/.test(st)
    && /if\(!causeARegler\(failJobModal,\{jobsDeLArticle:jobsByInventaire\[failJobModal\.inventaire_id\]\?\?null,plateformesHorsJeu:horsJeu\}\)\)return null;/.test(st)
    && /onClick=\{\(\)=>retirerTacheDeARegler\(failJobModal\)\}/.test(st) && /phraseRetraitTache\(label,lang,/.test(st));
  ok("le mini-éditeur (« à compléter ») aussi", /onRetirerDeARegler=\{retirerTacheDeARegler\}/.test(st)
    && /export function NeedsUserModal\(\{ job, lang, onClose, onDone, onAbandonner = null, onRetirerDeARegler = null \}\)/.test(st)
    && /\{onRetirerDeARegler && retraitTachePossible\(job\)\.ok && \(/.test(st));
  ok("le bouton d'origine reste (« Change d'abord le texte… » sur un refus Beebs identique)", /if\(r\.memeContenuBeebs\)return\(/.test(st));
  ok("les lignes non-tâche : un `retrait` (éléments) par sorte, et la règle appliquée aux deux listes",
    (st.match(/retrait: \(\) =>/g) ?? []).length >= 11 && /\]\.map\(avecRetraitLigne\);/.test(st) && /\}\)\)\.map\(avecRetraitLigne\);/.test(st));
  ok("ni 'attente', ni 'compte_plateforme', ni 'plus_en_ligne' ne portent de `retrait` (leur propre mémoire)",
    !/cle: 'attente'[^\n]*\n[^\n]*\n[^\n]*retrait:/.test(st) && !/onOuvrir: \(\) => setGesteOuvert\('compte_plateforme'\), retrait/.test(st) && !/setGesteOuvert\('plus_en_ligne'\), retrait/.test(st));
  ok("platform_settings ne s'écrit que par la RPC (fusionnerReglages) et se relit dans la relecture bornée existante",
    /const \{ data, error \} = await fusionnerReglages\(p\.chemin, p\.patch, p\.supprimer\);/.test(st)
    && /setRetraitsLignes\(data\?\.platform_settings\?\.\[CLE_REGLAGE_RETRAITS\] \?\? null\);/.test(st)
    && !/\.update\(\{ ?platform_settings/.test(st));
  ok("la tuile compte les lignes MONTRÉES ; les lignes retirées sont dites et se remettent d'un appui",
    /gesteARegler\.n = Math\.max\(0, nbAReglerTout - nbRetireesDeLaListe\);/.test(st) && /data-pied="retirees"/.test(st) && /remettreLignesARegler\(clesRetireesMontrables\)/.test(st));
  ok("les gardes d'avant tiennent (même écran, même ordre, même tuile)",
    /<EcranARegler lang=\{lang\} lignes=\{\[\.\.\.lignesNonSurveillees, \.\.\.lignesARegler\]\}/.test(st) && /const nbAReglerTout = nbNonSurveillees \+ nbARegler;/.test(st)
    && /plusEnLigne\?\.nMasquees>0\?\(/.test(st));
  ok("EcranARegler : « Retirer de la liste », puis la phrase et « Oui, retirer » / « Non, garder » ; jamais un bouton dans un bouton",
    /const blocRetrait = \(l\) => \{/.test(ec) && /'Retirer de la liste'/.test(ec) && /'Oui, retirer'/.test(ec) && /'Non, garder'/.test(ec)
    && /\{l\.phraseRetrait && /.test(ec) && /<div key=\{l\.cle\} data-ligne-bloc=/.test(ec) && /if \(l\.action\) \{/.test(ec) && /\{blocRetrait\(l\)\}/.test(ec));
}

console.log(`\n${rouges.length ? `✗ ${rouges.length} rouge(s) : ${rouges.join(" | ")}` : "✓ tout est vert"} — ${verts + rouges.length} contrôles`);
process.exit(rouges.length ? 1 : 0);
