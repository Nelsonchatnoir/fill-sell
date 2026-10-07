// ═══════════════════════════════════════════════════════════════════════════
// RATTACHEMENT AVANT STOCK — SELFTEST (07/10/2026, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché
//   de tout ce que l'utilisateur a déjà. »
// Fige ce qui relie la base, la fonction serveur, le chien de garde et l'app.
// La preuve en base (transaction annulée) : scripts/reparations/
// 20261007_preuve_rattachement_avant_stock.mjs.
//
//   npm run selftest:rattachement-avant-stock
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const fonction = (sql, nom) => {
  const i = sql.indexOf(`FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const j = sql.indexOf('$function$;', i);
  return sql.slice(i, j);
};

const mig = lire('supabase/migrations/20261007140000_rattachement_avant_stock.sql');
const fn = lire('supabase/functions/rapprochement/index.ts');
const hw = lire('supabase/functions/handler-watch/index.ts');
const cfg = lire('supabase/config.toml');
const bloc = lire('src/stock/BlocSynchro.jsx');
const textes = lire('src/annonces/textes.js');
const stock = lire('src/tabs/StockTab.jsx');

console.log('1. Rien n’entre dans le stock hors du moteur du compte');
{
  const traiter = fonction(mig, 'rapprocher_traiter_annonce');
  ok(traiter && !/rapprocher_importer\(/.test(traiter), 'rapprocher_traiter_annonce n’importe plus jamais');
  ok(/RETURN 'differe';/.test(traiter), 'sans identifiant : « differe » (le moteur du compte tranche)');
  const releve = fonction(mig, 'rapprocher_releve');
  ok(releve && !/rapprocher_traiter_annonce\(/.test(releve) && /rapprochement_relancer\(v_user\)/.test(releve), 'rapprocher_releve ne rapproche plus dans l’extension : il réveille le serveur');
  ok(/'restantes', 0/.test(releve), 'l’extension lit « restantes » 0 : un seul tour, plus de « à reprendre au prochain relevé »');
  const imp = fonction(mig, 'rapprocher_importer');
  ok(/v_sans_question boolean := p_par IN \('utilisateur', 'rapprochement'\)/.test(imp), 'la voie du moteur ne repose pas la question');
  ok(/CASE WHEN p_par = 'rapprochement' THEN 'auto' ELSE p_par END/.test(imp), 'rapprochements.par reste dans sa liste fermée (utilisateur, job, auto)');
}

console.log('2. Le moteur : attendre, empreinter, classer, puis créer');
{
  const av = fonction(mig, 'rapprochement_avancer');
  ok(/pg_try_advisory_xact_lock\(hashtext\('rapprochement:'/.test(av), 'un seul passage à la fois par compte (verrou)');
  ok(/s\.kind IN \('annonces', 'dressing'\)[\s\S]{0,200}'queued'[\s\S]{0,200}'running'/.test(av), 'rien ne se tranche tant qu’un relevé du compte (Vinted compris) tourne');
  ok(/'etat', 'empreintes', 'urls'/.test(av), 'les empreintes manquantes d’abord (annonces + couvertures)');
  ok(/veille_cpu[\s\S]{0,120}> 70/.test(av), 'la base qui peine passe avant (veille_cpu > 70 %)');
  ok(/rapprochement_nouvelles/.test(av) && /'creation'/.test(av), 'les « sans candidat » ne sont créées qu’une fois TOUT classé');
  ok(/releve_est_geste\(s\.declencheur\)/.test(av), 'un relevé automatique ne crée rien (releves_sur_geste)');
  ok(/retenue_silencieuse_beebs/.test(av), 'la retenue silencieuse Beebs est gardée');
  ok(/'photo_identique', jsonb_build_object\('groupe_creation', true\)/.test(av), 'le regroupement garde le motif « photo_identique » (lu par retrait_job_prouve)');
}

console.log('3. Les candidats : un doute est une proposition, jamais une fusion');
{
  const c = fonction(mig, 'rapprochement_candidats');
  ok(/v_photo_n = 1/.test(c) && /'sur', v_photo\[1\]/.test(c), 'une seule photo identique en stock : rattachée');
  for (const m of ['photo_meme_plateforme', 'photo_deux_annonces', 'photo_variantes', 'photo_plusieurs']) ok(c.includes(`'${m}'`), `photo ambiguë « ${m} » : un doute`);
  for (const m of ['titre_exact', 'annonce_remplacee', 'homonyme_vendu', 'homonyme_en_stock', 'titre_inclus', 'faisceau']) ok(c.includes(`'${m}'`), `candidat « ${m} »`);
  ok(/titres_types_exclusifs\(a\.titre, f\.titre\)/.test(c) || /NOT \(v_ty && f\.ty\)/.test(c), 'veto du type d’objet (pantalon ≠ blazer)');
  ok(/'bas', ARRAY\['pantalon'/.test(mig) && /'dessus_chaud', ARRAY\['veste','vestes','blazer'/.test(mig), 'familles de types fermées');
}

console.log('4. La fusion déplace tout, et se défait');
ok(/FROM push_ventes WHERE inventaire_id = p_absorbe/.test(mig) && /FROM remises_en_vente WHERE inventaire_id = p_absorbe/.test(mig), 'push_ventes et remises_en_vente suivent l’article gardé');
ok(/deplacements -> 'push_ventes'/.test(mig) && /deplacements -> 'remises_en_vente'/.test(mig), '… et reviennent en défaisant');
ok(/'vendu_encore_en_ligne', jsonb_build_object\('annonce_id', a\.id, 'par', 'utilisateur'/.test(mig), '« Oui » sur un article vendu : « Vendu — encore en ligne, retirer ? »');

console.log('5. Le réveil serveur et le filet');
ok(/\[functions\.rapprochement\]\s*\nverify_jwt = false/.test(cfg), 'rapprochement : verify_jwt = false (appelée par la base)');
ok(/x-cron-secret/.test(fn) && /secret !== attendu/.test(fn), 'garde maison x-cron-secret');
ok(/rpc\("rapprochement_avancer"/.test(fn) && /empreintes-urls/.test(fn), 'la fonction boucle sur le moteur et fait empreinter en parallèle');
ok(/relance: true/.test(fn) && /body\.relance !== true/.test(fn), 'une seule relance d’elle-même');
ok(/trg_rapprochement_fin_run/.test(mig) && /NEW\.status NOT IN \('queued', 'running'\)/.test(mig), 'un relevé qui finit (ou s’arrête) réveille le moteur');
ok(/cron\.schedule\('rapprochement-1min'/.test(mig) && /maj_le < now\(\) - interval '45 seconds'/.test(mig), 'le filet ne part que s’il y a un compte en retard');

console.log('6. La reprise après une extension coupée : une fois, jamais deux');
ok(/\[reprise-releve\]/.test(hw) && /declencheur: `\$\{base\}:redemande`/.test(hw), 'un relevé-geste arrêté avant sa liste repart en file (« :redemande »)');
ok(/\/\^\(bouton\|bouton_distant\|app\)\$\/\.test\(base\)/.test(hw), 'jamais une deuxième reprise (une demande « :redemande » ne repart pas)');

console.log('7. L’app : la barre, le temps, la fin, les doutes hors du stock');
ok(/lireAvancementSynchro/.test(lire('src/annonces/useReleveAnnonces.js')) && /rpc\('synchro_avancement'\)/.test(lire('src/utils/syncPlateformes.js')), 'l’avancement est lu (synchro_avancement)');
ok(/const actifGlobal = vague\.active \|\| rapActif;/.test(bloc), 'la synchro reste « en cours » tant que le rapprochement tourne');
ok(/T\.tempsRestant\(/.test(bloc) && /T\.stockPret/.test(bloc) && /T\.rapprochementEnCours/.test(bloc), 'temps restant, « Ton stock est prêt », phase de rapprochement');
ok(/rapprochementEnCours: 'Rapprochement de tes annonces en cours'/.test(textes) && /stockPret: 'Ton stock est prêt'/.test(textes), 'les mots de Nico');
ok(/cle: 'a_verifier'/.test(stock) && /nbAVerifier \+ nbSansPrix/.test(stock), '« Annonces à vérifier » dans À régler, comptées par la tuile');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
