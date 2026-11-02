// ═══════════════════════════════════════════════════════════════════════════
// DOUBLONS : LA DÉCISION, pas seulement le verdict photo
// ═══════════════════════════════════════════════════════════════════════════
// Pour chaque paire de fiches en stock dont le verdict photos_distance CHANGE entre A et B
// (rejouer-autres.mjs, partie Q), on rejoue inventaire_doublon_evaluer → meme_objet_signaux →
// meme_objet_niveau avec le verdict A puis le verdict B, tout le reste identique.
// Le rôle en lecture ne peut appeler aucune de ces fonctions : leurs corps, lus en prod le 02/11
// (defs/*.sql), sont recopiés ici à l'identique (titre_norm, titre_jetons, titre_couleurs,
// titre_couleur_forme, titre_nombres, titre_quantite_marquee, titre_marque_utile, fiche_marque,
// meme_objet_signaux, meme_objet_niveau, titres_variante_substituee). Les titres, marques et prix
// sont relus EN ENTIER en prod (lecture seule).
// La candidature (inventaire_doublons_pour) : la plus ancienne des deux est candidate de l'autre si
// leurs titres partagent un jeton (s.jt && v_jb) ; deux fiches Vinted sont écartées d'office
// (« deux_annonces_vinted ») sauf remise en ligne — comptées à part.
import fs from 'node:fs';
import path from 'node:path';
import { requete, W } from './sql-lecture.mjs';

// ── corps SQL recopiés ──
const translate = (s, de, vers) => [...s].map((c) => { const i = de.indexOf(c); return i < 0 ? c : (i < vers.length ? vers[i] : ''); }).join('');
const titreNorm = (t) => translate(String(t ?? ''), 'àâäáãåéèêëíìîïóòôöõúùûüçñýÿœæÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑÝŒÆ', 'aaaaaaeeeeiiiiooooouuuucnyyoaAAAAAAEEEEIIIIOOOOOUUUUCNYOA')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
const mots = (t) => { const n = titreNorm(t); return n === '' ? [] : n.split(' '); };
const VIDES = ['pour', 'avec', 'sans', 'par', 'sur', 'les', 'des', 'une', 'aux', 'est', 'dans', 'tres', 'bon', 'etat', 'neuf', 'neuve', 'taille', 'occasion', 'the', 'and', 'for', 'with', 'tbe', 'excellent', 'parfait', 'comme', 'ans', 'mois', 'vintage'];
function titreJetons(t) {
  const m = mots(t), out = new Set();
  m.forEach((x, o) => {
    const prec = o > 0 ? m[o - 1] : null;
    const j = /^[1-9]0s$/.test(x) ? '19' + x.slice(0, 2) : (/^[1-9]0$/.test(x) && prec !== null && /^annees?$/.test(prec)) ? '19' + x
      : /^[0-9]+$/.test(x) ? x : (x.length > 4 && /[sx]$/.test(x)) ? x.slice(0, -1) : x;
    const garde = /^[0-9]+$/.test(j) ? j.length >= 3 : (x.length >= 3 && !VIDES.includes(x));
    if (garde) out.add(j);
  });
  return [...out].sort();
}
function titreNombres(t) {
  const m = mots(t), out = new Set();
  m.forEach((x, o) => { const prec = o > 0 ? m[o - 1] : null;
    const n = /^[1-9]0s$/.test(x) ? '19' + x.slice(0, 2) : (/^[1-9]0$/.test(x) && prec !== null && /^annees?$/.test(prec)) ? '19' + x : x;
    if (/^[0-9]+$/.test(n)) out.add(n); });
  return [...out].sort();
}
const FORMES = { blanche: 'blanc', blanches: 'blanc', blancs: 'blanc', noire: 'noir', noires: 'noir', noirs: 'noir', grise: 'gris', grises: 'gris', bleue: 'bleu', bleues: 'bleu', bleus: 'bleu', verte: 'vert', vertes: 'vert', verts: 'vert', rouges: 'rouge', roses: 'rose', jaunes: 'jaune', violette: 'violet', violettes: 'violet', violets: 'violet', marrons: 'marron', beiges: 'beige', doree: 'dore', dorees: 'dore', dores: 'dore', argentee: 'argente', argentees: 'argente', argentes: 'argente', argent: 'argente', turquoises: 'turquoise' };
const forme = (m) => FORMES[m] ?? m;
const COULEURS = ['blanc', 'noir', 'gris', 'bleu', 'vert', 'rouge', 'rose', 'jaune', 'orange', 'violet', 'marron', 'beige', 'turquoise', 'dore', 'argente', 'bordeaux', 'kaki', 'camel', 'creme', 'ecru', 'fuchsia', 'lilas', 'mauve', 'marine', 'anthracite', 'taupe', 'corail', 'ivoire', 'multicolore', 'transparent', 'chocolat', 'moutarde', 'saumon', 'prune', 'aubergine', 'menthe', 'olive', 'cuivre', 'bronze', 'lavande', 'peche', 'framboise', 'cerise', 'emeraude', 'sable', 'indigo', 'or'];
const NUANCES = ['pomme', 'ciel', 'clair', 'claire', 'fonce', 'foncee', 'marine', 'roi', 'pale', 'anthracite', 'perle', 'nuit', 'canard', 'pastel', 'vif', 'vive', 'fluo', 'menthe', 'olive', 'sapin', 'kaki', 'bordeaux', 'corail', 'saumon', 'poudre', 'lavande', 'lilas', 'prune', 'cerise', 'brique', 'rouille', 'terracotta', 'moutarde', 'citron', 'dore', 'cuivre', 'chocolat', 'taupe', 'sable', 'beige', 'creme', 'ecru', 'ivoire', 'casse', 'nacre', 'turquoise', 'petrole', 'emeraude', 'or', 'argent', 'argente', 'framboise', 'peche', 'indigo', 'electrique', 'glacier', 'gris', 'bleu', 'vert', 'rose', 'rouge', 'jaune', 'orange', 'violet', 'noir', 'blanc'];
function titreCouleurs(t) {
  const m = titreNorm(t).split(' '); // string_to_array('', ' ') = {} : la boucle ne voit rien
  if (titreNorm(t) === '') return [];
  const out = []; let i = 0;
  while (i < m.length) {
    const v = forme(m[i]);
    if (COULEURS.includes(v)) {
      const s = i < m.length - 1 ? forme(m[i + 1]) : null;
      if (s !== null && NUANCES.includes(s) && s !== v && s !== 'et') { out.push(v + ' ' + s); i++; } else out.push(v);
    }
    i++;
  }
  return [...new Set(out)].sort();
}
const quantiteMarquee = (t) => { const n = titreNorm(t);
  return / (lot|lots|paire|paires|duo|trio|deux|trois|quatre|cinq|six|sept|huit|dix|douze) /.test(' ' + n + ' ') || /^[1-9][0-9]? [a-z]/.test(n) || / [1-9][0-9]? ?x /.test(' ' + n + ' '); };
const MARQUES_VIDES = ['', 'sans marque', 'sans', 'autre', 'autres', 'vintage', 'fait main', 'handmade', 'artisanal', 'artisanale', 'artisanat', 'inconnue', 'inconnu', 'marque inconnue', 'no brand', 'non marque', 'non marquee', 'unbranded', 'generique', 'marque generique', 'aucune', 'none', 'other', 'divers'];
const marqueUtile = (m) => { const n = titreNorm(m); return MARQUES_VIDES.includes(n) ? '' : n; };
const ficheMarque = (marque, attrMarque) => { const t = (marque ?? '').trim(); return t !== '' ? t : attrMarque; };
const egaux = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const inclus = (a, b) => a.every((x) => b.includes(x));
function signaux(a, b, photo) {
  const ja = titreJetons(a.titre), jb = titreJetons(b.titre), ca = titreCouleurs(a.titre), cb = titreCouleurs(b.titre);
  const na = titreNombres(a.titre), nb = titreNombres(b.titre);
  const ma = marqueUtile(ficheMarque(a.marque, a.attr_marque)), mb = marqueUtile(ficheMarque(b.marque, b.attr_marque));
  const vmin = Math.min(ja.length, jb.length), communs = ja.filter((x) => jb.includes(x)).length;
  const ov = vmin === 0 ? 0 : Math.round((communs * 100) / vmin) / 100;
  const pa = a.prix == null ? null : Number(a.prix), pb = b.prix == null ? null : Number(b.prix);
  const prix = (pa == null || pb == null || pa <= 0 || pb <= 0) ? 'inconnu' : Math.abs(pa - pb) < 0.01 ? 'egal' : Math.abs(pa - pb) / Math.max(pa, pb) <= 0.15 ? 'proche' : 'different';
  const ratio = pa > 0 && pb > 0 ? Math.max(pa, pb) / Math.min(pa, pb) : 1;
  const ta = titreNorm(a.titre);
  return { ov, communs, exact: ta !== '' && ta === titreNorm(b.titre),
    couleur: ca.length && cb.length && !egaux(ca, cb) ? 'conflit' : 'ok',
    nombre: !na.length || !nb.length || egaux(na, nb) ? 'ok' : (inclus(na, nb) || inclus(nb, na)) ? 'partiel' : 'conflit',
    marque: ma === '' || mb === '' ? 'inconnue' : (ma === mb || mb.includes(ma) || ma.includes(mb)) ? 'egale' : 'conflit',
    prix, photo: { verdict: photo }, lot: quantiteMarquee(a.titre) !== quantiteMarquee(b.titre) && ratio > 1.8 ? 'lot_contre_unite' : 'ok', ja, jb };
}
function niveau(s) {
  const v = s.photo?.verdict ?? 'inconnue', ov = s.ov, exact = s.exact;
  if (s.couleur === 'conflit') return ['ecarte', 'couleur'];
  if (s.nombre === 'conflit') return ['ecarte', 'nombre'];
  if (s.marque === 'conflit') return ['ecarte', 'marque'];
  const certainPhoto = v === 'identique' && ov >= 0.75, certainTexte = v === 'inconnue' && exact && s.prix === 'egal';
  if ((certainPhoto || certainTexte) && s.nombre === 'ok' && s.lot === 'ok') return ['probable', certainPhoto ? 'photo_identique' : 'titre_exact_prix_egal'];
  if ((v === 'identique' && ov >= 0.4) || (v === 'proche' && ov >= 0.6) || (exact && v !== 'differente')
    || (v === 'inconnue' && ov >= 0.75 && ['egal', 'proche'].includes(s.prix))
    || (['differente', 'inconnue'].includes(v) && ov >= 0.8 && s.communs >= 5)) {
    const motif = s.lot !== 'ok' ? 'lot_contre_unite' : s.nombre === 'partiel' ? 'nombres_partiels' : v === 'identique' ? 'photo_identique'
      : exact ? 'titre_exact' : v === 'proche' ? 'photo_proche' : (['differente', 'inconnue'].includes(v) && ov >= 0.8 && s.communs >= 5) ? 'titre_precis' : 'titre_proche';
    return ['probable', motif];
  }
  return ['ecarte', v === 'differente' ? 'photos_differentes' : 'preuves_insuffisantes'];
}

// ── les paires qui changent (partie Q) ──
const dirR = path.join(W, 'donnees', 'resultats', 'autres');
const paires = [];
for (const f of fs.readdirSync(dirR).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(dirR, f), 'utf8'));
  for (const e of r.Q.ecarts) paires.push({ user: r.user, ...e });
}
console.log('paires au verdict changé', paires.length);
const ids = [...new Set(paires.flatMap((p) => [p.a, p.b]))];
const fiches = new Map();
for (let i = 0; i < ids.length; i += 2000) {
  const lot = ids.slice(i, i + 2000);
  const rows = requete(`select json_agg(json_build_array(i.id::text, i.titre, i.marque, CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END,
      i.prix_vente, i.vinted_item_id IS NOT NULL, i.created_at, i.user_id::text)) j from inventaire i where i.id = ANY (array[${lot.join(',')}]::bigint[]);`, '_fiches_q.sql');
  for (const x of rows[0].j ?? []) fiches.set(x[0], { id: x[0], titre: x[1], marque: x[2], attr_marque: x[3], prix: x[4], vinted: x[5], created_at: x[6], user: x[7] });
}
// titres_variante_substituee : la fréquence d'un jeton sur les fiches non fusionnées du compte (titres entiers)
const comptesTouches = [...new Set(paires.map((p) => p.user))];
const dfDe = new Map();
function df(user) {
  if (dfDe.has(user)) return dfDe.get(user);
  const rows = requete(`select json_agg(i.titre) j, count(*) n from inventaire i where i.user_id = '${user}'::uuid and i.fusionne_dans is null;`, '_titres_compte.sql');
  const c = new Map(); for (const t of rows[0].j ?? []) for (const j of titreJetons(t)) c.set(j, (c.get(j) ?? 0) + 1);
  const res = { c, n: Number(rows[0].n) }; dfDe.set(user, res); return res;
}
function varianteSubstituee(user, a, b) {
  const ja = titreJetons(a), jb = titreJetons(b);
  const [court, long] = ja.length <= jb.length ? [ja, jb] : [jb, ja];
  const manque = court.filter((x) => !long.includes(x) && !/^[0-9]+$/.test(x));
  if (!manque.length) return false;
  const { c, n } = df(user); const seuil = Math.max(3, Math.ceil(n * 0.01));
  return manque.some((t) => (c.get(t) ?? 0) < seuil);
}
const bilan = { paires: paires.length, sans_jeton_commun: 0, deux_vinted: 0, candidates: 0, niveau_identique: 0, ecartee_les_deux_motif_autre: 0, question_les_deux_motif_autre: 0, niveau_change: 0,
  de_probable_a_ecarte: 0, de_ecarte_a_probable: 0, ecarts: [] };
for (const p of paires) {
  const a = fiches.get(String(p.a)), b = fiches.get(String(p.b));
  if (!a || !b) continue;
  const sA = signaux(a, b, p.A.v), sB = signaux(a, b, p.B.v);
  if (!sA.ja.some((x) => sA.jb.includes(x))) { bilan.sans_jeton_commun++; continue; }
  if (a.vinted && b.vinted) { bilan.deux_vinted++; continue; }
  bilan.candidates++;
  let [nA, mA] = niveau(sA), [nB, mB] = niveau(sB);
  if (nA === 'probable' && mA === 'titre_proche' && varianteSubstituee(a.user, a.titre, b.titre)) { nA = 'ecarte'; mA = 'variante_substituee'; }
  if (nB === 'probable' && mB === 'titre_proche' && varianteSubstituee(a.user, a.titre, b.titre)) { nB = 'ecarte'; mB = 'variante_substituee'; }
  if (nA === nB && mA === mB) { bilan.niveau_identique++; continue; }
  if (nA === nB) { if (nA === 'ecarte') { bilan.ecartee_les_deux_motif_autre++; continue; } bilan.question_les_deux_motif_autre++; } else { bilan.niveau_change++; if (nA === 'probable') bilan.de_probable_a_ecarte++; else bilan.de_ecarte_a_probable++; }
  bilan.ecarts.push({ compte: p.user.slice(0, 8), a: a.id, b: b.id, titreA: a.titre, titreB: b.titre, photoA: p.A, photoB: p.B, A: `${nA}/${mA}`, B: `${nB}/${mB}`, ov: sA.ov });
}
fs.writeFileSync(path.join(W, 'donnees', 'resultats', 'doublons-niveau.json'), JSON.stringify(bilan, null, 1));
console.log(JSON.stringify({ ...bilan, ecarts: bilan.ecarts.length }, null, 1));
