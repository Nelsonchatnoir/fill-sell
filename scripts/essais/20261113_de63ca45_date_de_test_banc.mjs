// LE BANC de la réparation scripts/reparations/20261113_de63ca45_date_de_test.sql et de son INVERSE (13/11/2026, lot NU —
// décision de Nico, H2 : « la date des 72 fiches « Jeu testé le » passe dans teste_le ») — SUR UN POSTGRES JETABLE
// (embedded-postgres sur le poste), jamais la prod. Le script n'est PAS exécuté en prod ici.
//   node scripts/essais/20261113_de63ca45_date_de_test_banc.mjs
// Décor : profiles / inventaire réduites aux colonnes que le script lit ; 85 fiches « aujourd'hui » et 65 « plus tard »
// (« …, fonctionne correctement. », textes d'essai), plus les cas qui ne doivent JAMAIS bouger : les 5 « plus tard » hors
// modèle (UMD, sans année ×2, « fonctionne parfaitement », « se lance et fonctionne correctement »), une « aujourd'hui » hors modèle, deux phrases dans un texte, une date déjà posée, une fiche
// vendue, un autre compte. Étapes : A. garde de nombre (trop peu de fiches → rien n'est écrit) ; B. réparation ;
// C. rejouée → refusée (« déjà passé ») ; D. inverse → chaque fiche retrouve son texte et ses attributs, à l'octet.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = lire('scripts/reparations/20261113_de63ca45_date_de_test.sql');
const INVERSE = lire('scripts/reparations/20261113_de63ca45_date_de_test_INVERSE.sql');
const COMPTE = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
const AUTRE = '00000000-0000-4000-8000-0000000000aa';
const FIN = 'Vendu comme sur les photos.\n\n📍 Remise en main propre possible.';
const corps = (i) => `🎮 Je vends le jeu d'essai n° ${i}.\n\n📦 Contenu :\n\n✅ Disque du jeu.`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const fiches = [];
let id = 1000;
const ajouter = (o) => fiches.push({ id: id++, user_id: COMPTE, statut: 'stock', attributs: { etat: { v: 'Très bon état' } }, ...o });
for (let i = 0; i < 85; i++) {
  const j = 1 + (i % 28), m = 9 + (i % 2); // septembre-octobre 2026
  ajouter({ famille: 'aujourdhui', date: `2026-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`,
    description: `${corps(i)}\n\nJeu testé aujourd’hui, le ${j === 1 ? '1er' : j} ${MOIS[m - 1]} 2026, et fonctionnel.\n\n${FIN}` });
}
for (let i = 0; i < 65; i++) {
  const j = 1 + (i % 28), m = 8 + (i % 2); // août-septembre 2026
  ajouter({ famille: 'plus_tard', date: `2026-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`,
    description: `${corps(100 + i)}\n\nJeu testé le ${j === 1 ? '1er' : j} ${MOIS[m - 1]} 2026, fonctionne correctement.\n\n${FIN}` });
}
// Ne doivent JAMAIS bouger.
const fixes = [];
const fixe = (o) => { ajouter({ famille: null, ...o }); fixes.push(fiches.at(-1).id); };
fixe({ description: `${corps(900)}\n\nUMD testé le 6 septembre 2026, fonctionne correctement.\n\n${FIN}` });
fixe({ description: `${corps(901)}\n\nJeu testé le 17 août, fonctionne parfaitement.\n\n${FIN}` });
fixe({ description: `${corps(902)}\n\nJeu testé le 31 mai, fonctionne parfaitement, aucun souci à signaler.\n\n${FIN}` });
fixe({ description: `${corps(903)}\n\nJeu testé aujourd’hui, le 20 septembre 2026, et fonctionne parfaitement.\n\n${FIN}` });
fixe({ description: `${corps(904)}\n\nJeu testé le 2 septembre 2026, fonctionne correctement.\n\nJeu testé le 3 septembre 2026, fonctionne correctement.\n\n${FIN}` });
fixe({ description: `${corps(905)}\n\nJeu testé le 4 septembre 2026, fonctionne correctement.\n\n${FIN}`, attributs: { teste_le: { v: '2026-09-04', source: 'manuel' } } });
fixe({ description: `${corps(906)}\n\nJeu testé le 5 septembre 2026, fonctionne correctement.\n\n${FIN}`, statut: 'vendu' });
fixe({ description: `${corps(907)}\n\nJeu testé le 5 septembre 2026, fonctionne correctement.\n\n${FIN}`, user_id: AUTRE });
fixe({ description: `${corps(908)}\n\nJeu testé le 15 septembre 2026, fonctionne correctement. Boîtier abîmé.\n\n${FIN}` });
// (13/11, décision du coordinateur — règle « phrases du vendeur mot pour mot ») les deux autres fins restent intactes.
fixe({ description: `${corps(909)}\n\nJeu testé le 15 septembre 2026, fonctionne parfaitement.\n\n${FIN}` });
fixe({ description: `${corps(910)}\n\nJeu testé le 15 septembre 2026, se lance et fonctionne correctement.\n\n${FIN}` });

async function base(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-date-de-test-'));
  const b = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await b.initialise(); await b.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid NOT NULL, statut text NOT NULL, description text, attributs jsonb);`);
  return { c, arreter: async () => { await c.end().catch(() => {}); await b.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } } };
}
const peupler = async (c, liste) => {
  await c.query('TRUNCATE public.inventaire');
  await c.query(`INSERT INTO public.profiles (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING`, [COMPTE, AUTRE]);
  for (const f of liste) await c.query(`INSERT INTO public.inventaire (id, user_id, statut, description, attributs) VALUES ($1, $2, $3, $4, $5)`,
    [f.id, f.user_id, f.statut, f.description, JSON.stringify(f.attributs)]);
};
const lignes = async (c) => new Map((await c.query(`SELECT id, description, attributs FROM public.inventaire ORDER BY id`)).rows.map((r) => [Number(r.id), r]));
const jouer = async (c, sql) => { try { const r = await c.query(sql); return { ok: true, r }; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; } };

let n = 0, ko = 0;
const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };
const { c, arreter } = await base(60000 + Math.floor(Math.random() * 2000));
try {
  console.log('A. GARDE DE NOMBRE — 59 fiches « plus tard » seulement');
  let k59 = 0;
  const peu = fiches.filter((f) => f.famille !== 'plus_tard' || ++k59 <= 59);
  await peupler(c, peu);
  const avantA = await lignes(c);
  const a = await jouer(c, SCRIPT);
  const apresA = await lignes(c);
  ok(!a.ok && /fiches « plus tard » retenues : 59/.test(a.erreur) && [...avantA].every(([k, v]) => apresA.get(k).description === v.description)
    && (await c.query(`SELECT to_regclass('public._backup_1113_de63ca45_date_de_test') t`)).rows[0].t === null, 'A : refus, rien écrit, aucune sauvegarde laissée', a.erreur);

  console.log('B. RÉPARATION');
  await peupler(c, fiches);
  const avant = await lignes(c);
  const b = await jouer(c, SCRIPT);
  const parFamille = Object.fromEntries((Array.isArray(b.r) ? b.r : [b.r]).flatMap((x) => x?.rows ?? []).filter((x) => x.famille).map((x) => [x.famille, Number(x.fiches_reparees)]));
  ok(b.ok && parFamille.aujourdhui === 85 && parFamille.plus_tard === 65, 'B : 85 « aujourd\'hui » + 65 « plus tard » réparées', b.ok ? parFamille : b.erreur);
  const apres = await lignes(c);
  const fautes = [];
  for (const f of fiches.filter((x) => x.famille)) {
    const l = apres.get(f.id);
    const attendu = f.description.replace(/\n\n(Jeu testé (aujourd’hui, le|le) [^\n]+)\n\n/, '\n\n');
    if (l.description !== attendu || l.attributs?.teste_le?.v !== f.date || l.attributs?.teste_le?.source !== 'manuel'
      || l.attributs?.teste_le?.origine !== 'reparation_20261113_date_de_test' || l.attributs?.etat?.v !== 'Très bon état') fautes.push({ id: f.id, d: l.description.slice(-120), t: l.attributs?.teste_le });
  }
  ok(fautes.length === 0, 'B : chaque fiche — la phrase sortie (et sa ligne vide), rien d\'autre ; teste_le = la date de SA phrase (« 1er » compris), source manuel ; ses autres attributs intacts', fautes.slice(0, 3));
  ok(fixes.every((k) => apres.get(k).description === avant.get(k).description && JSON.stringify(apres.get(k).attributs) === JSON.stringify(avant.get(k).attributs)),
    'B : jamais touchées — UMD, sans année ×2, « fonctionne parfaitement », « se lance et fonctionne correctement », « aujourd\'hui » hors modèle, deux phrases, date déjà posée, vendue, autre compte, phrase suivie d\'autre chose');

  console.log('C. REJOUÉE');
  const c2 = await jouer(c, SCRIPT);
  ok(!c2.ok && /script déjà passé/.test(c2.erreur), 'C : refusée (sauvegarde présente), rien écrit', c2.erreur);

  console.log('D. INVERSE');
  const d = await jouer(c, INVERSE);
  const rendu = await lignes(c);
  ok(d.ok && [...avant].every(([k, v]) => rendu.get(k).description === v.description && JSON.stringify(rendu.get(k).attributs) === JSON.stringify(v.attributs)),
    'D : chaque fiche retrouve son texte et ses attributs d\'avant, à l\'octet (les deux familles)', d.ok ? null : d.erreur);
  const rf = d.ok ? (Array.isArray(d.r) ? d.r : [d.r]).flatMap((x) => x?.rows ?? []).find((x) => 'rendues_par_famille' in x) : null;
  ok(rf && Number(rf.fiches_rendues) === 150 && rf.rendues_par_famille === 'aujourdhui 85, plus_tard 65', 'D : 150 rendues, par famille', rf);
} finally { await arreter(); }
console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
process.exit(ko ? 1 : 0);
