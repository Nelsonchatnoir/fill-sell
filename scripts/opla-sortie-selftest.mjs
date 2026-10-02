// Autotest de la sortie d'Opla (02/10/2026).
// `npm run selftest:opla-sortie`
import assert from "node:assert/strict";
import {
  OPLA_SORTIE, MESSAGE_OPLA_INDISPONIBLE, messageClotureOpla, estPublicationOpla,
  oplaACloreJob, clotureOpla, oplaRelie, STATUTS_OPLA_A_CLORE, sortieOplaActive, debutSortieOpla,
} from "../supabase/functions/_shared/opla-sortie.js";
import { archiverErreur } from "../supabase/functions/_shared/erreurs-archivees.js";

// A1/A5 : ce qui se clôt, ce qui ne se clôt jamais.
const j = (o) => ({ id: "x", platform: "opla", action: "publish", status: "pending", platform_fields: {}, ...o });
assert.equal(estPublicationOpla(j()), true);
assert.equal(estPublicationOpla(j({ action: null })), true, "action nulle = publish");
assert.equal(estPublicationOpla(j({ action: "republish" })), true);
assert.equal(estPublicationOpla(j({ action: "delete" })), false, "A4 : un retrait Opla n'est JAMAIS une publication");
assert.equal(estPublicationOpla(j({ platform: "vinted" })), false, "zéro régression Vinted");
for (const pf of ["vinted", "leboncoin", "ebay", "beebs"]) {
  for (const st of ["pending", "needs_user", "processing", "published"]) {
    assert.equal(oplaACloreJob(j({ platform: pf, status: st })), false, `${pf}/${st} jamais touché`);
  }
}
assert.deepEqual(STATUTS_OPLA_A_CLORE, ["pending", "needs_user"]);
assert.equal(oplaACloreJob(j({ status: "needs_user", platform_fields: { needs_user_source: "opla_acces" } })), true);
assert.equal(oplaACloreJob(j({ status: "needs_user", platform_fields: { needs_user_source: "connexion" } })), true);
assert.equal(oplaACloreJob(j({ status: "needs_user", platform_fields: { needs_user_source: "champ_a_choisir" } })), true);
assert.equal(oplaACloreJob(j({ status: "processing" })), false, "pris par une extension : il finit son cours");
assert.equal(oplaACloreJob(j({ status: "published", handler_build: "releve-annonces" })), false, "suivi d'un relevé (A3) jamais touché");
assert.equal(oplaACloreJob(j({ status: "sold" })), false);
assert.equal(oplaACloreJob(j({ action: "delete", status: "needs_user", platform_fields: { needs_user_source: "opla_acces" } })), false, "A4");

// La clôture : statut, message vrai, marqueur, rien à relancer.
const avant = j({ status: "needs_user", error: "Opla attend ton autorisation…", platform_fields: { needs_user_source: "opla_acces", next_action_after: "2026-10-02T10:00:00Z", opla_categorie: "x" } });
const cl = clotureOpla(avant, { par: "test", maintenant: Date.parse("2026-10-02T12:00:00Z"), archiver: archiverErreur });
assert.equal(cl.status, "cancelled", "jamais failed (pas de rouge)");
assert.ok(cl.error.startsWith(MESSAGE_OPLA_INDISPONIBLE), "la phrase de Nico en tête");
assert.equal(MESSAGE_OPLA_INDISPONIBLE, "Opla n'est plus disponible dans FillSell.");
assert.match(cl.error, /ne compte pas dans tes limites/);
assert.equal(cl.platform_fields.needs_user_source, undefined);
assert.equal(cl.platform_fields.next_action_after, undefined);
assert.equal(cl.platform_fields.opla_categorie, "x", "le reste de la fiche du job est gardé");
assert.deepEqual(cl.platform_fields.opla_sortie, { le: "2026-10-02T12:00:00.000Z", par: "test", statut_avant: "needs_user", source_avant: "opla_acces" });
assert.equal(cl.platform_fields.erreurs_archivees.at(-1).erreur, "Opla attend ton autorisation…", "l'ancien motif est archivé");
assert.equal(avant.platform_fields.needs_user_source, "opla_acces", "l'objet lu n'est pas modifié");
assert.match(messageClotureOpla("republish"), /annonce Opla n'a pas été touchée/);
assert.match(messageClotureOpla("publish"), /Rien n'a été publié sur Opla/);
assert.doesNotMatch(messageClotureOpla("publish") + messageClotureOpla("republish"), /retir/i, "A5 : aucun retrait annoncé");

// A2/A3 : « Opla relié ».
assert.equal(oplaRelie({ releveOplaFait: true }), true);
assert.equal(oplaRelie({ annonceOplaConnue: true }), true);
assert.equal(oplaRelie({ releveOplaFait: false, annonceOplaConnue: false }), false);
assert.equal(oplaRelie({}), false);
assert.equal(OPLA_SORTIE.DATE_TEXTE, "10 octobre");

// L'interrupteur : rien avant le 10/10 00:00 Paris, tout après ; 0 = désactivée.
const veille = Date.parse("2026-10-09T23:59:59+02:00");
const jourJ = Date.parse("2026-10-10T00:00:00+02:00");
assert.equal(sortieOplaActive(Date.parse("2026-10-02T13:00:00+02:00"), 1791583200), false, "le 02/10 : Opla fonctionne comme avant");
assert.equal(sortieOplaActive(veille, 1791583200), false, "la veille à 23:59:59 : toujours ouverte");
assert.equal(sortieOplaActive(jourJ, 1791583200), true, "le 10/10 à 00:00 Paris : la sortie s'applique");
assert.equal(sortieOplaActive(jourJ, null), true, "clé absente : la date par défaut, le 10/10");
assert.equal(sortieOplaActive(veille, undefined), false);
assert.equal(sortieOplaActive(jourJ, "illisible"), true, "lecture illisible : la date par défaut, jamais déplacée");
assert.equal(sortieOplaActive(jourJ + 86400000 * 30, 0), false, "0 = sortie désactivée, Opla reste ouverte");
assert.equal(sortieOplaActive(Date.parse("2026-10-08T00:00:00Z"), 1791410400), true, "avancer la bascule = une valeur plus tôt");
assert.equal(debutSortieOpla(null), Date.parse(OPLA_SORTIE.DEBUT_DEFAUT_ISO));
assert.equal(debutSortieOpla(0), null);

console.log("opla-sortie : tous les contrôles passent");
