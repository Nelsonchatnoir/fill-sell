import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lireYaml } from './yaml.mjs';
import { dateValide } from './dates.mjs';

// Données partagées du site vitrine (09/10/2026, architecture § 2.7,
// docs/seo/FORMAT-CONTENU.md § 4) : site/donnees/plateformes.yml,
// tarifs.yml et concurrents.yml (généré par npm run site:concurrents).
// Validées ici, avec des messages qui nomment le fichier et le champ — une
// faute de frappe ne doit jamais ouvrir une plateforme ni publier un prix en
// silence.

const ID = /^[a-z0-9]+$/;
const MODES = ['extension', 'api'];

function lireFichier(racine, ...morceaux) {
  const relatif = path.join('site', 'donnees', ...morceaux);
  const nom = relatif.split(path.sep).join('/');
  const err = (m) => new Error(`[site] ${nom} : ${m}`);
  const f = path.join(racine, relatif);
  if (!existsSync(f)) throw err('fichier absent');
  try {
    return { donnees: lireYaml(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')), err };
  } catch (e) {
    throw err(`illisible — ${String(e.message).split('\n')[0]}`);
  }
}

/**
 * Rend { date, plateformes, ouvertes } :
 *   · plateformes : toutes, telles que déclarées (fermées comprises) ;
 *   · ouvertes    : celles que le site peut nommer (ouverte ET au moins un pays ouvert).
 */
export function lirePlateformes(racine) {
  const { donnees, err } = lireFichier(racine, 'plateformes.yml');
  if (!dateValide(donnees.date)) throw err(`« date » AAAA-MM-JJ valide attendue entre guillemets, reçu ${JSON.stringify(donnees.date)}`);
  if (!Array.isArray(donnees.plateformes) || !donnees.plateformes.length) throw err('liste « plateformes » absente ou vide');
  const vus = new Set();
  for (const [i, p] of donnees.plateformes.entries()) {
    const ou = `plateforme n° ${i + 1}${p?.id ? ` (${p.id})` : ''}`;
    if (!p || typeof p !== 'object') throw err(`${ou} illisible`);
    if (typeof p.id !== 'string' || !ID.test(p.id)) throw err(`${ou} : « id » en minuscules attendu`);
    if (vus.has(p.id)) throw err(`${ou} : id en double`);
    vus.add(p.id);
    if (typeof p.nom !== 'string' || !p.nom.trim()) throw err(`${ou} : « nom » manquant`);
    if (typeof p.ouverte !== 'boolean') throw err(`${ou} : « ouverte » true ou false attendu`);
    if (!p.ouverte && (typeof p.raison !== 'string' || !p.raison.trim())) throw err(`${ou} : fermée sans « raison » (on dit pourquoi, toujours)`);
    if (!MODES.includes(p.mode)) throw err(`${ou} : « mode » ${MODES.join(' ou ')} attendu, reçu ${JSON.stringify(p.mode)}`);
    for (const champ of ['republication_auto', 'vente_enregistree_seule']) {
      if (typeof p[champ] !== 'boolean') throw err(`${ou} : « ${champ} » true ou false attendu`);
    }
    if (p.autorisation !== undefined && typeof p.autorisation !== 'boolean') throw err(`${ou} : « autorisation » true ou false attendu`);
    if (!Array.isArray(p.pays) || !p.pays.length) throw err(`${ou} : liste « pays » absente`);
    for (const pays of p.pays) {
      if (!pays || !/^[A-Z]{2}$/.test(pays.code ?? '') || typeof pays.domaine !== 'string' || typeof pays.ouvert !== 'boolean') {
        throw err(`${ou} : pays ${JSON.stringify(pays)} — { code: XX, domaine: …, ouvert: true|false } attendu`);
      }
      if (pays.ouvert && !p.ouverte) throw err(`${ou} : pays ${pays.code} ouvert sur une plateforme fermée`);
    }
  }
  const ouvertes = donnees.plateformes.filter((p) => p.ouverte && p.pays.some((x) => x.ouvert));
  return { date: donnees.date, plateformes: donnees.plateformes, ouvertes };
}

/**
 * Tarifs (site/donnees/tarifs.yml). ⛔ Aucun chiffre de quota (décision de
 * Nico du 09/10) : un chiffre dans « pour », « inclus », « communs » ou
 * « mentions » fait échouer le build — les prix, eux, sont des nombres.
 */
export function lireTarifs(racine, langues) {
  const { donnees, err } = lireFichier(racine, 'tarifs.yml');
  if (!dateValide(donnees.date)) throw err(`« date » AAAA-MM-JJ valide attendue, reçu ${JSON.stringify(donnees.date)}`);
  if (!/^[A-Z]{3}$/.test(donnees.devise ?? '')) throw err('« devise » ISO 4217 attendue (EUR)');
  if (typeof donnees.inscription !== 'string' || !donnees.inscription.startsWith('/login')) throw err('« inscription » : chemin de l\'app /login?… attendu');
  if (!Array.isArray(donnees.paliers) || donnees.paliers.length < 2) throw err('« paliers » : au moins deux paliers attendus');
  const sansChiffre = (texte, ou) => {
    if (typeof texte !== 'string' || !texte.trim()) throw err(`${ou} : texte attendu`);
    if (/\d/.test(texte)) throw err(`${ou} : « ${texte} » contient un chiffre — aucun chiffre de quota ni de plafond (décision de Nico du 09/10)`);
  };
  const parLangue = (v, ou, verif) => {
    for (const l of langues) {
      if (v?.[l] === undefined) throw err(`${ou} : version « ${l} » absente`);
      verif(v[l], `${ou}.${l}`);
    }
  };
  const vus = new Set();
  for (const [i, p] of donnees.paliers.entries()) {
    const ou = `paliers[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (typeof p?.id !== 'string' || !ID.test(p.id) || vus.has(p.id)) throw err(`${ou} : « id » unique en minuscules attendu`);
    vus.add(p.id);
    if (typeof p.prix !== 'number' || p.prix < 0) throw err(`${ou} : « prix » nombre ≥ 0 attendu (par mois)`);
    if (p.mis_en_avant !== undefined && typeof p.mis_en_avant !== 'boolean') throw err(`${ou} : « mis_en_avant » booléen attendu`);
    parLangue(p.nom, `${ou}.nom`, sansChiffre);
    parLangue(p.pour, `${ou}.pour`, sansChiffre);
    parLangue(p.cta, `${ou}.cta`, sansChiffre);
    parLangue(p.inclus, `${ou}.inclus`, (liste, o) => {
      if (!Array.isArray(liste) || !liste.length) throw err(`${o} : liste attendue`);
      liste.forEach((x, j) => sansChiffre(x, `${o}[${j}]`));
    });
  }
  if (donnees.paliers.filter((p) => p.mis_en_avant).length > 1) throw err('un seul palier « mis_en_avant »');
  parLangue(donnees.communs, 'communs', (liste, o) => {
    if (!Array.isArray(liste) || !liste.length) throw err(`${o} : liste attendue`);
    liste.forEach((x, j) => sansChiffre(x, `${o}[${j}]`));
  });
  parLangue(donnees.mentions, 'mentions', sansChiffre);
  return donnees;
}

/** Faits concurrents (site/donnees/concurrents.yml, écrit par npm run site:concurrents). */
export function lireConcurrents(racine) {
  const { donnees, err } = lireFichier(racine, 'concurrents.yml');
  if (!Array.isArray(donnees.outils) || !donnees.outils.length) throw err('liste « outils » absente — npm run site:concurrents');
  const parSlug = new Map(donnees.outils.map((o) => [o.slug, o]));
  const nous = donnees.outils.find((o) => o.notre_produit);
  if (!nous) throw err('ligne FillSell (notre_produit) absente — npm run site:concurrents');
  return { ...donnees, parSlug, nous };
}

// ── Jetons de texte (FORMAT-CONTENU § 1) ─────────────────────────────────────
// Remplacés au build dans le corps ET le frontmatter des pages. Tirés des
// données : une ligne de plateformes.yml change toutes les pages. Un jeton
// inconnu = build rouge ; les jetons de quotas, retirés le 09/10 (décision de
// Nico : aucun chiffre de quota), sont refusés avec leur raison.

const JETON = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Les valeurs des jetons, pour une langue (`nombres` : les nombres en toutes lettres). */
export function valeursJetons({ plateformes, locale, nombres }) {
  const liste = (noms) => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(noms);
  const ouvertes = plateformes.ouvertes;
  const n = ouvertes.length;
  return {
    plateformes: liste(ouvertes.map((p) => p.nom)),
    republication: liste(ouvertes.filter((p) => p.republication_auto).map((p) => p.nom)),
    nb_plateformes: nombres[n] ?? new Intl.NumberFormat(locale).format(n),
  };
}

/** Remplace les jetons d'une chaîne ; lève pour un jeton inconnu (fichier nommé). */
export function remplacerJetons(texte, valeurs, fichier) {
  if (typeof texte !== 'string' || !texte.includes('{{')) return texte;
  return texte.replace(JETON, (m, nom) => {
    if (/^quota:/i.test(nom)) {
      throw new Error(`[site] ${fichier} : jeton ${m} — les quotas ne s'affichent plus nulle part (décision de Nico du 09/10) : retire ce jeton`);
    }
    if (!Object.hasOwn(valeurs, nom)) {
      throw new Error(`[site] ${fichier} : jeton ${m} inconnu (jetons : ${Object.keys(valeurs).map((k) => `{{${k}}}`).join(', ')})`);
    }
    return valeurs[nom];
  });
}

/** Remplace les jetons dans toutes les chaînes d'une valeur (frontmatter). */
export function remplacerJetonsProfond(valeur, valeurs, fichier) {
  if (typeof valeur === 'string') return remplacerJetons(valeur, valeurs, fichier);
  if (Array.isArray(valeur)) return valeur.map((v) => remplacerJetonsProfond(v, valeurs, fichier));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, remplacerJetonsProfond(v, valeurs, fichier)]));
  }
  return valeur;
}
