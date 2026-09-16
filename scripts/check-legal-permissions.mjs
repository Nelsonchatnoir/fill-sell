#!/usr/bin/env node
// Garde-fou build : vérifie que le tableau des permissions de l'extension sur
// la page /legal (const `extensionPermissions` dans src/pages/Legal.jsx) reste
// aligné 1:1 avec ce que l'extension LIVRE RÉELLEMENT : les clés de
// chrome-extension/manifest.json (permissions + host_permissions), moins les
// hôtes de chantier.
//
// Objectif : au moment de soumettre l'extension au Chrome Web Store, la page de
// confidentialité doit justifier CHAQUE permission déclarée — ni oubli, ni
// entrée fantôme. Ce script casse le build si les deux listes divergent.
//
// ── HÔTES DE CHANTIER (2026-09-15) ──────────────────────────────────────────
// Le manifest SOURCE porte des hôtes qui ne partent PAS en production : ils
// servent au seul build unpacked d'un chantier à drapeau éteint (cas du 14/09,
// `https://www.opla.co/*`, que Nico charge depuis le dossier source). Les
// publier dans le tableau de fillsell.app/legal, c'est annoncer le chantier sur
// une page publique — hors de question tant qu'il n'est pas livré.
//
// Ces hôtes sont donc EXCLUS de ce contrôle. Mais « hôte de chantier » n'est PAS
// une seconde liste tenue ici : c'est exactement « hôte que
// scripts/package-extension.mjs REFUSE d'empaqueter ». Les deux gardes lisent le
// MÊME tableau — scripts/hotes-livrables-cws.mjs — via le MÊME prédicat, donc
// elles ne peuvent pas diverger. Le jour où un hôte est ajouté à l'allowlist
// pour être livré, il redevient du même geste exigible sur /legal.
//
// Le contrôle reste ENTIER partout ailleurs :
//   • toute permission d'API (storage, cookies, scripting…) reste exigée sur
//     /legal, sans exception possible — l'empaquetage ne les refuse jamais,
//     donc rien ne peut les exempter ;
//   • tout hôte réellement livrable absent de /legal casse toujours le build ;
//   • et un hôte de chantier PRÉSENT sur /legal casse le build aussi :
//     l'exemption ne devient jamais une porte d'entrée.
//
// Lancé automatiquement avant `vite build` (script `prebuild` de package.json),
// et manuellement via `npm run check:legal-permissions`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HOTES_LIVRABLES_CWS, HOTES_OPTIONNELS_CWS, estHoteDeChantier } from './hotes-livrables-cws.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'chrome-extension', 'manifest.json');
const LEGAL = path.join(ROOT, 'src', 'pages', 'Legal.jsx');

function fail(msg) {
  console.error('\n❌ check:legal-permissions — désynchronisation détectée\n');
  console.error(msg);
  console.error('\n→ Corrige la const `extensionPermissions` dans src/pages/Legal.jsx');
  console.error('  pour qu\'elle couvre exactement les clés LIVRÉES de');
  console.error('  chrome-extension/manifest.json (manifest moins les hôtes de chantier,');
  console.error('  cf. scripts/hotes-livrables-cws.mjs), puis relance le build.\n');
  process.exit(1);
}

// 0) Fail-closed sur la liste partagée : si elle était vidée (ou l'import
// cassé), TOUS les hôtes passeraient pour du chantier et ce script ne
// vérifierait plus rien en se déclarant vert. On refuse ce cas.
if (!Array.isArray(HOTES_LIVRABLES_CWS) || HOTES_LIVRABLES_CWS.length === 0) {
  fail(
    'L\'allowlist HOTES_LIVRABLES_CWS (scripts/hotes-livrables-cws.mjs) est vide ou illisible :\n' +
    'sans elle, ce contrôle n\'exigerait plus aucun hôte sur /legal. Build refusé.'
  );
}

// 1) Clés déclarées dans le manifest.
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  fail(`Impossible de lire/parser ${path.relative(ROOT, MANIFEST)} : ${e.message}`);
}
// optional_host_permissions inclus (2026-09-16) : un hôte OPTIONNEL part dans
// le paquet et le Web Store le lit — il se justifie sur /legal comme un hôte
// obligatoire. Seule différence, dite dans sa ligne : accordé à la demande,
// par un clic de la personne, jamais à l'installation ni à la mise à jour.
const manifestKeys = [
  ...(manifest.permissions || []),
  ...(manifest.host_permissions || []),
  ...(manifest.optional_host_permissions || []),
];
if (manifestKeys.length === 0) {
  fail('Aucune permission trouvée dans le manifest — vérifie le fichier manifest.json.');
}
if (!Array.isArray(HOTES_OPTIONNELS_CWS)) {
  fail('HOTES_OPTIONNELS_CWS (scripts/hotes-livrables-cws.mjs) est illisible. Build refusé.');
}

// 1bis) Partition : ce que l'extension LIVRE (exigible sur /legal) vs ce qui est
// de CHANTIER (interdit sur /legal). L'exemption ne porte QUE sur des motifs
// d'hôtes : une permission d'API n'est jamais exemptée, parce que l'empaquetage
// ne la refuse jamais — le prédicat est le même des deux côtés.
const hotesDeChantier = [
  ...(manifest.host_permissions || []),
  ...(manifest.optional_host_permissions || []),
].filter(estHoteDeChantier);
const chantierSet = new Set(hotesDeChantier);
const manifestKeysLivrees = manifestKeys.filter((k) => !chantierSet.has(k));

// 2) Clés listées dans la const extensionPermissions de Legal.jsx.
const legalSrc = readFileSync(LEGAL, 'utf8');
const blockMatch = legalSrc.match(/const extensionPermissions = \[([\s\S]*?)\n\];/);
if (!blockMatch) {
  fail(
    "Bloc `const extensionPermissions = [ ... ];` introuvable dans src/pages/Legal.jsx.\n" +
    'Le format a peut-être changé : adapte ce script (scripts/check-legal-permissions.mjs).'
  );
}
const legalKeys = [...blockMatch[1].matchAll(/key:\s*(['"])(.*?)\1/g)].map((m) => m[2]);
if (legalKeys.length === 0) {
  fail("Aucune entrée `key: '...'` trouvée dans la const extensionPermissions.");
}

// 3) Comparaison bidirectionnelle, sur les clés LIVRÉES.
const livreesSet = new Set(manifestKeysLivrees);
const legalSet = new Set(legalKeys);

const missingInLegal = manifestKeysLivrees.filter((k) => !legalSet.has(k)); // livré, absent du tableau
const extraInLegal = legalKeys.filter((k) => !livreesSet.has(k) && !chantierSet.has(k)); // dans le tableau, inconnu du manifest

// Un hôte de chantier listé sur /legal : l'exemption dispense de le justifier,
// elle n'autorise pas à le publier. Le build casse aussi dans ce sens-là.
const chantierInLegal = legalKeys.filter((k) => chantierSet.has(k));

// Doublons éventuels dans le tableau (source de faux positifs / oublis).
const dupes = legalKeys.filter((k, i) => legalKeys.indexOf(k) !== i);

if (missingInLegal.length || extraInLegal.length || chantierInLegal.length || dupes.length) {
  const parts = [];
  if (missingInLegal.length) {
    parts.push(
      `Clé(s) LIVRÉE(S) du manifest ABSENTE(S) du tableau /legal :\n  - ${missingInLegal.join('\n  - ')}`
    );
  }
  if (extraInLegal.length) {
    parts.push(
      `Entrée(s) du tableau /legal sans clé correspondante dans le manifest :\n  - ${extraInLegal.join('\n  - ')}`
    );
  }
  if (chantierInLegal.length) {
    parts.push(
      `HÔTE DE CHANTIER publié sur la page légale — à RETIRER de Legal.jsx :\n  - ${chantierInLegal.join('\n  - ')}\n\n` +
      '  Ces hôtes sont refusés à l\'empaquetage (scripts/hotes-livrables-cws.mjs) :\n' +
      '  ils ne partent pas en production, donc ils n\'ont rien à faire sur une page\n' +
      '  publique. Pour en livrer un pour de vrai, ajoute-le à HOTES_LIVRABLES_CWS\n' +
      '  dans le MÊME commit — il redeviendra alors exigible ici.'
    );
  }
  if (dupes.length) {
    parts.push(`Doublon(s) dans le tableau /legal :\n  - ${[...new Set(dupes)].join('\n  - ')}`);
  }
  fail(parts.join('\n\n'));
}

console.log(
  `✅ check:legal-permissions — ${manifestKeysLivrees.length} clés livrées du manifest alignées 1:1 avec le tableau /legal.`
);
if (hotesDeChantier.length) {
  // Jamais silencieux : l'exemption se lit dans le log de build.
  console.log(
    `   ↳ ${hotesDeChantier.length} hôte(s) de chantier exclu(s) du contrôle — refusés à\n` +
    `     l'empaquetage, donc non livrés et volontairement absents de /legal :\n` +
    `     ${hotesDeChantier.join(', ')}`
  );
}
