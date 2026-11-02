// Les lignes brutes dont les décisions SQL et JS (hors moteur v3) tirent leurs photos, en LECTURE SEULE,
// par pages (keyset sur id, une page = UNE ligne SQL json_agg : jamais la coupe à 1 000 lignes).
//   inventaire          → donnees/tables/inventaire.ndjson
//   annonces_plateforme → donnees/tables/annonces.ndjson
//   cross_post_jobs     → donnees/tables/jobs.ndjson (publish / republish)
// Usage : node lire-tables.mjs [inventaire|annonces|jobs ...]
import fs from 'node:fs';
import path from 'node:path';
import { requete, W } from './sql-lecture.mjs';

const dir = path.join(W, 'donnees', 'tables');
fs.mkdirSync(dir, { recursive: true });

// Un élément de photos : la chaîne, ou url / original d'un objet (comme fiche_photos_urls / rapprochement_v3_lire).
const URLS = (col) => `COALESCE((SELECT jsonb_agg(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END ORDER BY o)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)), '[]'::jsonb)`;
// urlsPhotos (recreation-deja-partie.js) : la chaîne, ou x.url d'un objet (sans « original »).
const URLS_JS = (col) => `COALESCE((SELECT jsonb_agg(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e ->> 'url' END ORDER BY o)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)), '[]'::jsonb)`;

const TABLES = {
  inventaire: {
    cle: 'i.id', type: 'bigint',
    sel: `json_build_array(i.id::text, i.user_id::text, i.statut, i.fusionne_dans IS NOT NULL, i.origine, i.vinted_item_id IS NOT NULL,
      i.created_at, left(i.titre, 90), ${URLS('i.photos')}, i.photos ->> 0, ${URLS_JS('i.photos')},
      COALESCE((SELECT jsonb_agg(e ->> 'url' ORDER BY o) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)), '[]'::jsonb),
      COALESCE(i.quantite, 1))`,
    de: 'inventaire i',
    champs: ['id', 'user', 'statut', 'fusionnee', 'origine', 'vinted', 'created_at', 'titre', 'urls', 'p0', 'urls_js', 'urls_cle_url', 'quantite'],
  },
  annonces: {
    cle: 'a.id', type: 'uuid',
    sel: `json_build_array(a.id::text, a.user_id::text, a.platform, a.listing_id, a.photo_url, ${URLS("a.capture -> 'photos'")}, ${URLS_JS("a.capture -> 'photos'")},
      a.inventaire_id::text, a.disparu_le IS NOT NULL, a.ignoree_le IS NOT NULL, a.statut_plateforme, a.job_id::text, left(a.titre, 90), a.created_at, a.retiree_le IS NOT NULL)`,
    de: 'annonces_plateforme a',
    champs: ['id', 'user', 'platform', 'listing_id', 'photo_url', 'capture_urls', 'capture_urls_js', 'inventaire_id', 'disparue', 'ignoree', 'statut_plateforme', 'job_id', 'titre', 'created_at', 'retiree'],
  },
  jobs: {
    cle: 'j.id', type: 'uuid',
    sel: `json_build_array(j.id::text, j.user_id::text, j.platform, j.action, j.status, j.inventaire_id::text, ${URLS_JS('j.photos')},
      j.platform_listing_id, j.listing_url IS NOT NULL, j.published_at, j.created_at, left(j.title, 90))`,
    de: "cross_post_jobs j", filtre: "j.action IN ('publish', 'republish')",
    champs: ['id', 'user', 'platform', 'action', 'status', 'inventaire_id', 'photos', 'platform_listing_id', 'a_lien', 'published_at', 'created_at', 'titre'],
  },
};

const PAGE = 15000;
for (const nom of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TABLES)) {
  const t = TABLES[nom];
  const sortie = path.join(dir, nom + '.ndjson');
  fs.writeFileSync(sortie, JSON.stringify({ champs: t.champs }) + '\n');
  let dernier = null, total = 0;
  const t0 = Date.now();
  for (;;) {
    const cond = [t.filtre, dernier === null ? null : `${t.cle} > '${dernier}'::${t.type}`].filter(Boolean).join(' AND ');
    // la dernière clé de la page (array_agg : max() n'existe pas pour uuid)
    const sql2 = `with z0 as (select ${t.cle} k, ${t.sel} r from ${t.de} ${cond ? 'where ' + cond : ''} order by ${t.cle} limit ${PAGE})
      select json_agg(r order by k) j, (array_agg(k order by k desc))[1]::text m, count(*) n from z0;`;
    const r = requete(sql2, `_${nom}.sql`)[0];
    if (!r || !Number(r.n)) break;
    fs.appendFileSync(sortie, r.j.map((x) => JSON.stringify(x)).join('\n') + '\n');
    total += Number(r.n); dernier = r.m;
    console.log(`${nom} ${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (Number(r.n) < PAGE) break;
  }
  console.log('FIN', nom, total);
}
