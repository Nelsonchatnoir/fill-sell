// ── Patch du capacitor.config.json iOS généré par `npx cap sync ios` ────────
//
// POURQUOI CE SCRIPT REMPLACE UN ÉCRASEMENT (2026-09-16).
// codemagic.yaml RÉÉCRIVAIT ce fichier en entier, avec un contenu figé dans le
// YAML. Conséquence mesurée aujourd'hui : capacitor.config.ts n'atteignait PAS
// le binaire iOS. Le bloc figé avait dérivé — backgroundColor #1D9E75 alors
// que la source dit #10201B depuis le 26/07, et launchAutoHide,
// launchFadeOutDuration, androidScaleType simplement absents. Le splash iOS
// livré ne ressemblait donc pas à celui du design system, et personne ne
// pouvait le voir en relisant les sources.
//
// Désormais : le fichier GÉNÉRÉ fait foi (donc capacitor.config.ts fait foi),
// et on n'y ajoute que ce que `cap sync` ne peut pas savoir.
//
// CE QU'IL FAUT AJOUTER, ET POURQUOI :
//   · AppleSignInPlugin — plugin natif maison (ios/App/App/AppleSignInPlugin.swift).
//     Aucun paquet npm ne le déclare, cap sync l'ignore. Sans lui, « Continuer
//     avec Apple » est un bouton mort dans le binaire, et le constat n'arrive
//     qu'au TestFlight.
//   · CameraPlugin — alias historique conservé aux côtés de CAPCameraPlugin,
//     présent dans l'ancienne liste figée. On ne le retire pas dans le même
//     lot que le passage au fichier généré : un doublon inoffensif vaut mieux
//     qu'un appareil photo muet à démontrer.
//
// Échoue BRUYAMMENT si le fichier n'existe pas : mieux vaut un build rouge
// qu'un binaire où Sign in with Apple ne répond pas.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CIBLE = 'ios/App/App/capacitor.config.json';
const CLASSES_REQUISES = ['AppleSignInPlugin', 'CameraPlugin'];
// Plugins sans lesquels le binaire est cassé de façon invisible au build.
// La vérification vit ici plutôt que dans un grep du YAML : elle porte sur le
// fichier réellement embarqué, après patch.
const CLASSES_CRITIQUES = ['CapacitorUpdaterPlugin', 'NativePurchasesPlugin', 'AppleSignInPlugin'];

if (!existsSync(CIBLE)) {
  console.error(`ERREUR : ${CIBLE} introuvable — \`npx cap sync ios\` n'a pas tourné ?`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(CIBLE, 'utf8'));
config.packageClassList = [...new Set([...(config.packageClassList ?? []), ...CLASSES_REQUISES])];

const manquants = CLASSES_CRITIQUES.filter((c) => !config.packageClassList.includes(c));
if (manquants.length) {
  console.error(`ERREUR : ${manquants.join(', ')} absent(s) de packageClassList — plugin non embarqué dans le binaire iOS`);
  process.exit(1);
}

writeFileSync(CIBLE, `${JSON.stringify(config, null, 2)}\n`);
console.log(`${CIBLE} patché — packageClassList : ${config.packageClassList.join(', ')}`);
console.log(readFileSync(CIBLE, 'utf8'));
