// selftest:cloud-apres-formule — (08/11/2026, points 0, 1 et 2 de Nico) « FORMULE + FILLSELL CLOUD » EN DEUX ACHATS NOMMÉS.
//   Constat du 08/11 14:23 (Nicotest, TestFlight) : « Passer Pro + FillSell Cloud » n'achetait que Pro, sur les 3 canaux.
//   1. L'intention (Cloud coché) est gardée une heure, effacée dès qu'une formule part sans elle ou que l'étape 2 est dite.
//   2. L'issue de l'étape 2 est TOUJOURS dite : ajouté, paiement reçu, ou « n'a pas été ajouté — ta formule reste active ».
//   3. Le câblage : la carte n'achète que sa formule ; la fenêtre « Bienvenue » montre la grille à 3 jauges du palier (lue
//      dans coin_config, CorpsCarteGrille) et l'étape 2 ; le web la rouvre au retour de Stripe.
//   npm run selftest:cloud-apres-formule
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  garderCloudEnsuite, lireCloudEnsuite, effacerCloudEnsuite, issueCloudEnsuite, textesCloudEnsuite, CLE_CLOUD_ENSUITE, DUREE_CLOUD_ENSUITE_MS,
} from '../src/cloud/cloudEnsuite.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const memoire = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

// ── 1. L'intention ──────────────────────────────────────────────────────────
const T0 = Date.parse('2026-11-08T14:00:00Z');
{
  const s = memoire();
  ok(garderCloudEnsuite({ tier: 'pro', origine: 'entete_offres' }, s, T0) === true && s.m.has(CLE_CLOUD_ENSUITE), 'intention gardée (Pro)');
  ok(JSON.stringify(lireCloudEnsuite(s, T0 + 5 * 60_000)) === '{"tier":"pro","origine":"entete_offres"}', 'relue dans l’heure');
  ok(lireCloudEnsuite(s, T0 + DUREE_CLOUD_ENSUITE_MS + 1) === null, 'plus d’une heure : oubliée');
  effacerCloudEnsuite(s);
  ok(lireCloudEnsuite(s, T0) === null && !s.m.has(CLE_CLOUD_ENSUITE), 'effacée');
  ok(garderCloudEnsuite({ tier: 'gratuit' }, s, T0) === false && garderCloudEnsuite({ tier: 'cloud' }, s, T0) === false, 'jamais pour Free ni un produit inconnu');
  s.setItem(CLE_CLOUD_ENSUITE, '{pas du json');
  ok(lireCloudEnsuite(s, T0) === null, 'illisible : rien');
  const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); }, removeItem() { throw new Error('bloqué'); } };
  ok(garderCloudEnsuite({ tier: 'pro' }, casse, T0) === false && lireCloudEnsuite(casse, T0) === null, 'stockage bloqué : jamais d’exception');
  effacerCloudEnsuite(casse);
}

// ── 2. L'issue de l'étape 2 ─────────────────────────────────────────────────
for (const lang of ['fr', 'en']) {
  const reste = lang === 'en' ? /Your Pro plan stays active/ : /Ta formule Pro reste active/;
  const actif = issueCloudEnsuite({ etat: 'actif' }, 'pro', lang);
  ok(actif.cle === 'actif' && (lang === 'en' ? /FillSell Cloud is added/ : /FillSell Cloud est ajouté/).test(actif.titre) && actif.cta, `${lang} : achat confirmé par le serveur → « ajouté » + Connecter mes plateformes`);
  const attente = issueCloudEnsuite({ etat: 'attente', message: lang === 'en' ? 'Payment received: your Cloud starts in a moment.' : 'Paiement reçu : ton Cloud démarre dans un instant.' }, 'pro', lang);
  ok(attente.cle === 'attente' && (lang === 'en' ? /Your Pro plan is active/ : /Ta formule Pro est active/).test(attente.texte), `${lang} : paiement reçu, serveur pas encore à jour → dit tel quel`);
  const annule = issueCloudEnsuite({ etat: 'annule' }, 'pro', lang);
  ok(annule.cle === 'annule' && (lang === 'en' ? /was not added/ : /n'a pas été ajouté/).test(annule.titre) && reste.test(annule.texte), `${lang} : 2e feuille fermée → « pas ajouté », la formule reste active`);
  const complet = issueCloudEnsuite({ etat: 'refuse', raison: 'complet', message: 'Toutes les places…' }, 'pro', lang);
  ok(complet.cle === 'echec' && reste.test(complet.texte) && /Toutes les places/.test(complet.texte), `${lang} : complet → la raison, puis la formule reste active`);
  const liste = issueCloudEnsuite({ etat: 'attente', raison: 'complet', attente: { rang: 2 }, message: 'Inscrit' }, 'pro', lang);
  ok(liste.cle === 'echec', `${lang} : inscrit en liste d’attente ≠ paiement reçu (le Cloud n’est pas ajouté)`);
  ok(issueCloudEnsuite({ etat: 'erreur' }, 'business', lang).cle === 'echec' && issueCloudEnsuite({}, 'premium', lang).cle === 'echec', `${lang} : erreur ou réponse vide → « pas ajouté »`);
  ok(issueCloudEnsuite({ etat: 'redirige' }, 'pro', lang) === null, `${lang} : Stripe (la page part) → rien à dire ici`);
  for (const k of ['annule', 'echec']) {
    const t = issueCloudEnsuite({ etat: k === 'annule' ? 'annule' : 'erreur' }, 'pro', lang);
    ok(!/est ajouté|is added/.test(t.texte) && !/est ajouté|is added/.test(t.titre), `${lang} : ${k} ne dit jamais « ajouté »`);
  }
  const TE = textesCloudEnsuite(lang);
  ok((lang === 'en' ? /Step 2 of 2/ : /Étape 2 sur 2/).test(TE.etapeTitre) && (lang === 'en' ? /separate purchase/ : /achat à part/).test(TE.etapeTexte('Pro', '24,99 €')), `${lang} : l’étape 2 dit que le Cloud est un achat à part`);
}

// ── 3. Le câblage ───────────────────────────────────────────────────────────
const app = lire('src/App.jsx');
const modale = lire('src/components/ConversionModal.jsx');
ok(!/formulePuisCloud|garderDemande\('apres_formule'\)/.test(app), 'App : plus de « formule puis feuille rouverte en silence »');
ok(/if\(opts\?\.cloudEnsuite===true&&cloudOffreVendable\(user\?\.id\)\)garderCloudEnsuite\(\{tier,origine:[^)]*\}\);\s*else effacerCloudEnsuite\(\);\s*startTierCheckout\(tier,/.test(app),
  'App : la carte lance SA formule ; l’intention est gardée (Cloud coché) ou effacée');
ok(/async function lancerCloudEnsuite\(tier\)\{\s*effacerCloudEnsuite\(\);/.test(app) && /achatCloud\.acheter\('apres_formule'\)/.test(app) && /setResultatCloudEnsuite\(issue\)/.test(app),
  'App : l’étape 2 efface l’intention, lance l’achat du Cloud, et dit son issue');
ok(/<ResultatCloudEnsuite issue=\{resultatCloudEnsuite\}/.test(app) && /onConnecter=\{\(\)=>\{setResultatCloudEnsuite\(null\);ouvrirMeConnecter\('apres_formule'\);\}\}/.test(app), 'App : la fenêtre d’issue est montée (Connecter mes plateformes si ajouté)');
ok(/etapeCloud=\{Boolean\(achatCloud&&cloudOffreVendable\(user\?\.id\)&&lireCloudEnsuite\(\)\)\}/.test(app) && /onClose=\{\(\)=>\{effacerCloudEnsuite\(\);setShowPremiumWelcome\(false\);\}\}/.test(app),
  'App : « Bienvenue » propose l’étape 2 seulement si le Cloud avait été coché ; la fermer oublie l’intention');
ok(/if\(isNative\|\|!user\?\.id\)return;\s*const i=lireCloudEnsuite\(\);\s*if\(i&&aAuMoins\(palier,i\.tier\)\)setShowPremiumWelcome\(true\);/.test(app), 'Web : au retour de Stripe, la même fenêtre (grille + étape 2)');
// La fenêtre « Bienvenue » : la grille à 3 jauges du palier, lue dans coin_config (point 2).
const bienvenue = app.slice(app.indexOf('function PremiumWelcomeModal('), app.indexOf('// ── FAB vocal flottant'));
ok(/supabase\.from\('coin_config'\)\.select\('key, value'\)/.test(bienvenue) && /grilleActiveConfig\(config\)/.test(bienvenue), 'Bienvenue : coin_config lu (même source que les quotas), grille testée');
ok(/<CorpsCarteGrille fr=\{fr\} palier=\{suffixe\} K=\{K\} margeBas=\{0\} \/>/.test(bienvenue), 'Bienvenue : avec la grille, le corps des cartes (annonces, publications, remontées, Lens, retouches)');
ok(/data-bienvenue-attente/.test(bienvenue) && !/const K = COIN_CONFIG_FALLBACK;/.test(bienvenue), 'Bienvenue : aucun chiffre avant la lecture ; plus de repli figé comme source');
ok(/data-bienvenue-etape-cloud/.test(bienvenue) && /TE\.etapeCta/.test(bienvenue) && /TE\.etapePlusTard/.test(bienvenue), 'Bienvenue : étape 2 « Ajouter FillSell Cloud » / « Plus tard »');
// La feuille des offres : jamais le Cloud dans l'achat d'une formule.
ok(/<PremiumPlanCard fr=\{fr\} K=\{K\} onUpgrade=\{onUpgrade\} cloud=\{null\} \/>/.test(modale) && /<ProPlanCard fr=\{fr\} K=\{K\} onUpgrade=\{onUpgrade\} cloud=\{null\} \/>/.test(modale), 'Feuille : cartes payantes sans « + FillSell Cloud »');
ok(/if \(voieFree && avecCloud\) onUpgrade\(tier, \{ cloudEnsuite: true \}\);\s*else onUpgrade\(tier\);/.test(modale), 'Feuille : Cloud coché → étape 2 APRÈS, jamais dans le même achat');
const textes = lire('src/cloud/textes.js');
ok(!/S'ajoute à la formule que tu choisis/.test(textes) && !/Adds to the plan you pick below/.test(textes), 'Interrupteur : plus jamais « s’ajoute à la formule que tu choisis ci-dessous »');

console.log(`✓ selftest:cloud-apres-formule — ${n} assertions`);
