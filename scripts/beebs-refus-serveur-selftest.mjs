// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Beebs : l'envoi refusé par son serveur est nommé, sans reprises aveugles » (19/11/2026)
//   npm run selftest:beebs-refus-serveur
//
// LE TROU (compte 3f91c02e, job 0bb5ac63, 19/11) : cinq essais de la même publication Beebs ont fini en « Dépôt Beebs
// non confirmé… aucune erreur affichée », alors que le même poste publiait 11 autres annonces entre-temps. La sonde
// réseau de l'extension avait pourtant lu la cause : l'envoi (Server Action POST /fr/listing) refusé par le serveur de
// Beebs, « HTTP 406 », corps vide. C'est le seul 406 parmi les 6 540 sondes Beebs en base. Ce résumé n'allait que dans
// last_diagnostic, et pas-de-rouge ne le lisait pas : « motif inconnu », 3 reprises aveugles, puis « n'a pas abouti
// après plusieurs essais automatiques » sans aucune cause.
// LA RÈGLE (_shared/beebs-refus-formulaire.js refusServeurBeebs, lue par pas-de-rouge.js) : Beebs n'a pas confirmé, et
// la sonde montre l'envoi de l'annonce refusé par un 4xx. 401, 403 et 429 (session, anti-robot DataDome, débit) ont
// leur propre chemin. 404 et 408 sont écartés aussi : action introuvable après une mise à jour du site de Beebs, ou
// délai, des refus passagers qui ne disent rien de l'annonce. Dans ce cas, le motif est nommé (beebs_refus_serveur)
// et la question passe à la personne, sans reprise aveugle.
// CE QUE CE TEST VERROUILLE :
//   A. la lecture pure du résumé de la sonde ;
//   B. le classement de la forme RÉELLE du job (brut, avertissements, last_diagnostic) ;
//   C. les voisins inchangés : 200, 403 DataDome, adresse mal choisie (prioritaire), autre plateforme.
// Identifiants FICTIFS, aucune donnée de client (selftest:donnees-clients).
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const R = await charger("supabase/functions/_shared/beebs-refus-formulaire.js");
const P = await charger("supabase/functions/_shared/pas-de-rouge.js");
const lire = (pf) => {
  if (typeof R.refusServeurBeebs !== "function") return { __absent: true };
  try { return R.refusServeurBeebs(pf); } catch (e) { return { __exception: String(e?.message ?? e) }; }
};
const sonde = (captures) => `[sonde beebs, dépôt non confirmé : ${captures.length} capture(s) non-GET : ${captures.join(" ; ")}]`;
const DIAG_406 = sonde(["/fr/listing#fillsell-worker → HTTP 406 · corps: "]);

// La forme réelle du job du 19/11 (texte du content script 0.6.192, avertissements, résumé de la sonde).
const BRUT = "Dépôt Beebs non confirmé : ni page de succès, ni message de confirmation affiché 45 s après le clic « Publier » — " +
  "aucune erreur affichée n'a pu être lue. L'annonce n'est PAS considérée comme déposée. Vérifie « Mes annonces » sur Beebs " +
  "avant de relancer : si elle y est déjà, republier en créerait une deuxième. — observabilité: clic : bouton « Mettre en vente » " +
  "(1 bouton(s) submit) ; catégorie via FIBER (feuille \"Voitures et autres véhicules\") ; interstitiel: aucune ; formulaire : " +
  "compteur d'envois inchangé (0) : le clic n'a pas déclenché l'envoi (en cours) ; erreurs : aucune ; adresse : section absente, incomplète";
const pfJob = (surcharge = {}) => ({
  taille: "Unique", age: "8 ans - 12 ans", marque: "Norev",
  beebsCategoryPath: ["Jeux, jouets et loisirs", "Véhicules", "Voitures et autres véhicules"],
  warnings: [
    { code: "generic", message: "Marque: \"Norev\" → option Beebs \"Norev\" (match marque-exacte)" },
    { code: "generic", message: "adresse: champ introuvable sur la page" },
    { code: "generic", message: "observabilité: état du formulaire Beebs après le clic : compteur d'envois inchangé (0) : le clic n'a pas déclenché l'envoi (en cours) ; erreurs : aucune ; adresse : section absente, incomplète" },
  ],
  last_diagnostic: DIAG_406,
  ...surcharge,
});
const classer = (arg) => {
  if (typeof P.classerEchec !== "function") return { __absent: true };
  try { return P.classerEchec({ platform: "beebs", action: "publish", brut: BRUT, essais: 0, reprises: 0, pf: pfJob(), ...arg }); }
  catch (e) { return { __exception: String(e?.message ?? e) }; }
};
const MESSAGE_406 = "Beebs a refusé l'envoi de cette annonce (réponse 406 de son serveur, sans message) ; rien n'a été publié. " +
  "Modifie le titre ou la description de la copie Beebs, puis relance.";

console.log("A. LA LECTURE DE LA SONDE");
ok(!R.__erreur && !P.__erreur, "modules beebs-refus-formulaire.js et pas-de-rouge.js chargés", R.__erreur ?? P.__erreur);
const l406 = lire({ last_diagnostic: DIAG_406 });
ok(l406?.http === 406 && l406?.corpsVide === true, "le résumé réel du 19/11 : envoi refusé, HTTP 406, corps vide", JSON.stringify(l406));
ok(lire({ last_diagnostic: sonde(["https://www.beebs.app/fr/listing → HTTP 422 · corps: {\"error\":\"x\"}"]) })?.http === 422,
  "adresse absolue, autre 4xx avec un corps : lu (422)");
for (const code of [200, 401, 403, 404, 408, 429, 500]) {
  ok(lire({ last_diagnostic: sonde([`/fr/listing#fillsell-worker → HTTP ${code} · corps: x`]) }) === null, `HTTP ${code} : pas un refus de l'annonce`);
}
ok(lire({ last_diagnostic: "[sonde beebs : aucun id produit extrait de 1 capture(s) — /fr/listing#fillsell-worker → HTTP 200 · 2:\"$Sreact.fragment\"]" }) === null,
  "la sonde d'un dépôt réussi (HTTP 200) : rien");
ok(lire({ last_diagnostic: sonde(["/fr/listing#fillsell-worker → HTTP 406 · corps: ", "/fr/listing#fillsell-worker → HTTP 200 · corps: 0:{}"]) }) === null,
  "la DERNIÈRE capture de l'envoi décide (un 406 suivi d'un 200 : rien)");
ok(lire({ last_diagnostic: sonde(["/api/upload → HTTP 413 · corps: "]) }) === null, "une autre requête que l'envoi de l'annonce : rien");
ok(lire({ last_diagnostic: sonde(["/fr/listing/success → HTTP 406 · corps: "]) }) === null, "une autre page que le formulaire : rien");
ok(lire({ last_diagnostic: "[sonde beebs, dépôt non confirmé : AUCUNE capture — la soumission n'est jamais partie, ou est partie hors fetch/XHR du top frame]" }) === null,
  "aucune capture : rien");
ok(lire(null) === null && lire({}) === null && lire({ last_diagnostic: { voie: "api", http: 406 } }) === null,
  "entrées absentes ou d'une autre forme : rien, jamais d'exception");

console.log("\nB. LE CLASSEMENT DE LA FORME RÉELLE");
const s = classer({});
ok(s.statut === "needs_user" && s.verdict === "a_toi" && s.motif === "beebs_refus_serveur" && s.source === "relancer",
  `${s.statut} / ${s.motif} / ${s.source} (avant : needs_user/pending, inconnu_reprise puis inconnu_relancer)`);
ok(s.message === MESSAGE_406, "le message nomme le refus (texte provisoire soumis à Nico)", s.message);
ok(s.pf?.beebs_refus_serveur?.http === 406 && Number.isFinite(Date.parse(s.pf?.beebs_refus_serveur?.le ?? "")),
  "la trace beebs_refus_serveur (code, date) part avec le verdict");
const sTard = classer({ essais: 2, reprises: 3 });
ok(sTard.motif === "beebs_refus_serveur" && sTard.message === MESSAGE_406, "budget de reprises épuisé : même motif nommé, plus jamais le texte générique");
const s422 = classer({ pf: pfJob({ last_diagnostic: sonde(["/fr/listing#fillsell-worker → HTTP 422 · corps: x"]) }) });
ok(s422.motif === "beebs_refus_serveur" && /réponse 422 de son serveur/.test(s422.message ?? ""), "le code lu est celui que dit le message (422)");

console.log("\nC. LES VOISINS INCHANGÉS");
ok(classer({ pf: pfJob({ last_diagnostic: sonde(["/fr/listing#fillsell-worker → HTTP 200 · corps: 0:{}"]) }) }).motif === "inconnu_reprise",
  "envoi parti (HTTP 200) sans confirmation : la reprise d'avant");
ok(classer({ pf: pfJob({ last_diagnostic: null }) }).motif === "inconnu_reprise", "sans sonde : la reprise d'avant");
ok(classer({ pf: pfJob({ last_diagnostic: null }), essais: 3, reprises: 3 }).motif === "inconnu_relancer", "sans sonde, budget épuisé : le « relancer » d'avant");
ok(classer({ pf: pfJob({ last_diagnostic: sonde(["/fr/listing#fillsell-worker → HTTP 403 · corps: <html>"]) }) }).motif !== "beebs_refus_serveur",
  "HTTP 403 (DataDome) : jamais ce motif");
const adresse = classer({ pf: pfJob({ warnings: [{ code: "generic", message: "adresse: \"9 Rue du 8 Mai 1945 08000 Villeneuve\" → suggestion Beebs \"8XL\"" }] }) });
ok(adresse.motif === "beebs_adresse_mal_choisie", `adresse validée sur autre chose : son motif d'abord (${adresse.motif})`);
const autre = typeof P.classerEchec === "function"
  ? P.classerEchec({ platform: "vinted", action: "publish", brut: "Publication Vinted non confirmée", essais: 0, reprises: 0, pf: { last_diagnostic: DIAG_406 } }) : {};
ok(autre.motif !== "beebs_refus_serveur", `une autre plateforme n'est jamais lue comme Beebs (${autre.motif})`);

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
