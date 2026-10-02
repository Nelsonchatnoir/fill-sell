// Autotest des règles SERVEUR du format de colis Vinted —
// `npm run selftest:vinted-colis-serveur` (_shared/vinted-colis.js,
// pas-de-rouge.js, republication-hors-ligne.js).
//
// Textes RELEVÉS en base le 02/10 (lohanobert59, 0.6.82), pas imaginés :
//   · « Montre Zenith » (publication, failed) : « … Champ exigé par Vinted :
//     package_size. À faire : renseigne « package_size » dans la copie Vinted
//     de l'app, puis relance la publication. [sonde réseau : … HTTP 400 … »
//   · « Montre à gousset » (republication 'deleted', needs_user) : « Ton annonce
//     a été retirée de Vinted et n'a pas pu être recréée automatiquement :
//     Vinted exige « package_size ». … Clique « Republier maintenant » … »
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";
import { decisionRecreationHorsLigne } from "../supabase/functions/_shared/republication-hors-ligne.js";
import {
  BUILD_COLIS_DANS_ENVOI, refusColisVinted, colisEnvoyeEtRefuse, envoiColisProuve,
} from "../supabase/functions/_shared/vinted-colis.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ZENITH = "La publication n'a pas abouti — l'annonce n'a PAS été créée. Champ exigé par Vinted : package_size. À faire : renseigne « package_size » dans la copie Vinted de l'app, puis relance la publication. [sonde réseau : /api/v2/item_upload/items → HTTP 400 · prix ENVOYÉ = 290 · réponse : {\"code\":99}]";
const GOUSSET = "Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : Vinted exige « package_size ». Rien n'est perdu : toutes ses données sont sauvegardées. Clique « Republier maintenant » — si un champ manque, il te sera demandé.";
const ZENITH_084 = "La publication n'a pas abouti — l'annonce n'a PAS été créée. Vinted exige le format du colis, que son formulaire ne propose pas pour ce rayon (format 1 envoyé directement, refusé quand même).";

console.log("\n1. RECONNAÎTRE LE REFUS");
ok(refusColisVinted(ZENITH) && refusColisVinted(GOUSSET) && refusColisVinted(ZENITH_084), "les trois textes réels sont reconnus");
ok(!refusColisVinted("Champ exigé par Vinted : brand. À faire : renseigne « Marque »"), "un autre champ n'est pas un refus de colis");
ok(!colisEnvoyeEtRefuse(ZENITH) && colisEnvoyeEtRefuse(ZENITH_084), "poste ancien ≠ format envoyé et refusé");

console.log("\n2. PUBLICATION (pas-de-rouge)");
const z = classerEchec({ platform: "vinted", action: "publish", brut: ZENITH, reecrit: ZENITH, essais: 0, pf: {} });
ok(z.statut === "pending" && z.motif === "colis_non_propose", "Zenith (0.6.82) → pending, motif nommé", JSON.stringify(z).slice(0, 200));
ok(z.pf?.build_min_requis === BUILD_COLIS_DANS_ENVOI, "servie seulement à un poste qui porte le correctif");
ok(!/on ne sait pas|renseigne|relance/i.test(z.message) && /nouvelle version de l'extension/.test(z.message) && /rien à faire/i.test(z.message), "message vrai : cause connue, aucun geste, reprise avec la mise à jour");
const z2 = classerEchec({ platform: "vinted", action: "publish", brut: ZENITH_084, reecrit: ZENITH_084, essais: 0, pf: {} });
ok(z2.statut === "cancelled" && z2.motif === "colis_refuse_meme_envoye" && !z2.pf?.build_min_requis, "poste à jour, format envoyé et refusé → arrêt, pas de boucle");
const autre = classerEchec({ platform: "leboncoin", action: "publish", brut: ZENITH, reecrit: ZENITH, essais: 0, pf: {} });
ok(autre.motif !== "colis_non_propose", "règle Vinted seulement");

console.log("\n3. RECRÉATION APRÈS RETRAIT (republication-hors-ligne)");
const pfGousset = { republish_step: "deleted", recreation_reprises: 6, server_required_fields: [{ key: "package_size", label: "package_size", message: "Sélectionne le format de ton colis" }] };
const g = decisionRecreationHorsLigne({ action: "republish", platform: "vinted", statut: "needs_user", pf: pfGousset, pfEnBase: pfGousset, brut: GOUSSET, reecrit: GOUSSET, maintenant: Date.parse("2026-10-02T09:00:00Z") });
ok(g?.statut === "pending" && g.motif === "recreation_colis_attend_mise_a_jour", "gousset → pending, motif nommé", JSON.stringify(g?.motif));
ok(g.pf.build_min_requis === BUILD_COLIS_DANS_ENVOI && g.pf.republish_step === "deleted", "attend un poste à jour, étape 'deleted' intacte");
ok(!/vers \d\d:\d\d|Republier maintenant|renseigne/.test(g.message) && /retirée de Vinted/.test(g.message) && /nouvelle version de l'extension/.test(g.message), "message vrai : plus de « on réessaie vers 10:59 »");
const g2 = decisionRecreationHorsLigne({ action: "republish", platform: "vinted", statut: "needs_user", pf: pfGousset, pfEnBase: pfGousset, brut: "Vinted exige le format du colis, que son formulaire ne propose pas pour ce rayon, et a refusé celui que nous lui avons envoyé.", maintenant: Date.parse("2026-10-02T09:00:00Z") });
ok(g2?.motif === "recreation_colis_refuse_meme_envoye" && !g2.pf.build_min_requis && g2.dansMinutes >= 360, "format envoyé et refusé → essai toutes les 6 h au plus, sans attendre de version");
const pfAutre = { republish_step: "deleted" };
const r = decisionRecreationHorsLigne({ action: "republish", platform: "vinted", statut: "needs_user", pf: pfAutre, pfEnBase: pfAutre, brut: "Timeout: pas de réponse du content script", maintenant: Date.now() });
ok(r?.motif === "recreation_reprise" && !r.pf.build_min_requis, "une autre panne garde son chemin d'avant");

console.log("\n4. L'ENVOI DIRECT EST-IL PROUVÉ ?");
ok(!envoiColisProuve([]), "aucune preuve → non");
ok(envoiColisProuve([{ http: 200, le: "2026-10-03T10:00:00Z" }]), "un POST accepté → oui");
ok(!envoiColisProuve([{ http: 200, le: "2026-10-03T10:00:00Z" }, { http: 400, le: "2026-10-03T11:00:00Z" }]), "un refus plus récent → non");
ok(envoiColisProuve([{ http: 400, le: "2026-10-03T09:00:00Z" }, { http: 200, le: "2026-10-03T10:00:00Z" }]), "un refus plus ancien que le dernier succès → oui");
ok(!envoiColisProuve([{ http: 400, le: "2026-10-03T09:00:00Z" }]), "seulement des refus → non");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ format de colis Vinted : cause nommée, aucune boucle, aucun geste, aucun retrait par un poste ancien");
