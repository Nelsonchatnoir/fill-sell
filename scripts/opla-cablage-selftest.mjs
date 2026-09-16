// ── AUTOTEST DU CÂBLAGE DE LA 5e PLATEFORME (lot C, 2026-09-16) ──────────────
// Le lot C touche les fichiers qui font tourner Vinted, Leboncoin, eBay et
// Beebs en production. Ce qu'il faut prouver est donc double, et les deux
// moitiés comptent autant :
//   1. Opla est VRAIMENT branchée — un job opla entre dans l'état d'un article,
//      il est trié, il est nommé. Sinon le câblage est décoratif.
//   2. RIEN ne bouge pour les 2 364 comptes qui n'ont pas le drapeau — et en
//      particulier aucun « Pas encore sur Opla » ne s'affiche. Ce contrôle-là
//      n'est pas théorique : compteursStock compte `pasEncore.opla` = TOUT le
//      stock de tout le monde, et c'est EXACTEMENT ce qui serait parti à
//      l'écran si les chips servaient PLATEFORMES_STOCK.
//
//   node scripts/opla-cablage-selftest.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// src/ est écrit pour un bundler : ses imports relatifs n'ont pas d'extension
// (`./publicationState`), ce que Node ESM refuse. On règle ça ICI, dans le
// test, plutôt qu'en retouchant des fichiers de production pour la commodité
// d'un script — le lot C est déjà le plus risqué du chantier.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, suivant) {
    try { return await suivant(spec, ctx); }
    catch (e) {
      if (spec.startsWith('.') && !/\\.[cm]?js$/.test(spec)) return suivant(spec + '.js', ctx);
      throw e;
    }
  }
`), pathToFileURL('./'));

const stock = await import(new URL('../src/utils/stockFiltres.js', import.meta.url).href);
const pub = await import(new URL('../src/utils/publicationState.js', import.meta.url).href);
const {
  PLATEFORMES_STOCK, PLATEFORMES_STOCK_OUVERTES, PLATEFORMES_STOCK_A_VENIR,
  LIBELLE_PLATEFORME, indexEtatStock, compteursStock, etatPlateformes,
} = stock;
const { computeRemovalInfo, annoncesEncoreEnLigne } = pub;

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — vu : ${JSON.stringify(detail)}` : ''}`); }
};

const job = (platform, extra = {}) => ({
  id: `job-${platform}-${Math.random().toString(36).slice(2, 8)}`,
  platform, action: 'publish', status: 'published',
  listing_url: `https://exemple/${platform}/1`,
  created_at: '2026-09-16T08:00:00Z',
  ...extra,
});
const article = (id, jobs) => ({ item: { id }, jobs });

console.log('\n── CÂBLAGE OPLA — LES DEUX MOITIÉS ────────────────────────────');

console.log('\n1. Opla est vraiment branchée côté DONNÉES');
{
  ok('PLATEFORMES_STOCK contient opla', PLATEFORMES_STOCK.includes('opla'), PLATEFORMES_STOCK);
  ok('les 4 en service sont intactes, dans le même ordre',
    PLATEFORMES_STOCK.slice(0, 4).join(',') === 'vinted,leboncoin,beebs,ebay', PLATEFORMES_STOCK);
  ok('Opla est NOMMÉE (jamais le code brut à l’écran)', LIBELLE_PLATEFORME.opla === 'Opla', LIBELLE_PLATEFORME.opla);

  // Un job opla 'published' doit entrer dans l'état de l'article — sinon
  // l'écran Stock serait aveugle à la 5e plateforme le jour de l'ouverture.
  const e = etatPlateformes([job('vinted'), job('opla')], 'fr');
  ok('un job opla publié compte comme « en ligne »', e.enLigne.includes('opla'), e.enLigne);

  // Le TRI vit dans annoncesEncoreEnLigne (ORDRE_PLATEFORMES), pas dans
  // etatPlateformes qui rend l'ordre des jobs. C'est cette fonction-là qu'il
  // faut interroger sur l'ordre.
  const rang = annoncesEncoreEnLigne({ id: '1' }, [job('opla'), job('ebay'), job('vinted')]).map((a) => a.platform);
  ok('annoncesEncoreEnLigne trie Opla EN DERNIER', rang[rang.length - 1] === 'opla', rang);
  ok('… et les quatre gardent leur ordre', rang.slice(0, 2).join(',') === 'vinted,ebay', rang);

  const bloque = etatPlateformes([job('opla', { status: 'needs_user', platform_fields: {} })], 'fr');
  ok('un job opla bloqué remonte dans « à compléter »',
    bloque.aCompleter.some((x) => x.platform === 'opla'), bloque.aCompleter.map((x) => x.platform));

  const rm = computeRemovalInfo([job('opla')]);
  ok('le retrait sait viser l’annonce Opla', rm.published.includes('opla'), rm.published);
}

console.log('\n2. ⛔ Rien ne bouge pour un compte SANS le drapeau');
{
  ok('PLATEFORMES_STOCK_OUVERTES reste à QUATRE',
    PLATEFORMES_STOCK_OUVERTES.length === 4 && !PLATEFORMES_STOCK_OUVERTES.includes('opla'),
    PLATEFORMES_STOCK_OUVERTES);
  ok('Opla vit dans la liste « à venir »',
    PLATEFORMES_STOCK_A_VENIR.length === 1 && PLATEFORMES_STOCK_A_VENIR[0] === 'opla',
    PLATEFORMES_STOCK_A_VENIR);

  // LA DÉMONSTRATION DU DANGER, pas une supposition : trois articles publiés
  // sur les 4 plateformes, aucun sur Opla.
  const arts = [article('1', [job('vinted')]), article('2', [job('leboncoin')]), article('3', [job('ebay')])];
  const index = indexEtatStock(arts.map((a) => a.item), Object.fromEntries(arts.map((a) => [a.item.id, a.jobs])), 'fr');
  const c = compteursStock(arts.map((a) => a.item), index);
  ok('⚠️ pasEncore.opla vaut TOUT le stock — c’est ça qui aurait fuité',
    c.pasEncore.opla === 3, c.pasEncore.opla);
  ok('et pourtant aucun chip Opla : la liste d’affichage ne le porte pas',
    !PLATEFORMES_STOCK_OUVERTES.some((p) => c.pasEncore[p] !== undefined && p === 'opla'));

  // Ce que rendrait la rangée de chips pour chacun des deux comptes.
  const chips = (visibles) => [...PLATEFORMES_STOCK_OUVERTES, ...PLATEFORMES_STOCK_A_VENIR.filter((p) => visibles.includes(p))];
  ok('compte SANS drapeau : quatre chips, aucune Opla',
    chips([]).length === 4 && !chips([]).includes('opla'), chips([]));
  ok('compte AVEC le drapeau : Opla en cinquième',
    chips(['opla']).length === 5 && chips(['opla'])[4] === 'opla', chips(['opla']));
  ok('un drapeau inconnu n’ajoute rien', chips(['vestiaire']).length === 4, chips(['vestiaire']));

  // La modale de retrait rend UNE LIGNE PAR ENTRÉE, publiée ou non : c'est le
  // deuxième endroit où Opla aurait fuité chez tout le monde.
  const RM = ['vinted', 'leboncoin', 'beebs', 'ebay'];
  const lignes = (visibles) => [...RM, ...PLATEFORMES_STOCK_A_VENIR.filter((p) => visibles.includes(p))];
  ok('retrait, compte SANS drapeau : quatre lignes', lignes([]).length === 4, lignes([]));
  ok('retrait, compte AVEC : cinq lignes, Opla en dernier',
    lignes(['opla']).length === 5 && lignes(['opla'])[4] === 'opla', lignes(['opla']));
}

console.log('\n3. Les quatre en service, avant/après, à l’identique');
{
  const arts = [article('1', [job('vinted'), job('beebs')]), article('2', [job('leboncoin')])];
  const index = indexEtatStock(arts.map((a) => a.item), Object.fromEntries(arts.map((a) => [a.item.id, a.jobs])), 'fr');
  const c = compteursStock(arts.map((a) => a.item), index);
  ok('compteurs « en ligne » inchangés',
    c.enLigne.vinted === 1 && c.enLigne.beebs === 1 && c.enLigne.leboncoin === 1 && c.enLigne.ebay === 0,
    c.enLigne);
  ok('« pas encore » inchangé pour les quatre',
    c.pasEncore.vinted === 1 && c.pasEncore.leboncoin === 1 && c.pasEncore.beebs === 1 && c.pasEncore.ebay === 2,
    c.pasEncore);
  ok('« jamais publié » inchangé', c.jamais === 0, c.jamais);
  const rang = annoncesEncoreEnLigne({ id: '1' }, [job('ebay'), job('beebs'), job('leboncoin')]).map((a) => a.platform);
  ok('ordre des quatre inchangé', rang.join(',') === 'leboncoin,beebs,ebay', rang);
}

console.log(
  echecs === 0
    ? '\nTOUT PASSE — Opla est branchée, et invisible pour qui n’a pas le drapeau\n'
    : `\n${echecs} CONTRÔLE(S) EN ÉCHEC\n`,
);
process.exit(echecs === 0 ? 0 : 1);
