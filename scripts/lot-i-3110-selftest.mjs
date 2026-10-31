// ═══════════════════════════════════════════════════════════════════════════
// LOT I (31/10 soir) — SELFTEST · `npm run selftest:lot-i-3110`
// ═══════════════════════════════════════════════════════════════════════════
// 1. Rosa Metra : le site Vinted lu, écrit à chaque relevé ; « Crée ta première annonce » après une synchro à zéro.
// 2. Couleur Vinted (PAUGUES, « Polaroid Land Camera ») : rayons qui l'exigent, réponse hors palette retirée puis
//    question en liste fermée, question de l'app fermée sur la palette.
// 3. Leboncoin : critères rendus tard → attente bornée, jamais un Continuer à l'aveugle.
// 6. Migration 20261031210000 (préparée) : la garde « recréée pas encore revue en ligne ».
// 7. Google Play : « Purchase is not purchased » = abandon ou refus ; l'abonnement confirmé par le serveur.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const ok = (c, quoi) => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}`); } };

const { vintedExigeUneCouleur } = await import("../supabase/functions/_shared/vinted-exigences.js");
const { classerEchec, couleurVintedHorsPalette } = await import("../supabase/functions/_shared/pas-de-rouge.js");
const G = await import("../supabase/functions/_shared/google-accuse-abonnement.js");
const { classerIssueAchat } = await import("../src/lib/issueAchat.js");

console.log("\n1. Rosa Metra — le site lu, la première annonce");
const bg = lire("chrome-extension/background.js");
const trace = bg.slice(bg.indexOf("function tracerPageDemandee("), bg.indexOf("function tracerPageDemandee(") + 1800);
ok(/domaine: VO\.domaineVintedAffiche\(\)/.test(trace), "sync_page porte le domaine Vinted lu, à chaque page de chaque relevé");
ok(/dressing lu vide — le profil Vinted \(\$\{ident\.login \?\? "\?"\}\) lu sur \$\{VO\.domaineVintedAffiche\(\)\} annonce item_count=/.test(bg),
  "la note « dressing lu vide » nomme le site lu (et garde « item_count= », lu par StockTab)");
const bloc = lire("src/stock/BlocSynchro.jsx");
const { synchroSansRien: pur } = await import("../src/stock/synchroSansRien.js");
ok(/import \{ synchroSansRien \} from '\.\/synchroSansRien\.js';/.test(bloc) && /synchroSansRien\(\{ enCours, quand, total: bilan\.total, nbArticles: items\?\.length \}\)/.test(bloc),
  "BlocSynchro lit la règle pure (synchroSansRien)");
ok(pur({ enCours: false, quand: "à l'instant", total: 0, nbArticles: 0 }) === true, "synchro finie, rien trouvé, stock vide → « Crée ta première annonce »");
ok(pur({ enCours: true, quand: "x", total: 0, nbArticles: 0 }) === false && pur({ enCours: false, quand: null, total: 0, nbArticles: 0 }) === false,
  "pendant la synchro, ou jamais synchronisé → rien");
ok(pur({ enCours: false, quand: "x", total: 3, nbArticles: 0 }) === false && pur({ enCours: false, quand: "x", total: 0, nbArticles: 2 }) === false,
  "des annonces trouvées, ou des articles au stock → rien");
ok((bloc.match(/\{premiereAnnonce && <PremiereAnnonce fr=\{fr\} \/>\}/g) ?? []).length === 2, "la carte apparaît après la synchro (résumé) et sur la carte de synchro ; « Synchroniser » reste");
ok(/new CustomEvent\('fillsell:ouvrir-lens'/.test(bloc), "le bouton ouvre Lens par l'événement fillsell:ouvrir-lens");
const app = lire("src/App.jsx");
const iTab = app.indexOf("const [tab,setTab]=useState(");
ok(/window\.addEventListener\('fillsell:ouvrir-lens',ouvrirLens\)/.test(app.slice(iTab, iTab + 900)) && /setTab\(2\)/.test(app.slice(iTab, iTab + 900)),
  "App écoute l'événement (onglet Lens) juste après l'état de l'onglet, avant tout retour anticipé");
ok(!/ouvrirLens|onOuvrirLens/.test(lire("src/tabs/StockTab.jsx")), "aucune prop neuve au Stock");

console.log("\n2. Couleur Vinted — la palette, ou la question");
ok(vintedExigeUneCouleur(["Électronique", "Appareils photo et accessoires", "Appareils photo", "Autres appareils photo"]),
  "Appareils photo : couleur exigée (formulaire et refus 400 du 31/10)");
ok(vintedExigeUneCouleur(["Électronique", "Téléphones portables et équipements de communication", "Téléphones portables"]),
  "Téléphones portables : couleur exigée (formulaire relevé les 25 et 29/10)");
ok(!vintedExigeUneCouleur(["Livres et médias", "Livres"]) && !vintedExigeUneCouleur(["Électronique", "Jeux vidéo et consoles", "Consoles"]),
  "les autres exceptions mesurées restent");
const brut = `COULEUR INTROUVABLE : Vinted ne propose pas la couleur ["appareil photo"]. Choisis une couleur de sa palette dans FillSell (fiche de l'article), puis relance la publication. Palette affichée par Vinted: ["Noir","Gris","Blanc","Multicolore"].`;
const pf = { colors: [], vintedAspects: { color: "appareil photo", brand: "Polaroid" }, needsUserResolved: { "vintedAspects.color": "appareil photo", etat: "Bon état" } };
const h = couleurVintedHorsPalette(brut, pf);
ok(h.absente && h.refusees[0] === "appareil photo" && h.palette.length === 4, "le refus et la palette de la PAGE sont lus dans la phrase de l'extension");
ok(!("color" in h.retrait.vintedAspects) && h.retrait.vintedAspects.brand === "Polaroid"
  && !("vintedAspects.color" in h.retrait.needsUserResolved) && h.retrait.needsUserResolved.etat === "Bon état",
  "la réponse hors palette est retirée de la copie ET de « tranché par toi », le reste intact");
const s1 = classerEchec({ platform: "vinted", action: "publish", brut, essais: 1, pf });
ok(s1.verdict === "reprise" && s1.motif === "vinted_couleur_retraduite" && !("color" in s1.pf.vintedAspects) && s1.pf.couleur_retraduite.reponse_retiree === "appareil photo",
  "1re fois : reprise, la couleur recalculée depuis la fiche, la mauvaise réponse retirée");
const s2 = classerEchec({ platform: "vinted", action: "publish", brut, essais: 2, pf: { ...pf, couleur_retraduite: { le: "x" } } });
ok(s2.verdict === "a_toi" && s2.source === "champ_a_choisir" && s2.champ.field_key === "color" && s2.champ.options_completes === true
  && s2.champ.input_type === "selection_only" && JSON.stringify(s2.champ.allowed_values) === JSON.stringify(["Noir", "Gris", "Blanc", "Multicolore"])
  && s2.champ.target.root === "vintedAspects" && /n'accepte que les couleurs de sa palette/.test(s2.message) && /« appareil photo »/.test(s2.message),
  "2e fois : la question, avec la palette de la page, en liste fermée — jamais « on ne sait pas »");
const brutNous = `COULEUR INTROUVABLE : la couleur ["Marine"] existe bien chez Vinted mais n'a pas pu être posée sur le formulaire — le problème vient de notre côté. Palette affichée par Vinted: ["Marine","Noir"].`;
const s3 = classerEchec({ platform: "vinted", action: "republish", brut: brutNous, essais: 1, pf: { vintedAspects: { color: "Marine" } } });
ok(s3.verdict === "reprise" && !("vintedAspects" in s3.pf), "« existe bien … pas pu être posée » (défaut chez nous) : rien n'est retiré, reprise comme avant");
const st = lire("src/tabs/StockTab.jsx");
ok(/const questionCouleurVinted = job\.platform === "vinted" && String\(f\?\.field_key \?\? ""\)\.toLowerCase\(\) === "color";/.test(st)
  && /catalogueAllowed, questionCouleurVinted \? \[\.\.\.VINTED_COLORS\] : null\]\.find\(listeDeChoixExploitable\)/.test(st),
  "app : la question Couleur Vinted propose la palette de la page, sinon le catalogue, sinon la palette Vinted");
ok(/strict=\{listeCertifieeComplete \|\| questionCouleurVinted\}/.test(st) && /Une couleur Vinted hors de la palette n'est jamais écrite/.test(st),
  "app : menu fermé (pas d'« Autre valeur… ») et aucune valeur hors palette écrite");

console.log("\n3. Leboncoin — critères rendus tard");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const sonde = lbc.slice(lbc.indexOf("async function sonderCriteresLbc("), lbc.indexOf("async function sonderCriteresLbc(") + 1600);
ok(/LBC_SONDE_TARDIVE_MS = 30_000/.test(lbc), "attente prolongée bornée : 30 s au plus");
ok(/if \(!pro && jobPorteCriteresLbc\(job\) && pageSansAucunCritereLbc\(\)\) \{\n\s*const tardif = await attendreCriteresTardifsLbc\(job, warnings\);/.test(sonde),
  "seulement quand le job porte des critères et que la page n'en montre AUCUN (jamais pour un rayon sans critère)");
ok(/critères : toujours aucun champ après/.test(lbc) && /indicesChargementLbc\(\)/.test(lbc), "l'état de la page est noté (visibilité, chargements, photos)");

console.log("\n6. Migration 20261031210000 (préparée, appliquée seulement sur feu vert)");
const mig = lire("supabase/migrations/20261031210000_recreee_non_confirmee_garde.sql");
const inv = lire("supabase/rollbacks/20261031210000_recreee_non_confirmee_garde_INVERSE.sql");
ok(/j\.action = 'republish' and j\.status = 'published'/.test(mig) && /= 'recreated'/.test(mig) && /j\.vu_en_ligne_le is null/.test(mig)
  && /interval '72 hours'/.test(mig) && /a\.run_id is not null/.test(mig), "la garde : republication publiée, recréée, jamais revue (veille ou relevé), 72 h au plus");
ok(/AND public\.republication_recreee_non_confirmee\(r\.user_id, r\.platform, ap\.inventaire_id, ap\.listing_id, ap\.job_id\) IS NULL/.test(mig),
  "constater_absences_releve : aucune annonce datée disparue pendant ce laps");
ok(/'motif', 'recreation_non_confirmee'/.test(mig) && /new\.id\);\n\s*if v_rep is not null then/.test(mig), "alerte_tenue : aucun « Vendue ? », y compris sur la nouvelle annonce du job lui-même");
ok(/republication_recreee_non_confirmee\(new\.user_id, 'vinted', new\.id, new\.vinted_item_id::text, null\)/.test(mig), "dressing Vinted : aucune disparition datée pendant ce laps");
ok(/drop function if exists public\.republication_recreee_non_confirmee/.test(inv) && !/republication_recreee_non_confirmee\(r\.user_id/.test(inv),
  "l'inverse remet les trois fonctions de production et retire la neuve");

console.log("\n7. Google Play — l'issue nommée, l'abonnement confirmé");
const g = classerIssueAchat(new Error("Purchase is not purchased"));
ok(g.issue === "abandon_ou_refus" && g.code === "GOOGLE_NON_ACHETE", "« Purchase is not purchased » = abandon ou refus dans la feuille, jamais une erreur");
ok(classerIssueAchat(new Error("Network down")).issue === "erreur", "une vraie erreur reste une erreur");
ok(/if\(cl\.issue==='abandon_ou_refus'\)\{\n\s*logTunnel\('checkout_abandon',\{canal,tier:tierLog,origine,motif:'google_non_achete'\}\);/.test(app)
  && /Achat non finalisé : rien n'a été débité\./.test(app), "app : tracé en abandon, message « Achat non finalisé : rien n'a été débité »");
ok(G.abonnementAConfirmer({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }) && !G.abonnementAConfirmer({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }),
  "seul un abonnement « en attente de confirmation » est confirmé");
ok(G.urlAccuseAbonnement("app.fillsell.app", "app.fillsell.pro2.sub", "tok") === "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.fillsell.app/purchases/subscriptions/app.fillsell.pro2.sub/tokens/tok:acknowledge",
  "l'adresse purchases.subscriptions.acknowledge");
const appels = [];
const faux = async (url, init) => { appels.push({ url, init }); return { ok: true, status: 204, text: async () => "" }; };
const silence = { log() {}, error() {} };
const r1 = await G.accuserAbonnementGoogle({ packageName: "p", productId: "s", purchaseToken: "t", purchase: { acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }, accessToken: "a", fetchImpl: faux, journal: silence });
const r2 = await G.accuserAbonnementGoogle({ packageName: "p", productId: "s", purchaseToken: "t", purchase: { acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }, accessToken: "a", fetchImpl: faux, journal: silence });
const r3 = await G.accuserAbonnementGoogle({ packageName: "p", productId: "s", purchaseToken: "t", purchase: { acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }, accessToken: "a", fetchImpl: async () => { throw new Error("réseau"); }, journal: silence });
ok(r1.fait && appels.length === 1 && appels[0].init.method === "POST" && !r2.fait && appels.length === 1 && r3.motif === "reseau",
  "confirmé une fois, jamais réécrit, un échec réseau ne lève jamais");
const vgp = lire("supabase/functions/validate-google-purchase/index.ts");
const iUp = vgp.indexOf('return json({ error: "profile_update_failed" }, 500);\n    }\n    // (31/10, lot I point 7)');
ok(iUp > 0 && vgp.indexOf("await accuserAbonnementGoogle({ packageName: PACKAGE_NAME, productId, purchaseToken, purchase, accessToken });", iUp) > iUp,
  "validate-google-purchase : confirmé APRÈS l'écriture du droit (jamais avant)");
const gpw = lire("supabase/functions/google-play-webhook/index.ts");
ok(/ctx\.maj\.effet_applique = isPremium \? "on" : "off";\n\s*\/\/ \(31\/10, lot I point 7\)[^\n]*\n\s*if \(isPremium\) await accuserAbonnementGoogle\(/.test(gpw),
  "google-play-webhook : filet sur chaque notification « on », après l'écriture du droit");

console.log(`\n${ko ? `✗ ${ko} rouge(s)` : "✓ tout est vert"} — ${n} contrôles`);
if (ko) process.exit(1);
