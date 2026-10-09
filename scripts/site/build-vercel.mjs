#!/usr/bin/env node
// `npm run build:vercel` — LA commande de build de Vercel (vercel.json,
// `buildCommand`), 09/10/2026.
//
// Pose FILLSELL_SITE=1 puis lance `npm run build` : passer par le script npm
// garde le hook `prebuild` (check-legal-permissions) et la garde d'arbre propre
// de vite.config.js. L'interrupteur est ainsi EXPLICITE et versionné dans le
// même commit que les rewrites de vercel.json qui en dépendent (revue A B1) —
// le générateur ne lit plus la variable VERCEL.
//
// Nommée « build:vercel » et non « build:web » (revue de la fondation, app
// § 7) : la procédure des binaires parle de « build web, cap sync » pour
// `npm run build` (scripts/binaires-2.9.62.mjs) ; un agent qui aurait lancé
// build:web pour le natif aurait buté sur la garde de dist/ sans comprendre.
// Ce script ne sert QUE Vercel : en local, `npm run site:apercu`.
import { spawnSync } from 'node:child_process';

const env = { ...process.env, FILLSELL_SITE: '1' };
const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
if (r.error) {
  console.error(`[build:vercel] npm run build n'a pas pu partir : ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
