// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉ HORS « MES ANNONCES » — SELFTEST (2026-09-25 nuit, MeMiniandMove / Louis)
// ═══════════════════════════════════════════════════════════════════════════
// MeMiniandMove (Leboncoin PRO) : /compte/part/mes-annonces la renvoie sur
// l'accueil « / ». Le relevé du 25/09 21:48 y a lu trois immeubles de
// Montluçon, importés en articles puis visés par trois retraits. Louis, 19/09 :
// 40 annonces de l'accueil. La règle : hors de « Mes annonces », rien n'entre.
//
// La garde vit aux DEUX bouts, et ce test fige ce qui les relie :
//   1. l'extension ne lit AUCUN lien hors du chemin de la liste du compte
//      (CHEMIN_LISTE_DU_COMPTE), ni sans compteur « En ligne (N) » sur
//      Leboncoin, et ne conclut jamais « compte vide » sur l'accueil ;
//   2. le serveur (migration 20260925233000) reconnaît les runs hors liste AU
//      TEXTE que l'extension écrit — toutes versions en circulation : si l'un
//      des deux libellés change d'un côté sans l'autre, la porte se rouvre.
// La migration a été jouée À BLANC en prod le 25/09 (transaction annulée) :
// 4 gardes posées, annonce libre du run écartée, annonce liée gardée, moteur,
// import auto/manuel et décision « attache »/« import » refusés, relevé
// normal inchangé (« propose_inchangee »), 43 lignes historiques inertes.
//
//   npm run selftest:releve-hors-liste
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const bg = lire('chrome-extension/background.js');
const migration = lire('supabase/migrations/20260925233000_releve_hors_liste_n_importe_rien.sql');

console.log('1. Le chemin de la liste du compte');
{
  const m = bg.match(/const CHEMIN_LISTE_DU_COMPTE = \{([\s\S]*?)\n\};/);
  ok(Boolean(m), 'CHEMIN_LISTE_DU_COMPTE existe');
  // eslint-disable-next-line no-new-func
  const C = m ? new Function(`return {${m[1]}};`)() : {};
  const cas = [
    ['leboncoin', '/compte/part/mes-annonces', true],
    ['leboncoin', '/compte/pro/mes-annonces', true],
    ['leboncoin', '/', false], // la redirection PRO de MeMiniandMove et de Louis
    ['leboncoin', '/compte/pro/accueil', false],
    ['leboncoin', '/recherche', false],
    ['ebay', '/sh/lst/active', true],
    ['ebay', '/', false],
    ['beebs', '/fr/account/my-adverts', true],
    ['beebs', '/fr/account/my-adverts/creating', true],
    ['beebs', '/fr', false],
  ];
  for (const [pf, chemin, attendu] of cas) {
    ok(Boolean(C[pf]?.test(chemin)) === attendu, `${pf} ${chemin} → ${attendu ? 'liste du compte' : 'HORS liste, rien lu'}`);
  }
}

console.log('2. Le relevé ne lit rien hors liste');
{
  ok(/cheminListeSrc && !new RegExp\(cheminListeSrc, "i"\)\.test\(location\.pathname\)\) \{\s*return \{\s*annonces: \[\]/.test(bg),
    'page hors chemin → annonces: [] avant tout défilement');
  ok(/if \(plateforme === "leboncoin" && !surLaListe\) \{\s*return \{\s*annonces: \[\]/.test(bg),
    'Leboncoin sans compteur « En ligne (N) » → aucun lien lu');
  ok(/CHEMIN_LISTE_DU_COMPTE\[platform\]\?\.source \?\? null\]/.test(bg), 'le chemin est bien passé à la lecture de page');
  ok(/if \(juge && rienVu && comptePeutEtreVide && !pagesHorsListe\.length\)/.test(bg),
    'jamais « compte vide » conclu sur une page hors liste');
  const appels = bg.match(/findListingLinkInPage\([^)]*requireTitle: true[^)]*\)/g) ?? [];
  const surListe = appels.filter((a) => /listeDuCompte/.test(a)).length;
  ok(surListe === 4, `recherche d'URL par titre sur « Mes annonces » : 4 appels bornés à la liste (${surListe})`);
}

console.log('3. Les libellés lus par le serveur sont ceux que l\'extension écrit');
{
  ok(bg.includes('"« Mes annonces » n\'a pas rendu sa liste (redirection du compte, challenge ou page non peinte)"'),
    'extension : libellé Leboncoin inchangé');
  ok(bg.includes('"le Hub vendeur n\'a pas rendu son compteur « annonces en cours »"'), 'extension : libellé eBay inchangé');
  ok(migration.includes("like '%n''a pas rendu sa liste%'"), 'serveur : lit le libellé Leboncoin');
  ok(migration.includes("like '%Hub vendeur n''a pas rendu son compteur%'"), 'serveur : lit le libellé eBay');
  ok(!/de Beebs n''a rien rendu/.test(migration.split('-- ── 1. LE PRÉDICAT')[1] ?? ''),
    'serveur : la page Beebs muette (index sous l\'uid du vendeur) n\'est PAS hors liste');
}

console.log('4. Les quatre portes du moteur, patchées sur la prod');
{
  for (const fn of ['rapprocher_releve(uuid)', 'rapprocher_traiter_annonce(uuid,text[],boolean,boolean,boolean)',
    'rapprocher_importer(uuid,uuid,text)', 'rapprochement_decider(uuid,text,bigint)']) {
    ok(migration.includes(`'public.${fn}'::regprocedure`), `porte : ${fn.split('(')[0]}`);
  }
  ok(/ancre trouvée % fois \(1 attendue\)/.test(migration), 'ancre exigée une seule fois, sinon rien n\'est modifié');
  ok(/and a\.inventaire_id is null\s+and a\.job_id is null\s+and a\.created_at >= new\.started_at/.test(migration),
    'trigger : ne supprime que ce que CE run a créé et que personne n\'a lié');
  ok(/p_decision IN \('attache', 'import'\)/.test(migration), 'app : « ignore » et « detache » restent permis');
}

if (ko) { console.log(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log('\n✓ hors de « Mes annonces », rien n\'entre — extension et serveur d\'accord');
