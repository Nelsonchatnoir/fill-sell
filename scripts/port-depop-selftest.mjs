// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — FRAIS DE PORT DEPOP (09/10/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// npm run selftest:port-depop
//   1. la lecture du port (app ET serveur : une seule fonction) ;
//   2. la décision de get-pending-jobs (poser le défaut / demander / rien) ;
//   3. le lot : un article Depop sans port est « à compléter », jamais prêt ;
//   4. la grille d'envoi suivi : prix réels, datés, sourcés ;
//   5. le câblage : le stepper bloque, « Confirmer » montre le champ, le lot le
//      demande une fois, les Réglages l'écrivent par fusion, la question
//      « Compléter » a son champ, get-pending-jobs pose le défaut.
import { readFileSync } from "node:fs";
import { lirePortSaisi, portDepopValide, portDepopParDefaut, decisionPortDepop, QUESTION_PORT_DEPOP }
  from "../supabase/functions/_shared/port-depop.js";
import { bilanArticle } from "../src/publication/lot/regles.js";
import { GRILLE_ENVOI_SUIVI, TRANSPORTEURS_SUIVI, prixAffiche } from "../src/utils/envoiSuiviFrance.js";
import { champsDepop } from "../src/utils/depopPublication.js";

let ok = 0; let ko = 0;
const dit = (nom, cond) => { if (cond) ok++; else { ko++; console.log(`✗ ${nom}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 1. La lecture du port ───────────────────────────────────────────────────
dit("« 4,90 » → 4.9", lirePortSaisi("4,90").valeur === 4.9);
dit("« 4.9 » → 4.9", lirePortSaisi("4.9").valeur === 4.9);
dit("« 4,90 € » → 4.9", lirePortSaisi("4,90 €").valeur === 4.9);
dit("« 5 » → 5", lirePortSaisi("5").valeur === 5);
dit("5 (nombre) → 5", lirePortSaisi(5).valeur === 5);
dit("« 0 » → 0 (envoi offert, accepté par le connecteur)", lirePortSaisi("0").valeur === 0);
dit("« 99,99 » → 99.99", lirePortSaisi("99,99").valeur === 99.99);
dit("« 100 » → trop haut", lirePortSaisi("100").erreur === "trop_haut");
dit("« 150 » → trop haut", lirePortSaisi("150").erreur === "trop_haut");
dit("« » → vide", lirePortSaisi("").erreur === "vide" && lirePortSaisi("  ").erreur === "vide");
dit("null → vide", lirePortSaisi(null).erreur === "vide");
dit("« abc » → invalide", lirePortSaisi("abc").erreur === "invalide");
dit("« -2 » → invalide", lirePortSaisi("-2").erreur === "invalide");
dit("« 4,999 » → invalide (au centime)", lirePortSaisi("4,999").erreur === "invalide");
dit("« 4,5 » → 4.5", portDepopValide("4,5") === 4.5);
// Le moteur de publication (champsDepop) lit la même saisie que le champ.
const c = champsDepop({ icon: "👕", genre: "Femme", pf: { etat: "Très bon état", depopPort: "4,90" } });
dit("champsDepop lit « 4,90 » → 4.9", c.champs.depopPort === 4.9);

// ── 2. La décision de get-pending-jobs ──────────────────────────────────────
dit("défaut lu dans platform_settings.depop.frais_port_defaut", portDepopParDefaut({ depop: { frais_port_defaut: 4.5 } }) === 4.5);
dit("défaut absent → null", portDepopParDefaut({ vinted: {} }) === null && portDepopParDefaut(null) === null);
dit("défaut hors limites → null", portDepopParDefaut({ depop: { frais_port_defaut: 120 } }) === null);
const job = (action, pf = {}) => ({ platform: "depop", action, platform_fields: pf });
dit("publication sans port + défaut → poser", JSON.stringify(decisionPortDepop(job("publish"), 4.5)) === JSON.stringify({ action: "poser", valeur: 4.5 }));
dit("republication importée sans port + défaut → poser", decisionPortDepop(job("republish", { source: "releve" }), 3).action === "poser");
dit("port déjà dit → rien (jamais par-dessus)", decisionPortDepop(job("publish", { depopPort: 7.2 }), 4.5).action === "rien");
dit("port 0 dit → rien", decisionPortDepop(job("publish", { depopPort: 0 }), 4.5).action === "rien");
dit("republication sans port ni défaut, avant retrait → demander", decisionPortDepop(job("republish", { republish_step: "a_capturer" }), null).action === "demander");
dit("republication sans port ni défaut, capturée → demander", decisionPortDepop(job("republish", { republish_step: "captured" }), null).action === "demander");
dit("republication déjà retirée → rien (jamais d'arrêt après le retrait)", decisionPortDepop(job("republish", { republish_step: "deleted", deleted_at: "x" }), null).action === "rien");
dit("publication sans port ni défaut → rien (le connecteur pose sa question)", decisionPortDepop(job("publish"), null).action === "rien");
dit("autre plateforme → rien", decisionPortDepop({ platform: "vinted", action: "publish", platform_fields: {} }, 4.5).action === "rien");
dit("retrait → rien", decisionPortDepop(job("delete"), 4.5).action === "rien");
dit("la question vise platform_fields.depopPort", QUESTION_PORT_DEPOP.field_key === "depopPort" && QUESTION_PORT_DEPOP.target.key === "depopPort" && QUESTION_PORT_DEPOP.target.root === null);

// ── 3. Le lot ───────────────────────────────────────────────────────────────
const moteur = (manquant) => ({
  plateformesPubliables: ["vinted", "depop"], nbQuestions: 0, price: 999, preparationAuRepos: true,
  ctaDisabled: manquant, motifsCtaGris: manquant ? ["Frais de port Depop à indiquer"] : [],
  portDepop: { visee: true, manquant, saisie: manquant ? "" : "4,50" },
  texteVendeur: { titre: "Jean", description: "Jean droit" }, initialListing: { titre: "Jean", description: "Jean droit" },
  edited: { vinted: { title: "Jean", description: "Jean droit" } }, jumeaux: [],
});
const b1 = bilanArticle(moteur(true), { texteValide: true }, "fr");
dit("lot : Depop sans port → « Port Depop », pas prêt", !b1.pret && b1.motifs.some((x) => x.cle === "port_depop"));
const b2 = bilanArticle(moteur(false), { texteValide: true }, "fr");
dit("lot : Depop avec port → aucun motif port", !b2.motifs.some((x) => x.cle === "port_depop"));

// ── 4. La grille d'envoi suivi ──────────────────────────────────────────────
dit("grille : 5 tailles", GRILLE_ENVOI_SUIVI.length === 5);
dit("grille : Colissimo et Mondial Relay", TRANSPORTEURS_SUIVI.map((t) => t.cle).join(",") === "colissimo,mondial_relay");
dit("grille : chaque prix est un vrai prix (< 100 €, au centime)", GRILLE_ENVOI_SUIVI.every((r) => TRANSPORTEURS_SUIVI.every((t) => portDepopValide(r.prix[t.cle]) === r.prix[t.cle])));
dit("grille : chaque transporteur a sa source datée", TRANSPORTEURS_SUIVI.every((t) => /^https:\/\//.test(t.source.url) && /2026/.test(t.source.validite.fr)));
dit("grille : prix croissants avec le poids", TRANSPORTEURS_SUIVI.every((t) => GRILLE_ENVOI_SUIVI.every((r, i) => i === 0 || r.prix[t.cle] >= GRILLE_ENVOI_SUIVI[i - 1].prix[t.cle])));
// Les montants lus le 09/10/2026 sur les grilles officielles (cf. en-tête du module).
dit("grille : Colissimo 500 g = 7,59 € (La Poste, 01/04/2026)", GRILLE_ENVOI_SUIVI[1].prix.colissimo === 7.59);
dit("grille : Mondial Relay 1 kg = 5,99 € (15/06/2026)", GRILLE_ENVOI_SUIVI[2].prix.mondial_relay === 5.99);
dit("prixAffiche fr", prixAffiche(7.59) === "7,59 €");

// ── 5. Le câblage ───────────────────────────────────────────────────────────
const lps = lire("src/components/ListingPreviewScreen.jsx");
const blocage = lps.slice(lps.indexOf("const requiredBlocking ="), lps.indexOf("refusSansQuestion;", lps.indexOf("const requiredBlocking =")));
dit("stepper : le port manquant grise le bouton (requiredBlocking)", blocage.includes("portDepopManquant ||"));
dit("stepper : le motif est dit sous le bouton", lps.includes("Frais de port Depop à indiquer"));
dit("stepper : « Continuer sans Depop » offert", lps.includes('...(portDepopManquant ? ["depop"] : [])'));
dit("stepper : le défaut pré-remplit la copie Depop", lps.includes("usePortDepopParDefaut(userId)") && lps.includes("formaterPort(portDepopDefaut.valeur, lang)"));
dit("stepper : m.portDepop tendu aux écrans", /portDepop: \{\s*visee:/.test(lps));
dit("« Confirmer » montre le champ", lire("src/publication/EcranConfirmer.jsx").includes("<CartePortDepop m={m} />"));
const lot = lire("src/publication/lot/LivraisonDuLot.jsx");
dit("lot : le port demandé UNE fois (champ du lot)", lot.includes('id="port-depop-lot"') && lot.includes("appliquerPortLot"));
dit("lot : l'article qui reste sans port a son champ", lire("src/publication/lot/LotPublication.jsx").includes("m.portDepop?.manquant && <CartePortDepop"));
const reg = lire("src/utils/fraisPortDepop.js");
dit("réglage : écrit par fusion, jamais l'objet entier", reg.includes("fusionnerReglages(['depop']") && !/\.update\(\s*\{\s*platform_settings/.test(reg));
dit("réglage : la sous-page est déclarée", lire("src/reglages/ReglagesPage.jsx").includes("'port-depop':") && lire("src/reglages/plan.js").includes("ouvre: 'port-depop'"));
dit("question « Compléter » : le champ Depop", lire("src/tabs/StockTab.jsx").includes('f?.field_key === "depopPort"'));
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
dit("get-pending-jobs : pose le défaut, demande sinon", gpj.includes("decisionPortDepop(j, await portDefaut())") && gpj.includes("needsUserField: QUESTION_PORT_DEPOP"));
dit("get-pending-jobs : jamais d'écriture hors pending", /update\(\{ platform_fields: pfP \}\)\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gpj));
const feuille = lire("src/components/PortDepop.jsx");
dit("feuille : portail, fond figé, Échap, retour Android", feuille.includes("createPortal(") && feuille.includes("useFondFige(true)") && feuille.includes("useEchap(onFermer)") && feuille.includes("useRetourAndroid(onFermer)"));
dit("feuille : croix, voile, glisser vers le bas", feuille.includes('className="fpd-croix"') && feuille.includes('className="fpd-voile"') && feuille.includes("SEUIL_FERMETURE_PX"));
dit("champ : clavier numérique et « € » visible", feuille.includes('inputMode="decimal"') && feuille.includes('className="fpd-euro"'));

console.log(`${ko ? "✗" : "✓"} port-depop : ${ok} vert(s), ${ko} rouge(s)`);
process.exit(ko ? 1 : 0);
