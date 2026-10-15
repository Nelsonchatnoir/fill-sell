// ═══════════════════════════════════════════════════════════════════════════
// PLUS AUCUN BANDEAU : TOUT VA DANS « À RÉGLER » — `npm run selftest:a-regler-sans-bandeau`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 soir, Nico : le bandeau rouge « Un article vendu est encore en ligne »
// (A6) et la ligne « Alertes « plus en ligne » / Masquer … » s'empilaient en
// haut de TOUS les onglets, hors du dessin de l'app, en double de « À régler ».
// Règle : TOUS les problèmes vont dans « À régler » (la tuile du Stock), et
// nulle part ailleurs.
//   1. un article VENDU encore en ligne = UNE ligne : titre, plateforme, geste ;
//      le tap ouvre SA fiche (l'ancien « Voir dans le Stock ») ;
//   2. la bonne boutique Vinted à ouvrir n'est jamais une alarme (ambre, sans
//      « risque de double vente ») ;
//   3. les annonces d'un article vendu qui attendent l'accord (pending_removal,
//      l'ancien « 🎉 Vendu : … retirer ? ») : même ligne, « Retirer » et « Plus
//      tard » dans la fiche — mêmes gestes qu'avant ;
//   4. les questions « plus en ligne — vendue ? » : une ligne qui ouvre leur
//      écran, comptée comme elle s'affiche (masquées à part) ;
//   5. le compteur est juste : un article une fois, jamais deux ;
//   6. la zone des bandeaux d'App.jsx ne porte plus rien de ce genre.
// Données du point 1 : le VRAI retrait de la jupe d'Ornella (job 90583f9a, lu
// en base le 12/10 à 17:10 UTC), recopié tel quel.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const M = await import(pathToFileURL(join(RACINE, 'src/utils/retraitsBloques.js')).href);

let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 400)}` : ''}`); } };

const LU_LE = Date.parse('2026-10-12T17:10:00Z');
const JUPE = { id: 1790102464317000, title: 'H&M Jupe plissée violet taille 42', statut: 'vendu' };
const RETRAIT_JUPE = {
  id: '90583f9a', action: 'delete', platform: 'vinted', status: 'needs_user', inventaire_id: 1790102464317000,
  created_at: '2026-10-11T14:49:00Z', listing_url: 'https://www.vinted.fr/items/9984154515',
  error: "Le retrait n'a pas été lancé : cette annonce est sur une autre de tes boutiques Vinted que celle ouverte dans Chrome. Connecte Chrome à la boutique qui porte cette annonce, sur vinted.fr : le retrait repartira tout seul.",
  platform_fields: {
    needs_user_source: 'boutique_etrangere', vinted_account_id: 472079,
    attente_boutique_retrait: { boutique: 472079, login: 'ornella-vend', connectee: 257364012, login_connectee: 'luciatrendyshop', depuis: '2026-10-11T19:33:44Z' },
    boutique_etrangere: { article: 472079, session: 257364012, login_session: 'luciatrendyshop', motif: 'boutique_etrangere' },
    arme_par: { chemin: 'vente_article_serveur', depot: '4e32ae61', pose_par: 'armer_retrait_job (serveur)' },
  },
};
const LOGINS = { 472079: 'ornella-vend', 257364012: 'luciatrendyshop' };
const bloquesDe = (jobs, fiches) => M.retraitsBloquesParConnexion({ jobs, fiches, maintenant: LU_LE, extensionVueLe: '2026-10-12T17:08:12Z', loginsBoutiques: LOGINS });

console.log('1. La jupe d’Ornella : une ligne de « À régler », sans alarme');
{
  const r = bloquesDe([RETRAIT_JUPE], [JUPE]);
  const a = M.articlesVendusEncoreEnLigne({ retraits: r, pendingRemovals: [], fiches: [JUPE] });
  verifier(a.length === 1 && a[0].inventaireId === JUPE.id && a[0].titre === JUPE.title, 'UNE ligne, au titre de l’article', JSON.stringify(a.map((x) => x.titre)));
  verifier(a[0].ton === 'regler', 'ambre (« en attente de la bonne boutique »), jamais rouge', a[0].ton);
  const d = M.detailArticleVenduEnLigne(a[0], 'fr');
  verifier(d === 'Vendu, encore en ligne sur Vinted. Ouvre ta boutique @ornella-vend sur vinted.fr dans Chrome, sur ton ordinateur : FillSell la retirera aussitôt.', 'la plateforme et la consigne, mot pour mot', d);
  verifier(!/double vente|risque/i.test(d), 'aucun « risque de double vente »', d);
  const h = M.retraitsHorsArticlesVendus(r, a);
  verifier(h.total === 0, 'la ligne « retraits » ne la compte pas une deuxième fois', h.total);
  verifier(!/double vente/.test(M.texteRetraitsBloques(r.parPlateforme[0], 'fr')) && !/double vente/.test(M.ligneCarteRetraitBloque('vinted', 'fr', 'boutique', '@ornella-vend')), 'ni dans l’écran des retraits, ni sur la carte de la fiche');
}

console.log('\n2. Toutes les plateformes, toutes les causes');
{
  const T = '2026-10-12T10:00:00Z';
  const fiches = [JUPE, { id: 2, title: 'Sac cuir', statut: 'vendu' }, { id: 3, title: 'Pull', statut: 'stock' }, { id: 4, title: 'Robe', statut: 'vendu' }];
  const jobs = [
    RETRAIT_JUPE,
    { id: 'o', action: 'delete', platform: 'opla', status: 'needs_user', inventaire_id: 2, created_at: T, listing_url: 'o', error: 'Connexion Opla requise', platform_fields: { needs_user_source: 'connexion' } },
    { id: 'b', action: 'delete', platform: 'beebs', status: 'needs_user', inventaire_id: 2, created_at: T, listing_url: 'b', error: 'Connexion Beebs requise', platform_fields: { needs_user_source: 'connexion' } },
    { id: 'v', action: 'delete', platform: 'vinted', status: 'pending', inventaire_id: 4, created_at: T, listing_url: 'v', platform_fields: { compte_vinted_bloque: { essais: 2 } } },
    // Article EN STOCK dont le retrait est demandé : reste dans la ligne « retraits ».
    { id: 'l', action: 'delete', platform: 'leboncoin', status: 'needs_user', inventaire_id: 3, created_at: T, listing_url: 'l', error: 'Connexion Leboncoin requise', platform_fields: { needs_user_source: 'connexion' } },
  ];
  const pending = [
    // Ancien « 🎉 Vendu : … retirer ? » sur la robe : eBay et Depop à retirer avec son accord.
    { id: 'p1', platform: 'ebay', inventaire_id: 4, title: 'Robe', created_at: T, platform_fields: { pending_removal: true } },
    { id: 'p2', platform: 'depop', inventaire_id: 4, title: 'Robe', created_at: T, platform_fields: { pending_removal: true } },
    // Même plateforme qu'un retrait déjà en file : jamais un second geste.
    { id: 'p3', platform: 'opla', inventaire_id: 2, title: 'Sac cuir', created_at: T, platform_fields: { pending_removal: true } },
    // Fiche supprimée : pas de ligne d'article (rien à ouvrir) — l'écran des retraits la garde.
    { id: 'p4', platform: 'leboncoin', inventaire_id: 999, title: 'Livre', created_at: T, platform_fields: { pending_removal: true } },
  ];
  const r = bloquesDe(jobs, fiches);
  const a = M.articlesVendusEncoreEnLigne({ retraits: r, pendingRemovals: pending, fiches });
  const parId = new Map(a.map((x) => [String(x.inventaireId), x]));
  verifier(a.length === 3 && parId.has(String(JUPE.id)) && parId.has('2') && parId.has('4'), 'trois articles vendus encore en ligne, un par ligne (jamais l’article en stock, jamais la fiche supprimée)', JSON.stringify(a.map((x) => x.titre)));
  const sac = parId.get('2');
  verifier(sac.plateformes.map((p) => `${p.platform}:${p.mur}`).join(',') === 'beebs:connexion,opla:connexion' && sac.aRetirer.length === 0, 'Sac : Beebs et Opla (connexion) — la copie Opla « à retirer » ne double pas son retrait', JSON.stringify(sac.plateformes));
  verifier(sac.ton === 'echec' && /[Rr]econnecte-toi à Beebs et Opla/.test(M.detailArticleVenduEnLigne(sac, 'fr')) && /double vente/.test(M.detailArticleVenduEnLigne(sac, 'fr')), 'une vraie connexion à reprendre : rouge, le geste, le risque', M.detailArticleVenduEnLigne(sac, 'fr'));
  const robe = parId.get('4');
  verifier(robe.plateformes.map((p) => `${p.platform}:${p.mur}`).join(',') === 'vinted:compte_bloque,ebay:a_retirer,depop:a_retirer' && robe.aRetirer.length === 2, 'Robe : « compte bloqué » Vinted + eBay et Depop à retirer avec son accord (Depop nommée)', JSON.stringify(robe.plateformes));
  const dRobe = M.detailArticleVenduEnLigne(robe, 'fr');
  verifier(/compte bloqué/.test(dRobe) && /eBay et Depop : elles attendent ton accord : touche « Retirer »/.test(dRobe), 'un geste par mur, la plateforme nommée', dRobe);
  const h = M.retraitsHorsArticlesVendus(r, a);
  verifier(h.total === 1 && h.parPlateforme[0].platform === 'leboncoin', 'la ligne « retraits » ne garde que le Pull en stock', JSON.stringify(h.parPlateforme.map((g) => g.platform)));
  const lignes = a.length + h.total;
  const annoncesDistinctes = new Set([...jobs.map((j) => `${j.inventaire_id}|${j.platform}`), ...pending.filter((p) => p.inventaire_id !== 999 && p.id !== 'p3').map((p) => `${p.inventaire_id}|${p.platform}`)]);
  verifier(lignes === 4 && annoncesDistinctes.size === 7, 'compteur : 3 articles + 1 retrait = 4 lignes, pour 7 annonces — aucun article compté deux fois', `${lignes} / ${annoncesDistinctes.size}`);
  verifier(M.detailArticleVenduEnLigne(a[0], 'en') && !/[àéè]/.test(M.detailArticleVenduEnLigne(robe, 'en')), 'en anglais aussi');
  const ordi = M.retraitsBloquesParConnexion({ jobs: [{ id: 'x', action: 'delete', platform: 'leboncoin', status: 'pending', inventaire_id: 4, created_at: '2026-10-12T08:00:00Z', listing_url: 'x', platform_fields: {} }], fiches, maintenant: LU_LE, extensionVueLe: '2026-10-10T08:00:00Z' });
  const ordiArt = M.articlesVendusEncoreEnLigne({ retraits: ordi, fiches });
  verifier(ordiArt.length === 1 && /[Oo]uvre Chrome sur ton ordinateur/.test(M.detailArticleVenduEnLigne(ordiArt[0], 'fr')), 'Chrome fermé : « ouvre Chrome sur ton ordinateur »', ordiArt.length);
}

console.log('\n3. La zone des bandeaux d’App.jsx : plus rien de ce genre, sur aucun onglet');
const app = lire('src/App.jsx');
{
  const z0 = app.indexOf('<div ref={scrollRef} className="wrap page-pad"');
  const z1 = app.indexOf('{tab===0&&', z0);
  const zone = app.slice(z0, z1);
  verifier(z0 > 0 && z1 > z0, 'zone des bandeaux trouvée');
  verifier(!/<RetraitsVendusBloques/.test(app) && !existsSync(join(RACINE, 'src/components/RetraitsVendusBloques.jsx')), 'le bandeau « Un article vendu est encore en ligne » n’existe plus');
  verifier(!/pendingRemovals\.length>0&&/.test(zone) && !/Encore en ligne sur <strong>\{platLabels\}/.test(app), 'plus de bandeau « 🎉 Vendu : … retirer ? »');
  verifier(!/Alertes « plus en ligne »':/.test(app) && !/`Masquer \$\{PLAT\[p\]\?\?p\}`/.test(app), 'plus de ligne « Alertes « plus en ligne » / Masquer Vinted… »');
  verifier(!/unavailableListings\.map\(job=>\{/.test(zone) && !/<FileAnnoncesADepiler/.test(zone), 'plus de question « plus en ligne » ni de file à dépiler dans la zone');
  verifier(/<VentesADecider /.test(zone), '« Ventes à confirmer » (lien du mail « Vendu ») reste où il est — question posée à Nico');
  // Les questions sont rendues par QuestionsPlusEnLigne (même gestes, App les passe).
  const qpl = lire('src/components/QuestionsPlusEnLigne.jsx');
  verifier(/const rendrePlusEnLigne=\(\{fermer\}\)=>\(\s*<QuestionsPlusEnLigne /.test(app)
    && /onOuvrirRevue=\{\(\)=>\{fermer\(\);setDisparusModal\(true\);\}\}/.test(app)
    && /<FileAnnoncesADepiler lang=\{lang\} nb=\{nbADepiler\} onOuvrir=\{onOuvrirRevue\} \/>/.test(qpl), 'les questions et la file sont rendues pour l’écran de « À régler » (la revue s’ouvre après l’avoir fermé)');
  verifier(/pendingRemovals=\{pendingRemovals\} onRetirerVendus=\{armRemovals\} onPlusTardVendus=\{reporterRetraits\}/.test(app), 'les annonces à retirer d’un article vendu passent au Stock, avec les MÊMES gestes');
  verifier(/plusEnLigne=\{\{n:nbPlusEnLigne,nMasquees:nbMasqueesPlusEnLigne,rendre:rendrePlusEnLigne,/.test(app), 'le compte et l’écran des questions passent au Stock');
  verifier(/questionsPlusEnLigne\.filter\(x=>!x\.q\.masquee\)\.length\s*\n\s*\+disparusATrancher\.filter\(i=>!idsVintedQuestions\.has\(String\(i\.id\)\)\)\.length/.test(app), 'compte des questions : masquées à part, un article Vinted une seule fois');
  // Chaque réponse : le bouton de la carte → la prop → le MÊME geste d'App qu'avant.
  for (const [nom, bouton, cablage] of [
    ['« Oui, enregistrer la vente »', /onClick=\{\(\) => onConfirmerVente\(job\)\}/, /onConfirmerVente=\{confirmSaleFromBanner\}/],
    ['« Non, je l’ai retirée »', /onClick=\{\(\) => onRetiree\(job\)\}/, /onRetiree=\{dismissUnavailable\}/],
    ['« Je ne sais pas »', /onClick=\{\(\) => onReporter\(job\)\}/, /onReporter=\{reporterAlerte\}/],
    ['« Masquer »', /onClick=\{\(\) => onMasquer\(job, !masquee\)\}/, /onMasquer=\{masquerAlerte\}/],
    ['« Oui, c’est elle »', /onClick=\{\(\) => onAccepterProposition\(job, proposition\)\}/, /onAccepterProposition=\{accepterProposition\}/],
    ['le prix d’achat et « Je ne sais plus »', /onClick=\{\(\) => onPrixAchatInconnu\(job\)\}/, /onPrixAchatInconnu=\{marquerPrixAchatInconnu\}[\s\S]*prix_achat_inconnu:true|prix_achat_inconnu:true[\s\S]*onPrixAchatInconnu=\{marquerPrixAchatInconnu\}/],
    // (15/10, P1-0) les deux sorties d'une carte « Vendue », tranchées par la base
    ['« Ce n’est pas vendu »', /onClick=\{\(\) => onPasVendue\(job\)\}/, /onPasVendue=\{\(job\)=>trancherSignalVente\(job,'pas_vendue'\)\}/],
    ['« Déjà enregistrée »', /onClick=\{\(\) => onDejaEnregistree\(job\)\}/, /onDejaEnregistree=\{\(job\)=>trancherSignalVente\(job,'meme_vente'\)\}/],
  ]) {
    verifier(bouton.test(qpl) && cablage.test(app), `aucune réponse perdue : ${nom}`);
  }
  verifier(/supabase\.rpc\('signal_vente_trancher',\{p_job:job\.id,p_reponse:reponse\}\)/.test(app), '« Vendue » : la base tranche (signal_vente_trancher), jamais l’app');
  verifier(/masquerAlertesPlateforme\(p,false\)/.test(app), 'une plateforme masquée en entier se réaffiche encore (rien n’est coincé)');
  verifier(!/data-bandeau=/.test(app), 'aucun data-bandeau dans l’app');
}

console.log('\n4. Le Stock : « À régler »');
{
  const st = lire('src/tabs/StockTab.jsx');
  verifier(/\.\.\.vendusEnLigne\.map\(\(a\) => \(\{\s*\n\s*cle: `vendu:\$\{a\.inventaireId\}`, groupe: 'vendus', article: true, n: 1, ton: a\.ton,/.test(st), 'une ligne par article vendu encore en ligne');
  verifier(/onOuvrir: \(\) => \{ setGesteOuvert\(null\); setMenuArticleId\(a\.inventaireId\); \}/.test(st), 'le tap ouvre la fiche de l’article');
  verifier(/const nbRetraitsBloques = nbVendusEnLigne \+ nbRetraitsAutres;/.test(st) && /const nbARegler = nbRetraitsBloques \+ nbIdentiteLbc \+ nbAttenteAction \+ questionsDejaVendu\.length \+ nbAVerifier \+ nbSansPrix \+ brouillons\.length \+ nbPlusEnLigne;/.test(st), 'la tuile compte les articles vendus encore en ligne et les annonces plus en ligne');
  verifier(/\{ cle: 'plus_en_ligne', n: nbPlusEnLigne,/.test(st) && /onOuvrir: \(\) => setGesteOuvert\('plus_en_ligne'\) \}/.test(st), 'la ligne « Annonces plus en ligne »');
  verifier(/\{gesteOuvert==='plus_en_ligne'&&plusEnLigne\?\.rendre&&\(\s*<EcranPlein [^>]*onFermer=\{\(\)=>setGesteOuvert\('a_regler'\)\}>\s*\{plusEnLigne\.rendre\(\{fermer:\(\)=>setGesteOuvert\(null\)\}\)\}/.test(st), 'son écran (gabarit EcranPlein), retour vers « À régler »');
  verifier(/cle: 'retirer-vendu'[\s\S]{0,400}onTap: \(\) => onRetirerVendus\(aRetirer\)/.test(st) && /cle: 'retirer-plus-tard'[\s\S]{0,400}onTap: \(\) => onPlusTardVendus\(aRetirer\)/.test(st), 'la fiche porte « Retirer » et « Plus tard »');
  verifier(/aRetirer=\{aRetirerSansFiche\} onRetirer=\{onRetirerVendus\} onPlusTard=\{onPlusTardVendus\}/.test(st), 'fiche supprimée : l’écran des retraits garde « Retirer » / « Plus tard »');
  verifier(/plusEnLigne\?\.nMasquees>0\?\(/.test(st), 'les alertes masquées sont dites au pied de « À régler », jamais perdues');
  const ec = lire('src/stock/EcranARegler.jsx');
  verifier(/\{!l\.article && \(/.test(ec) && /const rouge = l\.ton \? l\.ton === 'echec' : ROUGES\.has\(l\.cle\);/.test(ec), 'même ligne que les autres ; pas de nombre pour un article ; ambre sauf vraie alarme');
  const er = lire('src/stock/EcranRetraitsBloques.jsx');
  verifier(/const ambre = g\.mur === 'boutique';/.test(er), 'écran des retraits : la bonne boutique en ambre');
}

console.log('\n5. Aucun autre bandeau du genre dans l’app');
{
  for (const f of ['src/tabs/DashboardTab.jsx', 'src/tabs/VentesTab.jsx', 'src/tabs/StockTab.jsx']) {
    if (!existsSync(join(RACINE, f))) continue;
    const t = lire(f);
    verifier(!/<RetraitsVendusBloques|Un article vendu est encore en ligne|articles vendus sont encore en ligne/.test(t), `${f} : rien`);
  }
}

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
