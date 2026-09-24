// ═══════════════════════════════════════════════════════════════════════════
// OPLA EST-IL AUTORISÉ SUR CE COMPTE ? — SELFTEST (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute la règle LIVRÉE (supabase/functions/_shared/acces-opla.js), la seule
// que lisent le stepper, l'écran de suivi, les Réglages, le relevé, la
// republication et les cartes du Stock.
//
// Ce qu'il garantit :
//   1. le cas Louis (deux postes avec accès, sonde muette 0.6.63) rend
//      « autorise » — plus jamais « Autoriser Opla » à ce compte ;
//   2. un refus PLUS RÉCENT (relevé « accès non accordé », parcage en cours)
//      l'emporte sur une preuve plus ancienne, et l'inverse ;
//   3. un poste SANS accès ne retire rien quand un autre poste l'a ;
//   4. sans aucune preuve : « inconnu » — jamais « autorise » par défaut (le
//      bouton reste affiché) ;
//   5. la sonde ne prouve RIEN sur un 401 ni sur un silence, seulement sur un
//      `true` ; la page de connexion vue par l'onglet prouve la permission ;
//   6. la version d'extension n'entre pas dans le calcul (postes déclarés par
//      la 0.6.64+, appris pour les plus anciennes : même règle) ;
//   7. parcageDepasse : un parcage plus ancien que la preuve « repart tout
//      seul », un parcage plus récent attend l'autorisation.
//
//   node scripts/acces-opla-selftest.mjs

import { verdictAccesOpla, parcageDepasse, tempsParcage, POSTE_VIVANT_MS } from "../supabase/functions/_shared/acces-opla.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const MAINTENANT = Date.parse("2026-09-24T17:05:00Z");
const il = (min) => new Date(MAINTENANT - min * 60_000).toISOString();

console.log("1. Cas Louis (24/09 17:01, extension 0.6.63, deux profils Chrome)");
{
  const v = verdictAccesOpla({
    maintenant: MAINTENANT,
    postes: {
      "070b2126": { le: "2026-09-24T17:01:15.995Z", build: "2026-09-23T22:48:50Z+d4e424c", opla_acces: true, opla_acces_le: "2026-09-24T16:41:18.666Z" },
      "8632c049": { le: "2026-09-24T17:01:18.164Z", build: "2026-09-23T22:48:50Z+d4e424c", opla_acces: true, opla_acces_le: "2026-09-24T16:41:18.733+00:00", opla_acces_preuve: "publication Opla aboutie" },
    },
    // La sonde du compte ne dit RIEN d'Opla : c'est ce silence que le stepper lisait comme un refus.
    sessions: { opla: null, http: { opla: null }, checked_at: "2026-09-24T16:59:16.478Z", checked_at_par_plateforme: { opla: "2026-09-24T16:25:17.465Z" } },
    releveReussiLe: "2026-09-24T16:19:34.662Z",
    publieLe: "2026-09-24T16:41:18.733Z",
    releveNonAccordeLe: "2026-09-24T13:19:26.973Z",
  });
  ok(v.verdict === "autorise", `autorisé (rendu : ${v.verdict}/${v.motif})`);
  ok(v.postes.avec === 2 && v.postes.sans === 0, "deux postes avec accès comptés");
}

console.log("2. Le plus récent l'emporte");
{
  const postes = { a: { le: il(1), opla_acces: true, opla_acces_le: il(60) } };
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes, releveNonAccordeLe: il(10) }).verdict === "a_autoriser", "relevé « accès non accordé » plus récent que l'accès établi → à autoriser");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes, releveNonAccordeLe: il(120) }).verdict === "autorise", "relevé « non accordé » plus ancien → autorisé");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes, parcageLe: il(5) }).verdict === "a_autoriser", "parcage en cours plus récent → à autoriser");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes, parcageLe: il(90) }).verdict === "autorise", "parcage plus ancien → autorisé");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, releveReussiLe: il(30), releveNonAccordeLe: il(30) }).verdict === "a_autoriser", "à égalité, le refus l'emporte");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, releveNonAccordeLe: il(300), octroiLe: il(20) }).verdict === "autorise", "l'octroi dans le popup lève un refus plus ancien");
}

console.log("3. Un poste sans accès ne retire rien quand un autre l'a");
{
  const v = verdictAccesOpla({ maintenant: MAINTENANT, postes: {
    avec: { le: il(2), opla_acces: true, opla_acces_le: il(2) },
    sans: { le: il(1), opla_acces: false, opla_acces_le: il(1) },
  } });
  ok(v.verdict === "autorise", "profil Chrome sans permission à côté d'un profil qui l'a → autorisé");
  const seul = verdictAccesOpla({ maintenant: MAINTENANT, postes: { sans: { le: il(1), opla_acces: false } }, releveReussiLe: il(600) });
  ok(seul.verdict === "a_autoriser" && seul.motif === "poste_sans_acces", "seul poste, sans accès, plus récent qu'un vieux relevé → à autoriser");
  const mort = verdictAccesOpla({ maintenant: MAINTENANT, postes: { vieux: { le: new Date(MAINTENANT - POSTE_VIVANT_MS - 60_000).toISOString(), opla_acces: true } } });
  ok(mort.verdict === "inconnu", "un poste non vu depuis 48 h ne compte plus");
}

console.log("4. Sans aucune preuve : inconnu — jamais autorisé par défaut");
{
  const v = verdictAccesOpla({ maintenant: MAINTENANT });
  ok(v.verdict === "inconnu" && v.motif === "aucune_preuve", "rien → inconnu (le bouton reste affiché)");
  const p = verdictAccesOpla({ maintenant: MAINTENANT, postes: { x: { le: il(1), build: "0.6.53" } } });
  ok(p.verdict === "inconnu", "un poste qui ne dit rien d'Opla → inconnu");
}

console.log("5. La sonde : seulement un `true`, jamais un 401 ni un silence");
{
  const s401 = verdictAccesOpla({ maintenant: MAINTENANT, sessions: { opla: false, http: { opla: 401 }, checked_at: il(3) } });
  ok(s401.verdict === "inconnu", "sonde false/401 (≤ 0.6.64) → ne prouve rien");
  const sNull = verdictAccesOpla({ maintenant: MAINTENANT, sessions: { opla: null, http: { opla: 401 }, checked_at: il(3) } });
  ok(sNull.verdict === "inconnu", "sonde null/401 (0.6.65+) → ne prouve rien");
  const sVrai = verdictAccesOpla({ maintenant: MAINTENANT, sessions: { opla: true, http: { opla: 200 }, checked_at_par_plateforme: { opla: il(3) } } });
  ok(sVrai.verdict === "autorise" && sVrai.motif === "sonde_vivante", "sonde true (200 + compte) → autorisé");
  const page = verdictAccesOpla({ maintenant: MAINTENANT, sessions: { opla: false, http: { opla: "login_redirect_observee" }, checked_at: il(3) }, releveNonAccordeLe: il(200) });
  ok(page.verdict === "autorise" && page.motif === "page_connexion_vue", "page de connexion vue par l'onglet → la permission était là");
  const onglet401 = verdictAccesOpla({ maintenant: MAINTENANT, releveSessionRefuseeLe: il(4), releveNonAccordeLe: il(50) });
  ok(onglet401.verdict === "autorise", "relevé « session Opla refusée (HTTP 401) » dans l'onglet → la permission était là");
}

console.log("6. La version d'extension n'entre pas dans le calcul");
{
  const declare = { le: il(1), build: "2026-09-24T14:34:46Z+aa459a7", opla_acces: true, opla_acces_le: il(1) };
  const appris = { le: il(1), build: "2026-09-19T12:23:44Z+1604cf2", opla_acces: true, opla_acces_le: il(30) };
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes: { declare } }).verdict === "autorise", "0.6.66 (déclaré) → autorisé");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes: { appris } }).verdict === "autorise", "0.6.53 (appris) → autorisé");
  ok(verdictAccesOpla({ maintenant: MAINTENANT, postes: { sansDate: { le: il(1), opla_acces: true } } }).verdict === "autorise", "accès sans opla_acces_le → daté de la dernière apparition");
}

console.log("7. parcageDepasse");
{
  const v = verdictAccesOpla({ maintenant: MAINTENANT, postes: { a: { le: il(1), opla_acces: true, opla_acces_le: il(2) } } });
  const vieux = { created_at: il(300), platform_fields: { needs_user_source: "opla_acces", opla_acces_attendu_le: il(200) } };
  ok(parcageDepasse(vieux, v), "parcage plus ancien que la preuve → repart tout seul");
  ok(tempsParcage({ created_at: il(300), platform_fields: { opla_acces_attendu_le: il(200), opla_acces_reprise_le: il(100) } }) === Date.parse(il(100)), "le moment du parcage est le plus tardif connu");
  const refuse = verdictAccesOpla({ maintenant: MAINTENANT, parcageLe: il(1) });
  ok(!parcageDepasse(vieux, refuse), "compte non autorisé → le parcage attend l'autorisation");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ accès Opla : tout passe");
process.exit(ko ? 1 : 0);
