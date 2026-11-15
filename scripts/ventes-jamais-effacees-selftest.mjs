// VERROU (15/11/2026, complément du lot (2) de Nico, point 4) — UNE VENTE N'EST JAMAIS EFFACÉE SANS QUE LA PERSONNE L'AIT
// CHOISI, ET TOUTE SUPPRESSION EST TRACÉE.
//
// Cas : noubliejamais (Ludovic, Pro) : « je ne vois plus que mes ventes de novembre ». 1 732 ventes effacées le 13/11 à
// 19:14 (plus 7 et 12 le 14/11) par « Réinitialiser mon inventaire » (Réglages › Mon compte), qui appelait
// supprimer_mon_stock_sans_retrait() → `delete from ventes where user_id = auth.uid()`. Six comptes, 4 685 ventes, aucun
// geste tracé ; le relevé ne les ramenait plus (ventes_supprimees). Rapport docs/enquetes/lot-1511-3-ventes-effacees.
//
// Ce verrou casse si :
//   1. un chemin de code (app, extension, fonctions edge) efface des ventes hors de la liste FERMÉE ci-dessous, où chaque
//      chemin est un geste explicite de la personne (ou la suppression de son compte) ;
//   2. une fonction SQL des migrations efface des ventes hors de la liste FERMÉE des fonctions du serveur (fusion du relevé,
//      éclatement d'un lot, annulation prouvée par la plateforme, réinitialisation sur case cochée) ;
//   3. « Réinitialiser mon inventaire » peut effacer des ventes sans p_avec_ventes (par défaut faux), ou l'app appelle la
//      RPC sans p_avec_ventes, ou la case n'est pas décochée à chaque ouverture, ou le texte promet d'effacer les ventes ;
//   4. une suppression de vente n'est plus journalisée (ligne entière, rôle, motif, requête) ou la pierre tombale perd son
//      motif ;
//   5. la preuve sur base jetable (scripts/ventes/preuve-ventes-jamais-effacees.mjs) n'est plus inscrite.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = process.env.VERROU_RACINE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

function fichiers(dossier, ext) {
  const out = [];
  const pile = [path.join(racine, dossier)];
  while (pile.length) {
    const d = pile.pop();
    let entrees = [];
    try { entrees = readdirSync(d); } catch { continue; }
    for (const e of entrees) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const p = path.join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) pile.push(p);
      else if (ext.test(e)) out.push(path.relative(racine, p).replace(/\\/g, '/'));
    }
  }
  return out;
}

console.log('1. Les chemins de code qui effacent des ventes : une liste FERMÉE de gestes explicites');
// Chaque entrée : le fichier, le motif de la requête, pourquoi c'est un geste explicite.
const PERMIS = [
  { fichier: 'src/App.jsx', motif: /from\('ventes'\)\.delete\(\)\s*\n\s*\.eq\('inventaire_id',item\.id\)\.eq\('user_id',user\.id\)/, pourquoi: '« Supprimer l\'article ET sa vente » (modale à deux choix, executerSuppression alsoDeleteSale)' },
  { fichier: 'src/App.jsx', motif: /from\('ventes'\)\.delete\(\)\.eq\('id',deleteConfirm\.sale\.id\)/, pourquoi: '« Supprimer cette vente » (confirmation, deleteConfirm type sale)' },
  { fichier: 'supabase/functions/delete-account/index.ts', motif: /from\('ventes'\)\.delete\(\)\.eq\('user_id', userId\)/, pourquoi: 'suppression du compte (deux confirmations)' },
];
const sources = [...fichiers('src', /\.(js|jsx|ts|mjs)$/), ...fichiers('chrome-extension', /\.(js|mjs)$/), ...fichiers('supabase/functions', /\.(ts|js)$/)];
const trouves = [];
for (const f of sources) {
  const s = lire(f);
  for (const m of s.matchAll(/from\(\s*['"]ventes['"]\s*\)\s*\.delete\(|delete\s+from\s+(?:public\.)?ventes\b/gi)) {
    const ligne = s.slice(0, m.index).split('\n').length;
    const debutLigne = s.lastIndexOf('\n', m.index) + 1;
    if (/^\s*(\/\/|\*|--)/.test(s.slice(debutLigne, m.index))) continue;   // un commentaire
    trouves.push({ f, ligne, contexte: s.slice(m.index, m.index + 220) });
  }
}
for (const p of PERMIS) ok(p.motif.test(lire(p.fichier)), `permis et présent : ${p.fichier} — ${p.pourquoi}`);
const horsListe = trouves.filter((t) => !PERMIS.some((p) => p.fichier === t.f && p.motif.test(t.contexte)));
ok(trouves.length === PERMIS.length && horsListe.length === 0,
  `aucun autre chemin n'efface des ventes (${trouves.length} trouvé(s)) ${horsListe.map((t) => `${t.f}:${t.ligne}`).join(' ')}`);

console.log('2. Les fonctions SQL qui effacent des ventes : une liste FERMÉE');
const FONCTIONS_PERMISES = {
  supprimer_mon_stock_sans_retrait: 'réinitialisation — seulement sur la case « Supprimer aussi mes ventes » (p_avec_ventes)',
  enregistrer_ventes_relevees: 'fusion d\'une vente saisie dans la vente relevée de la même commande (aucune vente perdue)',
  vente_vinted_lot_eclater: 'éclatement d\'une commande en lot en ses articles (la commande devient ses parts)',
  vente_commande_annulee: 'commande eBay annulée ou remboursée, prouvée par la plateforme',
  vente_commande_annulee_vinted: 'commande Vinted annulée, prouvée par la plateforme',
  vente_commande_annulee_beebs: 'commande Beebs annulée, prouvée par la plateforme',
  vente_transaction_annulee_leboncoin: 'transaction Leboncoin annulée, prouvée par la plateforme',
};
const noms = new Set();
for (const f of fichiers('supabase/migrations', /\.sql$/)) {
  const s = lire(f);
  for (const m of s.matchAll(/delete\s+from\s+(?:public\.)?ventes\b/gi)) {
    const avant = s.slice(0, m.index);
    if (/--[^\n]*$/.test(avant)) continue;
    const fns = [...avant.matchAll(/function\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi)];
    noms.add(fns.length ? fns[fns.length - 1][1] : '(hors fonction)');
  }
}
const inconnues = [...noms].filter((x) => !Object.hasOwn(FONCTIONS_PERMISES, x));
ok(inconnues.length === 0, `toute fonction qui efface des ventes est dans la liste (${noms.size} : ${[...noms].join(', ')})${inconnues.length ? ` — HORS LISTE : ${inconnues.join(', ')}` : ''}`);

console.log('3. « Réinitialiser mon inventaire » garde les ventes, sauf case cochée');
const mig = lire('supabase/migrations/20261115140000_ventes_jamais_effacees_sans_le_vouloir.sql');
const corps = mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.supprimer_mon_stock_sans_retrait(p_avec_ventes boolean DEFAULT false)'));
ok(/supprimer_mon_stock_sans_retrait\(p_avec_ventes boolean DEFAULT false\)/.test(mig), 'p_avec_ventes, faux par défaut (une app d\'avant garde les ventes)');
ok(/if p_avec_ventes is true then[\s\S]{0,200}delete from public\.ventes where user_id = auth\.uid\(\);[\s\S]{0,120}else\s+update public\.ventes set inventaire_id = null/.test(corps),
  'le DELETE des ventes n\'existe QUE sous p_avec_ventes ; sinon les ventes sont détachées');
ok((corps.match(/delete from public\.ventes/g) ?? []).length === 1, 'un seul DELETE de ventes dans la fonction');
ok(/insert into public\.usage_logs[\s\S]{0,80}'reinitialisation_inventaire'/.test(corps), 'le geste est noté dans usage_logs');
ok(/DROP FUNCTION IF EXISTS public\.supprimer_mon_stock_sans_retrait\(\);/.test(mig), 'l\'ancienne fonction sans argument disparaît (aucune ambiguïté)');
const app = lire('src/App.jsx');
const reset = app.slice(app.indexOf('async function handleReset(){'), app.indexOf('async function handleEditSave(){'));
ok(/supabase\.rpc\('supprimer_mon_stock_sans_retrait',\{p_avec_ventes:avecVentes\}\)/.test(reset), 'l\'app envoie TOUJOURS p_avec_ventes');
ok(!/supabase\.rpc\('supprimer_mon_stock_sans_retrait'\)/.test(reset), 'jamais l\'appel sans argument dans la réinitialisation (l\'ancienne fonction effaçait tout)');
ok(/if\(resetStep===0\)\{setResetAvecVentes\(false\);setResetStep\(1\);return;\}/.test(reset), 'la case est décochée à chaque ouverture');
ok(/if\(avecVentes\)setSales\(\[\]\);\s*else await fetchAll\(user\.id\);/.test(reset), 'sans la case, les ventes restent à l\'écran (relues)');
const spc = lire('src/reglages/SousPageCompte.jsx');
ok(/checked=\{reset\.avecVentes === true\}/.test(spc) && /reset\.avecVentes \? T\.reinitConfirmeAvecVentes : T\.reinitConfirme/.test(spc), 'la case « Supprimer aussi mes ventes » et le bouton qui le dit');
const tx = lire('src/reglages/textes.js');
ok(!/Vide ton stock et tes ventes/.test(tx) && /Tes ventes et ton chiffre d'affaires sont gardés/.test(tx), 'le texte dit que les ventes sont gardées');
const sc = lire('src/compte/supprimerCompte.js');
ok(/supabase\.rpc\('supprimer_mon_stock_sans_retrait'\)/.test(sc), 'suppression du compte : même RPC (les ventes partent avec le compte, par delete-account)');

console.log('4. Toute suppression est tracée');
ok(/CREATE TRIGGER ventes_suppression_journal BEFORE DELETE ON public\.ventes\s+FOR EACH ROW EXECUTE FUNCTION public\.ventes_suppression_journal\(\);/.test(mig),
  'journal : BEFORE DELETE, sans clause WHEN (tout auteur)');
ok(/to_jsonb\(OLD\)/.test(mig) && /ventes_motif_suppression\(\)/.test(mig) && /current_query\(\)/.test(mig), 'journal : la ligne ENTIÈRE, le motif, la requête');
ok(/source, motif\)\s*\n\s*VALUES[\s\S]{0,300}ventes_motif_suppression\(\), left\(current_query\(\), 300\)/.test(mig), 'pierre tombale : son motif et le code qui l\'a faite');
ok(/REVOKE ALL ON public\.ventes_suppressions_journal FROM PUBLIC, anon, authenticated;/.test(mig), 'journal fermé aux clients');
ok(lire('supabase/rollbacks/20261115140000_ventes_jamais_effacees_sans_le_vouloir_INVERSE.sql').includes('RETURNS void'), 'inverse prêt');

console.log('5. La preuve sur base jetable est inscrite');
const pkg = JSON.parse(lire('package.json') || '{}');
ok(/pg-jetable\.mjs scripts\/ventes\/preuve-ventes-jamais-effacees\.mjs/.test(pkg.scripts?.['selftest:ventes-jamais-effacees-pg'] ?? ''), 'selftest:ventes-jamais-effacees-pg');

console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
