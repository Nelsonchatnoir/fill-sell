// ═══════════════════════════════════════════════════════════════════════════
// PLUS AUCUN TEMPS ESTIMÉ DEVANT LA PERSONNE — garde (16/10/2026, Nico)
//   node scripts/aucune-estimation-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 15/10 : « ça fait fuir ». Ni durée, ni heure prévue, ni compte à
// rebours : dans l'app, l'extension, les messages du serveur et les mails.
// Ce test lit les SOURCES (pas la prod) et refuse toute ligne de texte
// destinée à la personne qui promet un délai : « dans ~5 min », « vers
// 17:36 », « toutes les heures », « Prochain passage dans 2 min », « Renvoyer
// dans 42 s », « Environ 3 min », « d'ici quelques minutes »…
//
// Ce qui est permis, et dit : un FAIT daté au passé (« depuis le 14/10 »,
// « il y a 12 min »), une date qu'une plateforme ou un contrat impose (fin
// d'essai, date de relance Stripe, restriction Vinted « jusqu'au 20/10 ») —
// ces lignes-là portent le marqueur `estimation-ok:` avec leur raison.
// Les journaux (console.*), les commentaires, les tests et les pages
// légales ou marketing du site ne sont pas des écrans d'attente : exclus.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIERS = ["src", "chrome-extension", "supabase/functions"];
const EXCLUS = [
  /node_modules/, /\.test\.js$/, /\.css$/, /\.json$/, /\.md$/, /\.png$/, /\.woff2?$/,
  /src\/pages\/Legal\.jsx$/, /src\/pages\/LandingPage\.jsx$/, /src\/pages\/BlogList\.jsx$/, /src\/pages\/BlogPost\.jsx$/, /src\/blog\//,
  /supabase\/functions\/ops-digest\//, /supabase\/functions\/veille-cpu\//, /supabase\/functions\/send-bug-report\//,
  /supabase\/functions\/_shared\/ops-/, /supabase\/functions\/abonnements-stores-audit\//,
  /chrome-extension\/etat-job\.js$/, // copie générée de _shared/etat-job.js (vérifiée par selftest:etat-job)
  /chrome-extension\/content-scripts\/opla\.js$/, // Opla quittée le 10/10 : script inerte
  /supabase\/functions\/_shared\/ventes-prouvees\.js$/, // rapport interne (support@)
];
// Les motifs d'une promesse de temps, dans une chaîne destinée à l'écran.
const MOTIFS = [
  /~\s*(\$\{[^}]*\}|\d+)\s*(-\s*\d+\s*)?(min|minutes?|h|heures?|s|secondes?)\b/,
  /\bvers (\$\{[^}]*\}|\d{1,2}\s*[:h]\s*\d{2})/,
  /\b(dans|d'ici|sous|avant|après|within|in) (environ |à peu près |moins d'|moins de |un |une |deux |trois |quelques |plusieurs |about |a few |~)?(\$\{[^}]*\}|\d+)?\s*(quarts? d'heure|demi-heure|minutes?|min|heures?|secondes?|seconds?|hours?|jours?|days?)\b(?![a-zé])/i,
  /\bdans (quelques|plusieurs|deux|trois) (minutes?|heures?|secondes?|jours?)\b/i,
  /\b(toutes|tous) les (heures|\d+ (minutes|min|heures|h))\b/i,
  /\bevery (hour|\d+ (minutes|min|hours))\b/i,
  /\bprochain(e)? (essai|passage|tentative|recr[ée]ation|sync\w*|v[ée]rification) (vers|dans|à|le|possible dans) /i,
  /\b(Renvoyer|Resend|Relancer|Relaunch|Réessaie|Retry|Try again) (dans|in) (\$\{[^}]*\}|\d+)/i,
  /\b(Environ|About|Moins d.une minute|Less than a minute|une dizaine de minutes|une minute\b|2 minutes au plus|deux minutes environ)/,
  /\b\d+ min au plus\b/i,
  /\ben quelques (secondes|minutes|heures)\b|\b(in|within) (a few )?(seconds|minutes)\b/i,
  /\bencore (\$\{[^}]*\}|\d+) ?j\b/,
  /T\.tempsRestant\(|secondes_restantes|retry_dans_s|prochaine_dans_min|dansCombien\(/,
];
// Une ligne de CODE qui n'est pas un texte d'écran.
// `raisonRequalif` est un journal interne (jamais montré), comme console.*.
const HORS_ECRAN = /^\s*(\/\/|\*|\/\*)|console\.(log|warn|error|info|debug)|raisonRequalif|^\s*#/;
const MARQUEUR = /estimation-ok:/;

const lister = (dossier) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx|ts|tsx|html)$/.test(e.name)) continue;
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      if (EXCLUS.some((re) => re.test(rel))) continue;
      out.push([rel, p]);
    }
  };
  walk(path.join(ROOT, dossier));
  return out;
};

const fautes = [];
let lignesLues = 0;
for (const dossier of DOSSIERS) {
  for (const [rel, abs] of lister(dossier)) {
    const lignes = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    let dansCommentaire = false;
    let dansJournal = false;
    lignes.forEach((ligne, i) => {
      lignesLues++;
      // Un console.log( ouvert sur plusieurs lignes : du journal jusqu'au « ); ».
      if (dansJournal) { if (/\);\s*$/.test(ligne)) dansJournal = false; return; }
      if (/console\.(log|warn|error|info|debug)\(\s*$/.test(ligne)) { dansJournal = true; return; }
      // Blocs de commentaires /* … */ sur plusieurs lignes.
      if (dansCommentaire) { if (/\*\//.test(ligne)) dansCommentaire = false; return; }
      if ((/^\s*\{?\/\*/.test(ligne) || /\{\/\*/.test(ligne)) && !/\*\//.test(ligne)) { dansCommentaire = true; return; }
      // Le marqueur se lit AVANT de retirer un commentaire de fin de ligne.
      if (HORS_ECRAN.test(ligne) || MARQUEUR.test(ligne)) return;
      ligne = ligne.replace(/(^|\s)\/\/(?!\/).*$/, "");
      // Seules les lignes qui portent une chaîne de caractères sont des textes d'écran.
      if (!/["'`]/.test(ligne)) return;
      const m = MOTIFS.find((re) => re.test(ligne));
      if (m) fautes.push(`${rel}:${i + 1}: ${ligne.trim().slice(0, 150)}`);
    });
  }
}

console.log(`${lignesLues} lignes lues dans ${DOSSIERS.join(", ")}`);
if (fautes.length) {
  console.error(`✗ ${fautes.length} texte(s) promettent encore un délai, une heure ou une durée :`);
  for (const f of fautes) console.error("  " + f);
  process.exit(1);
}
console.log("✓ aucune estimation de temps devant la personne (app, extension, serveur, mails)");
