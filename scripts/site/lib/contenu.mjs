import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matter, MOTEURS } from './yaml.mjs';
import { lirePlateformes, lireConcurrents, valeursJetons, remplacerJetons, remplacerJetonsProfond } from './donnees.mjs';
import { dateValide, dateFuture } from './dates.mjs';
import { aujourdhuiParis } from './html.mjs';
import { LANGUES, CODES_LANGUES, accueilDe, cheminDans, langue } from '../../../site/langues.mjs';
import { TEXTES } from '../../../site/gabarits/textes.mjs';

// Lecture du contenu du site vitrine (09/10/2026).
//
// Deux sources, deux contrats — et c'est voulu :
//   · site/contenu/<langue>/**/*.md : frontmatter YAML VALIDÉ par le schéma
//     ci-dessous (messages en français qui nomment le fichier et le champ),
//     selon le CONTRAT docs/seo/FORMAT-CONTENU.md (types et champs) ;
//   · src/blog/*.md : le blog, PARTAGÉ avec la SPA (src/blog/posts.js). Il
//     garde son lecteur ligne à ligne (src/blog/frontmatter.js) et son contrat
//     « une ligne par clé » : la SPA le lit encore, un second dialecte casserait
//     l'un ou l'autre. selftest:site-blog-lecteurs prouve que le site et la SPA
//     lisent la même chose. Aucun jeton n'y est remplacé (la SPA les montrerait).
//
// Les langues viennent de site/langues.mjs, les plateformes nommables de
// site/donnees/plateformes.yml et les outils comparés de
// site/donnees/concurrents.yml (architecture § 2.7) : rien n'est écrit en dur
// ici. Pièges YAML (dates, « # ») : scripts/site/lib/yaml.mjs et
// verifierGuillemets ci-dessous.
//
// Jetons ({{plateformes}}, {{republication}}, {{nb_plateformes}}) : remplacés
// dans le corps ET le frontmatter AVANT la validation (les longueurs se
// mesurent sur le texte affiché). Un jeton inconnu, ou un ancien jeton de
// quota, fait échouer le build (scripts/site/lib/donnees.mjs).

export const TYPES = ['accueil', 'guide', 'trajet', 'plateforme', 'fonction', 'comparatif', 'alternative', 'classement', 'tarifs', 'glossaire', 'faq'];
export const CTAS = ['inscription', 'extension', 'stores'];

const ID = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA = /^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$/;

// Champs COMMUNS à tous les types de site/contenu (l'article du blog a son
// propre contrat). Un champ inconnu est une ERREUR (une faute de frappe sur
// « descripton » ne doit pas publier une page sans description).
const COMMUNS = {
  id: { type: 'chaine', requis: true, motif: ID, aide: 'minuscules, chiffres, « - » et « / », commun à toutes les langues de la page' },
  type: { type: 'enum', requis: true, valeurs: TYPES },
  lang: { type: 'enum', requis: true, valeurs: CODES_LANGUES },
  slug: { type: 'chaine', aide: 'facultatif : s\'il est écrit, il doit égaler le chemin du fichier' },
  title: { type: 'chaine', requis: true, min: 15, max: 70, aide: 'le <title> complet, marque comprise' },
  description: { type: 'chaine', requis: true, min: 70, max: 165 },
  nom: { type: 'chaine', requis: true, min: 3, max: 40, aide: "nom court : menu, fil d'Ariane, cartes des pages liées" },
  h1: { type: 'chaine', requis: true, min: 5, max: 90 },
  chapo: { type: 'chaine', requis: true, min: 40, max: 420, aide: 'la réponse directe, en tête de page' },
  publie: { type: 'date', requis: true },
  fil: { type: 'liste-id', aide: 'ids des pages intermédiaires du fil d\'Ariane (l\'accueil est implicite)' },
  liens: { type: 'liste-id', aide: 'ids des pages liées, affichées en fin de page' },
  og: { type: 'image-publique', motif: /^\/[^\s]+\.(png|jpe?g)$/, aide: 'image de partage FORCÉE, fichier de public/ ; par défaut, la carte générée par npm run site:og' },
  brouillon: { type: 'booleen', aide: 'true : jamais générée, jamais au sitemap' },
  demonstration: { type: 'booleen', aide: 'true : bandeau « brouillon de démonstration » visible — REFUSÉ en production' },
  faq: { type: 'booleen', aide: 'true : le corps porte une section « Questions fréquentes » (### = une question)' },
  surtitre: { type: 'chaine', min: 3, max: 48, aide: 'petit libellé au-dessus du h1' },
  points_cles: { type: 'liste-textes', min: 3, max: 5, minTexte: 20, maxTexte: 220, aide: '3 à 5 phrases autonomes, « l\'essentiel en 10 secondes »' },
  hero_media: { type: 'media', aide: 'capture affichée dans un cadre de téléphone (chemin sous site/medias, ex. captures/lens-analyse-photo.png)' },
  hero_alt: { type: 'chaine', min: 20, max: 420, aide: 'texte alternatif de hero_media (obligatoire avec lui)' },
  cta: { type: 'enum', valeurs: CTAS, aide: 'appel principal (défaut : inscription)' },
  etapes: { type: 'etapes', aide: 'liste de { titre (3-70), texte (20-320), media?, alt? } — bloc d\'étapes et JSON-LD HowTo' },
  plateformes_citees: { type: 'plateformes', aide: 'ids de plateformes OUVERTES de site/donnees/plateformes.yml' },
};

// Champs PROPRES à un type (FORMAT-CONTENU § 3). Écrits sur un autre type :
// erreur qui nomme le type qui les accepte.
const PROPRES = {
  accueil: {
    fonctions: { type: 'fonctions', aide: '4 à 8 cartes { titre, texte (20-260), page, media?, alt? }' },
    comparaison: { type: 'comparaison', aide: '{ concurrents: 2 à 4 slugs de site/donnees/concurrents.yml, criteres: [...] }' },
    video: { type: 'booleen', aide: 'true : la vidéo de présentation (site/medias/video/video.json)' },
    tarifs: { type: 'booleen', aide: 'true : les cartes de site/donnees/tarifs.yml' },
  },
  trajet: {
    trajet: { type: 'trajet', requis: true, aide: '{ de, vers } parmi les plateformes ouvertes de site/donnees/plateformes.yml' },
  },
  plateforme: {
    plateforme: { type: 'plateforme', requis: true, aide: 'id d\'une plateforme OUVERTE de site/donnees/plateformes.yml' },
  },
  comparatif: {
    concurrent: { type: 'concurrent', requis: true, aide: 'slug de site/donnees/concurrents.yml (jamais FillSell)' },
    choisir_fillsell: { type: 'liste-textes', requis: true, min: 2, max: 5, minTexte: 10, maxTexte: 220, aide: '2 à 5 profils pour qui FillSell est le meilleur choix' },
    choisir_concurrent: { type: 'liste-textes', requis: true, min: 1, max: 4, minTexte: 10, maxTexte: 220, aide: '1 à 4 profils pour qui l\'autre outil convient mieux' },
  },
  alternative: {
    concurrent: { type: 'concurrent', requis: true, aide: 'slug de site/donnees/concurrents.yml (jamais FillSell)' },
    alternatives: { type: 'concurrents', requis: true, min: 1, max: 6, aide: '1 à 6 slugs de site/donnees/concurrents.yml (FillSell est présenté en premier par le gabarit)' },
  },
};

const TOUS_CHAMPS = new Set([...Object.keys(COMMUNS), ...Object.values(PROPRES).flatMap((p) => Object.keys(p))]);

function fichierPublic(racine, chemin) {
  const f = path.join(racine, 'public', ...chemin.split('/').filter(Boolean));
  return existsSync(f) && statSync(f).isFile();
}

function fichierMedia(racine, chemin) {
  const f = path.join(racine, 'site', 'medias', ...chemin.split('/'));
  return existsSync(f) && statSync(f).isFile();
}

function verifierTexte(v, regle, err, quoi = '') {
  if (typeof v !== 'string') throw err(`${quoi}une chaîne est attendue, reçu ${JSON.stringify(v)}`);
  const t = v.trim();
  if (!t) throw err(`${quoi}vide`);
  const min = regle.minTexte ?? regle.min;
  const max = regle.maxTexte ?? regle.max;
  if (min && t.length < min) throw err(`${quoi}${t.length} caractères, il en faut au moins ${min}`);
  if (max && t.length > max) throw err(`${quoi}${t.length} caractères, au plus ${max}`);
}

function verifierMedia(v, err, ctx, quoi = '') {
  if (typeof v !== 'string' || !MEDIA.test(v)) throw err(`${quoi}chemin sous site/medias attendu (minuscules, .png/.jpg/.webp), reçu ${JSON.stringify(v)}`);
  if (!fichierMedia(ctx.racine, v)) throw err(`${quoi}« ${v} » absent de site/medias`);
}

function verifierChamp(nom, valeur, regle, ctx) {
  const err = (msg) => new Error(`[site] ${ctx.fichier} : champ « ${nom} » : ${msg}${regle.aide ? ` (${regle.aide})` : ''}`);
  const ouvertes = ctx.plateformes.ouvertes.map((p) => p.id);
  const plateformeOuverte = (id, quoi = '') => {
    const fermee = ctx.plateformes.plateformes.find((p) => p.id === id && !ouvertes.includes(id));
    if (fermee) throw err(`${quoi}${fermee.nom} n'est pas ouverte à tous : ${fermee.raison ?? 'aucun pays ouvert'}`);
    if (!ouvertes.includes(id)) throw err(`${quoi}« ${id} » n'est pas une plateforme ouverte (${ouvertes.join(', ')})`);
  };
  const concurrent = (slug, quoi = '') => {
    const c = ctx.concurrents();
    const o = c.parSlug.get(slug);
    if (!o) throw err(`${quoi}« ${slug} » absent de site/donnees/concurrents.yml (npm run site:concurrents)`);
    if (o.notre_produit) throw err(`${quoi}« ${slug} » est FillSell lui-même`);
  };
  switch (regle.type) {
    case 'chaine':
    case 'image-publique': {
      verifierTexte(valeur, regle, err);
      const v = valeur.trim();
      if (regle.motif && !regle.motif.test(v)) throw err(`« ${v} » ne respecte pas le format attendu`);
      // Image de partage absente = og:image en 404 à chaque partage (revue de
      // la fondation, M-4 n° 11) : le fichier doit exister dans public/.
      if (regle.type === 'image-publique' && !fichierPublic(ctx.racine, v)) throw err(`« ${v} » absent de public/`);
      return;
    }
    case 'enum':
      if (!regle.valeurs.includes(valeur)) throw err(`« ${valeur} » n'est pas permis (valeurs : ${regle.valeurs.join(', ')})`);
      return;
    case 'date':
      // Aller-retour (« 2026-02-31 » refusé) et jamais dans le futur (revue de
      // la fondation M-1 : « 2030-01-01 » partait au sitemap).
      if (!dateValide(valeur)) throw err(`date AAAA-MM-JJ qui existe attendue, entre guillemets, reçu ${JSON.stringify(valeur)}`);
      if (dateFuture(valeur, ctx.aujourdhui)) throw err(`${valeur} est dans le futur (aujourd'hui ${ctx.aujourdhui}, Paris) : une page ne se date pas d'avance`);
      return;
    case 'booleen':
      if (typeof valeur !== 'boolean') throw err(`true ou false attendu, reçu ${JSON.stringify(valeur)}`);
      return;
    case 'liste-id':
      if (!Array.isArray(valeur) || valeur.some((v) => typeof v !== 'string' || !ID.test(v))) {
        throw err(`liste d'ids attendue, reçu ${JSON.stringify(valeur)}`);
      }
      return;
    case 'liste-textes':
      if (!Array.isArray(valeur)) throw err(`liste attendue, reçu ${JSON.stringify(valeur)}`);
      if (valeur.length < regle.min || valeur.length > regle.max) throw err(`${valeur.length} éléments, de ${regle.min} à ${regle.max} attendus`);
      valeur.forEach((v, i) => verifierTexte(v, regle, err, `élément ${i + 1} : `));
      return;
    case 'media':
      verifierMedia(valeur, err, ctx);
      return;
    case 'etapes':
      if (!Array.isArray(valeur) || valeur.length < 2 || valeur.length > 8) throw err('liste de 2 à 8 étapes attendue');
      valeur.forEach((e, i) => {
        const q = `étape ${i + 1} : `;
        if (!e || typeof e !== 'object' || Array.isArray(e)) throw err(`${q}objet { titre, texte } attendu`);
        for (const k of Object.keys(e)) if (!['titre', 'texte', 'media', 'alt'].includes(k)) throw err(`${q}clé « ${k} » inconnue (titre, texte, media, alt)`);
        verifierTexte(e.titre, { min: 3, max: 70 }, err, `${q}titre : `);
        verifierTexte(e.texte, { min: 20, max: 320 }, err, `${q}texte : `);
        if (e.media !== undefined) {
          verifierMedia(e.media, err, ctx, `${q}media : `);
          verifierTexte(e.alt, { min: 20, max: 420 }, err, `${q}alt (obligatoire avec media) : `);
        } else if (e.alt !== undefined) throw err(`${q}« alt » sans « media »`);
      });
      return;
    case 'fonctions':
      if (!Array.isArray(valeur) || valeur.length < 4 || valeur.length > 8) throw err('liste de 4 à 8 cartes attendue');
      valeur.forEach((f, i) => {
        const q = `carte ${i + 1} : `;
        if (!f || typeof f !== 'object' || Array.isArray(f)) throw err(`${q}objet attendu`);
        for (const k of Object.keys(f)) if (!['titre', 'texte', 'page', 'media', 'alt'].includes(k)) throw err(`${q}clé « ${k} » inconnue (titre, texte, page, media, alt)`);
        verifierTexte(f.titre, { min: 3, max: 60 }, err, `${q}titre : `);
        verifierTexte(f.texte, { min: 20, max: 260 }, err, `${q}texte : `);
        if (typeof f.page !== 'string' || !/^(?:[a-z]{2}:)?[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(f.page)) throw err(`${q}« page » : id d'une page attendu (ou <langue>:<id> pour une autre langue)`);
        if (f.media !== undefined) {
          verifierMedia(f.media, err, ctx, `${q}media : `);
          verifierTexte(f.alt, { min: 20, max: 420 }, err, `${q}alt (obligatoire avec media) : `);
        } else if (f.alt !== undefined) throw err(`${q}« alt » sans « media »`);
      });
      return;
    case 'comparaison': {
      if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) throw err('objet { concurrents, criteres } attendu');
      for (const k of Object.keys(valeur)) if (!['concurrents', 'criteres'].includes(k)) throw err(`clé « ${k} » inconnue (concurrents, criteres)`);
      if (!Array.isArray(valeur.concurrents) || valeur.concurrents.length < 2 || valeur.concurrents.length > 4) throw err('« concurrents » : 2 à 4 slugs');
      valeur.concurrents.forEach((s) => concurrent(s, 'concurrents : '));
      const connus = Object.keys(ctx.concurrents().nous.criteres);
      if (!Array.isArray(valeur.criteres) || valeur.criteres.length < 3 || valeur.criteres.length > 8) throw err('« criteres » : 3 à 8 critères');
      for (const c of valeur.criteres) if (!connus.includes(c)) throw err(`critère « ${c} » inconnu (critères : ${connus.join(', ')})`);
      return;
    }
    case 'plateformes':
      if (!Array.isArray(valeur) || !valeur.length || new Set(valeur).size !== valeur.length) throw err('liste d\'ids sans doublon attendue');
      valeur.forEach((id) => plateformeOuverte(id));
      return;
    case 'plateforme':
      if (typeof valeur !== 'string') throw err('id attendu');
      plateformeOuverte(valeur);
      return;
    case 'trajet': {
      for (const id of [valeur?.de, valeur?.vers]) {
        const fermee = ctx.plateformes.plateformes.find((p) => p.id === id && !ouvertes.includes(id));
        if (fermee) throw err(`${fermee.nom} n'est pas ouverte à tous : ${fermee.raison ?? 'aucun pays ouvert'}`);
      }
      if (!valeur || typeof valeur !== 'object' || !ouvertes.includes(valeur.de) || !ouvertes.includes(valeur.vers) || valeur.de === valeur.vers) {
        throw err(`{ de, vers } attendu, deux plateformes différentes parmi ${ouvertes.join(', ')}, reçu ${JSON.stringify(valeur)}`);
      }
      return;
    }
    case 'concurrent':
      if (typeof valeur !== 'string' || !SLUG.test(valeur)) throw err('slug attendu');
      concurrent(valeur);
      return;
    case 'concurrents':
      if (!Array.isArray(valeur) || valeur.length < regle.min || valeur.length > regle.max) throw err(`liste de ${regle.min} à ${regle.max} slugs attendue`);
      valeur.forEach((s) => concurrent(s));
      return;
    default:
      throw err('règle de schéma inconnue');
  }
}

/** Le schéma d'un type : communs + propres. */
export function schemaDe(type) {
  return { ...COMMUNS, ...(PROPRES[type] ?? {}) };
}

/** Valide un frontmatter de page ; lève avec le fichier et le champ en cause. */
export function validerFrontmatter(data, { fichier, langDossier, cheminFichier, plateformes, racine, concurrents, aujourdhui = aujourdhuiParis() }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`[site] ${fichier} : frontmatter absent ou illisible (--- en tête de fichier)`);
  }
  const schema = schemaDe(data.type);
  for (const cle of Object.keys(data)) {
    if (schema[cle]) continue;
    if (TOUS_CHAMPS.has(cle)) {
      const types = Object.entries(PROPRES).filter(([, p]) => p[cle]).map(([t]) => t);
      throw new Error(`[site] ${fichier} : champ « ${cle} » réservé au type ${types.join(' ou ')} (cette page est de type « ${data.type} »)`);
    }
    throw new Error(`[site] ${fichier} : champ inconnu « ${cle} » (champs permis pour « ${data.type} » : ${Object.keys(schema).join(', ')})`);
  }
  let cache = null;
  const ctx = { fichier, plateformes, racine, aujourdhui, concurrents: () => (cache ??= concurrents ? concurrents() : lireConcurrents(racine)) };
  for (const [nom, regle] of Object.entries(schema)) {
    if (data[nom] === undefined || data[nom] === null) {
      if (regle.requis) throw new Error(`[site] ${fichier} : champ « ${nom} » manquant${regle.aide ? ` (${regle.aide})` : ''}`);
      continue;
    }
    verifierChamp(nom, data[nom], regle, ctx);
  }
  if ((data.hero_media === undefined) !== (data.hero_alt === undefined)) {
    throw new Error(`[site] ${fichier} : « hero_media » et « hero_alt » vont ensemble (le texte alternatif est obligatoire)`);
  }
  if (data.lang !== langDossier) {
    throw new Error(`[site] ${fichier} : champ « lang » = ${data.lang}, mais le fichier est rangé sous contenu/${langDossier}/`);
  }
  if (data.type === 'accueil' && cheminFichier !== 'accueil') {
    throw new Error(`[site] ${fichier} : le type « accueil » est réservé à contenu/${langDossier}/accueil.md`);
  }
  if (data.type !== 'accueil' && cheminFichier === 'accueil') {
    throw new Error(`[site] ${fichier} : accueil.md doit porter « type: accueil »`);
  }
  if (data.slug !== undefined && data.slug !== cheminFichier) {
    throw new Error(`[site] ${fichier} : champ « slug » = « ${data.slug} », le chemin du fichier dit « ${cheminFichier} » (le chemin du fichier EST l'URL)`);
  }
}

// Valeurs qui contiennent « # » ou « : » sans guillemets : le YAML les coupe
// ou les refuse. On le dit avant que js-yaml ne le fasse en silence.
function verifierGuillemets(brut, fichier) {
  const entete = /^---\r?\n([\s\S]*?)\r?\n---/.exec(brut)?.[1] ?? '';
  entete.split(/\r?\n/).forEach((ligne, i) => {
    if (/^\s*(#|$)/.test(ligne)) return;
    // « clé: valeur », « - clé: valeur » (liste d'objets) ou « - valeur » (liste).
    const reste = ligne.replace(/^\s*(?:-\s+)?/, '');
    const paire = /^([a-z][a-z0-9_]*):(?:\s+(.*))?$/.exec(reste);
    const cle = paire ? paire[1] : null;
    const valeur = (paire ? paire[2] ?? '' : (/^\s*-\s+/.test(ligne) ? reste : '')).trim();
    if (!valeur) return;
    if (/^["'[{|>]/.test(valeur) || /^(true|false|null|-?\d+(\.\d+)?)$/.test(valeur)) return;
    if (/\s#/.test(valeur) || /:(\s|$)/.test(valeur)) {
      throw new Error(
        `[site] ${fichier}, ligne ${i + 2} : la valeur ${cle ? `de « ${cle} » ` : ''}contient « # » ou « : » sans guillemets. ` +
        'YAML la couperait en silence (commentaire) ou la refuserait : écris-la entre guillemets.',
      );
    }
  });
}

async function fichiersMd(dossier) {
  if (!existsSync(dossier)) return [];
  const sortie = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...await fichiersMd(p));
    else if (e.name.endsWith('.md')) sortie.push(p);
  }
  return sortie.sort();
}

/** Nom de fichier proposé pour un chemin hors motif (« Mon Guide » → « mon-guide »). */
const cheminPropose = (c) => c.normalize('NFD').toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-+|-+$/g, '');

/** Les valeurs des jetons d'une langue. */
export function jetonsDe(lang, plateformes) {
  return valeursJetons({ plateformes, locale: langue(lang).locale, nombres: TEXTES[lang].nombres });
}

/** Les pages de site/contenu (brouillons compris, marqués). */
export async function lirePagesSite(racine, { aujourdhui = aujourdhuiParis(), concurrents = null } = {}) {
  const plateformes = lirePlateformes(racine);
  const pages = [];
  // Un dossier de langue NON déclarée ne serait jamais lu : on le dit, plutôt
  // que de laisser des pages écrites qui ne sortent nulle part.
  const dossierContenu = path.join(racine, 'site', 'contenu');
  for (const nom of existsSync(dossierContenu) ? await readdir(dossierContenu) : []) {
    if (!CODES_LANGUES.includes(nom)) {
      throw new Error(`[site] site/contenu/${nom}/ : langue non déclarée dans site/langues.mjs (langues : ${CODES_LANGUES.join(', ')})`);
    }
  }
  for (const { code: lang } of LANGUES) {
    const base = path.join(dossierContenu, lang);
    const jetons = jetonsDe(lang, plateformes);
    for (const p of await fichiersMd(base)) {
      const fichier = path.relative(racine, p).split(path.sep).join('/');
      const cheminFichier = path.relative(base, p).split(path.sep).join('/').replace(/\.md$/, '');
      // Le chemin du fichier EST l'URL (revue de la fondation M-7) : « Mon
      // Guide.md » donnait /Mon Guide, refusé seulement par ricochet.
      if (!ID.test(cheminFichier)) {
        throw new Error(
          `[site] ${fichier} : le chemin du fichier devient l'URL — minuscules, chiffres, « - » et « / » seulement ` +
          `(renomme-le en « ${cheminPropose(cheminFichier)}.md »)`,
        );
      }
      const brut = (await readFile(p, 'utf8')).replace(/\r\n/g, '\n');
      verifierGuillemets(brut, fichier);
      let lu;
      try {
        lu = matter(brut, { engines: MOTEURS });
      } catch (e) {
        throw new Error(`[site] ${fichier} : frontmatter YAML illisible — ${e.message.split('\n')[0]}`);
      }
      const data = remplacerJetonsProfond(lu.data, jetons, fichier);
      const markdown = remplacerJetons(lu.content, jetons, fichier);
      validerFrontmatter(data, { fichier, langDossier: lang, cheminFichier, plateformes, racine, aujourdhui, concurrents });
      const chemin = cheminFichier === 'accueil' ? accueilDe(lang) : cheminDans(lang, cheminFichier);
      pages.push({ ...data, source: 'site', fichier, chemin, markdown });
    }
  }
  return pages;
}

/**
 * Les articles du blog, lus EXACTEMENT comme la SPA les lit (src/blog/posts.js) :
 * même parseur, même slug, même tri. Seules les fins de ligne sont ramenées à
 * LF (un poste Windows en core.autocrlf les sert en CRLF ; Vercel en LF) pour
 * que l'empreinte des dates soit la même partout.
 */
export async function lireArticlesBlog(racine, { aujourdhui = aujourdhuiParis() } = {}) {
  const { parseFrontmatter, slugFromPath, sortPosts } = await import(
    pathToFileURL(path.join(racine, 'src', 'blog', 'frontmatter.js')).href
  );
  const dossier = path.join(racine, 'src', 'blog');
  const noms = (await readdir(dossier)).filter((f) => f.endsWith('.md')).sort();
  const posts = await Promise.all(noms.map(async (nom) => {
    const brut = (await readFile(path.join(dossier, nom), 'utf8')).replace(/\r\n/g, '\n');
    const { data, content } = parseFrontmatter(brut);
    return { slug: slugFromPath(nom), ...data, content, fichier: `src/blog/${nom}` };
  }));
  for (const p of posts) {
    for (const champ of ['title', 'description', 'date', 'lang']) {
      if (!p[champ]) throw new Error(`[site] ${p.fichier} : champ « ${champ} » manquant (contrat du blog : une ligne « clé: valeur » par champ)`);
    }
    if (!CODES_LANGUES.includes(p.lang)) throw new Error(`[site] ${p.fichier} : lang « ${p.lang} » non déclarée dans site/langues.mjs`);
    for (const champ of ['date', 'updated']) {
      if (p[champ] === undefined) continue;
      if (!dateValide(p[champ])) throw new Error(`[site] ${p.fichier} : ${champ} « ${p[champ]} » — date AAAA-MM-JJ qui existe attendue`);
      if (dateFuture(p[champ], aujourdhui)) throw new Error(`[site] ${p.fichier} : ${champ} ${p[champ]} dans le futur (aujourd'hui ${aujourdhui}, Paris)`);
    }
    if (p.og_image && !fichierPublic(racine, p.og_image)) throw new Error(`[site] ${p.fichier} : og_image « ${p.og_image} » absent de public/`);
    if (p.translation && !posts.some((o) => o.slug === p.translation)) {
      throw new Error(`[site] ${p.fichier} : translation « ${p.translation} » ne correspond à aucun article`);
    }
  }
  return sortPosts(posts);
}
