#!/usr/bin/env node
// `npm run site:concurrents` — faits concurrents du site vitrine (09/10/2026).
//
// Lit le BRIEF docs/seo/briefs/concurrents.yml (tenu par la veille
// concurrentielle, mis à jour à part), le VALIDE, et écrit
// site/donnees/concurrents.yml — la SEULE source des faits concurrents sur le
// site (docs/seo/FORMAT-CONTENU.md § 4). Relancer après chaque mise à jour du
// brief ; le fichier écrit est à commiter.
//
// Ce qu'il REFUSE (aucun fichier écrit, code 1) :
//   · une valeur sans `sources` (liste non vide), sans `date` (AAAA-MM-JJ qui
//     existe) ou sans `niveau` (un des niveaux déclarés dans meta.niveaux) —
//     un fait sans source ni date ne se publie pas (PLAN § 2) ;
//   · un outil sans slug, sans nom ou sans critère ; un slug en double ;
//   · un classement qui nomme un outil inconnu.
//
// Ce qu'il RETIRE (le site ne publie jamais l'interne) : notes internes,
// « à ne pas écrire », références F-xx de la fiche, chemins de fichiers, nom
// d'éditeur (personnes physiques), marqueurs [R-…], et toute mention de la
// plateforme sortie le 10/10/2026 (décision 1 de Nico : nulle part, y compris
// pour décrire un concurrent) — segment de liste retiré, ou valeur écartée
// si elle n'a pas de segment propre. Chaque retrait est journalisé.
//
// Pour la ligne FillSell (notre_produit), il RETIRE aussi tout segment qui
// écrit un palier à côté de la republication (« à tous les paliers », « pour
// tous », « dès le gratuit » — décision de Nico du 09/10, 03c P1 ; revue
// technique C-8), et partout les renvois internes à un champ du brief
// (« voir plateformes_auto »). site:verifier relit la sortie derrière lui.
//
// LANGUES (revue technique C-11) : tout texte publié (valeur, catégorie, nom
// et grille des critères du classement, variantes, raisons « hors
// classement ») s'écrit soit en chaîne (français), soit en { fr, en } : le
// français reste la base (`valeur`, `grille`…), les autres langues vont
// dans `traductions: { <champ>: { en: … } }`. Une page anglaise affiche
// l'anglais quand il existe, sinon le français marqué lang="fr".
//
// Il AJOUTE, par valeur, un `verdict` (oui | non | partiel | null) lu en tête
// du texte (français) : il sert aux tableaux courts (cartes empilées sur
// téléphone) et aux pages d'une autre langue quand la traduction manque.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireYaml, yaml } from './lib/yaml.mjs';
import { dateValide } from './lib/dates.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join('docs', 'seo', 'briefs', 'concurrents.yml');
const CIBLE = path.join('site', 'donnees', 'concurrents.yml');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Le nom de la plateforme sortie le 10/10 est écrit par son code, pas en clair :
// ce fichier ne doit pas lui-même la nommer (recherche « Opla » dans le dépôt du site).
const RETIREE = new RegExp(`\\b${String.fromCharCode(79, 112, 108, 97)}\\b`, 'i');

const erreurs = [];
const retraits = [];
const err = (m) => erreurs.push(m);

/** Texte nettoyé : marqueurs internes retirés, espaces fusionnées. */
function nettoyer(texte) {
  return String(texte).replace(/\s*\[R-[A-Z0-9-]+\]/g, '').replace(/[ \t]+/g, ' ').replace(/\s+([,.)])/g, '$1').trim();
}

/** Segments « ; » d'un texte, puis éléments « , » ; garde ceux que `garder` accepte. */
function filtrerSegments(texte, garder) {
  return texte.split(/\s*;\s*/)
    .map((phrase) => phrase.split(/,\s*/).filter(garder).join(', ').trim())
    .filter(Boolean).join(' ; ');
}

// Renvoi interne à un champ du brief (« voir plateformes_auto ») : jamais publié.
const RENVOI_INTERNE = /\bvoir [a-z]+(?:_[a-z]+)+\b/;
function sansRenvoiInterne(texte, ou) {
  if (!RENVOI_INTERNE.test(texte)) return texte;
  retraits.push(`${ou} : renvoi interne au brief retiré`);
  return filtrerSegments(texte, (e) => !RENVOI_INTERNE.test(e));
}

// Décision de Nico (09/10) : aucun palier écrit à côté de la republication.
const PALIER = /\b(paliers?|plans?|forfaits?|Pro|Premium|Business|Gratuit|pour tous)\b/i;
const REPUBLI = /\b(republi|remont)\w*/i;
function sansPalierRepublication(texte, ou, critere) {
  if (!(critere === 'republication' || REPUBLI.test(texte)) || !PALIER.test(texte)) return texte;
  retraits.push(`${ou} : segment retiré (palier écrit à côté de la republication — décision de Nico du 09/10)`);
  return filtrerSegments(texte, (e) => !PALIER.test(e));
}

/**
 * Un texte publié : chaîne (français) ou { fr, en… }. Rend { base, traductions }
 * (base = le français, nettoyé ; traductions = { en: … } nettoyées), ou null.
 */
function texteBilingue(v, ou) {
  if (typeof v === 'string') return { base: v, traductions: {} };
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.fr === 'string') {
    const traductions = {};
    for (const [l, t] of Object.entries(v)) {
      if (l === 'fr') continue;
      if (!/^[a-z]{2}$/.test(l) || typeof t !== 'string' || !t.trim()) { err(`${ou} : traduction « ${l} » illisible (\`{ fr: …, en: … }\` attendu)`); continue; }
      traductions[l] = t;
    }
    return { base: v.fr, traductions };
  }
  return null;
}

/** Applique `traiter` à la base et à chaque traduction ; null si la base est écartée. */
function publierTexte(v, ou, traiter) {
  const b = texteBilingue(v, ou);
  if (!b) return null;
  const base = traiter(b.base, ou);
  if (base === null) return null;
  const traductions = {};
  for (const [l, t] of Object.entries(b.traductions)) {
    const x = traiter(t, `${ou}.${l}`);
    if (x) traductions[l] = x;
  }
  return { base, traductions };
}

/**
 * Retire la plateforme sortie d'un texte : le segment de liste qui la nomme
 * (séparé par « , » ou « ; ») part ; s'il n'en reste rien de lisible, null.
 */
function sansPlateformeRetiree(texte, ou) {
  if (!RETIREE.test(texte)) return texte;
  const morceaux = texte.split(/(\s*;\s*)/);
  const gardes = [];
  for (let i = 0; i < morceaux.length; i += 2) {
    const phrase = morceaux[i];
    if (!RETIREE.test(phrase)) { gardes.push(phrase); continue; }
    const elements = phrase.split(/,\s*/).filter((e) => !RETIREE.test(e));
    if (elements.length) gardes.push(elements.join(', ').replace(/\s+et\s*$/, ''));
  }
  const sortie = gardes.map((x) => x.trim()).filter(Boolean).join(' ; ').trim();
  retraits.push(`${ou} : segment retiré (plateforme sortie le 10/10)`);
  if (!sortie || RETIREE.test(sortie) || sortie.length < 3) return null;
  return sortie;
}

/** Verdict lu en tête de la valeur (oui | non | partiel | sans_objet | null). */
function verdict(texte) {
  const t = texte.toLowerCase();
  if (/^sans objet\b/.test(t)) return 'sans_objet';
  if (/^(oui|yes)\b/.test(t)) return 'oui';
  if (/^(non|no)\b/.test(t)) return 'non';
  if (/^(partiel|en partie|à la main|seulement|bientôt|en bêta)/.test(t)) return 'partiel';
  return null;
}

function valeurSite(v, ou, niveaux, { nous = false, critere = null } = {}) {
  if (!v || typeof v !== 'object') { err(`${ou} : objet { valeur, sources, date, niveau } attendu`); return null; }
  const bilingue = texteBilingue(v.valeur, `${ou}.valeur`);
  if (!bilingue || !bilingue.base.trim()) err(`${ou} : « valeur » absente ou vide (chaîne, ou { fr, en })`);
  else v = { ...v, valeur: bilingue.base, traductionsValeur: bilingue.traductions };
  // « sans objet » (Clemz n'a qu'une plateforme : rien à regrouper) n'est pas un
  // fait sur l'outil : seule valeur permise sans source.
  const sansObjet = typeof v.valeur === 'string' && /^sans objet\b/i.test(v.valeur.trim());
  if (!Array.isArray(v.sources) || (!v.sources.length && !sansObjet) || v.sources.some((s) => typeof s !== 'string' || !s.trim())) err(`${ou} : « sources » absente ou vide (un fait sans source ne se publie pas)`);
  if (!dateValide(v.date)) err(`${ou} : « date » AAAA-MM-JJ qui existe attendue, reçu ${JSON.stringify(v.date)}`);
  if (!niveaux.includes(v.niveau)) err(`${ou} : « niveau » ${JSON.stringify(v.niveau)} inconnu (niveaux : ${niveaux.join(', ')})`);
  if (typeof v.valeur !== 'string') return null;
  const traiter = (t, o) => {
    const x = sansPlateformeRetiree(nettoyer(t), o);
    if (x === null) return null;
    const y = sansRenvoiInterne(x, o);
    return nous ? sansPalierRepublication(y, o, critere) : y;
  };
  const texte = traiter(v.valeur, ou);
  if (texte === null) { retraits.push(`${ou} : valeur écartée (elle ne parlait que de la plateforme sortie)`); return null; }
  const traductions = Object.fromEntries(Object.entries(v.traductionsValeur ?? {}).map(([l, t]) => [l, traiter(t, `${ou}.${l}`)]).filter(([, t]) => t));
  const sortie = {
    valeur: texte,
    ...(Object.keys(traductions).length ? { traductions: { valeur: traductions } } : {}),
    verdict: verdict(texte),
    // Seules les adresses https:// se publient (les chemins internes du brief, jamais).
    sources: (v.sources ?? []).filter((s) => /^https:\/\//.test(s)),
    date: v.date,
    niveau: v.niveau,
  };
  if (v.contradictoire) sortie.contradictoire = true;
  if (Array.isArray(v.paliers)) {
    sortie.devise = v.devise ?? 'EUR';
    if (v.par_site) sortie.par_site = true;
    sortie.paliers = v.paliers.map((p, i) => {
      const prix = p.prix_mensuel ?? p.prix_mensuel_par_site ?? null;
      if (typeof p.nom !== 'string' || (prix !== null && typeof prix !== 'number')) err(`${ou}.paliers[${i}] : { nom, prix_mensuel } attendu`);
      return { nom: p.nom, prix_mensuel: prix, ...(p.prix_mensuel_annuel !== undefined ? { prix_mensuel_annuel: p.prix_mensuel_annuel } : {}) };
    });
  }
  return sortie;
}

function listeSite(liste, ou) {
  if (liste === undefined) return [];
  if (!Array.isArray(liste)) { err(`${ou} : liste attendue`); return []; }
  return liste.map((x, i) => (typeof x === 'string' ? sansPlateformeRetiree(nettoyer(x), `${ou}[${i}]`) : null)).filter(Boolean);
}

/** { champ: { base, traductions } } → { traductions: { champ: { en: … } } } (rien si aucune). */
function traductionsDe(champs) {
  const t = Object.fromEntries(Object.entries(champs).filter(([, v]) => v && Object.keys(v.traductions).length).map(([k, v]) => [k, v.traductions]));
  return Object.keys(t).length ? { traductions: t } : {};
}

export function importer(brief) {
  const niveaux = Object.keys(brief?.meta?.niveaux ?? {});
  if (!niveaux.length) err('meta.niveaux absent : les niveaux de preuve doivent être déclarés');
  const criteres = Object.keys(brief?.meta?.criteres ?? {});
  if (!Array.isArray(brief?.outils) || !brief.outils.length) err('liste « outils » absente');
  const vus = new Set();
  const outils = [];
  for (const [i, o] of (brief?.outils ?? []).entries()) {
    const ou = `outils[${i}]${o?.slug ? ` (${o.slug})` : ''}`;
    if (!o || typeof o.slug !== 'string' || !SLUG.test(o.slug)) { err(`${ou} : « slug » attendu`); continue; }
    if (vus.has(o.slug)) err(`${ou} : slug en double`);
    vus.add(o.slug);
    if (typeof o.nom !== 'string' || !o.nom.trim()) err(`${ou} : « nom » attendu`);
    if (typeof o.url !== 'string' || !/^https:\/\//.test(o.url)) err(`${ou} : « url » https:// attendue`);
    if (!o.criteres || typeof o.criteres !== 'object') { err(`${ou} : « criteres » absents`); continue; }
    const sortie = {
      slug: o.slug,
      nom: o.nom,
      url: o.url,
      pays: o.pays ?? null,
      ...(() => {
        const c = o.categorie ? publierTexte(o.categorie, `${ou}.categorie`, (t, x) => sansPlateformeRetiree(nettoyer(t), x)) : null;
        return { categorie: c?.base ?? null, ...(c && Object.keys(c.traductions).length ? { traductions: { categorie: c.traductions } } : {}) };
      })(),
      ...(o.notre_produit ? { notre_produit: true } : {}),
      classement: o.classement?.statut ?? null,
      criteres: {},
    };
    for (const [cle, v] of Object.entries(o.criteres)) {
      if (!criteres.includes(cle) && cle !== 'activite') { err(`${ou} : critère « ${cle} » absent de meta.criteres`); continue; }
      if (v && typeof v === 'object' && v.valeur === undefined && !Array.isArray(v)) {
        // Critère composé (plateformes : une valeur par plateforme).
        const sous = {};
        for (const [k, sv] of Object.entries(v)) {
          if (RETIREE.test(k)) { retraits.push(`${ou}.criteres.${cle}.${k} : clé retirée`); continue; }
          const val = valeurSite(sv, `${ou}.criteres.${cle}.${k}`, niveaux, { nous: !!o.notre_produit, critere: cle });
          if (val) sous[k] = val;
        }
        sortie.criteres[cle] = sous;
      } else {
        const val = valeurSite(v, `${ou}.criteres.${cle}`, niveaux, { nous: !!o.notre_produit, critere: cle });
        if (val) sortie.criteres[cle] = val;
      }
    }
    sortie.fait_bien = listeSite(o.fait_bien, `${ou}.fait_bien`);
    sortie.fillsell_fait_pas_lui = listeSite(o.fillsell_fait_pas_lui, `${ou}.fillsell_fait_pas_lui`);
    sortie.lui_fait_pas_fillsell = listeSite(o.lui_fait_pas_fillsell, `${ou}.lui_fait_pas_fillsell`);
    outils.push(sortie);
  }
  if (!outils.some((o) => o.notre_produit)) err('aucun outil « notre_produit: true » (la ligne FillSell)');

  // Classement : grille, notes, variantes, hors classement.
  const c = brief?.classement;
  let classement = null;
  if (c) {
    const slugs = new Set(outils.map((o) => o.slug));
    const ids = (c.criteres ?? []).map((x) => x.id);
    for (const n of c.notes ?? []) {
      if (!slugs.has(n.slug)) err(`classement.notes : outil « ${n.slug} » inconnu`);
      const somme = ids.filter((id) => typeof n[id] === 'number').reduce((s, id) => s + n[id], 0);
      if (typeof n.total !== 'number' || Math.abs(somme - n.total) > 0.01) err(`classement.notes (${n.slug}) : total ${n.total} ≠ somme des sous-notes ${somme}`);
    }
    for (const h of c.hors_classement ?? []) if (!slugs.has(h.slug)) err(`classement.hors_classement : outil « ${h.slug} » inconnu`);
    classement = {
      titre: c.titre,
      avertissement: nettoyer(c.avertissement ?? ''),
      eliminatoire: listeSite(c.eliminatoire, 'classement.eliminatoire'),
      criteres: (c.criteres ?? []).map((x) => {
        const o = `classement.criteres.${x.id}`;
        const nom = publierTexte(x.nom, `${o}.nom`, (t) => nettoyer(t));
        const grille = publierTexte(x.grille, `${o}.grille`, (t, y) => sansPlateformeRetiree(nettoyer(t), y));
        return { id: x.id, nom: nom?.base ?? null, poids: x.poids, grille: grille?.base ?? null, ...traductionsDe({ nom, grille }) };
      }),
      notes: [...(c.notes ?? [])].sort((a, b) => b.total - a.total),
      variantes: (c.variantes ?? []).map((v, i) => {
        const nom = publierTexte(v.nom, `classement.variantes[${i}].nom`, (t) => nettoyer(t));
        const ordre = publierTexte(v.ordre, `classement.variantes[${i}].ordre`, (t) => nettoyer(t));
        return { nom: nom?.base ?? null, poids: String(v.poids), ordre: ordre?.base ?? null, ...traductionsDe({ nom, ordre }) };
      }),
      hors_classement: (c.hors_classement ?? []).map((h) => {
        const raison = publierTexte(h.raison, `classement.hors_classement.${h.slug}`, (t, y) => sansPlateformeRetiree(nettoyer(t), y));
        return { slug: h.slug, raison: raison?.base ?? null, ...traductionsDe({ raison }) };
      }),
    };
  }
  return {
    meta: {
      observe_le: brief?.meta?.observe_le,
      niveaux: brief?.meta?.niveaux,
      avertissements: listeSite(brief?.meta?.avertissements, 'meta.avertissements'),
    },
    outils,
    classement,
  };
}

// ── Ligne de commande ─────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const fichier = path.join(racine, SOURCE);
  if (!existsSync(fichier)) {
    console.error(`[site:concurrents] ${SOURCE} introuvable`);
    process.exit(1);
  }
  let brief;
  try {
    brief = lireYaml(readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n'));
  } catch (e) {
    console.error(`[site:concurrents] ${SOURCE} illisible — ${String(e.message).split('\n')[0]}`);
    process.exit(1);
  }
  const donnees = importer(brief);
  for (const r of retraits) console.log(`  retiré : ${r}`);
  if (erreurs.length) {
    for (const e of erreurs) console.error(`  ✗ ${e}`);
    console.error(`[site:concurrents] ${erreurs.length} erreur(s) : ${CIBLE} n'est PAS écrit.`);
    process.exit(1);
  }
  const entete = [
    '# FAITS CONCURRENTS du site vitrine — FICHIER GÉNÉRÉ, ne pas modifier à la main.',
    `# Source : ${SOURCE.split(path.sep).join('/')} (observé le ${donnees.meta.observe_le}).`,
    '# Régénérer : npm run site:concurrents (valide sources, dates et niveaux ; retire l\'interne).',
    '',
  ].join('\n');
  const corps = yaml.dump(donnees, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true, quotingType: '"' });
  writeFileSync(path.join(racine, CIBLE), entete + corps);
  console.log(`[site:concurrents] ${donnees.outils.length} outils, ${donnees.classement?.notes?.length ?? 0} notes au classement, ${retraits.length} retrait(s) → ${CIBLE.split(path.sep).join('/')}`);
}
