// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR LU EN ARRIÈRE-PLAN, DÈS L'IMPORT (25/10) — `npm run selftest:lecture-fond`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ : supabase/functions/_shared/lecture-fond.js (qui lit, quoi, à quel rythme — servi par
// get-pending-jobs dans `lecture_fond`), le pont de la page (src/utils/vintedSync.js : sonde de 1,5 s, état du pont)
// et la lecture du stepper et du lot (src/publication/texteDuVendeur.js : pont mort dit en 1,5 s au lieu de 12 ou
// 25 s d'attente, page publique d'abord avec une extension ≥ 0.6.144), puis vérifie le branchement serveur.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Une fausse page pour le pont (le module l'écoute dès son chargement).
const ecouteurs = new Set();
let reponseAuPing = null;   // null : personne ne répond (pont mort) ; sinon la version annoncée
// (28/10) Une extension OCCUPÉE (sa lecture attend la fin d'un dépôt, sous le verrou) : la page publique répond après
// `retardPublique` ms ; `commandes` garde ce que la page a demandé.
let retardPublique = 0;
const commandes = [];
globalThis.window = {
  location: { origin: "https://fillsell.app" },
  addEventListener: (t, f) => { if (t === "message") ecouteurs.add(f); },
  removeEventListener: (t, f) => { if (t === "message") ecouteurs.delete(f); },
  postMessage: (data) => {
    if (data?.__fillsellCmd) commandes.push(data.__fillsellCmd);
    setTimeout(() => {
      for (const f of [...ecouteurs]) f({ source: globalThis.window, data });
      if (data?.__fillsellPing && reponseAuPing) globalThis.window.postMessage({ __fillsellExt: true, version: reponseAuPing });
      if (data?.__fillsellCmd === "FETCH_VINTED_PUBLIC" && reponseAuPing) {
        const repondre = () => globalThis.window.postMessage({ __fillsellAnnoncePublique: { vintedItemId: data.vintedItemId, success: true, ok: true, description: "Texte lu sur la page", couleur: "Noir", catalog_id: 3313 } });
        if (retardPublique > 0) setTimeout(repondre, retardPublique); else repondre();
      }
    }, 0);
  },
};

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lf = await import("../supabase/functions/_shared/lecture-fond.js");
const vs = await import("../src/utils/vintedSync.js");
const tv = await import("../src/publication/texteDuVendeur.js");

let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Qui lit, et à quel rythme (_shared/lecture-fond.js)");
{
  const NICO = lf.LECTURE_FOND_PILOTES[0];
  const AUTRE = "00000000-0000-0000-0000-000000000001";
  const base = { versionOk: true, luesAujourdhui: 0, dernierRefusMs: null, maintenant: Date.parse("2026-10-25T13:00:00Z") };
  ok(lf.modeLectureFond(undefined) === lf.LECTURE_FOND_MODE_DEFAUT && lf.modeLectureFond("x") === lf.LECTURE_FOND_MODE_DEFAUT, "sans réglage : le mode par défaut");
  ok(lf.modeLectureFond(0) === 0 && lf.modeLectureFond(3) === 3 && lf.modeLectureFond(7) === lf.LECTURE_FOND_MODE_DEFAUT, "réglage lu de 0 à 3, rien d'autre");
  const p1 = lf.regleLectureFond({ ...base, userId: NICO, mode: 1 });
  ok(p1.actif && p1.mode === "mesure" && p1.par_cycle === 3 && p1.ecart_s.join("-") === "20-45", "mode 1 : le poste pilote MESURE (3 pages par poll, 20 à 45 s entre deux)", JSON.stringify(p1));
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 1, payant: true }).actif === false, "mode 1 : personne d'autre");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 2, payant: true }).mode === "rattrapage", "mode 2 : les comptes payants rattrapent");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 2, payant: false }).actif === false, "mode 2 : pas encore les gratuits");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3 }).actif === true, "mode 3 : tous");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 0 }).raison === "coupe", "mode 0 : coupé pour tous");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, versionOk: false }).raison === "extension_trop_ancienne", "extension < 0.6.144 : rien servi");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, pauseAntirobot: true }).raison === "pause_antirobot", "pause anti-robot du compte : rien");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, dernierRefusMs: base.maintenant - 5 * 3600_000 }).raison === "refus_recent", "un refus de Vinted il y a 5 h : coupé");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, dernierRefusMs: base.maintenant - 7 * 3600_000 }).actif === true, "7 h après : rouvert");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, luesAujourdhui: 300 }).raison === "plafond_du_jour", "300 pages dans la journée : plafond");
  ok(lf.regleLectureFond({ ...base, userId: AUTRE, mode: 3, luesAujourdhui: 299 }).par_cycle === 1, "le plafond est tenu à la page près");
}

console.log("2. Quoi lire");
{
  const t = Date.parse("2026-10-25T13:00:00Z");
  const f = (o) => ({ id: 1, vinted_item_id: "10499143345", description: "", vinted_catalog_id: null, couleur: null, created_at: "2026-10-24T12:21:00Z", ...o });
  ok(lf.aLireEnFond(f({}), t), "importée sans texte : à lire");
  ok(!lf.aLireEnFond(f({ description: "x", vinted_catalog_id: 3313, couleur: { v: "Noir" } }), t), "texte, rayon et couleur : rien à lire");
  ok(lf.aLireEnFond(f({ description: "x", vinted_catalog_id: 3313 }), t), "sans couleur : à lire");
  ok(!lf.aLireEnFond(f({ page_publique_lue: { at: "2026-10-20T00:00:00Z" } }), t), "lue il y a 5 jours : pas relue (30 jours)");
  ok(lf.aLireEnFond(f({ page_publique_lue: { at: "2026-09-20T00:00:00Z" } }), t), "lue il y a 35 jours : relue");
  ok(!lf.aLireEnFond(f({ page_publique_lue: { at: "2026-10-22T00:00:00Z", echec: "introuvable" } }), t), "échec il y a 3 jours : pas relue (7 jours)");
  ok(!lf.aLireEnFond(f({ vinted_item_id: null }), t), "sans annonce Vinted : rien");
  const lignes = [f({ id: 1, created_at: "2026-10-01T00:00:00Z" }), f({ id: 2, created_at: "2026-10-24T00:00:00Z" }), f({ id: 3, created_at: "2026-10-20T00:00:00Z" })];
  const l = lf.listeLectureFond(lignes, { actif: true, mode: "rattrapage", par_cycle: 2 }, t);
  ok(l.map((x) => x.inventaire_id).join(",") === "2,3", "les plus récemment importées d'abord, 2 par poll", JSON.stringify(l));
  const completes = [1, 2, 3].map((id) => f({ id, description: "x", vinted_catalog_id: 1, couleur: { v: "Noir" }, created_at: `2026-10-2${id}T00:00:00Z` }));
  const m1 = lf.listeLectureFond(completes, { actif: true, mode: "mesure", par_cycle: 2 }, t);
  const m2 = lf.listeLectureFond(completes, { actif: true, mode: "mesure", par_cycle: 2 }, t + 120_000);
  ok(m1.length === 2 && m2.length === 2 && m1.map((x) => x.inventaire_id).join() !== m2.map((x) => x.inventaire_id).join() && m1.every((x) => x.ecrire === false), "mesure : les fiches complètes en rotation d'un poll à l'autre, rien d'écrit");
  const mixte = lf.listeLectureFond([...completes, f({ id: 9, created_at: "2026-10-25T09:00:00Z" })], { actif: true, mode: "mesure", par_cycle: 2 }, t);
  ok(mixte[0]?.inventaire_id === "9" && mixte[0].ecrire === true && mixte[1]?.ecrire === false, "mesure : la vraie fiche à lire du pilote passe d'abord, et elle est écrite (preuve du parcours)", JSON.stringify(mixte));
  ok(lf.listeLectureFond(lignes, { actif: false }, t).length === 0, "compte fermé : liste vide");
  ok(lf.debutJourParis(Date.parse("2026-10-25T12:30:00Z")) === "2026-10-24T23:00:00.000Z", "minuit à Paris (heure d'hiver)");
  ok(lf.debutJourParis(Date.parse("2026-10-20T12:30:00Z")) === "2026-10-19T22:00:00.000Z", "minuit à Paris (heure d'été)");
}

console.log("3. Le pont de la page (src/utils/vintedSync.js)");
{
  reponseAuPing = null;
  const t0 = Date.now();
  const mort = await vs.sonderPontExtension(300);
  ok(mort.vivant === false && Date.now() - t0 < 1000, "personne ne répond au ping : pont mort, constaté vite");
  reponseAuPing = "0.6.144";
  const vivant = await vs.sonderPontExtension(300);
  ok(vivant.vivant === true && vivant.version === "0.6.144", "une extension vivante répond avec sa version");
  const etats = [];
  const stop = vs.ecouterEtatPont((m) => etats.push(m));
  vs.signalerPontMort();
  globalThis.window.postMessage({ __fillsellExt: true, version: "0.6.144" });
  await new Promise((r) => setTimeout(r, 10));
  stop();
  ok(etats.join(",") === "false,true,false", "état du pont : vivant → mort → de nouveau vivant quand un script neuf s'annonce", etats.join(","));
  globalThis.window.postMessage({ __fillsellPontMort: { cmd: "FETCH_VINTED_ITEM" } });
  await new Promise((r) => setTimeout(r, 10));
  ok(vs.pontExtensionMort() === true, "une copie coupée qui le dit (__fillsellPontMort) suffit à le savoir");
}

console.log("4. La lecture du stepper et du lot (src/publication/texteDuVendeur.js)");
{
  reponseAuPing = null;
  const t0 = Date.now();
  const r = await tv.lireDetailVintedParExtension("10499143345", 25_000, { sonder: () => vs.sonderPontExtension(200) });
  ok(r?.pontMort === true && Date.now() - t0 < 2000, "pont mort : réponse en moins de 2 s ({ pontMort }), plus 25 s d'attente", JSON.stringify(r));
  reponseAuPing = "0.6.144";
  const p = await tv.lireDetailVintedParExtension("10499143345", 2000, { sonder: () => vs.sonderPontExtension(300) });
  ok(p?.success === true && p.source === "page_publique" && p.description === "Texte lu sur la page" && p.natif?.catalog_id === 3313, "extension ≥ 0.6.144 : la page publique d'abord", JSON.stringify(p));
  const a = tv.attributsDepuisPagePublique({ couleur: "Noir", couleur2: "Blanc", marque: "Playmobil", catalog_id: 3313 }, "2026-10-25T13:00:00Z");
  ok(a.couleur?.v === "Noir" && a.couleur.source === "vinted_detail" && a.couleur2?.v === "Blanc" && a.categorie_vinted?.v === 3313 && a.page_publique_lue, "les attributs de la page publique (source vinted_detail : la base arbitre)");
  // Le chemin complet : une fiche importée sans texte, pont mort → la note le dit.
  const ecrits = [];
  const supabase = {
    from: () => {
      const q = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, is: () => q, limit: async () => ({ data: [] }),
        update: (patch) => { ecrits.push(patch); return { eq: () => ({ eq: () => ({ then: (f) => f() , or: () => ({ then: (f) => f() }) }) }) }; },
      };
      return q;
    },
  };
  const res = await tv.completerTexteDuVendeur(
    { id: 7, description: "", origine: "vinted_sync", vinted_item_id: "10499143345", vinted_catalog_id: null, title: "coffret" },
    { supabase, userId: "u1", extensionVinted: true, lireDetailVinted: async () => ({ success: false, pontMort: true }) },
  );
  ok(res.note === "pont_mort", "fiche sans texte, pont mort : la note dit « pont_mort » (la page propose de se recharger)", JSON.stringify(res.note));
}

console.log("5. Le branchement serveur (get-pending-jobs)");
{
  const gpj = readFileSync(join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  const i = gpj.indexOf("LE TEXTE DU VENDEUR LU EN ARRIÈRE-PLAN, DÈS L'IMPORT");
  const bloc = i > 0 ? gpj.slice(i, i + 6000) : "";
  ok(bloc.length > 0, "le bloc est là");
  ok(/versionAuMoins\(version, LECTURE_FOND_VERSION_MIN\)/.test(bloc), "servi aux seules extensions ≥ 0.6.144");
  ok(/\.eq\("metadata->>resultat", "antirobot"\)/.test(bloc) && /pause_refus_h/.test(bloc), "le dernier refus du compte (6 h) est relu à chaque poll");
  ok(/pauseAntirobot: Boolean\(antirobotPause\) \|\| compteEnPauseAr/.test(bloc), "jamais pendant une pause anti-robot");
  ok(/\.eq\("origine", "vinted_sync"\)\.eq\("statut", "stock"\)/.test(bloc) && /\.is\("disparu_le", null\)/.test(bloc), "seulement les fiches importées de Vinted, au stock, vivantes");
  ok(/\.limit\(50\)/.test(bloc) && /\.limit\(200\)/.test(bloc), "lectures bornées (50 candidates, 200 en mesure)");
  ok(/catch \(_e\) \{ lectureFond = null;/.test(bloc), "illisible : rien n'est servi, la file part comme avant");
  ok(/lecture_fond: lectureFond,/.test(gpj), "la réponse porte lecture_fond");
}

console.log("6. (26/10, urgence lenteur) La lecture de fond s'efface quand la personne publie");
{
  const NICO = lf.LECTURE_FOND_PILOTES[0];
  const base = { versionOk: true, luesAujourdhui: 0, dernierRefusMs: null, maintenant: Date.parse("2026-10-26T07:00:00Z") };
  ok(lf.regleLectureFond({ ...base, userId: NICO, mode: 1, personnePublie: true }).raison === "personne_publie", "la personne publie (geste < 10 min) : rien servi, même au pilote");
  ok(lf.regleLectureFond({ ...base, userId: NICO, mode: 1, personnePublie: false }).actif === true, "sans geste récent : la règle d'avant");
  ok(lf.FEATURES_PUBLICATION.includes("generate_listing") && lf.FEATURES_PUBLICATION.includes("publish") && lf.PAUSE_PUBLICATION_MIN === 10, "les gestes de publication et la fenêtre de 10 min");
  const gpj = readFileSync(join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  ok(/let personnePublie = out\.length > 0(?: \|\| syncCommandsAnnonces\.some\(\(c\) => c\.devant\))?;/.test(gpj), "un poll qui sert des tâches (ou une relecture avant redépôt) : pas de lecture de fond");
  ok(/\.in\("feature", FEATURES_PUBLICATION/.test(gpj) && /PAUSE_PUBLICATION_MIN \* 60_000/.test(gpj), "le geste récent est relu (usage_logs, 10 min)");
  ok((gpj.match(/personnePublie,\r?\n\s*\}\);/g) ?? []).length === 2, "Vinted ET Beebs reçoivent la pause");
  const bg = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8");
  ok(/jobFlowWaiters\+\+;/.test(bg) && /jobFlowWaiters = Math\.max\(0, jobFlowWaiters - 1\);/.test(bg), "extension : le verrou compte ceux qui l'attendent");
  const iv = bg.indexOf("async function lireFondVinted(");
  const fv = bg.slice(iv, iv + 2500);
  ok(/if \(fondDoitCeder\(\)\) return;/.test(fv) && /await attendreOuCeder\(attente\)/.test(fv) && !/await sleep\(attente\)/.test(fv), "extension : la lecture Vinted n'attend plus, verrou tenu, sans céder");
  const ib = bg.indexOf("async function lireFondBeebs(");
  const fb = bg.slice(ib, ib + 2500);
  ok(/if \(fondDoitCeder\(\)\) return;/.test(fb) && /await attendreOuCeder\(attente\)/.test(fb) && !/await sleep\(attente\)/.test(fb), "extension : la lecture Beebs pareil");
  for (const t of ["PUBLISH_NOW", "FETCH_VINTED_ITEM", "FETCH_VINTED_PUBLIC", "CAPTURE_VINTED_ITEM"]) {
    const i = bg.indexOf(`if (msg?.type === "${t}") {`);
    ok(i > 0 && /^\s*noterDemandeApp\(\);/.test(bg.slice(i + `if (msg?.type === "${t}") {`.length)), `extension : « ${t} » de l'app efface la lecture de fond 10 min`);
  }
  ok(/tachesDuCycle = Array\.isArray\(jobs\) \? jobs\.length : 0;/.test(bg), "extension : une file qui tourne ce cycle, pas de lecture de fond derrière");
  {
    const i = bg.indexOf("await recoverMissingListingUrls(session)");
    const avant = bg.slice(Math.max(0, i - 1200), i);
    // (29/10, lot B — boucle du poll) Un poll en attente n'est plus « quelqu'un » ; la relance est bornée (selftest repoll-borne).
    ok(i > 0 && /if \(cederAuxDemandesEnAttente\(\)\) return;\s*$/.test(avant) && /const attentes = majPlanifiee \? \[\] : attentesHorsPoll\(\);/.test(bg),
      "extension : quelqu'un attend le verrou (hors poll) → la maintenance de fond (liens, veille, messagerie) passe après lui, un poll repart ensuite (borné)");
  }
  ok(/if \(Date\.now\(\) - derniereDemandeAppMs < FOND_PAUSE_APRES_DEMANDE_MS\) return "personne_publie";/.test(bg) && /FOND_PAUSE_APRES_DEMANDE_MS = 10 \* 60_000/.test(bg), "extension : 10 min après une demande de l'app");
}

console.log("7. (28/10, jocabroc8) Page occupée ≠ pont mort ; extension occupée = une seule demande, jamais le formulaire d'édition");
{
  const bloquer = (ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { /* le fil de la page est pris */ } };
  // 7a. La page est prise 1 s juste après le ping (rendu d'un gros Stock) : la réponse arrive après le minuteur.
  reponseAuPing = "0.6.149";
  let p = vs.sonderPontExtension(300);
  bloquer(1000);
  let r = await p;
  ok(r.vivant === true && r.version === "0.6.149", "page occupée 1 s pendant la sonde : le minuteur en retard repingue, le pont est VIVANT", JSON.stringify(r));
  // 7b. Personne ne répond, page occupée : mort quand même, après UN seul repingue, et le retard est dit.
  reponseAuPing = null;
  const t0 = Date.now();
  p = vs.sonderPontExtension(300);
  bloquer(1000);
  r = await p;
  ok(r.vivant === false && Number(r.retardMs) >= vs.PONT_RETARD_TOLERE_MS && Date.now() - t0 < 2500, "personne ne répond : mort après un seul repingue, retard dit (retardMs)", JSON.stringify(r));
  // 7c. À l'heure et sans réponse : mort tout de suite, sans repingue (la règle du 25/10 tient).
  const t1 = Date.now();
  r = await vs.sonderPontExtension(300);
  ok(r.vivant === false && Date.now() - t1 < 900, "délai tenu à l'heure, aucune réponse : pont mort constaté vite");
  // 7d. L'extension publie (lecture sous verrou, réponse dans 700 ms) : deux appels pour la même annonce = UNE commande,
  //     aucune demande par le formulaire d'édition, « sans_reponse » dit l'extension occupée.
  reponseAuPing = "0.6.149";
  retardPublique = 700;
  commandes.length = 0;
  const sansCreneau = { sonder: () => vs.sonderPontExtension(200), attendreCreneau: async () => {} };
  const a = await tv.lireDetailVintedParExtension("10573279036", 150, sansCreneau);
  ok(tv.lecturePubliqueEnVol("10573279036") === true, "la demande reste en vol après le délai de l'appelant");
  const b = await tv.lireDetailVintedParExtension("10573279036", 150, sansCreneau);
  ok(a?.motif === "sans_reponse" && a.occupee === true && b?.motif === "sans_reponse", "sans réponse dans le délai : « sans_reponse » (extension occupée)", JSON.stringify([a, b]));
  ok(commandes.filter((c) => c === "FETCH_VINTED_PUBLIC").length === 1 && !commandes.includes("FETCH_VINTED_ITEM"), "une seule page publique demandée, jamais le formulaire d'édition en plus", commandes.join(","));
  await new Promise((ok2) => setTimeout(ok2, 800));
  ok(tv.lecturePubliqueEnVol("10573279036") === false, "la réponse arrivée, la demande n'est plus en vol");
  retardPublique = 0;
  const c = await tv.lireDetailVintedParExtension("10573279036", 2000, sansCreneau);
  ok(c?.success === true && c.source === "page_publique", "l'extension libre : la lecture suivante aboutit", JSON.stringify(c));
  // 7e. La trace : un pont mort porte son retard, une extension occupée le dit.
  const supa = { from: () => { const q = { select: () => q, eq: () => q, gte: () => q, order: () => q, is: () => q, limit: async () => ({ data: [] }),
    update: () => ({ eq: () => ({ eq: () => ({ then: (f) => f(), or: () => ({ then: (f) => f() }) }) }) }) }; return q; } };
  const fiche = { id: 8, description: "", origine: "vinted_sync", vinted_item_id: "1", vinted_catalog_id: null, title: "soupière" };
  const rm = await tv.completerTexteDuVendeur(fiche, { supabase: supa, userId: "u1", extensionVinted: true, lireDetailVinted: async () => ({ success: false, pontMort: true, retardMs: 1200 }) });
  ok(rm.note === "pont_mort" && rm.pontRetardMs === 1200, "pont mort : la note et le retard du minuteur", JSON.stringify(rm));
  const ro = await tv.completerTexteDuVendeur(fiche, { supabase: supa, userId: "u1", extensionVinted: true, lireDetailVinted: async () => ({ success: false, motif: "sans_reponse", occupee: true }) });
  ok(ro.note === "vinted_echec" && ro.extensionOccupee === true, "extension occupée : la note d'avant (vinted_echec) et extensionOccupee", JSON.stringify(ro));
  // 7f. Les branchements : l'écran d'attente suit la dernière sonde ; l'extension rattache les demandes, sous le MÊME verrou.
  const att = readFileSync(join(RACINE, "src/publication/AttenteLectureOrigine.jsx"), "utf8");
  ok(/setPontMort\(res\?\.note === "pont_mort"\);/.test(att) && !/if \(res\?\.note === "pont_mort"\) setPontMort\(true\);/.test(att), "écran d'attente : « recharge la page » suit la dernière sonde (plus collé après un instant)");
  const bg = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8");
  const i = bg.indexOf('if (msg?.type === "FETCH_VINTED_PUBLIC") {');
  const h = bg.slice(i, i + 3000);
  // (29/10, lot C 1) La lecture que la personne attend : sans le verrou d'abord (onglet vivant), sinon EN TÊTE de file —
  // toujours une seule page lue par annonce (lecture-prioritaire-selftest prouve l'ordre).
  ok(/const proprietaire = !lecturesPubliquesEnVol\.has\(id\);/.test(h) && /lirePagePubliqueVintedPrioritaire\(id, "page-publique-vinted"\)/.test(h) && /if \(!proprietaire\) return lu;/.test(h),
    "extension : une demande pour une annonce déjà en file s'y rattache — une page lue, par la voie prioritaire");
  ok(/^const lecturesPubliquesEnVol = new Map\(\);$/m.test(bg) && bg.indexOf("const lecturesPubliquesEnVol") < bg.indexOf("chrome.runtime.onMessage.addListener("), "extension : la mémoire des lectures en vol est déclarée avant l'écoute des messages");
  const v = bg.indexOf("function withJobFlowLock(label, fn) {");
  ok(v > 0 && /jobFlowTail = run\.catch\(\(\) => \{\}\);\s*return run;\s*\}/.test(bg.slice(v, v + 1100)) && /await drainerLecturesPrioritaires\("tour"\);/.test(bg.slice(v, v + 1100)),
    "extension : withJobFlowLock toujours une file (un seul flux à la fois), qui fait passer d'abord les lectures prioritaires");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} lecture-fond : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
