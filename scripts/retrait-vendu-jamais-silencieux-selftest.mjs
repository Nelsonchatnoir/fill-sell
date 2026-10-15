// ═══════════════════════════════════════════════════════════════════════════
// JAMAIS DE RETRAIT D'ARTICLE VENDU EN SILENCE — `npm run selftest:retrait-vendu-jamais-silencieux`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A6). Ornella : jupe H&M vendue, retrait Vinted retenu sans un mot
// (annonce sur sa boutique 472079, Chrome sur @luciatrendyshop). nerema75 :
// « nous n'arrivons pas encore à prouver… », boutique jamais nommée. Et des
// comptes dont l'ordinateur ne tourne plus depuis des jours.
//   1. utils/retraitsBloques.js : murs « boutique » (marqueur serveur,
//      boutique_etrangere, origine inconnue) et « ordinateur » (extension
//      silencieuse > 15 min, retrait en attente > 15 min) — même levée : le
//      dernier retrait de l'annonce seulement, qui disparaît dès qu'il aboutit ;
//   2. la phrase dit le GESTE (« ouvre ta boutique @x », « ouvre Chrome ») et
//      le risque de double vente — sauf pour la bonne boutique à ouvrir
//      (12/10 soir, Nico : ni alarme ni « double vente ») ; jamais
//      « Me connecter » hors connexion ;
//   3. (12/10 soir, Nico) PLUS AUCUN BANDEAU : l'article vendu encore en ligne
//      est UNE ligne de « À régler » (son titre, la plateforme, le geste ; le
//      tap ouvre sa fiche) — selftest:a-regler-sans-bandeau pour le détail ;
//   4. get-pending-jobs : un retrait retenu pour une autre boutique porte la
//      boutique à ouvrir (attente_boutique_retrait) et le message — levé dès
//      que la bonne boutique est ouverte ;
//   5. handler-watch : un retrait après vente n'est jamais soldé par le ménage
//      des 72 h ; la garde « identité prouvée » se lève quand la boutique est vue.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const M = await import(pathToFileURL(join(RACINE, 'src/utils/retraitsBloques.js')).href);
const A = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/attente-autre-boutique.js')).href);

let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };
const T = Date.parse('2026-10-11T17:30:00Z');
const retrait = (o) => ({ id: o.id ?? 'r1', action: 'delete', platform: 'vinted', status: 'pending', inventaire_id: 7, listing_url: 'https://www.vinted.fr/items/1', created_at: '2026-10-11T14:49:00Z', platform_fields: {}, ...o });
const fiches = [{ id: 7, title: 'Jupe H&M', statut: 'vendu' }, { id: 8, title: 'Pull', statut: 'stock' }];

console.log('1. Les murs');
const ornella = retrait({ platform_fields: { attente_boutique_retrait: { boutique: '472079', login: 'ornella-vend', connectee: '999', login_connectee: 'luciatrendyshop' } } });
verifier(M.retraitBloqueParBoutique(ornella)?.login === 'ornella-vend', 'Ornella : retrait retenu pour une autre boutique → mur « boutique », @ornella-vend');
const nerema = retrait({ id: 'r2', inventaire_id: null, platform_fields: { verification_boutique_vinted: { motif: 'origine_inconnue' } } });
verifier(!!M.retraitBloqueParBoutique(nerema), 'nerema75 : boutique non prouvée (origine inconnue) → mur « boutique »');
const etrangere = retrait({ id: 'r3', status: 'needs_user', platform_fields: { needs_user_source: 'boutique_etrangere', boutique_etrangere: { article: '472079', login_article: 'ornella-vend' } } });
verifier(M.retraitBloqueParBoutique(etrangere)?.boutique === '472079', 'boutique étrangère (needs_user) → mur « boutique »');
verifier(M.retraitBloqueParBoutique(retrait({ platform_fields: { verification_boutique_vinted: { motif: 'session_inconnue' } } })) === null, 'session inconnue : c’est le mur « connexion », pas « boutique »');
verifier(M.retraitBloqueParOrdinateur(retrait({}), '2026-10-09T10:00:00Z', T), 'extension muette depuis 2 jours, retrait en attente depuis 3 h → mur « ordinateur »');
verifier(!M.retraitBloqueParOrdinateur(retrait({}), '2026-10-11T17:25:00Z', T), 'extension vue il y a 5 min → pas ce mur');
verifier(!M.retraitBloqueParOrdinateur(retrait({ created_at: '2026-10-11T17:25:00Z' }), null, T), 'retrait né il y a 5 min → on lui laisse le temps');

console.log('\n2. Le regroupement, la phrase, la levée');
const bloques = M.retraitsBloquesParConnexion({ jobs: [ornella, nerema, retrait({ id: 'r4', inventaire_id: 8, listing_url: 'u4', created_at: '2026-10-11T10:00:00Z' })], fiches, maintenant: T, extensionVueLe: '2026-10-11T17:29:00Z', loginsBoutiques: { 472079: 'ornella-vend' } });
const gB = bloques.parPlateforme.find((g) => g.mur === 'boutique' && g.boutique === '@ornella-vend');
verifier(!!gB && gB.nVendus === 1, 'groupe « boutique @ornella-vend », 1 article vendu');
const phrase = M.texteRetraitsBloques(gB, 'fr');
verifier(/vendu/.test(phrase) && /ouvre ta boutique @ornella-vend/i.test(phrase) && /ordinateur/.test(phrase), 'la phrase : vendu, « ouvre ta boutique @ornella-vend », ordinateur', phrase);
// (12/10 soir, Nico) « En attente de la bonne boutique » : pas d'alarme.
verifier(!/double vente/.test(phrase) && !/double vente/.test(M.ligneCarteRetraitBloque('vinted', 'fr', 'boutique', '@ornella-vend')), 'la bonne boutique à ouvrir : jamais « risque de double vente »', phrase);
verifier(!bloques.parPlateforme.some((g) => g.mur === 'ordinateur'), 'extension vue à l’instant : aucun mur « ordinateur »');
const sansExt = M.retraitsBloquesParConnexion({ jobs: [retrait({ id: 'r5' })], fiches, maintenant: T, extensionVueLe: '2026-10-09T10:00:00Z' });
verifier(sansExt.parPlateforme[0]?.mur === 'ordinateur' && /ouvre Chrome sur ton ordinateur/.test(M.texteRetraitsBloques(sansExt.parPlateforme[0], 'fr')), 'ordinateur éteint : « ouvre Chrome sur ton ordinateur »');
const anciens = M.retraitsBloquesParConnexion({ jobs: [retrait({ id: 'r6' })], fiches, maintenant: T });
verifier(anciens.total === 0, 'un appelant d’avant (sans extensionVueLe) : le mur « ordinateur » n’est pas jugé (rien d’inventé)');
const fait = M.retraitsBloquesParConnexion({ jobs: [ornella, { ...ornella, id: 'r9', status: 'deleted', created_at: '2026-10-11T17:00:00Z', platform_fields: {} }], fiches, maintenant: T, extensionVueLe: '2026-10-11T17:29:00Z' });
verifier(fait.total === 0, 'le retrait abouti (plus récent) éteint l’ancien : le message se lève seul');
verifier(/ouvre ta boutique @ornella-vend dans Chrome/i.test(M.ligneCarteRetraitBloque('vinted', 'fr', 'boutique', '@ornella-vend')), 'la carte vendue dit la boutique à ouvrir');
verifier(M.retraitApresVente({ platform_fields: { arme_par: { pose_par: 'armer_retrait_job (serveur)' } } }, null), 'un retrait armé par le serveur après une vente compte comme « vendu », même fiche supprimée');
// Murs MÊLÉS (aperçu du 12/10 : « Reconnecte-toi à Vinted, Vinted, Leboncoin et Beebs ») : un geste par mur.
const meles = M.retraitsBloquesParConnexion({
  jobs: [ornella, retrait({ id: 'r10', inventaire_id: 8, platform: 'leboncoin', listing_url: 'https://www.leboncoin.fr/ad/1', created_at: '2026-10-09T10:00:00Z' }),
    retrait({ id: 'r11', inventaire_id: 7, platform: 'beebs', listing_url: 'https://www.beebs.app/1', status: 'needs_user', error: 'Connexion Beebs requise', platform_fields: { needs_user_source: 'connexion' } })],
  fiches, maintenant: T, extensionVueLe: '2026-10-09T10:00:00Z',
});
const lm = M.ligneARegler(meles, 'fr');
verifier(/ouvre ta boutique @ornella-vend dans Chrome/i.test(lm.detail) && /ouvre Chrome sur ton ordinateur/.test(lm.detail) && /reconnecte-toi à Beebs/.test(lm.detail) && !/Reconnecte-toi à Vinted/.test(lm.detail), '« À régler », murs mêlés : un geste par mur (boutique, ordinateur, reconnexion), jamais « reconnecte-toi » pour une boutique', lm.detail);
verifier(!/Vinted, Vinted/.test(lm.detail), '« À régler » : aucune plateforme nommée deux fois', lm.detail);
const seuleBoutique = M.ligneARegler(M.retraitsBloquesParConnexion({ jobs: [ornella], fiches, maintenant: T, extensionVueLe: '2026-10-11T17:29:00Z' }), 'fr');
verifier(/ouvre ta boutique @ornella-vend/i.test(seuleBoutique.detail) && !/double vente/.test(seuleBoutique.detail), '« À régler », la bonne boutique seule : le geste, sans alarme', seuleBoutique.detail);

console.log('\n3. Plus aucun bandeau : « À régler » (12/10 soir, Nico)');
const app = lire('src/App.jsx');
verifier(!/<RetraitsVendusBloques/.test(app) && !/setRetraitsEnFile/.test(app), 'plus de bandeau « Vendu, encore en ligne » dans l’app (ni sa lecture)');
const vendus = M.articlesVendusEncoreEnLigne({ retraits: bloques, pendingRemovals: [], fiches });
verifier(vendus.length === 1 && vendus[0].titre === 'Jupe H&M' && vendus[0].ton === 'regler', 'la jupe vendue : UNE ligne « À régler », ambre (la bonne boutique à ouvrir)', JSON.stringify(vendus.map((v) => [v.titre, v.ton])));
const detailJupe = M.detailArticleVenduEnLigne(vendus[0], 'fr');
verifier(/Vinted/.test(detailJupe) && /ouvre ta boutique @ornella-vend sur vinted\.fr dans Chrome, sur ton ordinateur : FillSell la retirera aussitôt/i.test(detailJupe) && !/double vente/.test(detailJupe), 'sa ligne : la plateforme et le geste, sans alarme', detailJupe);
const stock = lire('src/tabs/StockTab.jsx');
verifier(/murDe\.get\(p\) === 'connexion' && <BoutonMeConnecter/.test(stock) && /extensionVueLe: extensionStatus \?/.test(stock), 'Stock : « Me connecter » pour une connexion seulement ; murs jugés avec l’extension');
verifier(/onOuvrir: \(\) => \{ setGesteOuvert\(null\); setMenuArticleId\(a\.inventaireId\); \}/.test(stock), 'la ligne ouvre la fiche de l’article (l’ancien « Voir dans le Stock »)');

console.log('\n4. Le serveur');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
verifier(/pfD\["attente_boutique_retrait"\] = \{/.test(gpj) && /Ouvre ta boutique \$\{login \? `@\$\{login\}` : "qui porte l'annonce"\}/.test(gpj), 'get-pending-jobs : le retrait retenu porte la boutique à ouvrir et le message');
verifier(/delete pfSans\["attente_boutique_retrait"\]/.test(gpj), 'get-pending-jobs : levé quand la bonne boutique est ouverte');
const hw = lire('supabase/functions/handler-watch/index.ts');
verifier(/needs_user_source === "boutique_etrangere"\s*\n?\s*\|\| \/armer_retrait_job\//.test(hw), 'handler-watch : un retrait après vente n’est jamais soldé par le ménage des 72 h');
verifier(A.attenteBoutiqueLevable({ motif: 'boutique_etrangere', article: '472079', pose_par: A.POSE_PAR_IDENTITE_PROUVEE }), 'la garde « identité prouvée » se lève quand la boutique de l’annonce est vue connectée');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
