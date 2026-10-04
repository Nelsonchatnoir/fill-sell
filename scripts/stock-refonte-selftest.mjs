// Autotest de la refonte du Stock (03/10/2026, planche validée par Nico).
//
//     node --import ./scripts/loader-ext.mjs scripts/stock-refonte-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. l'ACTION PRINCIPALE d'une carte suit l'ordre de Nico — Régler → Publier
//      partout → Remonter → Marquer vendu — et la carte lit bien cette règle ;
//   2. « ancienne » = le plancher de republication DÉJÀ en place (AGE_MIN de
//      RepublicationPlanifiee.jsx), relu dans la source : une recopie qui
//      diverge casse ce test ;
//   3. les LOGOS d'une carte : trois au plus, puis « +N » (correction b) ;
//   4. les FILTRES : pastilles rapides (une active), tranches d'ancienneté,
//      prix Min/Max — un prix inconnu ne satisfait aucune borne (VIDE ≠ ZÉRO) ;
//   5. le choix CARTES / LISTE est mémorisé, et un stockage en panne retombe
//      sur Cartes sans lever ;
//   6. le verbe est « SYNCHRONISER », partout dans les mots des annonces ;
//   7. les tris de la planche, « Plus récents » par défaut ;
//   8. « DUPLIQUER » copie la fiche et RIEN de ce qui la relie aux annonces de
//      l'original, tout ou rien ;
//   9. aucun émoji ni aucune plateforme écrite en dur dans src/stock/.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); }
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Les lignes de CODE d'un fichier (commentaires retirés, grossièrement).
const lignesDeCode = (texte) => texte.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
});

const R = await charger('src/stock/regles.js');
const { trierStock } = await charger('src/utils/stockFiltres.js');
const { textesAnnonces } = await charger('src/annonces/textes.js');
const D = await charger('src/stock/dupliquer.js');

// ── 1. L'action principale — l'ordre de Nico ─────────────────────────────────
{
  const a = R.actionPrincipale;
  verifier(a({ vendu: true, aRegler: true, aPublier: 3 }) === null, 'un article vendu n’a pas d’action principale');
  verifier(a({ aRegler: true, aPublier: 2, ancienne: true, remontable: true }) === 'regler', 'à régler passe AVANT tout le reste');
  verifier(a({ aPublier: 1, ancienne: true, remontable: true }) === 'publier', 'pas partout passe avant Remonter');
  verifier(a({ aPublier: 0, ancienne: true, remontable: true }) === 'remonter', 'partout, ancienne et republiable → Remonter');
  verifier(a({ ancienne: true, remontable: false }) === 'vendu', 'ancienne mais pas republiable → Marquer vendu');
  verifier(a({ ancienne: false, remontable: true }) === 'vendu', 'récente → Marquer vendu');
  verifier(a({}) === 'vendu', 'rien à faire → Marquer vendu');
  verifier(egal(['regler', 'publier', 'remonter', 'vendu'].map((x) => R.libelleAction(x, 'fr')),
    ['Régler', 'Publier partout', 'Remonter', 'Marquer vendu']), 'les quatre libellés de la planche');
  const stock = lire('src/tabs/StockTab.jsx');
  verifier(/actionPrincipale\(\{/.test(stock), 'la carte du Stock tranche avec actionPrincipale (pas une seconde règle)');
}

// ── 2. « Ancienne » = le plancher de republication existant ─────────────────
{
  const src = lire('src/components/RepublicationPlanifiee.jsx');
  const m = src.match(/const AGE_MIN = (\d+);/);
  verifier(!!m && Number(m[1]) === R.SEUIL_ANCIENNE_JOURS, 'SEUIL_ANCIENNE_JOURS === AGE_MIN de RepublicationPlanifiee', m ? `AGE_MIN=${m[1]}` : 'AGE_MIN introuvable');
  verifier(!R.estAncienne(6) && R.estAncienne(7) && R.estAncienne(30), 'ancienne à partir de 7 jours');
  verifier(!R.estAncienne(null), 'âge inconnu ≠ ancienne');
  const maintenant = Date.parse('2026-10-03T12:00:00Z');
  const il = (j) => new Date(maintenant - j * 86400000).toISOString();
  const item = { listed_at_guess: il(10) };
  const jobs = [
    { platform: 'leboncoin', action: 'publish', status: 'published', published_at: il(3) },
    { platform: 'leboncoin', action: 'republish', status: 'published', published_at: il(20), platform_fields: { recreated_at: il(2) } },
    { platform: 'beebs', action: 'publish', status: 'failed', published_at: il(40) },
  ];
  verifier(R.ancienneteJours(item, jobs, ['vinted', 'leboncoin'], maintenant) === 10, 'l’âge rendu est celui de l’annonce la PLUS ancienne en ligne');
  verifier(R.ancienneteJours(item, jobs, ['leboncoin'], maintenant) === 2, 'une republication RAJEUNIT l’annonce : sa date de recréation compte (2 j, pas 3 ni 20)');
  verifier(R.ancienneteJours(item, jobs, ['beebs'], maintenant) === null, 'un job non publié ne date rien');
  verifier(R.ancienneteJours(item, jobs, [], maintenant) === null, 'hors ligne partout → âge inconnu');
}

// ── 3. Les logos d'une carte : trois, puis « +N » ────────────────────────────
{
  verifier(R.MAX_LOGOS_CARTE === 3, 'trois logos au plus');
  verifier(egal(R.pileLogos(['vinted', 'ebay']), { visibles: ['vinted', 'ebay'], reste: 0 }), 'deux logos : tous visibles');
  verifier(egal(R.pileLogos(['a', 'b', 'c']), { visibles: ['a', 'b', 'c'], reste: 0 }), 'trois logos : tous visibles, pas de +0');
  verifier(egal(R.pileLogos(['a', 'b', 'c', 'd', 'e']), { visibles: ['a', 'b', 'c'], reste: 2 }), 'cinq logos : trois + « +2 »');
  verifier(egal(R.pileLogos(null), { visibles: [], reste: 0 }), 'pas de liste : rien, sans lever');
  const carte = lire('src/stock/Carte.jsx');
  verifier(/pileLogos\(/.test(carte), 'la carte passe par pileLogos');
}

// ── 4. Les filtres ───────────────────────────────────────────────────────────
{
  verifier(egal(R.FILTRES_RAPIDES, ['tous', 'en_ligne', 'pas_partout', 'anciennes', 'vendus']), 'les cinq pastilles, dans l’ordre de la planche');
  verifier(egal(R.FILTRES_RAPIDES.map((c) => R.libelleFiltreRapide(c, 'fr')), ['Tous', 'En ligne', 'Pas partout', 'Anciennes', 'Vendus']), 'leurs libellés');
  const f = R.entreDansFiltreRapide;
  const vendu = { vendu: true, enLigne: true, aPublier: 2, ancienne: true };
  verifier(f('vendus', vendu) && !f('tous', vendu) && !f('en_ligne', vendu) && !f('pas_partout', vendu) && !f('anciennes', vendu), 'un vendu n’entre QUE dans « Vendus »');
  verifier(f('tous', {}) && !f('vendus', {}), 'un article en stock entre dans « Tous », pas dans « Vendus »');
  verifier(f('en_ligne', { enLigne: true }) && !f('en_ligne', { enLigne: false }), '« En ligne » = au moins une annonce en ligne');
  verifier(f('pas_partout', { aPublier: 1 }) && !f('pas_partout', { aPublier: 0 }), '« Pas partout » = une plateforme encore libre');
  verifier(f('anciennes', { enLigne: true, ancienne: true }) && !f('anciennes', { enLigne: false, ancienne: true }), '« Anciennes » = en ligne ET ancienne');
  verifier(R.trancheAnciennete(null) === null, 'âge inconnu : aucune tranche (jamais « moins de 7 j » par défaut)');
  verifier(R.trancheAnciennete(0) === 'moins_7' && R.trancheAnciennete(6) === 'moins_7', 'moins de 7 j');
  verifier(R.trancheAnciennete(7) === '7_30' && R.trancheAnciennete(30) === '7_30', '7 à 30 j');
  verifier(R.trancheAnciennete(31) === 'plus_30', 'plus de 30 j');
  verifier(R.lirePrixSaisi('12,50') === 12.5 && R.lirePrixSaisi(' 1 200 ') === 1200 && R.lirePrixSaisi('10.5') === 10.5, 'saisie française lue');
  verifier(R.lirePrixSaisi('') === null && R.lirePrixSaisi('abc') === null && R.lirePrixSaisi('-3') === null, 'vide, illisible ou négatif → pas de borne');
  verifier(R.dansFourchettePrix(null, null, null) === true, 'sans borne, tout passe');
  verifier(R.dansFourchettePrix(null, 5, null) === false && R.dansFourchettePrix(null, null, 50) === false, 'prix INCONNU : ne satisfait aucune borne (VIDE ≠ ZÉRO)');
  verifier(R.dansFourchettePrix(0, 0, 10) === true, 'un vrai zéro est un prix');
  verifier(R.dansFourchettePrix(10, 5, 20) && !R.dansFourchettePrix(4, 5, null) && !R.dansFourchettePrix(25, null, 20), 'bornes min et max');
}

// ── 5. Cartes / Liste, mémorisé ──────────────────────────────────────────────
{
  const memoire = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const st = memoire();
  verifier(R.lireAffichage(st) === 'cartes', 'première visite : Cartes');
  verifier(R.ecrireAffichage(st, 'liste') === true && st.m.get(R.CLE_AFFICHAGE) === 'liste', 'le choix « Liste » est écrit sous fs_stock_affichage');
  verifier(R.lireAffichage(st) === 'liste', 'et relu à la visite suivante');
  verifier(R.ecrireAffichage(st, 'grille') === false && R.lireAffichage(st) === 'liste', 'une valeur inconnue n’est jamais écrite');
  st.m.set(R.CLE_AFFICHAGE, 'n’importe quoi');
  verifier(R.lireAffichage(st) === 'cartes', 'une valeur lue inconnue retombe sur Cartes');
  const enPanne = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
  verifier(R.lireAffichage(enPanne) === 'cartes' && R.ecrireAffichage(enPanne, 'liste') === false, 'stockage en panne : Cartes, sans lever');
  verifier(R.lireAffichage(null) === 'cartes', 'pas de stockage : Cartes');
  const stock = lire('src/tabs/StockTab.jsx');
  verifier(/lireAffichage\(/.test(stock) && /ecrireAffichage\(/.test(stock), 'le Stock lit ET écrit le choix par ces deux fonctions');
}

// ── 6. Un seul verbe : « Synchroniser » ──────────────────────────────────────
{
  const textes = lire('src/annonces/textes.js');
  verifier(/UN SEUL VERBE : « synchroniser »/.test(textes), 'la règle de textes.js impose « synchroniser »');
  const T = textesAnnonces('fr');
  verifier(T.ctaTout === 'Synchroniser', 'le bouton s’appelle « Synchroniser »', `« ${T.ctaTout} »`);
  verifier(T.titreEnCours === 'Synchronisation', 'pendant : « Synchronisation »');
  // Chaque mot FR, y compris les phrases construites (appelées avec des
  // arguments types) : jamais « relever », jamais « actualiser ».
  const args = ['Vinted', 2, 3, 'il y a 2 min'];
  const tout = [];
  for (const [cle, v] of Object.entries(T)) {
    if (typeof v === 'string') tout.push([cle, v]);
    else if (typeof v === 'function') { try { const r = v(...args); if (typeof r === 'string') tout.push([cle, r]); } catch { /* phrase à arguments typés : lue dans la source plus bas */ } }
  }
  const fautifs = tout.filter(([, t]) => /\brelev|\brelèv|actualis/i.test(t)).map(([c]) => c);
  verifier(fautifs.length === 0, 'aucun texte FR ne dit « relever » ni « actualiser »', fautifs.join(', '));
  // Les chaînes de code de la refonte (src/stock/) : même règle.
  const fichiers = fs.readdirSync(join(ROOT, 'src/stock')).filter((f) => /\.(jsx?|mjs)$/.test(f));
  const parles = [];
  for (const f of fichiers) {
    for (const l of lignesDeCode(lire(`src/stock/${f}`))) {
      for (const m of l.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
        const s = m[1] ?? m[2] ?? m[3] ?? '';
        if (/\b[Rr]elev(er|ez|é)\b|\bRelèv|\bActualis/.test(s)) parles.push(`${f}: ${s.slice(0, 50)}`);
      }
    }
  }
  verifier(parles.length === 0, 'aucune phrase de src/stock/ ne dit « relever »', parles.join(' | '));
  const bloc = lire('src/stock/BlocSynchro.jsx');
  verifier(/T\.ctaTout/.test(bloc), 'le bouton du bloc de synchronisation lit T.ctaTout');
  verifier(/<ConstellationReleve\b/.test(bloc), 'l’animation de synchronisation est le composant EXISTANT (ConstellationReleve)');
}

// ── 7. Les tris de la planche ────────────────────────────────────────────────
{
  verifier(R.TRI_PAR_DEFAUT === 'ajout_desc', '« Plus récents » par défaut');
  verifier(egal(R.TRIS_PLANCHE.map((c) => R.libelleTriPlanche(c, 'fr')), ['Plus récents', 'Plus anciens', 'Plus vus', 'Prix croissant', 'Prix décroissant']), 'les cinq tris de la planche');
  const items = [{ id: 1, v: 5 }, { id: 2, v: null }, { id: 3, v: 40 }, { id: 4, v: 5 }];
  const tri = trierStock(items, 'vues_desc', { vues: (it) => it.v }).map((it) => it.id);
  verifier(egal(tri, [3, 1, 4, 2]), '« Plus vus » : décroissant, stable, vues inconnues en dernier', tri.join(','));
}

// ── 8. Dupliquer ─────────────────────────────────────────────────────────────
{
  const original = {
    id: 1759480000000, user_id: 'u-1', titre: 'Veste en jean', prix_achat: null, prix_achat_inconnu: true,
    prix_vente: 25, marque: 'Levi’s', description: 'Très bon état', type: 'Mode', purchase_costs: 2, selling_fees: 3.4,
    emplacement: 'Portant 3', plateforme: 'Vinted', photos: [{ type: 'photo', url: 'https://x/listing-photos/u-1/raw/a_1.jpg' }],
    vinted_catalog_id: 1234, statut: 'vendu', quantite: 3, margin: 12, margin_pct: 40, date: '2026-09-01T10:00:00Z',
    vinted_item_id: '7788', listed_at_guess: '2026-09-02T10:00:00Z', first_seen_at: '2026-09-02T10:00:00Z',
    last_synced_at: '2026-10-01T10:00:00Z', disparu_le: null, vinted_status: 'active', vinted_view_count: 87,
    vinted_favourite_count: 9, vinted_account_id: '472079', origine: 'releve_vinted', fusionne_dans: null, fusionne_le: null,
    attributs: { etat: { v: 'Très bon état' }, taille: { v: 'M' }, poids: { v: 600 }, contenu_divergent: { leboncoin: true } },
  };
  const fiche = { inventaire_id: original.id, user_id: 'u-1', scan_id: 'scan-9', source: 'lens', brouillon: true,
    fiche: { titres: { vinted: 'Veste en jean Levi’s' }, champs: { vinted: { couleur: 'Bleu' } } } };
  const maintenant = new Date('2026-10-03T12:00:00Z');
  const { inventaire: c, fiche: cf } = D.construireCopie(original, fiche, { id: 42, maintenant });
  verifier(c.id === 42 && c.user_id === 'u-1', 'identifiant NEUF, même compte');
  for (const col of ['titre', 'prix_achat', 'prix_achat_inconnu', 'prix_vente', 'marque', 'description', 'type', 'purchase_costs', 'emplacement', 'plateforme', 'vinted_catalog_id']) {
    verifier(egal(c[col], original[col]), `copié : ${col}`);
  }
  verifier(egal(c.photos, original.photos), 'copiées : les photos (mêmes fichiers, protégés tant qu’une fiche les cite)');
  verifier(c.statut === 'stock' && c.quantite === 1, 'la copie est EN STOCK, à l’unité (même d’un vendu ou d’un lot)');
  verifier(c.margin === null && c.margin_pct === null && c.selling_fees === 0, 'ni marge ni frais de vente : rien n’est vendu');
  verifier(c.origine === null, 'origine NULL (saisie) : aucun trigger de synchro ne s’en mêle');
  const liens = D.COLONNES_LIEES_AUX_ANNONCES.filter((col) => col !== 'origine' && c[col] !== undefined);
  verifier(liens.length === 0, 'AUCUNE colonne qui désigne une annonce de l’original', liens.join(', '));
  verifier(c.attributs.etat?.v === 'Très bon état' && c.attributs.taille?.v === 'M' && c.attributs.poids?.v === 600, 'copiés : état, taille, poids (attributs)');
  verifier(!('contenu_divergent' in c.attributs), 'pas l’écart avec une annonce LBC de l’original');
  verifier(c.attributs.duplique_de?.v === original.id && c.attributs.duplique_de?.source === 'duplication', 'la provenance est gardée (lien vers l’ARTICLE, pas ses annonces)');
  verifier('contenu_divergent' in original.attributs, 'l’original n’est pas touché');
  verifier(cf && cf.inventaire_id === 42 && cf.source === 'duplication' && cf.brouillon === false, 'la fiche générée suit la copie, pas en brouillon');
  verifier(cf && !('scan_id' in cf), 'pas le scan de l’original');
  cf.fiche.champs.vinted.couleur = 'Rouge';
  verifier(fiche.fiche.champs.vinted.couleur === 'Bleu', 'copie PROFONDE de la fiche (l’original ne bouge pas)');
  verifier(D.construireCopie(original, null, { id: 43 }).fiche === null, 'sans fiche générée : pas de fiche');

  // dupliquerArticle — base simulée : tout ou rien, rejeu d'identifiant.
  const fausseBase = ({ echecFiche = false, collisions = 0 } = {}) => {
    const journal = [];
    let restantes = collisions;
    const requete = (table) => {
      const etat = { table, op: 'select', filtres: [] };
      const q = {
        select: () => q,
        eq: (k, v) => { etat.filtres.push([k, v]); return q; },
        insert: (lignes) => { etat.op = 'insert'; etat.lignes = lignes; return q; },
        delete: () => { etat.op = 'delete'; return q; },
        maybeSingle: async () => {
          if (table === 'inventaire') return { data: original, error: null };
          return { data: fiche, error: null };
        },
        single: async () => {
          journal.push({ table, op: etat.op, id: etat.lignes?.[0]?.id });
          if (restantes > 0) { restantes--; return { data: null, error: { code: '23505', message: 'duplicate key' } }; }
          return { data: { ...etat.lignes[0] }, error: null };
        },
        then: (resoudre) => {
          journal.push({ table, op: etat.op, filtres: etat.filtres });
          if (table === 'fiches_annonce' && etat.op === 'insert' && echecFiche) return resoudre({ error: { message: 'refus' } });
          return resoudre({ error: null });
        },
      };
      return q;
    };
    return { from: requete, journal };
  };
  {
    const b = fausseBase();
    const r = await D.dupliquerArticle(b, { userId: 'u-1', inventaireId: original.id, maintenant });
    verifier(r.ok && r.ligne.statut === 'stock', 'duplication réussie : la ligne neuve est rendue');
    verifier(b.journal.some((e) => e.table === 'fiches_annonce' && e.op === 'insert'), 'la fiche générée est copiée');
    verifier(!b.journal.some((e) => e.op === 'delete'), 'rien n’est supprimé quand tout passe');
  }
  {
    const b = fausseBase({ echecFiche: true });
    const r = await D.dupliquerArticle(b, { userId: 'u-1', inventaireId: original.id, maintenant });
    const suppression = b.journal.find((e) => e.op === 'delete');
    verifier(!r.ok, 'fiche refusée → la duplication échoue');
    verifier(!!suppression && suppression.table === 'inventaire' && suppression.filtres.some(([k]) => k === 'user_id'), 'TOUT OU RIEN : l’article neuf est retiré (du bon compte)');
  }
  {
    const b = fausseBase({ collisions: 1 });
    const r = await D.dupliquerArticle(b, { userId: 'u-1', inventaireId: original.id, maintenant });
    const essais = b.journal.filter((e) => e.table === 'inventaire' && e.op === 'insert');
    verifier(r.ok && essais.length === 2 && essais[0].id !== essais[1].id, 'collision d’identifiant : un second essai, avec un autre id');
  }
  const app = lire('src/App.jsx');
  verifier(/dupliquerArticle\(supabase,/.test(app) && /_copie:true/.test(app), 'App crée la copie puis ouvre SA fiche en modification');
  verifier(/Dupliquer cet article/.test(app), 'la fiche article porte « Dupliquer »');
  verifier(/onDupliquer=\{\(item\)=>dupliquerFiche\(item,'carte'\)\}/.test(app), 'le menu « … » des cartes est câblé');
  verifier((lire('src/tabs/StockTab.jsx').match(/cle: 'dupliquer'/g) ?? []).length >= 2, '« Dupliquer » est dans le menu « … » (en stock comme vendu)');
}

// ── 9. src/stock/ : ni émoji, ni plateforme en dur ───────────────────────────
{
  const fichiers = fs.readdirSync(join(ROOT, 'src/stock')).filter((f) => /\.(jsx?|mjs)$/.test(f));
  const emojis = []; const depop = [];
  for (const f of fichiers) {
    for (const l of lignesDeCode(lire(`src/stock/${f}`))) {
      if (/\p{Extended_Pictographic}/u.test(l)) emojis.push(`${f}: ${l.trim().slice(0, 60)}`);
      if (/depop/i.test(l)) depop.push(f);
    }
  }
  verifier(emojis.length === 0, 'aucun émoji dans les composants de la refonte', emojis.join(' | '));
  verifier(depop.length === 0, 'Depop n’est écrit nulle part : il viendra de la configuration des plateformes', depop.join(', '));
}

console.log(ko ? `\n${ko} échec(s), ${ok} vérifications vertes.` : `\nTout est vert (${ok} vérifications).`);
process.exit(ko ? 1 : 0);
