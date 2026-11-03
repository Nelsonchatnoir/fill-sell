// (03/11, point 2 de Nico) LE PARE-FEU DES NAVIGATEURS DEVIENT DYNAMIQUE : une IP neuve, revenue au pool ou prolongée
// est permise SANS redéploiement. L'orchestrateur écrit la liste des sorties permises (« ip:port », une par ligne) dans
// etat/proxys-permis.txt ; sur l'hôte, l'unité fillsell-pare-feu-maj.path voit le fichier changer et rejoue
// deploiement/pare-feu-navigateurs.sh (chaîne FILLSELL-NAV remplacée d'un bloc par iptables-restore : aucune fenêtre,
// aucune connexion coupée), qui réécrit la preuve etat/pare-feu.json avec les destinations APPLIQUÉES. L'orchestrateur
// ne contrôle ni ne visite une IP tant que la preuve ne la porte pas (un contrôle d'entrée raté par le pare-feu
// jetterait une IP saine).
// Repli : sans fichier d'état, le script lit deploiement/proxys-permis.txt (DESTINATIONS_PROXY du déploiement).
import { readFile, writeFile, rename } from 'node:fs/promises';

export const FICHIER_SORTIES = 'proxys-permis.txt';
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/**
 * Les sorties permises (pure : testée) : toute IP du pool qui n'est pas expirée (achetée, disponible, attribuée, au
 * repos, au rebut tant qu'elle est payée), une heure de marge après l'échéance ; plus celles qu'un navigateur ouvert
 * utilise encore (jamais couper une session en cours). Triées, sans doublon, « ip:port ».
 */
export function sortiesDuPool(ips, { enUsage = [], maintenant = Date.now() } = {}) {
  const usage = new Set((enUsage ?? []).map((x) => Number(x)).filter(Number.isFinite));
  const lignes = new Set();
  for (const i of Array.isArray(ips) ? ips : []) {
    const ip = String(i?.ip ?? '').replace(/\/32$/, '');
    const port = Number(i?.port ?? 12323);
    if (!IPV4.test(ip) || !(port >= 1 && port <= 65535)) continue;
    const vivante = i?.etat !== 'expiree' && Date.parse(String(i?.expire_le ?? '')) > maintenant - 3600_000;
    if (vivante || usage.has(Number(i?.id))) lignes.add(`${ip}:${port}`);
  }
  return [...lignes].sort();
}

/** Le texte du fichier (pur) : un en-tête, puis une sortie par ligne. */
export function texteSorties(lignes) {
  return `# Écrit par l'orchestrateur FillSell Cloud (pareFeu.js) — sorties permises des navigateurs, « ip:port ».\n${(lignes ?? []).join('\n')}\n`;
}

/** Les lignes valides d'un texte de sorties (pure) — même règle que pare-feu-navigateurs.sh. */
export function lireSorties(texte) {
  return String(texte ?? '').split(/\r?\n/).map((l) => l.replace(/\s/g, '')).filter((l) => l && !l.startsWith('#'))
    .filter((l) => { const [ip, port] = [l.slice(0, l.lastIndexOf(':')), l.slice(l.lastIndexOf(':') + 1)]; return IPV4.test(ip) && /^\d{2,5}$/.test(port); });
}

/**
 * Ce que l'hôte a APPLIQUÉ (pure), lu dans la preuve etat/pare-feu.json : { ports: Set|null, sorties: Set }.
 * « ports:12321,12323 » (repli sans liste) = toute adresse sur ces ports.
 */
export function sortiesAppliquees(preuveBrute) {
  let p = null;
  try { p = JSON.parse(String(preuveBrute ?? '')); } catch { return { ports: null, sorties: new Set() }; }
  const d = String(p?.destinations ?? '');
  if (d.startsWith('ports:')) return { ports: new Set(d.slice(6).split(',').map((x) => x.trim()).filter(Boolean)), sorties: new Set() };
  return { ports: null, sorties: new Set(d.split(',').map((x) => x.trim()).filter(Boolean)) };
}

/** Une sortie est-elle ouverte par le pare-feu appliqué ? (pure) */
export function sortieOuverte(appliquees, ip, port) {
  const cle = `${String(ip).replace(/\/32$/, '')}:${Number(port ?? 12323)}`;
  if (appliquees?.ports) return appliquees.ports.has(String(Number(port ?? 12323)));
  return Boolean(appliquees?.sorties?.has(cle));
}

export function creerPareFeu({ config, journal, attendreMs = 20_000, pasMs = 1000 }) {
  const dossier = config.dossierEtat || '/srv/fillsell-cloud/etat';
  const fichier = `${dossier}/${FICHIER_SORTIES}`;
  const preuve = `${dossier}/pare-feu.json`;

  async function appliquees() {
    return sortiesAppliquees(await readFile(preuve, 'utf8').catch(() => ''));
  }

  /**
   * Écrit la liste voulue (si elle a changé : écriture atomique, l'unité de l'hôte ne voit qu'un fichier complet), puis
   * attend au plus `attendreMs` que la preuve la porte. Rend { ecrit, appliquees, manquantes }.
   */
  async function synchroniser(ips, { enUsage = [] } = {}) {
    const voulues = sortiesDuPool(ips, { enUsage });
    if (!voulues.length) return { ecrit: false, appliquees: await appliquees(), manquantes: [] };
    const actuel = lireSorties(await readFile(fichier, 'utf8').catch(() => ''));
    let ecrit = false;
    if (actuel.join(',') !== voulues.join(',')) {
      const tmp = `${fichier}.${process.pid}.tmp`;
      await writeFile(tmp, texteSorties(voulues), { mode: 0o644 });
      await rename(tmp, fichier);
      ecrit = true;
      journal?.info('pare_feu_liste_ecrite', { sorties: voulues.length });
    }
    let a = await appliquees();
    let manquantes = voulues.filter((v) => !sortieOuverte(a, v.slice(0, v.lastIndexOf(':')), v.slice(v.lastIndexOf(':') + 1)));
    for (let t = 0; manquantes.length && t < attendreMs; t += pasMs) {
      await new Promise((r) => setTimeout(r, pasMs));
      a = await appliquees();
      manquantes = voulues.filter((v) => !sortieOuverte(a, v.slice(0, v.lastIndexOf(':')), v.slice(v.lastIndexOf(':') + 1)));
    }
    if (manquantes.length) journal?.alerte('pare_feu_non_applique', { manquantes: manquantes.length });
    return { ecrit, appliquees: a, manquantes };
  }

  return { synchroniser, appliquees, fichier };
}
