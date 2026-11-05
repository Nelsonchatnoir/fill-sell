// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION EN LECTURE SEULE — les fiches UNITAIRES qui portent DEUX annonces vivantes (ou plus) d'une même plateforme
// (05/11 soir, point 3 e, décision 2 de Nico : « simulation seulement, aucune réparation »)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico du 05/11 (migration 20261105190000) : une fiche unitaire ne porte jamais deux annonces de la même
// plateforme — deux annonces d'une plateforme sont deux exemplaires (exception : la republication PROUVÉE, P16).
// Ce script relit le parc tel qu'il est et range chaque couple (fiche unitaire × plateforme) dans UNE classe :
//   1. ERREUR      — deux objets différents rattachés à tort : titres sans mot commun, ou titres qui désignent deux
//                    objets (nom propre propre à chacun, n° d'inventaire « #… », taille ou âge, couleur / nombre — le
//                    juge d'attribut du moteur) avec des photos qui ne sont pas identiques, ou un prix du simple au double ;
//   2. REPUBLICATION — une annonce en remplace une autre : republication de FillSell engagée (l'ancienne en cours de
//                    retrait) ou faite (l'ancienne n'est plus vue depuis l'apparition de la nouvelle), remise en ligne
//                    par la personne (même chose, sans job) ; à part, « P16 » : la même annonce publiée deux fois PAR LA
//                    PERSONNE (même titre, même prix, même description, ni lot ni quantité — l'exception voulue le 15/10),
//                    toutes deux en ligne — jamais quand l'une est un dépôt ou une republication de FillSell (à vérifier) ;
//   3. SÉRIE       — la fiche est en réalité un article en plusieurs exemplaires : quantité > 1 sur la plateforme, titre
//                    en série (≥ 3 annonces vivantes de la plateforme au même titre chez le compte, comme titre_en_serie),
//                    même titre déjà vendu sur une AUTRE fiche, ou même titre avec des photos différentes (deux exemplaires) ;
//   4. À VÉRIFIER  — la preuve manque (même objet probable, ou indices contraires).
// L'ordre compte : ERREUR, puis REPUBLICATION (remplacement), puis SÉRIE, puis P16, sinon À VÉRIFIER.
// Photos : photo_empreintes (dHash/pHash + variantes), mesurées par le module du moteur
// (_shared/rapprochement/photos.js, comparerPhotos) ; ≤ 4 = identiques (SEUILS.quasi), > 12 = différentes (SEUILS.proche).
// Population : annonces_plateforme ni disparues, ni retirées, ni ignorées, rattachées à une fiche non fusionnée de
// quantité ≤ 1 ; un couple = (fiche, plateforme) avec ≥ 2 numéros d'annonce distincts. Rien n'est écrit.
// ⛔ (05/11 soir, correction — faux positif « Robe ethnique » de misscat801, signalé par Nico : tout y était retiré) Une
// annonce sans date de disparition n'est pas forcément en ligne : Beebs ne date jamais une absence (règle du 25/10), et
// un retrait déclaré par la personne (« je l'ai retirée moi-même ») ou fait par une republication laisse la ligne sans
// disparu_le. AVANT les classes : une annonce n'est VIVANTE que si le DERNIER relevé du compte sur la plateforme l'a vue
// (vu_le ≥ ce relevé − 24 h). Un couple dont moins de deux annonces sont ainsi vivantes est rangé à part (« ne vit
// plus » : retirées, ou compte sans relevé récent — à vérifier sur la plateforme), Opla à part aussi (« invérifiable » :
// quittée le 10/10, plus aucun relevé). Ni l'un ni l'autre n'est une paire vivante ; jamais en rouge.
//
//   node scripts/simulation-fiches-deux-annonces.mjs [--json <fichier>] [--md <fichier>] [--extraction <fichier.json>]
//     --json : le détail complet en JSON ; --md : le rapport Markdown (classes, comptes, exemples, liste complète) ;
//     --extraction : rejouer sur une extraction déjà lue (hors ligne, sans relire la prod) ;
//     --sauver-extraction <fichier> : garder l'extraction lue (données personnelles : hors du dépôt).
// Lectures : `npx supabase db query --linked --read-only` (transaction en lecture seule), SELECT seulement. Mesuré le
// 05/11 soir : ~45 s pour l'extraction (relecture des titres des comptes concernés), puis 5 lectures d'empreintes.
// Heures à l'heure de Paris.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/rapprochement/photos.js')).href);
const T = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/rapprochement/texte.js')).href);

export const SEUIL_IDENTIQUE = 4;   // SEUILS.quasi du moteur
export const SEUIL_DIFFERENTE = 12; // SEUILS.proche du moteur

// ── LECTURE (SELECT seulement, transaction en lecture seule) ─────────────────────────────────────────────────────────
function lireProd(sql) {
  if (!/^\s*(WITH|SELECT)\s/i.test(sql)) throw new Error('lecture seule : seul un SELECT part');
  const f = path.join(os.tmpdir(), `simulation-fiches-deux-annonces-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, sql);
  try {
    for (let essai = 1; ; essai++) {
      const r = spawnSync(`npx supabase db query --linked --read-only -f "${f.split(path.sep).join('/')}" -o json`,
        { cwd: RACINE, shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
      const t = r.stdout ?? ''; const i = t.indexOf('{');
      try {
        const j = JSON.parse(t.slice(i));
        if (j.error) throw new Error(JSON.stringify(j.error));
        return j.rows?.[0]?.r ?? [];
      } catch (e) { if (essai >= 3) throw new Error(`lecture refusée : ${e.message} ${(r.stderr ?? '').slice(-300)}`); }
    }
  } finally { fs.rmSync(f, { force: true }); }
}

export const SQL_EXTRACTION = `
WITH vivantes AS (
  SELECT a.* FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
   WHERE a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
     AND i.fusionne_dans IS NULL AND COALESCE(i.quantite, 1) <= 1),
couples AS MATERIALIZED (
  SELECT inventaire_id, platform FROM vivantes GROUP BY 1, 2 HAVING count(DISTINCT listing_id) >= 2),
ca AS MATERIALIZED (
  SELECT a.*, rapprochement_texte_norm(a.titre) AS n FROM vivantes a
    JOIN couples c ON c.inventaire_id = a.inventaire_id AND c.platform = a.platform),
comptes AS MATERIALIZED (SELECT DISTINCT user_id FROM ca),
titres AS MATERIALIZED (
  SELECT ap.user_id, ap.platform, rapprochement_texte_norm(ap.titre) AS n,
         count(*) FILTER (WHERE ap.disparu_le IS NULL AND ap.ignoree_le IS NULL) AS vivantes, count(*) AS toutes
    FROM annonces_plateforme ap WHERE ap.user_id IN (SELECT user_id FROM comptes) GROUP BY 1, 2, 3),
vt AS MATERIALIZED (
  SELECT v.user_id, rapprochement_texte_norm(v.titre) AS n, v.inventaire_id FROM ventes v WHERE v.user_id IN (SELECT user_id FROM comptes))
SELECT jsonb_agg(x ORDER BY x ->> 'compte', x ->> 'fiche_id', x ->> 'platform') AS r FROM (
SELECT jsonb_build_object(
  'fiche_id', i.id::text, 'platform', c.platform, 'user_id', i.user_id, 'compte', split_part(p.email, '@', 1),
  'fiche', jsonb_build_object('titre', i.titre, 'quantite', i.quantite, 'statut', i.statut, 'prix', i.prix_vente,
           'origine', i.origine, 'vinted', i.vinted_item_id, 'cree', i.created_at),
  'annonces', (SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'listing_id', a.listing_id, 'titre', a.titre, 'prix', a.prix, 'cree', a.created_at, 'vu', a.vu_le,
      'statut', a.statut_plateforme, 'quantite', a.quantite, 'source', a.source_rapprochement, 'url', a.url, 'norm', a.n,
      'serie', (SELECT t.vivantes FROM titres t WHERE t.user_id = a.user_id AND t.platform = a.platform AND t.n = a.n),
      'historique', (SELECT t.toutes FROM titres t WHERE t.user_id = a.user_id AND t.platform = a.platform AND t.n = a.n),
      'ventes_autres_fiches', (SELECT count(*) FROM vt WHERE vt.user_id = a.user_id AND vt.n = a.n AND vt.n <> ''
                                 AND vt.inventaire_id IS DISTINCT FROM a.inventaire_id),
      'desc_cle', rapprochement_description_cle(a.capture ->> 'description'),
      'desc_lot', rapprochement_description_lot(a.capture ->> 'description', a.titre),
      'photos', COALESCE((SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END),
      'job', (SELECT jsonb_build_object('id', j.id, 'action', j.action, 'status', j.status, 'cree', j.created_at, 'erreur', left(j.error, 120),
                 'source', j.platform_fields ->> 'source', 'republish_step', j.platform_fields ->> 'republish_step')
                FROM cross_post_jobs j WHERE j.id = a.job_id),
      'rapprochements', (SELECT jsonb_agg(jsonb_build_object('decision', r.decision, 'par', r.par, 'motif', r.detail ->> 'motif',
                 'republication', r.detail ->> 'republication', 'le', r.created_at) ORDER BY r.created_at)
                FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import')),
      'fusions', (SELECT jsonb_agg(jsonb_build_object('par', f.par, 'le', f.created_at) ORDER BY f.created_at)
                FROM inventaire_fusions f WHERE f.user_id = a.user_id AND f.defait_le IS NULL AND (f.deplacements -> 'annonces_plateforme') ? a.id::text)
    ) ORDER BY a.created_at, a.listing_id)
    FROM ca a WHERE a.inventaire_id = c.inventaire_id AND a.platform = c.platform),
  'jobs', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'action', j.action, 'status', j.status, 'cree', j.created_at,
             'listing', j.platform_listing_id, 'republish_step', j.platform_fields ->> 'republish_step',
             'retrait_engage', (COALESCE(j.platform_fields ->> 'republish_step', '') = 'deleted'
                                OR COALESCE(j.platform_fields, '{}'::jsonb) ?| array['deleted_at', 'republish_suppression_envoyee'])) ORDER BY j.created_at)
    FROM cross_post_jobs j WHERE j.inventaire_id = c.inventaire_id AND j.platform = c.platform),
  'ventes', (SELECT jsonb_agg(jsonb_build_object('plateforme', COALESCE(v.plateforme_code, v.plateforme), 'le', v.created_at, 'statut', v.statut))
    FROM ventes v WHERE v.inventaire_id = c.inventaire_id),
  'derniere_vue_compte', (SELECT max(x.vu_le) FROM annonces_plateforme x WHERE x.user_id = i.user_id AND x.platform = c.platform),
  'refus_deux_exemplaires', EXISTS (SELECT 1 FROM inventaire_doublons d WHERE d.user_id = i.user_id AND d.motif = 'annonce_en_double'
                                     AND d.statut = 'refusee' AND d.decide_par = 'utilisateur')
) AS x
FROM couples c JOIN inventaire i ON i.id = c.inventaire_id LEFT JOIN profiles p ON p.id = i.user_id) z;`;

export function lireEmpreintes(urls) {
  const out = [];
  for (let i = 0; i < urls.length; i += 500) {
    const lot = urls.slice(i, i + 500);
    out.push(...(lireProd(`SELECT jsonb_agg(jsonb_build_object('url', url, 'dhash', dhash, 'phash', phash, 'variantes', variantes)) AS r
      FROM photo_empreintes WHERE url IN (${lot.map((u) => `'${String(u).replace(/'/g, "''")}'`).join(', ')});`) ?? []));
  }
  return out;
}

// ── LES INDICES (fonctions pures) ────────────────────────────────────────────────────────────────────────────────────
const GENERIQUES = new Set(('neuf neuve neufs neuves vintage taille tailles homme femme femmes hommes enfant enfants fille garcon '
  + 'bebe bebes mixte lot lots tres bon bonne etat excellent parfait avec sans pour dans collection rare ancien ancienne anciens '
  + 'original originale officiel officielle licence cadeau france edition complet complete jamais porte portee servi marque '
  + 'nouveau nouvelle occasion petit petite grand grande taille unique the and les des une deux trois').split(' '));
const mots = (t) => T.norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
const motsSignifiants = (t) => mots(t).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !GENERIQUES.has(w));
const voisin = (w, liste) => liste.some((x) => x === w || (w.length >= 5 && x.length >= 5 && x.slice(0, 5) === w.slice(0, 5)));
export function motsCommuns(a, b) { const B = new Set(mots(b)); return [...new Set(mots(a))].filter((w) => B.has(w)).length; }
/** Chaque titre porte au moins un mot signifiant que l'autre n'a pas (Mentali / Typhlosion, Frodon / Gollum). */
export function nomsDistincts(a, b) {
  const A = motsSignifiants(a), B = motsSignifiants(b);
  const ua = A.filter((w) => !voisin(w, B)), ub = B.filter((w) => !voisin(w, A));
  return ua.length && ub.length ? { a: ua.slice(0, 3), b: ub.slice(0, 3) } : null;
}
const brut = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const extraire = (re, t) => { const m = re.exec(brut(t)); return m ? m[1] : null; };
const TAILLE_LETTRES = '(?:xxxs|xxs|xs|xxxl|xxl|xl|s|m|l)';
/** Un attribut qui dit l'objet, différent des deux côtés : n° d'inventaire, taille, âge, lot / pièce seule, couleur / nombre. */
export function attributDifferent(a, b) {
  const paires = [
    ['n° d\'inventaire', /#\s?(\d+)/],
    ['taille', /\btaille\s+(?:fr\s+)?([a-z0-9/]+)/],
    ['taille', new RegExp(`\\b(${TAILLE_LETTRES}\\/${TAILLE_LETTRES}|xxxs|xxs|xs|xxxl|xxl|xl)\\b`)],
    ['âge', /\b(\d+)\s?(?:m|mois|ans)\b/],
  ];
  for (const [nom, re] of paires) { const x = extraire(re, a), y = extraire(re, b); if (x && y && x !== y) return `${nom} ${x} ≠ ${y}`; }
  const la = /\blots?\b/.test(brut(a)), lb = /\blots?\b/.test(brut(b));
  if (la !== lb) return 'lot ≠ pièce seule';
  const d = T.attributDistinctif(a, b);
  return d ? `attribut distinctif (${d})` : null;
}
/** Références (mot d'au moins 4 signes avec un chiffre : « fr036 », « 2040 », « 9837260480 ») : aucune en commun. */
export function referencesDifferentes(a, b) {
  const refs = (t) => new Set(brut(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && /\d/.test(w)));
  const A = refs(a), B = refs(b);
  return A.size && B.size && ![...A].some((x) => B.has(x)) ? `références ${[...A].slice(0, 2).join(' ')} ≠ ${[...B].slice(0, 2).join(' ')}` : null;
}
const ms = (t) => (t ? Date.parse(t) : NaN);
const COALESCE_SOURCE = (job) => String(job?.source ?? '');   // '' = dépôt de FillSell (aucune source « releve »)
const enCours = (s) => ['pending', 'processing', 'needs_user'].includes(s);

export const MARGE_DERNIER_RELEVE_MS = 24 * 3600_000;   // vue dans les 24 h avant le dernier relevé du compte : vivante
export const COMPTE_SANS_RELEVE_MS = 7 * 86_400_000;    // plus aucun relevé de la plateforme depuis 7 jours : à vérifier sur place
/** Vue au DERNIER relevé du compte sur la plateforme (l'annonce la plus récemment vue du compte, à 24 h près). */
export function vueAuDernierReleve(a, derniere) {
  const d = ms(derniere);
  return Number.isFinite(d) && Number.isFinite(ms(a.vu)) && ms(a.vu) >= d - MARGE_DERNIER_RELEVE_MS;
}
/** Avant les classes : Opla (quittée le 10/10) et les couples dont moins de deux annonces vivent au dernier relevé. */
export function horsPaireVivante(c, lu = new Date()) {
  const A = c.annonces ?? [];
  const der = c.derniere_vue_compte ?? null;
  const vues = (a) => `${a.listing_id} vue le ${h(a.vu)}${a.job?.erreur ? ` (dépôt ${a.job.status} : « ${a.job.erreur} »)` : ''}`;
  if (c.platform === 'opla') {
    return { classe: 'inverifiable', motif: 'Opla quittée le 10/10 : plus aucun relevé, invérifiable d\'ici',
      preuve: `dernier relevé Opla du compte le ${h(der)} ; ${A.map(vues).join(', ')}` };
  }
  const vivantes = A.filter((a) => vueAuDernierReleve(a, der));
  if (vivantes.length >= 2) return null;
  const sansReleve = Number.isFinite(ms(der)) && lu.getTime() - ms(der) > COMPTE_SANS_RELEVE_MS;
  return { classe: 'non_revues',
    motif: sansReleve ? 'absentes du dernier relevé du compte, qui date de plus de 7 jours : la paire ne vivait déjà plus à cette date'
      : 'absentes du dernier relevé du compte : retirées ou disparues, la paire ne vit plus',
    preuve: `dernier relevé ${c.platform} du compte le ${h(der)} ; vivantes à ce relevé : ${vivantes.map((a) => a.listing_id).join(', ') || 'aucune'} ; ${A.map(vues).join(', ')}` };
}

/** Range un couple. `photosDe(annonce)` rend les photos prêtes à comparer (photos.js). */
export function classer(c, photosDe, lu = new Date()) {
  const hors = horsPaireVivante(c, lu);
  if (hors) return hors;
  const A = c.annonces;
  const paires = [];
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    const pa = photosDe(a), pb = photosDe(b);
    const photo = pa.length && pb.length ? P.comparerPhotos(pa, pb).best : null;
    const x = Number(a.prix) || 0, y = Number(b.prix) || 0;
    const differe = a.norm !== b.norm;
    paires.push({ a, b, photo, ratio: x > 0 && y > 0 ? Math.max(x, y) / Math.min(x, y) : 1, communs: motsCommuns(a.titre, b.titre),
      noms: differe ? nomsDistincts(a.titre, b.titre) : null, attribut: differe ? attributDifferent(a.titre, b.titre) : null,
      refs: differe ? referencesDifferentes(a.titre, b.titre) : null });
  }
  const photoTxt = (p) => (p.photo === null ? 'photos inconnues' : `photos à ${p.photo.toFixed(1)}`);
  const identiques = (p) => p.photo !== null && p.photo <= SEUIL_IDENTIQUE;
  const differentes = (p) => p.photo !== null && p.photo > SEUIL_DIFFERENTE;

  // 1. ERREUR — deux objets différents
  for (const p of paires) {
    const ab = `« ${p.a.titre} » (${p.a.prix} €) / « ${p.b.titre} » (${p.b.prix} €)`;
    const fin = `${photoTxt(p)}, prix ×${p.ratio.toFixed(2)}`;
    const noms = p.noms ? `mots propres « ${p.noms.a.join(' ')} » / « ${p.noms.b.join(' ')} »` : null;
    const err = (motif, indice) => ({ classe: 'erreur', motif, preuve: `${ab} — ${indice}, ${fin}` });
    if (p.communs === 0) return err('titres sans mot commun', 'aucun mot commun');
    if (p.attribut && /inventaire/.test(p.attribut)) return err('n° d\'inventaire différents', p.attribut);
    if (p.refs) return err('références différentes', p.refs);
    if (p.attribut && !identiques(p)) return err('attribut différent (taille, âge, lot, couleur, nombre), photos non identiques', p.attribut);
    if (p.noms && differentes(p)) return err('objets nommés différemment, photos différentes', noms);
    // (même prix au centime : la même annonce eBay traduite pour un autre pays — jamais une erreur sur ce seul indice)
    if (p.noms && p.photo === null && p.communs <= 1 && p.ratio > 1) return err('objets nommés différemment, un seul mot commun, prix différents, photos inconnues', noms);
    if ((p.noms || p.attribut) && p.ratio >= 2) return err('objets nommés différemment, prix du simple au double', p.attribut ?? noms);
  }

  // 2. REPUBLICATION — une annonce en remplace une autre
  const parDate = [...A].sort((a, b) => ms(a.cree) - ms(b.cree));
  const neuve = parDate[parDate.length - 1], anciennes = parDate.slice(0, -1);
  const plusVues = anciennes.every((a) => ms(a.vu) < ms(neuve.cree)) && ms(neuve.vu) > Math.max(...anciennes.map((a) => ms(a.vu)));
  const pNeuve = paires.filter((p) => p.a === neuve || p.b === neuve);
  if (plusVues && !pNeuve.some(differentes)) {
    const fillsell = neuve.job?.action === 'republish';
    return { classe: 'republication', motif: fillsell ? 'republication FillSell faite : l\'ancienne n\'est plus vue depuis' : 'remise en ligne : l\'ancienne n\'est plus vue depuis la nouvelle',
      preuve: `${anciennes.map((a) => `${a.listing_id} vue pour la dernière fois le ${h(a.vu)}`).join(', ')} ; ${neuve.listing_id} relevée la 1re fois le ${h(neuve.cree)}, vue le ${h(neuve.vu)}`
        + `${fillsell ? ` (job republish ${String(neuve.job.id).slice(0, 8)}, étape ${neuve.job.republish_step ?? '—'})` : ''}, ${pNeuve.map(photoTxt).join(', ')}` };
  }
  // une republication FillSell engagée sur CHACUNE des anciennes (étape « captured »/« deleted » ou retrait envoyé)
  const engagees = anciennes.map((a) => (c.jobs ?? []).find((j) => j.action === 'republish' && enCours(j.status)
    && (['captured', 'deleted'].includes(j.republish_step ?? '') || j.retrait_engage) && String(a.listing_id) === String(j.listing ?? '')));
  if (engagees.every(Boolean) && !pNeuve.some(differentes)) {
    return { classe: 'republication', motif: 'republication FillSell engagée : l\'ancienne en cours de retrait',
      preuve: engagees.map((j) => `job ${String(j.id).slice(0, 8)} (${j.status}, étape ${j.republish_step ?? '—'}, créé le ${h(j.cree)}) sur l'annonce ${j.listing}`).join(', ')
        + ` ; nouvelle ${neuve.listing_id} relevée la 1re fois le ${h(neuve.cree)}, ${pNeuve.map(photoTxt).join(', ')}` };
  }

  // 3. SÉRIE — un article en plusieurs exemplaires
  const qte = A.find((a) => (a.quantite ?? 0) > 1);
  if (qte) return { classe: 'serie', motif: 'quantité > 1 sur la plateforme', preuve: `${qte.listing_id} « ${qte.titre} » : quantité ${qte.quantite}` };
  const serie = A.find((a) => a.norm && (a.serie ?? 0) >= 3);
  if (serie) return { classe: 'serie', motif: 'titre en série (≥ 3 annonces vivantes)', preuve: `« ${serie.titre} » : ${serie.serie} annonces vivantes de ce titre sur ${c.platform} chez le compte (${serie.historique} en tout)` };
  const vendu = A.find((a) => a.norm && (a.ventes_autres_fiches ?? 0) >= 1);
  if (vendu) return { classe: 'serie', motif: 'même titre déjà vendu sur une autre fiche', preuve: `« ${vendu.titre} » : ${vendu.ventes_autres_fiches} vente(s) de ce titre sur d'autres fiches du compte` };
  const exemplaires = paires.find((p) => p.a.norm === p.b.norm && differentes(p));
  if (exemplaires) return { classe: 'serie', motif: 'même titre, photos différentes : deux exemplaires', preuve: `« ${exemplaires.a.titre} » ${exemplaires.a.prix} € / ${exemplaires.b.prix} €, ${photoTxt(exemplaires)}` };

  // 4. P16 — la même annonce publiée deux fois PAR LA PERSONNE (exception voulue le 15/10), toutes deux en ligne.
  //    Si l'une vient d'un dépôt ou d'une republication de FillSell, ce n'est pas P16 : FillSell a mis une 2e annonce en
  //    ligne à côté d'une annonce encore vivante — à vérifier (risque de double vente).
  const deFillSell = A.filter((a) => a.job && (a.job.action === 'republish' || COALESCE_SOURCE(a.job) !== 'releve'));
  if (deFillSell.length) {
    return { classe: 'a_verifier', motif: 'dépôt ou republication FillSell à côté d\'une annonce encore en ligne',
      preuve: `${deFillSell.map((a) => `${a.listing_id} = ${a.job.action === 'republish' ? 'republication' : 'dépôt'} FillSell (job ${String(a.job.id).slice(0, 8)}, ${a.job.status})`).join(', ')} ; `
        + `${A.filter((a) => !deFillSell.includes(a)).map((a) => `${a.listing_id} ${a.job ? 'relevée' : 'sans job'}`).join(', ') || 'les autres aussi de FillSell'} ; `
        + `${paires.map(photoTxt).join(', ')} ; toutes vues le ${A.map((a) => h(a.vu)).join(' / ')}` };
  }
  const p16 = !c.refus_deux_exemplaires && paires.every((p) => p.a.norm && p.a.norm === p.b.norm && Number(p.a.prix) > 0 && Number(p.a.prix) === Number(p.b.prix)
    && p.a.desc_cle && p.a.desc_cle === p.b.desc_cle && !p.a.desc_lot && !p.b.desc_lot && (p.a.quantite ?? 1) <= 1 && (p.b.quantite ?? 1) <= 1);
  if (p16) {
    return { classe: 'republication', motif: 'P16 : la même annonce publiée deux fois, toutes deux en ligne',
      preuve: `même titre « ${A[0].titre} », même prix ${A[0].prix} €, même description ; ${paires.map(photoTxt).join(', ')} ; vues le ${A.map((a) => h(a.vu)).join(' / ')}` };
  }

  // 5. À VÉRIFIER
  const p0 = paires[0];
  let motif = 'même objet probable, preuve de remplacement absente';
  if (paires.some((p) => p.noms || p.attribut)) motif = 'titres différents mais photos identiques';
  else if (paires.some(differentes)) motif = 'photos différentes';
  else if (paires.some((p) => p.a.norm !== p.b.norm)) motif = 'titres reformulés, photos identiques ou proches';
  else if (paires.some((p) => p.ratio > 1)) motif = 'même titre, prix différents';
  else if (paires.some((p) => p.a.desc_cle !== p.b.desc_cle)) motif = 'même titre et prix, descriptions différentes ou absentes';
  return { classe: 'a_verifier', motif,
    preuve: paires.map((p) => `« ${p.a.titre} » (${p.a.prix} €) / « ${p.b.titre} » (${p.b.prix} €), ${photoTxt(p)}`).slice(0, 2).join(' ; ')
      + (p0 ? ` ; vues le ${A.map((a) => h(a.vu)).join(' / ')}` : '') };
}

export const h = (t) => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—');
const geste = (a) => (a.fusions ?? []).some((f) => f.par === 'utilisateur' || String(f.par).startsWith('utilisateur ('))
  || (a.rapprochements ?? []).some((r) => r.par === 'utilisateur') ? 'la personne' : (a.source === 'job' ? 'identifiant' : 'automatique');

export const CLASSES = [
  ['republication', 'Vraies republications'],
  ['serie', 'Séries (plusieurs exemplaires)'],
  ['erreur', 'Vraies erreurs (deux objets différents)'],
  ['a_verifier', 'À vérifier'],
  ['non_revues', 'Ne vivent plus (absentes du dernier relevé du compte) — hors paires vivantes'],
  ['inverifiable', 'Invérifiables (Opla quittée le 10/10) — hors paires vivantes'],
];
const PAIRES_VIVANTES = new Set(['republication', 'serie', 'erreur', 'a_verifier']);

// ── PROGRAMME ────────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  let lu = new Date();
  let couples, empreintes;
  if (val('--extraction')) {
    const x = JSON.parse(fs.readFileSync(val('--extraction'), 'utf8'));
    ({ couples, empreintes } = x); if (x.lu) lu = new Date(x.lu);
  } else {
    couples = lireProd(SQL_EXTRACTION) ?? [];
    empreintes = lireEmpreintes([...new Set(couples.flatMap((c) => c.annonces.flatMap((a) => a.photos ?? [])))]);
    if (val('--sauver-extraction')) fs.writeFileSync(val('--sauver-extraction'), JSON.stringify({ lu: lu.toISOString(), couples, empreintes }));
  }
  const E = new Map(empreintes.map((r) => [r.url, P.photoDepuisEmpreinte(r)]));
  const photosDe = (a) => (a.photos ?? []).map((u) => E.get(u)).filter(Boolean);
  const res = couples.map((c) => ({ c, ...classer(c, photosDe, lu) }));
  const parClasse = Object.fromEntries(CLASSES.map(([k]) => [k, res.filter((r) => r.classe === k)]));
  const comptes = (l) => { const m = new Map(); for (const r of l) m.set(r.c.compte, (m.get(r.c.compte) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const motifs = (l) => { const m = new Map(); for (const r of l) m.set(r.motif, (m.get(r.motif) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

  console.log(`Simulation EN LECTURE SEULE — fiches unitaires à ≥ 2 annonces vivantes d'une plateforme — ${h(lu.toISOString())} (Paris)`);
  console.log(`${res.length} couples (fiche × plateforme), ${new Set(res.map((r) => r.c.user_id)).size} comptes, ${empreintes.length} empreintes de photo lues\n`);
  for (const [k, nom] of CLASSES) {
    const l = parClasse[k];
    console.log(`${nom} : ${l.length} couples, ${new Set(l.map((r) => r.c.user_id)).size} comptes${l.some((r) => r.c.fiche.statut === 'vendu') ? `, dont ${l.filter((r) => r.c.fiche.statut === 'vendu').length} sur une fiche VENDUE` : ''}`);
    for (const [m, n] of motifs(l)) console.log(`    ${n} × ${m}`);
    console.log(`    comptes : ${comptes(l).map(([c, n]) => `${c} ${n}`).join(', ')}`);
  }
  if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify({ lu: lu.toISOString(), couples: res.map(({ c, ...x }) => ({ ...x, compte: c.compte, user: c.user_id, fiche: c.fiche_id, platform: c.platform, annonces: c.annonces.map((a) => ({ listing_id: a.listing_id, titre: a.titre, prix: a.prix, vu: a.vu, cree: a.cree, source: a.source })) })) }, null, 1));
  if (val('--md')) fs.writeFileSync(val('--md'), markdown(res, parClasse, comptes, motifs, lu, empreintes.length));
}

function markdown(res, parClasse, comptes, motifs, lu, nEmp) {
  const L = [];
  const ligneAnnonces = (c) => c.annonces.map((a) => `${a.listing_id} « ${String(a.titre).replace(/\|/g, '/')} » ${a.prix} € (${geste(a)})`).join(' ; ');
  L.push(`# Simulation — fiches unitaires à deux annonces vivantes d'une même plateforme`, '');
  L.push(`> Lecture seule, relue en prod le ${h(lu.toISOString())} (heure de Paris) par \`scripts/simulation-fiches-deux-annonces.mjs\` ; `
    + `AUCUNE réparation (décision 2 de Nico, 05/11 soir, point 3 e). Règle : une fiche unitaire ne porte jamais deux annonces d'une `
    + `même plateforme (migration 20261105190000) — sauf la republication prouvée (P16).`, '');
  L.push(`**${res.length} couples** (fiche unitaire × plateforme) sur **${new Set(res.map((r) => r.c.user_id)).size} comptes** (338 annoncés au point 3 e, `
    + `mesurés plus tôt : le parc bouge d'une lecture à l'autre — relevés, retraits). Population : annonces ni disparues, ni retirées, `
    + `ni ignorées, rattachées à une fiche non fusionnée de quantité ≤ 1, au moins deux numéros d'annonce distincts sur la plateforme. `
    + `${nEmp} empreintes de photo lues (photo_empreintes).`, '');
  L.push('| Classe | Couples | Comptes | Fiche vendue | Motifs |', '|---|---:|---:|---:|---|');
  for (const [k, nom] of CLASSES) {
    const l = parClasse[k];
    L.push(`| ${nom} | ${l.length} | ${new Set(l.map((r) => r.c.user_id)).size} | ${l.filter((r) => r.c.fiche.statut === 'vendu').length} | ${motifs(l).map(([m, n]) => `${n} × ${m}`).join(' ; ')} |`);
  }
  const vendues = res.filter((r) => r.c.fiche.statut === 'vendu' && PAIRES_VIVANTES.has(r.classe));
  const vendHors = res.filter((r) => r.c.fiche.statut === 'vendu' && !PAIRES_VIVANTES.has(r.classe));
  if (vendHors.length) {
    L.push('', `${vendHors.length} couple(s) sur une fiche vendue rangé(s) HORS des paires vivantes (jamais en rouge) :`, '');
    for (const r of vendHors) L.push(`- ${r.c.compte} · ${r.c.platform} · fiche ${r.c.fiche_id} « ${r.c.fiche.titre} » — ${r.motif} — ${r.preuve}`);
  }
  if (vendues.length) {
    L.push('', `**⚠ ${vendues.length} couples sur une fiche déjà VENDUE**, deux annonces encore en ligne sur la plateforme (à regarder en premier : `
      + `aucune n'est retirée par la règle « deux exemplaires » d'armer_retraits_copies) :`, '');
    for (const r of vendues) L.push(`- ${r.c.compte} · ${r.c.platform} · fiche ${r.c.fiche_id} « ${r.c.fiche.titre} » — ${r.motif} — ${r.c.annonces.map((a) => `${a.listing_id} (vue le ${h(a.vu)})`).join(', ')} ; ventes : ${(r.c.ventes ?? []).map((v) => `${v.plateforme} le ${h(v.le)}`).join(', ') || '—'}`);
  }
  L.push('', '## Les règles de la simulation (dans cet ordre, la première qui joue range le couple)', '');
  L.push('1. **Erreur** — deux objets différents : titres sans mot commun ; n° d\'inventaire « #… » différents ; ou titres qui nomment '
    + 'deux objets (chaque titre a un mot signifiant que l\'autre n\'a pas — hors mots génériques —, ou une taille, un âge, une couleur, '
    + 'un nombre différents, juge d\'attribut du moteur) avec des photos NON identiques (distance > 4, ou inconnues), ou un prix du simple au double.');
  L.push('2. **Republication (remplacement)** — une republication FillSell ENGAGÉE sur l\'ancienne annonce (job republish en cours, '
    + 'étape « captured »/« deleted » ou retrait envoyé : l\'ancienne est en cours de retrait) ; ou l\'ancienne n\'a plus été vue par aucun '
    + 'relevé depuis l\'apparition de la nouvelle, que la nouvelle a été revue depuis, et les photos ne sont pas différentes (republication '
    + 'FillSell faite si la nouvelle vient d\'un job republish, remise en ligne par la personne sinon).');
  L.push('3. **Série** — quantité > 1 sur la plateforme ; titre en série (≥ 3 annonces vivantes de ce titre sur la plateforme chez le '
    + 'compte, la règle titre_en_serie de la migration) ; même titre déjà vendu sur une AUTRE fiche du compte ; ou même titre avec des '
    + 'photos différentes (> 12) : deux exemplaires.');
  L.push('4. **Republication P16** — la même annonce publiée deux fois : même titre normalisé, même prix, même description (clé '
    + 'rapprochement_description_cle), ni lot ni quantité, jamais chez un compte qui a dit « Non, deux exemplaires » — toutes deux en ligne '
    + '(l\'exception voulue le 15/10 ; aucune n\'est retirée : après une vente, la jumelle reste en vente si personne ne la retire). '
    + 'Jamais quand l\'une des deux est un dépôt ou une republication de FillSell : FillSell a alors mis une 2e annonce en ligne à côté '
    + 'd\'une annonce encore vivante — classée « à vérifier » (risque de double vente).');
  L.push('5. **À vérifier** — tout le reste : la preuve manque.', '');
  L.push('Avant ces cinq règles (correction du 05/11 soir) : une annonce n\'est vivante que si le DERNIER relevé du compte sur la '
    + 'plateforme l\'a vue (à 24 h près) — Beebs ne date jamais une absence, un retrait déclaré par la personne ou fait par une '
    + 'republication laisse la ligne sans date de disparition. Un couple à moins de deux annonces vivantes « ne vit plus » ; Opla '
    + '(quittée le 10/10) est « invérifiable ». Ni l\'un ni l\'autre n\'est une paire vivante, jamais en rouge.', '');
  L.push('Photos : module du moteur (`_shared/rapprochement/photos.js`, `comparerPhotos`, meilleure lecture dHash/pHash et variantes) ; '
    + '≤ 4 = identiques, > 12 = différentes. « Rattachée par » : la personne (son « Oui » ou un rattachement à la main), identifiant '
    + '(dépôt FillSell), automatique (moteur).', '');
  for (const [k, nom] of CLASSES) {
    const l = parClasse[k];
    L.push(`## ${nom} — ${l.length} couples, ${new Set(l.map((r) => r.c.user_id)).size} comptes`, '');
    L.push(`Comptes : ${comptes(l).map(([c, n]) => `${c} (${n})`).join(', ') || '—'}.`, '');
    L.push(`Motifs : ${motifs(l).map(([m, n]) => `${m} (${n})`).join(' ; ') || '—'}.`, '');
    // 3 exemples : un par motif, des plus fréquents aux plus rares, chacun d'un compte différent, le plus récemment vu
    const ex = []; const vus = new Set();
    const vuMax = (x) => Math.max(...x.c.annonces.map((a) => ms(a.vu) || 0));
    for (const [m] of motifs(l)) { const r = l.filter((x) => x.motif === m && !vus.has(x.c.compte)).sort((x, y) => vuMax(y) - vuMax(x))[0]; if (r && ex.length < 3) { ex.push(r); vus.add(r.c.compte); } }
    for (const r of l) if (!ex.includes(r) && !vus.has(r.c.compte) && ex.length < 3) { ex.push(r); vus.add(r.c.compte); }
    for (const r of l) if (!ex.includes(r) && ex.length < 3) ex.push(r);
    if (ex.length) L.push('### Trois exemples, avec la preuve', '');
    for (const r of ex) {
      L.push(`- **${r.c.compte}** (${String(r.c.user_id).slice(0, 8)}) · ${r.c.platform} · fiche ${r.c.fiche_id} « ${r.c.fiche.titre} » (${r.c.fiche.statut}) — **${r.motif}**`);
      L.push(`  - preuve : ${r.preuve}`);
      for (const a of r.c.annonces) L.push(`  - annonce ${a.listing_id} « ${a.titre} » ${a.prix} € — relevée la 1re fois le ${h(a.cree)}, vue le ${h(a.vu)}, rattachée par ${geste(a)}${a.url ? ` — ${a.url}` : ''}`);
    }
    if (l.length) {
      L.push('', '### Liste complète', '', '| Compte | Plateforme | Fiche | Annonces (n° « titre » prix, rattachée par) | Motif | Preuve |', '|---|---|---|---|---|---|');
      for (const r of l) L.push(`| ${r.c.compte} | ${r.c.platform} | ${r.c.fiche_id} | ${ligneAnnonces(r.c)} | ${r.motif} | ${String(r.preuve).replace(/\|/g, '/')} |`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}
