// ═══════════════════════════════════════════════════════════════════════════
// Selftest « la délégation Leboncoin va au bout : retrait, republication, relevé » (05/11, demande de Nico)
//   npm run selftest:delegation-leboncoin-chaine
//
// LE CAS : louis-seller délègue Leboncoin au compte Amiral. Amiral mis en pause Leboncoin le 02/11 ; la visite de
// contrôle qui lève la pause était avalée par une garde de la base (puis servie « devant », refusée par l'extension
// ≥ 0.6.170) : pendant trois jours, plus RIEN de Leboncoin pour Louis — le retrait du Playmobil (69f89a6d) a attendu
// du 03/11 15:36 au 05/11 09:52. Les selftests de la délégation (delegation-leboncoin, -releves) vérifiaient chaque
// maillon seul ; celui-ci suit la CHAÎNE, pour les trois sortes de travail :
//   A. servi : le compte de travail reçoit les retraits, republications et relevés Leboncoin du propriétaire, et
//      eux seuls ; les postes du propriétaire ne les reçoivent plus ;
//   B. fait : l'extension de l'exécutant les fait AVEC LE JETON du propriétaire (processJob / lancerRelevePlateforme) ;
//   C. pause de l'exécutant : rien ne part pour personne, le propriétaire lit la vérité (« en pause », jamais « ouvre
//      l'extension ») ;
//   D. la pause se LÈVE : visite posée (la base l'accepte), servie sans « devant », lancée en bouton_distant (seul
//      chemin que la garde de pause de l'extension laisse passer) ; essai réussi → reprise → libre ;
//   E. après la levée : le cycle délégué repart ; une republication déjà retirée part tout de suite ;
//   F. et si ça recoince : la file arrêtée remonte en rouge, exécutant nommé (ops-digest).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const D = await imp("supabase/functions/_shared/delegation-leboncoin.js");
const B = await imp("supabase/functions/_shared/blocage-leboncoin.js");
const A = await imp("supabase/functions/_shared/attente-extension-active.js");
const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
const BG = lire("chrome-extension/background.js");

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const corpsDe = (src, debut) => { const i = src.indexOf(debut); if (i < 0) return ""; const f = src.indexOf("\n}\n", i); return src.slice(i, f < 0 ? undefined : f); };

const LOUIS = "447d920c-976a-4d8f-aff4-a2998050358c";
const AMIRAL = "faf5021a-479a-4bb3-b3ec-c296770739b7";
const TRAVAIL = [
  { id: "retrait", action: "delete", platform: "leboncoin" },
  { id: "republication", action: "republish", platform: "leboncoin", platform_fields: { republish_step: "a_capturer" } },
  { id: "publication", action: "publish", platform: "leboncoin" },
  { id: "vinted", action: "publish", platform: "vinted" },
];

console.log("\n[A] servi au compte de travail : retrait, republication, relevé Leboncoin — et eux seuls");
{
  const delegue = D.tachesDuDelegue(TRAVAIL).map((j) => j.id).join();
  ok(delegue === "retrait,republication,publication", `le compte de travail reçoit les tâches Leboncoin (${delegue})`);
  ok(D.tachesSansLbc(TRAVAIL).map((j) => j.id).join() === "vinted", "les postes du propriétaire ne gardent que le reste");
  ok(D.delegationLbcValide({ proprietaire: LOUIS, flagsProprietaire: { delegation_leboncoin: { executant: AMIRAL } }, executant: AMIRAL, flagsExecutant: { execute_leboncoin_pour: [LOUIS] } }),
    "la paire louis-seller → Amiral, posée des deux côtés, est une délégation valide");
  ok(/delegationLbc \? c\.platform === PLATEFORME_DELEGUEE : proprietaireDelegue \? c\.platform !== PLATEFORME_DELEGUEE : true/.test(GPJ),
    "relevés : le poll délégué ne lit que les relevés Leboncoin du propriétaire, ses postes jamais");
}

console.log("\n[B] fait par l'extension de l'exécutant, avec le jeton du propriétaire");
{
  const cycle = corpsDe(BG, "async function cycleDelegueUnCompte(");
  ok(cycle.length > 0, "cycleDelegueUnCompte présent");
  ok(/callEdgeFunction\("get-pending-jobs", tokenD,/.test(cycle) && /delegation: \{ executant_jeton: own\.access_token, plateformes: \["leboncoin"\] \}/.test(cycle),
    "le poll délégué part avec le jeton du propriétaire, l'exécutant prouvé par le sien");
  ok(/\.filter\(\(j\) => j\?\.platform === "leboncoin"\)/.test(cycle) && /const outcome = await processJob\(job, tokenD\);/.test(cycle),
    "retraits et republications : processJob avec le jeton du propriétaire");
  ok(/const etapeDeleted = job\.action === "republish" && job\.platform_fields\?\.republish_step === "deleted";/.test(cycle),
    "une republication déjà retirée n'attend ni la mise à jour ni la pause de file");
  ok(/lancerRelevePlateforme\(\{ platform: "leboncoin", declencheur: "bouton_distant", runId: cmd\.id, session: sD \}\)/.test(cycle),
    "relevés servis : lancés pour le propriétaire (sa session), en bouton_distant avec leur numéro");
}

console.log("\n[C] l'exécutant en pause : rien ne part, et le propriétaire lit la vérité");
{
  const cycle = corpsDe(BG, "async function cycleDelegueLbc(");
  ok(/if \(await leboncoinEnPause\(\)\) \{[\s\S]{0,200}return;/.test(cycle), "pause sur le navigateur de l'exécutant : aucun travail délégué ce cycle");
  ok(/const msgP = lecturesExtensionEnPause\(ebEx\.etat\)\s*\? messageTacheDelegueeEnPause\(proprietaireDelegue\.nom\)\s*: messageTacheDelegueeEnAttente\(proprietaireDelegue\.nom\);/.test(GPJ),
    "get-pending-jobs : exécutant en pause → message « en pause », sinon « en attente »");
  const m = D.messageTacheDelegueeEnPause("Amiral");
  ok(/Leboncoin passe par .*Amiral/.test(m) && /restreint l'accès/.test(m) && !/ouvr/i.test(m), "le message dit la pause, jamais « ouvre l'extension »", m);
  for (const etat of ["bloque", "essai"]) ok(B.lecturesExtensionEnPause(etat), `état « ${etat} » : lectures et cycle délégué arrêtés`);
}

console.log("\n[D] la pause se lève : visite posée, acceptée par la base, servie et lancée sur le seul chemin permis");
{
  ok(/declencheur: "controle_blocage_lbc", queued_at/.test(GPJ), "get-pending-jobs pose la visite de contrôle (déclencheur controle_blocage_lbc)");
  ok(!/declencheur: "controle_blocage_lbc", devant: true/.test(GPJ), "jamais servie « devant » (lancée en « serveur », la garde de pause la refuserait)");
  const dossier = join(ROOT, "supabase/migrations");
  const derniere = readdirSync(dossier).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => /FUNCTION public\.releve_est_veille\(/.test(lire(`supabase/migrations/${f}`))).at(-1);
  const corps = lire(`supabase/migrations/${derniere}`);
  const liste = [...(corps.slice(corps.lastIndexOf("FUNCTION public.releve_est_veille(")).match(/IN \(([\s\S]*?)\)/)?.[1] ?? "").matchAll(/'([^']*)'/g)].map((x) => x[1]);
  ok(liste.includes("controle_blocage_lbc"), `la base l'accepte (releve_est_veille de ${derniere}) — plus avalée en silence`);
  ok(/if \(platform === "leboncoin" && !sessionFournie && !\(declencheur === "bouton_distant" && runId\) && await leboncoinEnPause\(\)\)/.test(BG),
    "garde de pause de l'extension : seul bouton_distant + numéro de relevé passe");
  ok(/async function traiterRelevesEnAttente\(\)[\s\S]{0,400}lancerRelevePlateforme\(\{ platform: cmd\.platform, declencheur: "bouton_distant", runId: cmd\.id \}\)/.test(BG),
    "un relevé servi (hors « devant ») est lancé en bouton_distant avec son numéro : la visite passe la garde");
  // La machine à états, de la pose à la liberté.
  const t0 = Date.parse("2026-11-02T17:09:54Z");
  const pose = B.blocagePose({}, { signe: "http_403", source: "extension (veille_commandes)", maintenant: new Date(t0).toISOString() });
  const ps = (b) => ({ leboncoin: { blocage_acces: b } });
  ok(B.etatBlocageLbc(ps(pose), t0 + 60_000).etat === "bloque", "pause posée : bloqué");
  const tEssai = t0 + B.ESSAI_APRES_MS + 60_000;
  ok(B.etatBlocageLbc(ps(pose), tEssai).etat === "essai", "2 h plus tard : une visite de contrôle est due");
  const servi = { ...B.blocageAvecEssai(pose, { jobId: "", maintenant: new Date(tEssai).toISOString() }), essai: { releve_id: "578be0e1", le: new Date(tEssai).toISOString(), controle: true } };
  const enCours = B.etatBlocageLbc(ps(servi), tEssai + 60_000);
  ok(enCours.etat === "bloque" && enCours.essai_en_cours === true, "visite servie : on attend son résultat (2 h au plus)");
  const leve = B.blocageLeve(servi, { par: "visite de contrôle", maintenant: new Date(tEssai + 120_000).toISOString() });
  const rep = B.etatBlocageLbc(ps(leve), tEssai + 180_000);
  ok(rep.etat === "libre" && !B.lecturesExtensionEnPause(rep.etat), "visite réussie : libre tout de suite (reprise prudente supprimée, 05/11), lectures et cycle délégué rouverts");
  ok(B.etatBlocageLbc(ps(leve), tEssai + 120_000 + B.REPRISE_PRUDENTE_MS + 60_000).etat === "libre", "la reprise prudente finie : libre");
}

console.log("\n[E] après la levée : le travail de Louis repart");
{
  ok(B.annonceDejaRetiree({ action: "republish", platform_fields: { republish_step: "deleted" } }) && !B.annonceDejaRetiree({ action: "delete" }),
    "une republication déjà retirée est reconnue (elle part tout de suite)");
  ok(/const retireesA = ebA\.etat === "reprise" \? lbcA\.filter\(\(j\) => annonceDejaRetiree\(j\)\) : \[\];/.test(GPJ),
    "chez l'exécutant en reprise, les republications déjà retirées du propriétaire partent sans attendre");
  ok(/if \(ebA\.etat === "reprise" && \(retireesA\.length \|\| \(ebA\.prete && lbcA\.length\)\)\)/.test(GPJ),
    "puis une action toutes les 10 min (reprise prudente comptée sur la session de l'exécutant) : retrait et republication repartent");
  ok(/if \(!\(ebA\.etat === "reprise" && ebA\.prete && !gardeA\)\) syncCommandsAnnonces = syncCommandsAnnonces\.filter\(\(c\) => c\.platform !== PLATEFORME_DELEGUEE\);/.test(GPJ),
    "relevés du propriétaire : servis quand la reprise est prête et qu'aucune action ne part ce passage");
}

console.log("\n[F] et si la chaîne recoince : rouge sur support@fillsell.app, exécutant nommé");
{
  const maintenant = Date.parse("2026-11-05T08:50:00Z");
  const profils = new Map([
    [LOUIS, { id: LOUIS, username: "louis-seller", extension_last_seen_at: null, beta_flags: { delegation_leboncoin: { executant: AMIRAL, nom: "Amiral" } }, platform_settings: {} }],
    [AMIRAL, { id: AMIRAL, username: "Amiral", extension_last_seen_at: "2026-11-05T08:41:51Z", beta_flags: { execute_leboncoin_pour: [LOUIS] }, platform_settings: {} }],
  ]);
  const jobs = [
    { id: "retrait", user_id: LOUIS, status: "pending", action: "delete", platform: "leboncoin", created_at: "2026-11-03T14:36:00Z", error: "" },
    { id: "republication", user_id: LOUIS, status: "pending", action: "republish", platform: "leboncoin", created_at: "2026-11-03T20:00:00Z", error: "", platform_fields: { republish_step: "deleted", republish_source: "auto" } },
  ];
  const r = A.filesArretees({ jobs, profils, derniersDeparts: new Map(), maintenant });
  ok(r.arretees.length === 1 && r.arretees[0].executantNom === "Amiral" && r.arretees[0].n === 2 && /delete×1, republish×1/.test(r.arretees[0].actions),
    "retrait et republication déjà retirée de Louis : une ligne rouge, exécutée par Amiral", JSON.stringify(r.arretees));
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — la délégation Leboncoin va au bout : retrait, republication, relevé`);
process.exit(ko ? 1 : 0);
