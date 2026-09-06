// Auto-test « attente de boutique Vinted » (06/09/2026 soir, cas claeys59450).
//
// Trois garanties :
//
//   1. MIROIR SERVEUR/APP. La garde de get-pending-jobs et le calcul de l'app
//      doivent couvrir le MÊME périmètre. On relit la fonction Edge et on
//      vérifie qu'elle nomme bien republish ET delete sur vinted — le jour où
//      quelqu'un rétrécit l'un des deux, ce test tombe. (Deno ne peut pas
//      importer src/, la duplication est inévitable ; la dérive ne l'est pas.)
//   2. LE CAS FONDATEUR. Un retrait d'annonce (action='delete') qui vise une
//      boutique non connectée DOIT ressortir comme une attente. C'est
//      exactement le job 33247fd2 du 06/09 : il ne ressortait de RIEN, ni du
//      marqueur attente_boutique (posé à la seule étape 'a_capturer' des
//      republications), ni du miroir pauseBoutique (republish seul).
//   3. LES DEUX FAIL-OPEN, et le refus absolu d'afficher un identifiant
//      numérique à la place d'un nom de boutique.
//
//   node scripts/attente-boutique-selftest.mjs
//
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

const {
  ACTIONS_LIEES_A_UNE_BOUTIQUE, etatAttenteBoutique, lignesAttenteBoutique,
  phraseBoutiqueActive, messageFicheAttenteBoutique, nomBoutique,
} = await import(pathToFileURL(join(ROOT, "src/utils/attenteBoutique.js")).href);

// ── 1. Miroir serveur ────────────────────────────────────────────────────────
console.log("1. Périmètre serveur == périmètre app :");
const srv = lire("supabase/functions/get-pending-jobs/index.ts");
const garde = srv.match(/const boutiqueConcernee = [\s\S]{0,400}?;\n/);
check("get-pending-jobs porte bien un prédicat boutiqueConcernee", Boolean(garde));
if (garde) {
  const g = garde[0];
  for (const action of ACTIONS_LIEES_A_UNE_BOUTIQUE) {
    check(`la garde serveur couvre l'action « ${action} »`, g.includes(`"${action}"`), `\n      ${g.trim()}`);
  }
  check("la garde serveur ne couvre PAS « publish » (annonce neuve)", !/"publish"/.test(g));
  check("la garde serveur est bornée à vinted", g.includes('"vinted"'));
}

// ── Décor commun : deux boutiques, Chrome sur la SECONDE ─────────────────────
const BOUTIQUES = [
  { user_id: "3134424277", login: "patrick-boutique" },
  { user_id: "22484600", login: "patrick-vintage" },
];
const CONNECTEE = { userId: "22484600", login: "patrick-vintage" };
const ORIGINES = new Map([
  ["art-A", "3134424277"],   // le débardeur — boutique NON connectée
  ["art-B", "22484600"],     // un article de la boutique connectée
  ["art-N", ""],             // jamais estampillé (fail-open n°2)
]);

// ── 2. Le cas fondateur : le RETRAIT compte ──────────────────────────────────
console.log("\n2. Cas fondateur — le retrait d'annonce du 06/09 19:09 :");
const jobsPatrick = [
  { action: "delete", platform: "vinted", status: "pending", inventaire_id: "art-A" },
  { action: "republish", platform: "vinted", status: "pending", inventaire_id: "art-A" },
];
const etatP = etatAttenteBoutique({ jobs: jobsPatrick, origines: ORIGINES, connectee: CONNECTEE, boutiques: BOUTIQUES });
check("une attente est bien détectée", Boolean(etatP));
check("le retrait est compté", etatP?.suppression === 1, `(suppression=${etatP?.suppression})`);
check("la republication est comptée", etatP?.republish === 1, `(republish=${etatP?.republish})`);
check("total = 2", etatP?.total === 2, `(total=${etatP?.total})`);
check("la boutique attendue est nommée @patrick-boutique",
  etatP?.boutiques?.[0]?.nom === "@patrick-boutique", `(${etatP?.boutiques?.[0]?.nom})`);

const enTete = phraseBoutiqueActive(etatP);
check("la phrase d'ancrage nomme la boutique ACTIVE",
  enTete === "Tu es actuellement sur la boutique @patrick-vintage.", `\n      « ${enTete} »`);
const lignes = lignesAttenteBoutique(etatP);
check("une ligne par boutique attendue", lignes.length === 1, `(${lignes.length})`);
check("la ligne nomme l'autre boutique et les deux natures de job",
  lignes[0]?.includes("@patrick-boutique") && lignes[0]?.includes("1 republication") && lignes[0]?.includes("1 retrait d'annonce"),
  `\n      « ${lignes[0]} »`);
check("la ligne promet une reprise automatique",
  /reprendront? automatiquement/.test(lignes[0] ?? ""), `\n      « ${lignes[0]} »`);
check("aucun vocabulaire d'échec dans le message",
  !/échec|erreur|impossible|annul/i.test(`${enTete} ${lignes.join(" ")}`));

// Un delete SEUL : le cas exact du job 33247fd2, sans sa republication.
const etatSeul = etatAttenteBoutique({
  jobs: [{ action: "delete", platform: "vinted", status: "pending", inventaire_id: "art-A" }],
  origines: ORIGINES, connectee: CONNECTEE, boutiques: BOUTIQUES,
});
check("un retrait SEUL suffit à produire une attente", etatSeul?.total === 1);
check("le libellé dit « retrait d'annonce », pas « republication »",
  lignesAttenteBoutique(etatSeul)[0]?.includes("1 retrait d'annonce")
  && !lignesAttenteBoutique(etatSeul)[0]?.includes("republication"),
  `\n      « ${lignesAttenteBoutique(etatSeul)[0]} »`);

// ── 3. Fail-open, hors périmètre, et jamais d'identifiant à l'écran ──────────
console.log("\n3. Fail-open, périmètre et libellés :");
const base = { origines: ORIGINES, connectee: CONNECTEE, boutiques: BOUTIQUES };
const nul = (jobs, opts = {}) => etatAttenteBoutique({ ...base, ...opts, jobs });

check("identité non relevée → RIEN (fail-open n°1)",
  nul([{ action: "delete", platform: "vinted", status: "pending", inventaire_id: "art-A" }], { connectee: null }) === null);
check("article jamais estampillé → RIEN (fail-open n°2)",
  nul([{ action: "delete", platform: "vinted", status: "pending", inventaire_id: "art-N" }]) === null);
check("article de la boutique CONNECTÉE → RIEN",
  nul([{ action: "republish", platform: "vinted", status: "pending", inventaire_id: "art-B" }]) === null);
check("une PUBLICATION n'entre jamais (annonce neuve)",
  nul([{ action: "publish", platform: "vinted", status: "pending", inventaire_id: "art-A" }]) === null);
check("une autre plateforme n'entre jamais",
  nul([{ action: "delete", platform: "leboncoin", status: "pending", inventaire_id: "art-A" }]) === null);
check("un job terminé n'entre jamais",
  nul([{ action: "delete", platform: "vinted", status: "deleted", inventaire_id: "art-A" }]) === null);
check("un job sans inventaire_id n'entre jamais (delete orphelin)",
  nul([{ action: "delete", platform: "vinted", status: "pending", inventaire_id: null }]) === null);

// ⛔ JAMAIS un identifiant numérique à l'écran (règle Nico).
const sansPseudo = [{ user_id: "3134424277", login: null }];
check("pseudo inconnu → libellé humain, JAMAIS l'identifiant",
  nomBoutique("3134424277", sansPseudo) === "une autre de tes boutiques",
  `(${nomBoutique("3134424277", sansPseudo)})`);
const etatAnonyme = etatAttenteBoutique({
  jobs: [{ action: "republish", platform: "vinted", status: "pending", inventaire_id: "art-A" }],
  origines: ORIGINES, connectee: CONNECTEE, boutiques: sansPseudo,
});
check("aucun identifiant numérique dans la ligne rendue",
  !/\d{6,}/.test(lignesAttenteBoutique(etatAnonyme).join(" ")),
  `\n      « ${lignesAttenteBoutique(etatAnonyme)[0]} »`);

// ── 4. Le message de la FICHE ────────────────────────────────────────────────
console.log("\n4. Message sur la fiche d'un article :");
const fiche = messageFicheAttenteBoutique({
  connectee: CONNECTEE, origine: "3134424277", boutiques: BOUTIQUES, action: "delete",
});
check("la fiche rend un message", Boolean(fiche));
check("il nomme la boutique ACTIVE et la boutique ATTENDUE",
  fiche?.detail.includes("@patrick-vintage") && fiche?.detail.includes("@patrick-boutique"),
  `\n      « ${fiche?.detail} »`);
check("il dit « retrait » pour un delete", fiche?.detail.startsWith("Tu es actuellement") && fiche?.detail.includes("Ce retrait"));
check("il rassure explicitement", /Rien n'est perdu/.test(fiche?.detail ?? ""));
check("pastille courte non muette", fiche?.court === "Attend @patrick-boutique", `(${fiche?.court})`);
check("même boutique → aucun message",
  messageFicheAttenteBoutique({ connectee: CONNECTEE, origine: "22484600", boutiques: BOUTIQUES }) === null);
check("origine inconnue → aucun message",
  messageFicheAttenteBoutique({ connectee: CONNECTEE, origine: "", boutiques: BOUTIQUES }) === null);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
