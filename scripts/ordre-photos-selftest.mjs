// ═══════════════════════════════════════════════════════════════════════════
// Selftest L'ORDRE DES PHOTOS (06/11/2026, the_closet72 — règle de Nico) — npm run selftest:ordre-photos
// ═══════════════════════════════════════════════════════════════════════════
// L'ordre de l'article fait foi ; un ordre choisi pour une plateforme le remplace pour elle ; une plateforme à limite
// garde les N premières dans l'ordre choisi ; même chose en republication. Verrouillé sur les règles RÉELLES (importées,
// jamais recopiées) :
//   A. la règle JS (_shared/ordre-photos.js) ;
//   B. la publication et le lot (moteur/regles.js › construireJobs, le même pour l'écran et le lot) : 5 plateformes ;
//   C. les limites à l'envoi (Vinted 20 : get-pending-jobs ; Depop 8 : l'extension) ;
//   D. la republication « avec toutes tes photos » de Leboncoin (photos-lbc-amputees.js) ;
//   E. la migration 20261106230000 : republication, remise en vente, déclencheur — et leurs définitions de prod ;
//   F. sur un Postgres JETABLE (embedded-postgres, jamais la prod) : la règle SQL rend EXACTEMENT ce que rend la règle
//      JS (cas écrits + 400 cas tirés au sort), le déclencheur fait suivre les tâches pas encore parties, et les deux
//      insertions des fonctions de prod s'exécutent avec leurs vraies variables.
// Rouge = l'ordre peut de nouveau se perdre quelque part : on ne livre pas.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

const { photosDansLOrdreDeLArticle, clePhoto } = await imp('supabase/functions/_shared/ordre-photos.js');
const { construireJobs } = await imp('src/publication/moteur/regles.js');
const { entreesPhotos } = await imp('src/utils/photos.js');
const { getLbcFreePhotoQuota } = await imp('src/utils/lbcCategories.js');
const { photosDansLaLimite } = await imp('supabase/functions/_shared/photos-limite-plateforme.js');
const { ligneRepublicationPhotos } = await imp('supabase/functions/_shared/photos-lbc-amputees.js');

let ko = 0;
const ok = (cond, nom, detail = '') => {
  if (!cond) ko++;
  console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `   ← ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const urls = (l) => (l ?? []).map((p) => (typeof p === 'string' ? p : p?.url));
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Les photos du Lee noir de the_closet72 (06/11) : prise de vue 0…14, ordre choisi 5, 0, 4, 8, 14, 11…
const U = (i) => `https://x.supabase.co/storage/v1/object/public/listing-photos/u/raw/1793979784984_${i}.jpg?v=1793979784984`;
const prise = Array.from({ length: 15 }, (_, i) => ({ type: i === 0 ? 'original' : `photo_${i}`, url: U(i) }));
const ORDRE = [5, 0, 4, 8, 14, 11, 1, 2, 3, 6, 7, 9, 10, 12, 13];
const choisi = ORDRE.map((i) => prise[i]);

console.log('A. La règle : l\'ordre de l\'article fait foi');
{
  const r = photosDansLOrdreDeLArticle(prise, choisi, {});
  ok(egal(urls(r), urls(choisi)), 'job dans l\'ordre de prise de vue → l\'ordre de l\'article', urls(r).map((u) => u.match(/_(\d+)\.jpg/)[1]));
  ok(r[0] === prise[5], 'les entrées du job sont gardées telles quelles (seul l\'ordre change)');
  ok(photosDansLOrdreDeLArticle(choisi, choisi, {}) === choisi, 'déjà dans l\'ordre → le MÊME tableau (aucune écriture)');
  ok(photosDansLOrdreDeLArticle(prise, choisi, { photos_choisies: true }) === prise, 'ordre choisi pour CETTE plateforme → gardé tel quel');
  ok(photosDansLOrdreDeLArticle(prise, choisi, { photos_choisies: 'true' }) === prise, '… même écrit « true »');
  const trois = photosDansLOrdreDeLArticle(prise.slice(0, 3), choisi, { lbcPhotosCapped: true });
  ok(egal(urls(trois), urls(choisi.slice(0, 3))), 'dépôt plafonné à 3 (Leboncoin) → les 3 PREMIÈRES de l\'article', urls(trois));
  const sansPlafond = photosDansLOrdreDeLArticle(prise.slice(0, 3), choisi, {});
  ok(egal(urls(sansPlafond), [U(0), U(1), U(2)].sort((a, b) => urls(choisi).indexOf(a) - urls(choisi).indexOf(b))), 'job qui porte moins que l\'article (sans plafond) : ses photos seulement, rien d\'ajouté');
  const chaines = choisi.map((p) => p.url);
  const r2 = photosDansLOrdreDeLArticle(prise, chaines, {});
  ok(egal(urls(r2), chaines) && typeof r2[0] === 'object', 'article en chaînes nues, job en objets → objets du job, ordre de l\'article');
  const plaf2 = photosDansLOrdreDeLArticle([prise[0]], chaines, { lbcPhotosCapped: true });
  ok(egal(plaf2, [{ url: chaines[0], type: 'original' }]), 'plafonné : une photo de l\'article absente du job part en { url, type }', plaf2);
  ok(photosDansLOrdreDeLArticle([...prise, { url: 'https://ailleurs/cdn/1.jpg' }], choisi, {}).length === 16
    && photosDansLOrdreDeLArticle([...prise, { url: 'https://ailleurs/cdn/1.jpg' }], choisi, {})[0] === prise[0],
    'une photo du job absente de l\'article (autre hébergement) → job tel quel');
  ok(photosDansLOrdreDeLArticle([prise[0], prise[0], prise[1]], choisi, {})[0] === prise[0], 'doublon dans le job → job tel quel');
  ok(photosDansLOrdreDeLArticle(prise, [], {}) === prise && photosDansLOrdreDeLArticle(prise, null, {}) === prise, 'article sans photo → job tel quel');
  ok(photosDansLOrdreDeLArticle([], choisi, {}).length === 0 && photosDansLOrdreDeLArticle(null, choisi, {}) === null, 'job sans photo → tel quel');
  ok(clePhoto(U(3)) === clePhoto(U(3).replace('?v=1793979784984', '?v=2')), 'la requête (?v=…) ne distingue pas deux photos');
}

console.log('B. Publication et lot : construireJobs, 5 plateformes');
const PLATEFORMES = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'];
const construire = ({ processedPhotos, edited = {}, lbcCategoryPath = ['Mode', 'Vêtements'] }) => {
  const champsResolus = Object.fromEntries(PLATEFORMES.map((p) => [p, p === 'leboncoin' ? { lbcCategoryPath } : {}]));
  const ed = Object.fromEntries(PLATEFORMES.map((p) => [p, { title: 'Jean Lee noir', description: 'Jean.', price: 25, ...(edited[p] ?? {}) }]));
  return construireJobs({
    plateformes: PLATEFORMES, champsResolus, processedPhotos, userId: 'u', inventaireId: 1, photoOption: 'original',
    edited: ed, price: 25, outils: { entreesPhotos, getLbcFreePhotoQuota, normalizeVintedTitle: (t) => t },
  });
};
{
  const { rows, erreur } = construire({ processedPhotos: choisi });
  ok(!erreur && rows.length === 5, '5 lignes, aucune erreur', erreur);
  for (const r of rows) ok(egal(urls(r.photos), urls(choisi)), `${r.platform} : l'ordre de l'article (couverture = photo 5)`, urls(r.photos).slice(0, 3));
  // L'article vu par l'écran : URLs nues (Stock, Lens) → entreesPhotos → même ordre.
  const { rows: rows2 } = construire({ processedPhotos: choisi.map((p) => p.url) });
  ok(rows2.every((r) => egal(urls(r.photos), urls(choisi))), 'article en URLs nues : même ordre partout');
  // Un ordre choisi pour Beebs seulement : Beebs le prend, les autres gardent l'ordre de l'article.
  const pourBeebs = [U(14), U(13), U(12)];
  const { rows: rows3 } = construire({ processedPhotos: choisi, edited: { beebs: { photos: pourBeebs } } });
  const beebs = rows3.find((r) => r.platform === 'beebs');
  ok(egal(urls(beebs.photos), pourBeebs) && beebs.platform_fields.photos_choisies === true, 'Beebs : son choix (14, 13, 12), marqué photos_choisies');
  ok(rows3.filter((r) => r.platform !== 'beebs').every((r) => egal(urls(r.photos), urls(choisi)) && !r.platform_fields.photos_choisies),
    'les 4 autres : l\'ordre de l\'article, aucun choix');
  // Leboncoin plafonné (Divers > Autres : 3 gratuites) : les 3 premières DANS L'ORDRE CHOISI.
  const { rows: rows4 } = construire({ processedPhotos: choisi, lbcCategoryPath: ['Divers', 'Autres'] });
  const lbc = rows4.find((r) => r.platform === 'leboncoin');
  ok(egal(urls(lbc.photos), urls(choisi.slice(0, 3))) && lbc.platform_fields.lbcPhotosCapped === true, 'Leboncoin « Divers > Autres » : 5, 0, 4 (les 3 premières de l\'ordre choisi)', urls(lbc.photos));
  // Un choix Leboncoin plafonné ensuite : les 3 premières de SON choix.
  const { rows: rows5 } = construire({ processedPhotos: choisi, lbcCategoryPath: ['Divers', 'Autres'], edited: { leboncoin: { photos: [U(9), U(8), U(7), U(6)] } } });
  ok(egal(urls(rows5.find((r) => r.platform === 'leboncoin').photos), [U(9), U(8), U(7)]), 'Leboncoin choisi (9, 8, 7, 6) puis plafonné à 3 → 9, 8, 7');
}

console.log('C. Les limites à l\'envoi gardent l\'ordre');
{
  const vingtQuatre = Array.from({ length: 24 }, (_, i) => ({ url: U(23 - i) }));
  const v = photosDansLaLimite('vinted', vingtQuatre);
  ok(v.length === 20 && egal(urls(v), urls(vingtQuatre.slice(0, 20))), 'Vinted (get-pending-jobs) : les 20 premières, dans l\'ordre du job');
  ok(photosDansLaLimite('beebs', vingtQuatre) === vingtQuatre && photosDansLaLimite('leboncoin', vingtQuatre) === vingtQuatre, 'Beebs, Leboncoin : la liste du job, intacte');
  const depop = lire('chrome-extension/content-scripts/depop.js');
  ok(/\.slice\(0,\s*DEPOP_PHOTOS_MAX\)/.test(depop) && !/photos[^\n]{0,80}\.sort\(/.test(depop), 'Depop (extension) : les 8 premières (slice), aucun tri');
  for (const f of ['vinted', 'leboncoin', 'beebs', 'ebay']) {
    const src = lire(`chrome-extension/content-scripts/${f}.js`);
    ok(!/job\.photos[^\n]{0,60}\.sort\(/.test(src), `${f} (extension) : les photos du job ne sont jamais triées`);
  }
}

console.log('D. Republication « avec toutes tes photos » (Leboncoin)');
{
  const src = { id: 'j1', user_id: 'u', inventaire_id: 1, platform: 'leboncoin', photos: prise, title: 't', price: 1, platform_fields: { lbcPhotosCapped: true, photos_lbc: { envoyees: 3, fiche: 15 } } };
  const l = ligneRepublicationPhotos(src, { photosFiche: choisi, maintenant: '2026-11-06T18:00:00Z' });
  ok(egal(urls(l.photos), urls(choisi)), 'l\'ordre de la fiche (jamais plafonnée : la page relit le gratuit)', urls(l.photos).slice(0, 3));
  ok(l.platform_fields.republish_snapshot.photos === 15, 'le compte de photos de la copie suit');
  const l2 = ligneRepublicationPhotos({ ...src, platform_fields: { photos_choisies: true } }, { photosFiche: choisi });
  ok(l2.photos === prise, 'un choix fait pour Leboncoin : gardé tel quel');
}

console.log('E. La migration : republication, remise en vente, déclencheur — sur les définitions de prod');
const MIG = lire('supabase/migrations/20261106230000_ordre_photos_article.sql');
const PROD_REP = lire('scripts/fixtures/ordre-photos/prod-0611-spend_coins_and_republish.sql.txt');
const PROD_REM = lire('scripts/fixtures/ordre-photos/prod-0611-remises_en_vente_tick.sql.txt');
const INSERT_REP = `    -- (06/11, the_closet72 — règle de Nico) L'ORDRE DE L'ARTICLE FAIT FOI, en republication aussi : les photos du job
    -- source (rien d'ajouté, rien de retiré) remises dans l'ordre de la fiche ; un choix fait pour CETTE plateforme
    -- (photos_choisies) gardé tel quel ; un dépôt plafonné (quota Leboncoin) = les N premières de la fiche
    -- (public.photos_ordre_article). Avant : l'ordre de l'ANCIEN job, même après un réordonnancement de la fiche.
    v_photos := public.photos_ordre_article(v_photos,
      (SELECT i.photos FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user),
      v_src.platform_fields);
`;
const corps = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return null;
  const debut = txt.indexOf('$function$', i);
  const fin = txt.indexOf('$function$', debut + 10);
  return txt.slice(i, fin + 10);
};
{
  const rep = corps(MIG, 'spend_coins_and_republish');
  ok(rep && rep.includes(INSERT_REP), 'spend_coins_and_republish : les photos du job source passent par la règle');
  ok(rep && rep.replace(INSERT_REP, '') === PROD_REP.trimEnd(), 'spend_coins_and_republish : la définition de prod du 06/11, à cette insertion près');
  const rem = corps(MIG, 'remises_en_vente_tick');
  const remAvant = `                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0 THEN j.photos
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,`;
  const remApres = `                -- (06/11, the_closet72) Les photos du job vendu, dans l'ORDRE DE LA FICHE (public.photos_ordre_article).
                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0
                          THEN public.photos_ordre_article(j.photos, i.photos, j.platform_fields)
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,`;
  ok(rem && rem.includes(remApres), 'remises_en_vente_tick : les photos du job vendu passent par la règle');
  ok(rem && rem.replace(remApres, remAvant) === PROD_REM.trimEnd(), 'remises_en_vente_tick : la définition de prod du 06/11, à ce remplacement près');
  ok(/CREATE TRIGGER inventaire_ordre_photos_vers_taches\s+AFTER UPDATE OF photos ON public\.inventaire/.test(MIG), 'déclencheur posé sur inventaire.photos');
  ok(/j\.status IN \('pending', 'needs_user', 'failed'\)/.test(MIG) && !/'processing'|'published'/.test(MIG.slice(MIG.indexOf('inventaire_ordre_photos_vers_taches()'))),
    'déclencheur : jamais une tâche en cours ni une annonce en ligne');
  ok(!/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m.test(MIG), 'aucune transaction dans la migration (leçon du 03/11)');
}

console.log('F. Sur un Postgres JETABLE : la règle SQL = la règle JS, le déclencheur, les insertions de prod');
let EmbeddedPostgres, pg;
try { ({ default: EmbeddedPostgres } = await import('embedded-postgres')); pg = (await import('pg')).default; }
catch {
  ok(false, 'embedded-postgres et pg introuvables', 'npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3');
}
if (EmbeddedPostgres && pg) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(path.join(tmpdir(), 'fillsell-ordre-photos-'));
  const port = 56000 + Math.floor(Math.random() * 2000);
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'ordre', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  let client;
  try {
    await base.initialise();
    await base.start();
    client = new pg.Client({ connectionString: `postgres://postgres:ordre@127.0.0.1:${port}/postgres` });
    await client.connect();
    // Le décor : les tables que les fonctions lisent à la création (colonnes de prod utiles), auth.uid().
    await client.query(String.raw`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
      CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, statut text DEFAULT 'stock', titre text, photos jsonb);
      CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
        status text, photo_option text, bulk_batch_id uuid, title text, description text, price numeric, photos jsonb,
        platform_listing_id text, generated_at timestamptz, published_at timestamptz, error text, created_at timestamptz DEFAULT now(),
        listing_url text, last_checked_at timestamptz, sold_at timestamptz, platform_fields jsonb, action text, handler_build text,
        reservation_id uuid, reservation_settled_at timestamptz, voie text, vu_en_ligne_le timestamptz);
      CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, included_balance integer, purchased_balance integer, next_grant_at timestamptz, updated_at timestamptz);
      CREATE TABLE public.remises_en_vente (id bigint PRIMARY KEY);
    `);
    await client.query(MIG);
    ok(true, 'migration appliquée sur la base jetable (règle, deux fonctions de prod, déclencheur)');

    // F1. Parité : cas écrits + tirages.
    const cas = [];
    const pfs = [{}, { photos_choisies: true }, { lbcPhotosCapped: true }, { lbcPhotosCapped: 'true', photos_choisies: false }, null];
    const familles = [prise, choisi, choisi.map((p) => p.url), prise.slice(0, 3), [...prise, { url: 'https://ailleurs/1.jpg' }],
      [prise[0], prise[0]], [], null, [{ type: 'original' }], ['  ' + U(2) + '  ', U(1)], [42, U(1)], { pas: 'un tableau' }];
    for (const j of familles) for (const a of familles) for (const pf of pfs) cas.push([j, a, pf]);
    let graine = 6112026;
    const hasard = (n) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };
    for (let t = 0; t < 400; t++) {
      const n = 1 + hasard(8);
      const pool = Array.from({ length: 10 }, (_, i) => (hasard(3) === 0 ? U(i) : { type: `photo_${i}`, url: U(i) }));
      const job = Array.from({ length: n }, () => pool[hasard(10)]);
      const art = Array.from({ length: hasard(12) }, () => pool[hasard(10)]);
      cas.push([job, art, pfs[hasard(pfs.length)]]);
    }
    let ecarts = 0, premier = null;
    for (const [j, a, pf] of cas) {
      const attendu = photosDansLOrdreDeLArticle(Array.isArray(j) ? j : j, a, pf);
      const { rows } = await client.query('SELECT public.photos_ordre_article($1::jsonb, $2::jsonb, $3::jsonb) AS r',
        [j === null ? null : JSON.stringify(j), a === null ? null : JSON.stringify(a), pf === null ? null : JSON.stringify(pf)]);
      const sql = rows[0].r;
      const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((c) => [c, x[c]])) : x));
      if (canon(sql) !== canon(attendu === undefined ? null : attendu)) { ecarts++; premier ??= { j, a, pf, sql, attendu }; }
    }
    ok(ecarts === 0, `règle SQL = règle JS sur ${cas.length} cas`, premier);

    // F2. Le déclencheur : Stock › Modifier réordonne l'article.
    const user = '8ac5bbda-0947-4612-82fd-effdaa3ca84a';
    await client.query('INSERT INTO inventaire (id, user_id, photos) VALUES (1, $1, $2::jsonb)', [user, JSON.stringify(prise)]);
    const tache = async (platform, status, photos, pf = {}, action = 'publish') => (await client.query(
      'INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photos, platform_fields) VALUES ($1, 1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id',
      [user, platform, status, action, JSON.stringify(photos), JSON.stringify(pf)])).rows[0].id;
    const t = {
      vintedEnAttente: await tache('vinted', 'pending', prise),
      lbcPlafonne: await tache('leboncoin', 'pending', prise.slice(0, 3), { lbcPhotosCapped: true }),
      beebsChoisie: await tache('beebs', 'needs_user', [prise[14], prise[13]], { photos_choisies: true, lbcPhotosCapped: true }),
      depopEnCours: await tache('depop', 'processing', prise),
      ebayEnLigne: await tache('ebay', 'published', prise),
      vintedEchouee: await tache('vinted', 'failed', prise, {}, 'republish'),
      retrait: await tache('vinted', 'pending', prise, {}, 'delete'),
    };
    await client.query('UPDATE inventaire SET photos = $1::jsonb WHERE id = 1', [JSON.stringify(choisi)]);
    const photosDe = async (id) => urls((await client.query('SELECT photos FROM cross_post_jobs WHERE id = $1', [id])).rows[0].photos);
    ok(egal(await photosDe(t.vintedEnAttente), urls(choisi)), 'tâche en attente : suit l\'ordre de l\'article');
    ok(egal(await photosDe(t.lbcPlafonne), urls(choisi.slice(0, 3))), 'Leboncoin plafonné en attente : les 3 premières de l\'article');
    ok(egal(await photosDe(t.beebsChoisie), [U(14), U(13)]), 'choix fait pour Beebs : intact');
    ok(egal(await photosDe(t.depopEnCours), urls(prise)), 'tâche EN COURS (processing) : jamais touchée');
    ok(egal(await photosDe(t.ebayEnLigne), urls(prise)), 'annonce EN LIGNE : jamais touchée ici');
    ok(egal(await photosDe(t.vintedEchouee), urls(choisi)), 'republication échouée (à relancer) : suit');
    ok(egal(await photosDe(t.retrait), urls(prise)), 'un retrait : jamais touché');
    const avant = (await client.query("SELECT xmin::text x FROM cross_post_jobs WHERE id = $1", [t.vintedEnAttente])).rows[0].x;
    await client.query('UPDATE inventaire SET photos = $1::jsonb, titre = \'x\' WHERE id = 1', [JSON.stringify(choisi.map((p) => p.url))]);
    const apres = (await client.query("SELECT xmin::text x FROM cross_post_jobs WHERE id = $1", [t.vintedEnAttente])).rows[0].x;
    ok(avant === apres, 'même ordre réécrit autrement (chaînes) : aucune ligne réécrite');
    await client.query('UPDATE inventaire SET photos = \'"pas un tableau"\'::jsonb WHERE id = 1');
    ok(egal(await photosDe(t.vintedEnAttente), urls(choisi)), 'photos illisibles sur l\'article : tâches inchangées, écriture de la fiche acceptée');

    // F3. Les insertions des fonctions de prod s'exécutent avec leurs vraies variables (types de prod).
    await client.query('UPDATE inventaire SET photos = $1::jsonb WHERE id = 1', [JSON.stringify(choisi)]);
    const bloc = INSERT_REP.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user}"}', false)`);
    await client.query('CREATE TEMP TABLE sortie (photos jsonb)');
    await client.query(String.raw`
      DO $$
      DECLARE
        v_user uuid := auth.uid();
        v_src cross_post_jobs%ROWTYPE;
        v_photos jsonb;
        p_inventaire_id bigint := 1;
      BEGIN
        SELECT * INTO v_src FROM cross_post_jobs WHERE platform = 'ebay' AND inventaire_id = 1;
        v_photos := v_src.photos;
${bloc}
        INSERT INTO sortie VALUES (v_photos);
      END $$;`);
    const rep =(await client.query('SELECT photos FROM sortie')).rows[0]?.photos;
    ok(egal(urls(rep), urls(choisi)), 'spend_coins_and_republish (insertion de prod) : la copie part dans l\'ordre de l\'article', urls(rep ?? []).slice(0, 3));
    const { rows: r4 } = await client.query(`
      SELECT CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0
                       THEN public.photos_ordre_article(j.photos, i.photos, j.platform_fields)
                  WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END AS photos
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id WHERE j.platform = 'ebay'`);
    ok(egal(urls(r4[0].photos), urls(choisi)), 'remises_en_vente_tick (expression de prod) : la remise part dans l\'ordre de l\'article');
  } catch (e) {
    ok(false, 'base jetable', String(e?.message ?? e));
  } finally {
    try { await client?.end(); } catch { /* rien */ }
    try { await base.stop(); } catch { /* rien */ }
    try { rmSync(dossier, { recursive: true, force: true }); } catch { /* rien */ }
  }
}

console.log(ko ? `\n${ko} KO — l'ordre des photos peut se perdre : ne pas livrer.` : '\nTout est vert : l\'ordre de l\'article fait foi partout.');
process.exit(ko ? 1 : 0);
