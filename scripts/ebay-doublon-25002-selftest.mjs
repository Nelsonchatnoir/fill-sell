// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay refuse une annonce IDENTIQUE à une autre du même compte (25002) : la vraie raison, aucune relance
// inutile, et l'article part tout seul quand l'annonce identique n'est plus en ligne »
// (19/11/2026, point 7 du lot de Nico)
//   npm run selftest:ebay-doublon-25002
//
// LE CAS (18/11, compte au Cloud) : cinq bouilloires identiques, cinq articles distincts du stock. eBay accepte les
// quatre premières et refuse la cinquième à la mise en ligne (publishOffer, HTTP 400, errorId 25002 : « Cette annonce
// semble concerner un objet que vous avez déjà mis en vente sur eBay : <titre> (<n°>). Les annonces d'objets identiques
// d'un même vendeur ne peuvent pas être affichées en même temps sur eBay », paramètre listing-multi.html). La tâche
// affichait « eBay a refusé la publication (400, 25002) : Une erreur utilisateur est survenue… [0=…, 1=…, 2=http…] »
// et le trigger cross_post_jobs_needs_user_motif lui posait « relancer » : une relance retombe sur le même mur.
// CE QUE CE TEST VERROUILLE (règle pour tous les comptes, _shared/ebay-annonce-identique.js) :
//   A. la reconnaissance du refus (25002 « objets identiques »), jamais confondu avec les autres 25002 (EAN, retours,
//      plafond de vente) ;
//   B. le message : la vraie raison (eBay refuse deux annonces identiques sur un même compte), l'annonce identique
//      nommée, la reprise automatique dite — jamais « relance », jamais d'adresse ; traduit en anglais ;
//   C. l'écriture : source NOMMÉE (jamais « relancer », jamais ré-armée par la connexion eBay), marque datée ;
//   D. la reprise : quand l'annonce identique n'est plus en ligne (vendue, retirée), ou un essai par jour quand FillSell
//      ne la connaît pas — jamais tant qu'elle est en ligne ;
//   E. les tâches DÉJÀ posées (« relancer », diagnostic 25002) reclassées par le circuit, sans appel à eBay ;
//   F. les câblages : ebay-api-worker (branche du refus, passe d'entretien avant la file), traduction de l'app,
//      classement de la sentinelle, et la règle « pas de relance » que lit l'écran.
// Titres et numéros FICTIFS (selftest:donnees-clients).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
const essai = (f, ...a) => { if (typeof f !== "function") return { __absent: true }; try { return f(...a); } catch (e) { return { __exception: String(e?.message ?? e) }; } };
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const A = await charger("supabase/functions/_shared/ebay-annonce-identique.js");
const V = await charger("supabase/functions/_shared/ebay-voie.ts");
const MS = await charger("src/utils/messagesServeur.js");

// Le refus réel du 18/11 (forme exacte de la réponse d'eBay), titre et numéros remplacés.
const MESSAGE_FR = "Une erreur utilisateur est survenue. Cette annonce semble concerner un objet que vous avez déjà mis en vente sur eBay : "
  + "Bouilloire inox 1,7 L (840100000001). Les annonces d'objets identiques d'un même vendeur ne peuvent pas être affichées en même temps sur eBay. "
  + "Pour mettre en vente plusieurs exemplaires d'un même objet, créez une annonce à quantité multiple au format Prix fixe.";
const PARAMS = [
  { name: "0", value: "Bouilloire inox 1,7 L" }, { name: "1", value: "840100000001" },
  { name: "2", value: "http://pages.ebay.fr/help/policies/listing-multi.html" }, { name: "3", value: "840100000009" },
  { name: "4", value: "fs-1790000000000012" },
];
const REFUS = { errorId: 25002, message: MESSAGE_FR, params: PARAMS, parametres: PARAMS.map((p) => `${p.name}=${p.value}`).join(", ") };
const BRUT = JSON.stringify({ errors: [{ errorId: 25002, domain: "API_INVENTORY", subdomain: "Selling", category: "Request", message: MESSAGE_FR, parameters: PARAMS }] });

console.log("A. LE REFUS « OBJETS IDENTIQUES » EST RECONNU, ET LUI SEUL");
ok(!A.__erreur, "module _shared/ebay-annonce-identique.js chargé", A.__erreur);
ok(essai(A.refusAnnonceIdentique, REFUS) === true, "le refus du 18/11 (25002, listing-multi) est reconnu");
ok(essai(A.refusAnnonceIdentique, { errorId: 25002, message: "A user error has occurred. This listing appears to be for an item you already have on eBay: Kettle (840100000001). Listings for identical items from the same seller can't be displayed at the same time on eBay.", params: [] }) === true,
  "la même phrase en anglais, sans paramètre, est reconnue");
ok(essai(A.refusAnnonceIdentique, { errorId: 25002, message: "Une erreur utilisateur est survenue. Le champ EAN n'a pas été renseigné.", params: [{ name: "3", value: "EAN" }] }) === false, "25002 EAN : pas un doublon");
ok(essai(A.refusAnnonceIdentique, { errorId: 25002, message: "Une erreur utilisateur est survenue. Spécifiez des conditions de retour valides.", params: [{ name: "0", value: "ReturnsAcceptedOption" }] }) === false, "25002 retours : pas un doublon");
ok(essai(A.refusAnnonceIdentique, { errorId: 25002, message: "Une erreur utilisateur est survenue. Cette annonce entraînerait le dépassement du montant total de votre limite de vente.", params: [] }) === false, "25002 plafond de vente : pas un doublon");
ok(essai(A.refusAnnonceIdentique, { errorId: 25007, message: MESSAGE_FR, params: PARAMS }) === false && essai(A.refusAnnonceIdentique, null) === false, "un autre code, ou rien : pas un doublon");
const id = essai(A.annonceIdentiqueDe, REFUS);
ok(id?.annonce === "840100000001" && id?.titre === "Bouilloire inox 1,7 L", "l'annonce identique lue : son numéro (paramètre 1) et son titre (paramètre 0)", JSON.stringify(id));
const idSansParam = essai(A.annonceIdentiqueDe, { errorId: 25002, message: "… déjà mis en vente sur eBay : Bouilloire inox 1,7 L (840100000001). Les annonces d'objets identiques …", params: [] });
ok(idSansParam?.annonce === "840100000001" && idSansParam?.titre === "Bouilloire inox 1,7 L", "sans paramètres, lue dans la phrase", JSON.stringify(idSansParam));

console.log("\nB. LE MESSAGE DIT LA VRAIE RAISON, JAMAIS « RELANCE »");
const fr = essai(A.messageAnnonceIdentique, { titre: "Bouilloire inox 1,7 L", annonce: "840100000001" }, "fr");
ok(typeof fr === "string" && /deux annonces identiques/.test(fr) && /même compte/.test(fr), "eBay refuse deux annonces identiques sur un même compte", fr);
ok(/« Bouilloire inox 1,7 L »/.test(fr ?? "") && /déjà en ligne sur eBay/.test(fr ?? ""), "l'annonce identique est nommée");
ok(/Rien n'a été publié/.test(fr ?? "") && /tout seul/.test(fr ?? "") && /vendue ou retirée/.test(fr ?? ""), "rien de publié, et la reprise automatique dite (vendue ou retirée)");
ok(!/relanc/i.test(fr ?? "") && !/https?:\/\//.test(fr ?? "") && !/25002|\[0=/.test(fr ?? ""), "jamais « relance », jamais d'adresse, jamais le code ni les paramètres bruts");
const frSansTitre = essai(A.messageAnnonceIdentique, { titre: null, annonce: null }, "fr");
ok(typeof frSansTitre === "string" && /une de tes annonces déjà en ligne/.test(frSansTitre) && !/« »|null|undefined/.test(frSansTitre), "titre inconnu : phrase entière, sans trou", frSansTitre);
const en = essai(A.messageAnnonceIdentique, { titre: "Bouilloire inox 1,7 L", annonce: "840100000001" }, "en");
ok(typeof en === "string" && /two identical listings/.test(en) && !/[éèàç]|Rien|relaunch/i.test(en), "en anglais", en);
ok(essai(A.traduireTexteAnnonceIdentique, fr) === en && essai(A.traduireTexteAnnonceIdentique, frSansTitre) === essai(A.messageAnnonceIdentique, { titre: null }, "en"),
  "la phrase française se traduit exactement (même module)");
ok(essai(MS.traduireMessageServeur, fr, "en") === en, "l'app la traduit (utils/messagesServeur.js)", String(essai(MS.traduireMessageServeur, fr, "en")).slice(0, 120));

console.log("\nC. L'ÉCRITURE : UNE SOURCE NOMMÉE, JAMAIS « RELANCER », JAMAIS RÉ-ARMÉE PAR LA CONNEXION");
const LE = "2026-11-18T22:06:46.000Z";
const JOB = { id: "job-fictif", status: "processing", platform: "ebay", action: "publish", error: null,
  platform_fields: { processing_since: LE, ebayCategoryId: "133705", needs_user_source: "relancer", needs_user_sans_motif: { source_posee: "relancer" } } };
const w = essai(A.ecritureAnnonceIdentique, JOB, REFUS, { maintenant: LE });
const SRC = A.SOURCE_EBAY_ANNONCE_IDENTIQUE;
ok(SRC === "ebay_annonce_identique", "la source : ebay_annonce_identique", String(SRC));
ok(w?.status === "needs_user" && w?.platform_fields?.needs_user_source === SRC, "needs_user sous sa source", JSON.stringify(w).slice(0, 200));
ok(Array.isArray(V.SOURCES_EBAY_REARMABLES) && !V.SOURCES_EBAY_REARMABLES.includes(SRC) && SRC !== "relancer", "jamais « relancer », jamais ré-armée par une (re)connexion eBay");
const m = w?.platform_fields?.ebay_annonce_identique;
ok(m?.depuis === LE && m?.dernier_essai_le === LE && m?.annonce === "840100000001" && m?.titre === "Bouilloire inox 1,7 L" && m?.essais === 1, "marque datée : depuis, dernier essai, annonce identique, essais", JSON.stringify(m));
ok(w?.error === essai(A.messageAnnonceIdentique, { titre: "Bouilloire inox 1,7 L", annonce: "840100000001" }, "fr"), "le message de B");
ok(w?.platform_fields?.ebayCategoryId === "133705" && !("processing_since" in (w?.platform_fields ?? {})) && !("needs_user_sans_motif" in (w?.platform_fields ?? {})), "le reste gardé ; plus « en cours », plus la marque « sans motif »");
ok(JOB.status === "processing" && JOB.platform_fields.needs_user_source === "relancer", "pure : la tâche d'entrée n'est pas modifiée");
const w2 = essai(A.ecritureAnnonceIdentique, { ...JOB, platform_fields: w?.platform_fields }, { ...REFUS, params: [{ name: "0", value: "Bouilloire inox" }, { name: "1", value: "840100000002" }, PARAMS[2]] }, { maintenant: "2026-11-19T22:06:46.000Z" });
const m2 = w2?.platform_fields?.ebay_annonce_identique;
ok(m2?.depuis === LE && m2?.essais === 2 && m2?.annonce === "840100000002" && m2?.dernier_essai_le === "2026-11-19T22:06:46.000Z", "refusé de nouveau : même attente, essais comptés, la nouvelle annonce identique retenue", JSON.stringify(m2));
ok(essai(A.relanceSansObjetEbay, { status: "needs_user", platform: "ebay", platform_fields: w?.platform_fields }) === true
  && essai(A.relanceSansObjetEbay, { status: "needs_user", platform: "ebay", platform_fields: { needs_user_source: "relancer" } }) === false
  && essai(A.relanceSansObjetEbay, { status: "failed", platform: "ebay", platform_fields: w?.platform_fields }) === false,
"la règle que lit l'écran : aucune relance proposée tant que la tâche attend l'annonce identique (et seulement elle)");

console.log("\nD. LA REPRISE : QUAND L'ANNONCE IDENTIQUE N'EST PLUS EN LIGNE, JAMAIS TANT QU'ELLE L'EST");
const attend = { ...JOB, status: "needs_user", error: w?.error, platform_fields: w?.platform_fields };
const d = (jumelle, maintenant) => essai(A.repriseAnnonceIdentiqueDue, attend, jumelle, { maintenant: Date.parse(maintenant) });
ok(d({ connue: true, en_ligne: false }, "2026-11-18T22:10:00Z")?.due === true && d({ connue: true, en_ligne: false }, "2026-11-18T22:10:00Z")?.motif === "annonce_identique_terminee",
  "annonce identique vendue ou retirée (connue de FillSell) : reprise tout de suite, sans attendre");
ok(d({ connue: true, en_ligne: true }, "2026-11-25T22:10:00Z")?.due === false, "annonce identique toujours en ligne : jamais, même une semaine après");
ok(d({ connue: false, en_ligne: null }, "2026-11-19T10:00:00Z")?.due === false && d({ connue: false, en_ligne: null }, "2026-11-19T22:07:00Z")?.due === true
  && d({ connue: false, en_ligne: null }, "2026-11-19T22:07:00Z")?.motif === "essai_quotidien", "annonce identique inconnue de FillSell : un essai par jour (eBay tranche), pas avant 24 h");
ok(essai(A.repriseAnnonceIdentiqueDue, { ...attend, status: "pending" }, { connue: true, en_ligne: false })?.due === false
  && essai(A.repriseAnnonceIdentiqueDue, { ...attend, platform_fields: { ...attend.platform_fields, needs_user_source: "relancer" } }, { connue: true, en_ligne: false })?.due === false,
"une tâche qui n'attend pas (ou plus) l'annonce identique n'est jamais touchée");
// L'état de l'annonce identique, lu dans les tâches eBay de FillSell qui la portent (aucun appel à eBay).
const T = (action, status, created_at) => ({ platform_listing_id: "840100000001", action, status, created_at });
ok(essai(A.jumelleDepuisTaches, [T("publish", "published", "2026-11-18T22:04:00Z")], "840100000001")?.en_ligne === true
  && essai(A.jumelleDepuisTaches, [T("publish", "published", "2026-11-18T22:04:00Z")], "840100000001")?.connue === true, "publiée : en ligne");
ok(essai(A.jumelleDepuisTaches, [T("publish", "sold", "2026-11-18T22:04:00Z")], "840100000001")?.en_ligne === false, "vendue : plus en ligne");
ok(essai(A.jumelleDepuisTaches, [T("publish", "published", "2026-11-18T22:04:00Z"), T("delete", "deleted", "2026-11-20T09:00:00Z")], "840100000001")?.en_ligne === false,
  "retirée par FillSell après sa mise en ligne : plus en ligne");
ok(essai(A.jumelleDepuisTaches, [T("delete", "deleted", "2026-11-17T09:00:00Z"), T("republish", "published", "2026-11-18T22:04:00Z")], "840100000001")?.en_ligne === true,
  "un retrait d'AVANT sa (re)mise en ligne ne compte pas");
ok(essai(A.jumelleDepuisTaches, [T("publish", "failed", "2026-11-18T22:04:00Z")], "840100000001")?.en_ligne === false, "connue mais jamais publiée : pas en ligne");
const inconnue = essai(A.jumelleDepuisTaches, [], "840100000001");
ok(inconnue?.connue === false && inconnue?.en_ligne === null, "inconnue de FillSell (annonce faite ailleurs) : on ne conclut rien");
const r = essai(A.ecritureRepriseAnnonceIdentique, attend, { motif: "annonce_identique_terminee", maintenant: "2026-11-20T08:00:00.000Z", archiver: (a, e, s, p) => [...(Array.isArray(a) ? a : []), { erreur: e, statut: s, par: p }] });
ok(r?.status === "pending" && r?.error === null && !("needs_user_source" in (r?.platform_fields ?? {})), "reprise : en file, message effacé, source levée", JSON.stringify(r).slice(0, 200));
ok(r?.platform_fields?.ebay_annonce_identique?.repris_le === "2026-11-20T08:00:00.000Z" && r?.platform_fields?.ebay_annonce_identique?.motif_reprise === "annonce_identique_terminee"
  && r?.platform_fields?.erreurs_archivees?.[0]?.erreur === w?.error, "la reprise datée et motivée, le message archivé");

console.log("\nE. LES TÂCHES DÉJÀ POSÉES (« relancer », diagnostic 25002) : RECLASSÉES PAR LE CIRCUIT, SANS APPEL À eBAY");
const diag = { at: LE, etape: "publish", http: 400, errorId: 25002, message: MESSAGE_FR, brut: BRUT, voie: "api" };
const re = essai(A.refusDepuisDiagnostic, diag);
ok(essai(A.refusAnnonceIdentique, re) === true && essai(A.annonceIdentiqueDe, re)?.annonce === "840100000001", "le refus relu dans le diagnostic gardé (brut d'eBay)", JSON.stringify(re).slice(0, 160));
ok(essai(A.refusAnnonceIdentique, essai(A.refusDepuisDiagnostic, { errorId: 25002, message: MESSAGE_FR })) === true, "sans brut : la phrase suffit");
ok(essai(A.refusAnnonceIdentique, essai(A.refusDepuisDiagnostic, { errorId: 25002, message: "Une erreur utilisateur est survenue. Cette annonce entraînerait le dépassement du montant total de votre limite de vente." })) === false,
  "un autre 25002 déjà posé n'est pas reclassé");
const posee = { id: "job-pose", status: "needs_user", platform: "ebay", action: "publish", error: "eBay a refusé la publication (400, 25002) : …",
  platform_fields: { needs_user_source: "relancer", last_diagnostic: diag } };
ok(essai(A.aReclasserAnnonceIdentique, posee) === true && essai(A.aReclasserAnnonceIdentique, { ...posee, status: "pending" }) === false
  && essai(A.aReclasserAnnonceIdentique, { ...posee, platform_fields: { ...posee.platform_fields, needs_user_source: SRC } }) === false
  && essai(A.aReclasserAnnonceIdentique, { ...posee, platform: "vinted" }) === false, "à reclasser : needs_user eBay, source « relancer » (ou aucune), diagnostic « objets identiques »");
const rc = essai(A.ecritureAnnonceIdentique, posee, re, { maintenant: diag.at });
ok(rc?.platform_fields?.needs_user_source === SRC && rc?.platform_fields?.ebay_annonce_identique?.depuis === LE, "reclassée avec la date du refus, pas celle du passage");

console.log("\nF. LES CÂBLAGES");
const wk = lire("supabase/functions/ebay-api-worker/index.ts");
const iBranche = wk.indexOf("if (refusAnnonceIdentique(e)) {");
const iGenerique = wk.indexOf('const refus = messageRefus("la publication", pub.http, e);');
const i25007 = wk.indexOf("if (refusLivraisonInvalide(e)) {");
ok(iBranche > i25007 && iGenerique > iBranche && i25007 > 0, "worker : le refus « objets identiques » a sa branche, avant le refus générique (et après la livraison 25007)");
ok(/ecritureAnnonceIdentique\(job, e, \{ maintenant: new Date\(\)\.toISOString\(\) \}\)/.test(wk.slice(iBranche, iBranche + 1200)), "worker : la branche écrit par la règle (ecritureAnnonceIdentique)");
ok(/async function annoncesIdentiquesEntretien\(admin: SupabaseClient\)/.test(wk) && /annoncesIdentiques = await annoncesIdentiquesEntretien\(admin\);/.test(wk),
  "worker : la passe d'entretien (reclassement des tâches déjà posées, reprise) passe à chaque tick");
const iPasse = wk.indexOf("annoncesIdentiques = await annoncesIdentiquesEntretien(admin);");
const iFile = wk.indexOf('let cible = admin.from("cross_post_jobs")');
ok(iPasse > 0 && iFile > iPasse, "worker : avant la file (une tâche reprise part dans le même passage)");
ok(/import \{[^}]*refusAnnonceIdentique[^}]*\} from "\.\.\/_shared\/ebay-annonce-identique\.js";/.test(wk), "worker : import de la règle");
const ms = lire("src/utils/messagesServeur.js");
ok(/import \{ traduireTexteAnnonceIdentique \} from '\.\.\/\.\.\/supabase\/functions\/_shared\/ebay-annonce-identique\.js';/.test(ms), "app : la traduction vient du module qui écrit la phrase");
const cb = lire("supabase/functions/_shared/cause-blocage.js");
ok(/ebay_annonce_identique: \[ORIGINE\.PLATEFORME, "annonce_identique"\]/.test(cb), "sentinelle : rangée « plateforme / annonce identique », jamais « nous »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ eBay, annonce identique : la vraie raison, aucune relance inutile, reprise toute seule");
