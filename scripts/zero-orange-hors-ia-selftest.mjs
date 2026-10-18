// ═══════════════════════════════════════════════════════════════════════════
// Autotest — ZÉRO ORANGE HORS IA (18/10, lot 3)
//   node scripts/zero-orange-hors-ia-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Sur les VRAIS messages du parc relevés le 18/10 :
//   A. un refus de contenu Leboncoin n'est JAMAIS réessayé avec le même texte :
//      la question tout de suite (mots exacts de Leboncoin), ou UNE reprise si
//      le texte servi a changé (jocabroc8, 3e3074ef : « instagram ») ;
//   C. une coupure technique (onglet qui ne répond pas) lue sur le message
//      affiché OU sur le brut est « En pause », reprise seule — une seule
//      signature (CANAL_RE d'etat-job.js, réexportée par pas-de-rouge) ;
//   D. une attente automatique n'est ni orange ni dans « À régler » ; une
//      annonce d'une autre boutique que celle des relevés passe sur l'attente
//      de boutique (un geste nommé).
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const P = await imp("supabase/functions/_shared/pas-de-rouge.js");
const E = await imp("supabase/functions/_shared/etat-job.js");
const D = await imp("supabase/functions/_shared/description-leboncoin.ts");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("zero-orange-hors-ia-selftest");

// ── A. Le refus de contenu Leboncoin ─────────────────────────────────────────
// L'erreur RÉELLE du job 3e3074ef (jocabroc8), telle que l'extension l'écrit.
const REFUS = "Leboncoin refuse le dépôt : « Nous vous invitons à supprimer toute mention d'un site internet autre que leboncoin.fr dans le titre et/ou le texte de votre annonce. » · « Merci de modifier votre titre ou description. En effet, vous avez utilisé des mots qui ne respectent pas nos règles de contenu. » — corrige l'annonce dans FillSell, puis relance la publication. — Observabilité: adsubmit HTTP 403 (champ body, body) ; /deposer-une-annonce · titres [\"Déposer une annonce\"]. Nouvel essai automatique (tentative 4/5), rien à faire.";
const DESC = "Aucun défaut majeur évident n’a été constaté lors de l’examen visuel.\nLes photographies et une vidéo disponible sur instagram permettent d’apprécier les détails du décor. Merci de les examiner.";
const TITRE = "Jardinière ancienne barbotine";

cas("les mots EXACTS de Leboncoin et le champ visé sont lus, jamais l'observabilité", () => {
  const m = P.motsRefusLeboncoin(REFUS);
  assert.equal(m.mots.length, 2);
  assert.ok(m.mots[0].startsWith("Nous vous invitons à supprimer toute mention d'un site internet"));
  assert.ok(m.mots[1].startsWith("Merci de modifier votre titre ou description"));
  assert.deepEqual(m.champs, ["body"]);
  assert.deepEqual(P.motsRefusLeboncoin("Une autre erreur"), { mots: [], champs: [] });
});

cas("jocabroc8 : le texte servi a CHANGÉ (instagram retiré) → UNE reprise, marque posée", () => {
  const servie = D.nettoyerDescriptionLeboncoin(DESC, { titre: TITRE });
  assert.ok(servie.modifiee && !/instagram/i.test(servie.texte), "la liste du 18/10 retire la phrase");
  const emp = P.empreinteTexteServi(TITRE, servie.texte);
  const d = P.decisionRefusContenuLeboncoin({ action: "publish", brut: REFUS, pf: {}, empreinte: emp, nettoyageModifie: true });
  assert.equal(d.statut, "pending");
  assert.equal(d.motif, "lbc_texte_nettoye");
  assert.deepEqual(d.pf.lbc_refus_contenu.empreintes, [emp]);
  // Refusé encore AVEC CE texte : la question, jamais un second essai identique.
  const d2 = P.decisionRefusContenuLeboncoin({ action: "publish", brut: REFUS, pf: { ...d.pf }, empreinte: emp, nettoyageModifie: true });
  assert.equal(d2.statut, "needs_user");
  assert.equal(d2.source, "relancer");
  assert.ok(d2.message.includes("« Nous vous invitons à supprimer toute mention d'un site internet"), "les mots exacts");
  assert.ok(d2.message.includes("le même texte serait refusé de nouveau"));
});

cas("premier refus d'un texte que le nettoyage ne change pas → la question TOUT DE SUITE (jamais 3 reprises à l'identique)", () => {
  const d = P.decisionRefusContenuLeboncoin({ action: "publish", brut: REFUS, pf: {}, empreinte: P.empreinteTexteServi(TITRE, "Texte propre."), nettoyageModifie: false });
  assert.equal(d.statut, "needs_user");
  assert.equal(d.motif, "lbc_contenu_refuse");
});

cas("la fiche corrigée (autre texte servi) → une reprise ; au plus trois", () => {
  let pf = {};
  for (let i = 0; i < 3; i++) {
    const d = P.decisionRefusContenuLeboncoin({ brut: REFUS, pf, empreinte: `e${i}`, nettoyageModifie: true });
    assert.equal(d.statut, "pending", `reprise ${i + 1}`);
    pf = { ...pf, ...d.pf };
  }
  assert.equal(P.decisionRefusContenuLeboncoin({ brut: REFUS, pf, empreinte: "e9", nettoyageModifie: true }).statut, "needs_user", "la 4e : la question");
});

cas("seul le TITRE est refusé → la question « Titre » (servie par get-pending-jobs, titre_saisi)", () => {
  const titre = "Leboncoin refuse le dépôt : « Merci de modifier votre titre. » — corrige l'annonce dans FillSell. — Observabilité: adsubmit HTTP 403 (champ subject)";
  const d = P.decisionRefusContenuLeboncoin({ brut: titre, pf: {}, empreinte: "x", nettoyageModifie: false });
  assert.equal(d.source, "champ_a_choisir");
  assert.equal(d.champ.target.key, "titre_saisi");
  assert.ok(d.pf.titre_refuse);
});

cas("pas-de-rouge (update-job-status, sans empreinte) : la question tout de suite, plus jamais « motif inconnu »", () => {
  const s = P.classerEchec({ platform: "leboncoin", action: "publish", brut: REFUS, reecrit: "", essais: 0, pf: {}, sessions: { leboncoin: false } });
  assert.equal(s.statut, "needs_user");
  assert.equal(s.motif, "lbc_contenu_refuse");
  assert.notEqual(s.motif, "inconnu_reprise");
  // Les autres plateformes : rien ne change.
  assert.notEqual(P.classerEchec({ platform: "vinted", action: "publish", brut: REFUS, essais: 0, pf: {} }).motif, "lbc_contenu_refuse");
});

cas("la marque n'est jamais retirée ; la fiche jamais touchée (seul le texte SERVI change)", () => {
  const r = D.nettoyerDescriptionLeboncoin("Robe Shein taille M. Vidéo sur instagram.", { titre: "Robe Shein", marque: "Shein" });
  assert.ok(/Shein/.test(r.texte) && !/instagram/i.test(r.texte));
  const HW = lire("supabase/functions/handler-watch/index.ts");
  const bloc = HW.slice(HW.indexOf("LEBONCOIN REFUSE LE CONTENU : JAMAIS LE MÊME TEXTE DEUX FOIS"), HW.indexOf("eBAY EXIGE UN EAN : LA PUBLICATION REPART UNE FOIS"));
  assert.ok(!/from\("inventaire"\)/.test(bloc), "le bloc ne lit ni n'écrit la fiche");
  assert.ok(!/title:|description:/.test(bloc.replace(/\.select\([^)]*\)/g, "")), "le job garde son titre et sa description");
  assert.ok(/\.eq\("status", j\.status\)/.test(bloc), "écriture conditionnée au statut lu");
  assert.ok(/republish_step \?\? ""\) === "deleted"\) continue;/.test(bloc), "une recréation garde son circuit");
});

// ── C. Coupure technique ─────────────────────────────────────────────────────
const BRUT_COUPURE = "Republication interrompue pendant la suppression (onglet de travail vinted : le content script ne répond pas, ni après rechargement puis onglet neuf). Relance depuis l'app : l'état réel de l'annonce sera re-vérifié avant tout geste.";
const AFFICHE = "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.";
cas("une seule signature de coupure : pas-de-rouge réexporte CANAL_RE d'etat-job.js", () => {
  assert.equal(P.CANAL_RE, E.CANAL_RE);
  assert.ok(E.CANAL_RE.test(BRUT_COUPURE) && E.CANAL_RE.test(AFFICHE));
  const HW = lire("supabase/functions/handler-watch/index.ts");
  assert.ok(/import \{ CANAL_RE \} from "\.\.\/_shared\/etat-job\.js";/.test(HW));
  assert.ok(/MOTIF_TECHNIQUE_RE\.test\(txt\) \|\| CANAL_RE\.test\(txt\)/.test(HW) && /technique\(brutTech\)/.test(HW), "handler-watch : message ET brut");
  assert.ok(!/^const CANAL_RE =/m.test(lire("supabase/functions/_shared/pas-de-rouge.js")), "plus de copie dans pas-de-rouge");
});

const job = (x) => ({ id: "j", inventaire_id: 1, platform: "vinted", action: "republish", status: "needs_user", created_at: "2026-10-17T11:30:00Z", platform_fields: {}, ...x });
cas("seghirdeborah711 (16691e13) : coupure en republication, étape captured → « En pause » technique, plus de « Relancer »", () => {
  const j = job({ error: AFFICHE, platform_fields: { republish_step: "captured", needs_user_source: "relancer", error_technique: { brut: BRUT_COUPURE } } });
  assert.equal(E.attenteAutomatique(j), "technique");
  assert.equal(E.etatJob(j, {}).etat, E.ETATS.EN_PAUSE);
  // Le brut seul suffit (message affiché sans signature).
  assert.equal(E.attenteAutomatique(job({ error: "Cette republication attend.", platform_fields: { republish_step: "a_capturer", needs_user_source: "relancer", error_technique: { brut: BRUT_COUPURE } } })), "technique");
});
cas("périmètre : jamais une recréation (deleted), jamais un geste de la personne", () => {
  assert.equal(E.attenteAutomatique(job({ error: AFFICHE, platform_fields: { republish_step: "deleted", needs_user_source: "relancer", error_technique: { brut: BRUT_COUPURE } } })), null);
  assert.equal(E.attenteAutomatique(job({ error: "Timeout: Choisis la taille dans la liste", platform_fields: { republish_step: "captured", needs_user_source: "relancer" } })), null, "« taille » = un geste");
  assert.equal(E.attenteAutomatique(job({ action: "publish", error: AFFICHE, platform_fields: { needs_user_source: "relancer" } })), null, "une publication garde son « Relancer »");
  assert.equal(E.attenteAutomatique(job({ error: AFFICHE, platform_fields: { republish_step: "captured", needs_user_source: "champ_a_choisir" } })), null);
});
cas("la copie de l'extension porte la même règle (gen:etat-job-extension)", () => {
  const copie = lire("chrome-extension/etat-job.js");
  assert.ok(copie.includes("le content script ne répond pas|sonde injoignable") && copie.includes("function texteTechnique(texte)"));
});

// ── D. Attentes automatiques hors « À régler » ; autre boutique ──────────────
cas("StockTab : une attente automatique n'est ni orange ni dans « À régler »", () => {
  const S = lire("src/tabs/StockTab.jsx");
  assert.ok(/import \{ LIBELLES, attenteAutomatique \} from '\.\.\/\.\.\/supabase\/functions\/_shared\/etat-job\.js';/.test(S));
  assert.ok(/if \(j\.status === 'needs_user' && attenteAutomatique\(j\)\) continue;/.test(S), "attenteAction");
  assert.ok(/needsUserJobs=needsUserTous\.filter\(j=>natureNeedsUser\(j\)!=="en_cours"&&!oplaRepartSeule\(j\)&&!attenteAutomatique\(j\)\)/.test(S), "pastille");
  assert.ok(/genre: 'pause' \}, lang\), titre: situationJob\(j, \{ lang \}\)\.raison/.test(S), "« En pause », avec sa raison");
});
cas("introuvable à confirmer d'une AUTRE boutique : l'attente de boutique levable (un geste nommé)", () => {
  const A = lire("supabase/functions/handler-watch/index.ts");
  const bloc = A.slice(A.indexOf("L'ANNONCE VIT SUR UNE AUTRE BOUTIQUE QUE CELLE DES RELEVÉS"), A.indexOf("en attente de leur boutique"));
  assert.ok(/!siens\.length && autres\.length >= 2/.test(bloc), "≥ 2 relevés d'une autre boutique, aucun de la sienne");
  assert.ok(/logins\.has\(boutique\)/.test(bloc), "la boutique est confirmée sur le compte");
  assert.ok(/pose_par: POSE_PAR_ORIGINE_PROUVEE/.test(bloc) && /needs_user_source = "boutique_etrangere"/.test(bloc));
  assert.equal(E.attenteAutomatique(job({ platform_fields: { republish_step: "a_capturer", needs_user_source: "boutique_etrangere", boutique_etrangere: { motif: "boutique_etrangere", article: "472079", pose_par: "handler-watch (origine prouvée du job)" } } })), "boutique", "« En pause : ouvre ta boutique… »");
});

console.log(`zero-orange-hors-ia-selftest : ${n} cas verts`);
