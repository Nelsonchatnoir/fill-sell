// LA FLOTTE — plusieurs serveurs Hetzner, les places, la montée en charge (03/11/2026, points 1 et 5 de Nico).
//
//   · battre()  : chaque minute, ce serveur se déclare (cloud_serveur_battre) — capacité, navigateurs ouverts ;
//   · lireComptesDuServeur : ce que CE serveur sert (cloud_comptes_du_serveur ; repli sur cloud_comptes_a_servir tant
//     que la migration 20261103201000 n'est pas en base) ;
//   · capaciteServeur : sans NAVIGATEURS_MAX, la capacité THÉORIQUE vient de la mémoire de l'hôte et du plafond d'un
//     navigateur ; (07/11, décision 4) la capacité du moment vient des MESURES RÉELLES (capaciteMesuree) : départ 15, elle
//     monte seule jusqu'à 30 tant que les mesures le permettent ; alerte à 80 % ; jamais un serveur commandé seul ;
//   · tour()    : toutes les 10 min, la décision pure planFlotte. Sous le seuil de places libres, le serveur DOYEN
//     (le plus ancien nom vivant) prépare UN serveur neuf : corps exact de l'appel Hetzner, cloud-init (socle, .env,
//     paquet), DNS. ⛔ DOUBLE INTERRUPTEUR : rien n'est créé sans HETZNER_CREATION_AUTORISEE=1 (env) ET
//     coin_config cloud_serveurs_auto = 1 ; sinon le plan est seulement JOURNALISÉ (« à blanc »).
// Jamais un secret au journal : le user_data (qui porte le .env) n'y apparaît que par sa taille et son empreinte.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { socleAbsent } from './socle.js';

// coin_config ne porte que des ENTIERS : le type et le lieu y sont des index de ces listes (0 = défaut).
// cx43 (le serveur actuel) était en rupture le 01/11 : cpx42 (même taille, 8 vCPU, 16 Go) par défaut.
export const TYPES_SERVEUR = Object.freeze(['cpx42', 'cx43', 'cpx32', 'cx53', 'cpx62', 'ccx33']);
export const LIEUX_SERVEUR = Object.freeze(['fsn1', 'nbg1', 'hel1']);
export const SOCLE_MO_MESURE = 700;              // orchestrateur + Caddy + système, relevé le 03/11 sur cloud-1
export const VIVANT_MS = 5 * 60_000;             // = cloud_places_libres
export const CREATION_EN_COURS_MS = 45 * 60_000; // un serveur neuf se déclare en ~10 min ; au-delà : bloqué, alerte
export const USER_DATA_MAX = 32 * 1024;          // limite Hetzner du user_data
const IMAGE_SERVEUR = 'ubuntu-24.04';

const code = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
export const typeDepuisCode = (v) => TYPES_SERVEUR[code(v)] ?? TYPES_SERVEUR[0];
export const lieuDepuisCode = (v) => LIEUX_SERVEUR[code(v)] ?? LIEUX_SERVEUR[0];

/** L'erreur dit-elle « fonction inconnue » ? (la migration n'est pas encore en base) */
export const fonctionAbsente = (e) => socleAbsent(e);

/**
 * La capacité du serveur (pure) : NAVIGATEURS_MAX s'il est réglé ; sinon ⌊(mémoire de l'hôte − socle) / plafond d'un
 * navigateur⌋ ; illisible → repli (l'ancien défaut).
 */
export function capaciteServeur({ totalMo, socleMo = SOCLE_MO_MESURE, plafondMo, reglage = null, repli = 8 }) {
  if (reglage != null && Number.isFinite(Number(reglage))) return Math.max(0, Math.floor(Number(reglage)));
  if (!(Number(totalMo) > 0) || !(Number(plafondMo) > 0)) return repli;
  return Math.max(0, Math.floor((Number(totalMo) - Math.max(0, Number(socleMo) || 0)) / Number(plafondMo)));
}

/** Ce que sert CE serveur. Repli sur l'ancien appel tant que la fonction n'existe pas (déploiement avant migration). */
export async function lireComptesDuServeur(base, serveur) {
  const r = await base.rpc('cloud_comptes_du_serveur', { p_serveur: serveur });
  if (!r.error && Array.isArray(r.data)) return { comptes: r.data, source: 'serveur' };
  if (r.error && !fonctionAbsente(r.error)) throw new Error(`cloud_comptes_du_serveur : ${r.error.message}`);
  const a = await base.rpc('cloud_comptes_a_servir');
  if (a.error) throw new Error(`cloud_comptes_a_servir : ${a.error.message}`);
  return { comptes: a.data ?? [], source: 'repli' };
}

const numeroServeur = (nom) => { const m = /^cloud-(\d+)$/.exec(String(nom ?? '')); return m ? Number(m[1]) : null; };
const ordreNoms = (a, b) => {
  const na = numeroServeur(a); const nb = numeroServeur(b);
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1;
  if (nb != null) return 1;
  return String(a).localeCompare(String(b));
};
export const estVivant = (s, maintenant = Date.now()) => s?.etat === 'actif' && Number.isFinite(Date.parse(s?.vu_le ?? ''))
  && maintenant - Date.parse(s.vu_le) < VIVANT_MS;

/**
 * (06/11 soir, règle de Nico : « un compte ne doit JAMAIS être attribué à un serveur incapable de le servir ») CE QUE CE
 * SERVEUR PEUT SERVIR, déclaré à chaque battement (details.service) et lu par cloud_serveur_choisir (pure : testée) :
 *   · apte      : il peut RECEVOIR un compte — Chrome officiel, puce allumée, rendu réel LU dans un de ses navigateurs
 *                 (ou par la vérification hors réseau d'un serveur neuf : etat/rendu-serveur.json), jamais logiciel ;
 *   · incapable : il ne doit plus GARDER ses comptes — moteur sans Chrome officiel, puce coupée, rendu logiciel lu
 *                 (un rendu encore inconnu, juste après un démarrage, n'est PAS une incapacité) ;
 *   · comptes   : « tous », ou la liste COMPTES_AUTORISES (un compte hors liste ne lui est jamais attribué).
 */
export function serviceDuServeur({ config, rendu = null }) {
  const raisons = [];
  if (config?.moteurNavigateur !== 'chrome') raisons.push('moteur_sans_chrome_officiel');
  if (config?.navigateurGpu !== true) raisons.push('sans_puce');
  if (!rendu?.rendu) raisons.push('rendu_inconnu');
  else if (rendu.logiciel) raisons.push('rendu_logiciel');
  const liste = (config?.comptesAutorises ?? []).filter((u) => /^[0-9a-f-]{36}$/i.test(u));
  return {
    v: 1, apte: raisons.length === 0, incapable: raisons.some((r) => r !== 'rendu_inconnu'), raisons,
    moteur: config?.moteurNavigateur ?? null, puce: config?.navigateurGpu === true,
    rendu: rendu?.rendu ?? null, rendu_le: rendu?.le ?? null, rendu_source: rendu?.source ?? null,
    comptes: (config?.comptesAutorises ?? []).length ? liste : 'tous',
  };
}

/**
 * (06/11 soir, décision de Nico : « alerte vers support@ quand le serveur atteint 60 à 70 % de sa capacité réelle » ;
 * 07/11, décision 4 : à 80 %) L'ALERTE DE CAPACITÉ (pure : testée) — atteinte dès qu'UN taux dépasse le seuil
 * (coin_config cloud_capacite_alerte_pct, 80 par défaut) : comptes servis / capacité (la capacité ATTEIGNABLE mesurée en
 * capacité automatique, NAVIGATEURS_MAX sinon) ; et, par la dernière mesure de l'hôte (cloud_mesures, agent
 * fillsell-mesure, fraîche de moins de 15 min) : mémoire utilisée (hors cache récupérable), processeur et puce moyens
 * sur 5 min. Une mesure absente ou vieille ne déclenche rien (elle n'est que dite : mesure_fraiche = false).
 */
export const SEUIL_CAPACITE_PCT = 80;

/**
 * (07/11, décision 4 de Nico : « la capacité vient des mesures réelles, jusqu'à 30 comptes ; 14-15 n'était qu'un réglage
 * de départ ; elle monte seule tant que les mesures le permettent ») LA CAPACITÉ MESURÉE (pure : testée).
 * `mesures` = cloud_capacite_mesures(serveur, 24) : sur 24 h de fenêtres de 5 min — fenetres, comptes_max (le plus de
 * comptes ouverts ensemble), mem_compte_p95_mo, et les PROJECTIONS par fenêtre au 5e centile (= au 95e de la charge) :
 *   n_mem  = comptes + min(70 % de la mémoire − mémoire utilisée, mémoire disponible − 6 Gio) / mémoire p95 d'un compte ;
 *   n_cpu  = comptes × 60 / processeur p95 de l'hôte ;  n_puce = comptes × 60 / puce p95 (mêmes limites que la règle
 *            chiffrée du 06/11, docs/cloud/REPRISE.md) ;
 *   graves_7j (restrictions, blocages) et oom (24 h).
 * La règle :
 *   atteignable = min(plafond (CAPACITE_PLAFOND, 30), théorique (mémoire / plafond d'un navigateur), projections) ;
 *   cible       = min(atteignable, max(départ, comptes_max + avance)) — jamais plus de `avance` comptes au-delà de ce
 *                 qui a été RÉELLEMENT mesuré : la capacité monte avec les vrais comptes, palier par palier ;
 *   retenue     : un signe grave (restriction, blocage) sur 7 jours, ou un oom sur 24 h → aucune hausse (une baisse reste
 *                 possible) ;
 *   jamais sous les comptes déjà servis (aucun compte n'est retiré d'un serveur par une baisse : seule la vente s'arrête) ;
 *   mesures insuffisantes (< 12 h sur 24, aucun compte mesuré, fonction absente) → la capacité du moment (départ au
 *   démarrage), rien ne monte.
 */
export const FENETRES_MIN_CAPACITE = 144;
const nombre = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export function capaciteMesuree({ depart, plafond, theorique = null, avance = 5, actuelle = null, comptesServis = 0, mesures = null,
  fenetresMin = FENETRES_MIN_CAPACITE }) {
  const borneHaute = Math.max(1, Math.min(Number(plafond) || 1, nombre(theorique) ?? Infinity));
  const plancher = Math.max(0, Math.floor(Number(comptesServis) || 0));
  const dep = Math.min(Math.max(1, Math.floor(Number(depart) || 1)), borneHaute);
  const act = nombre(actuelle) ?? dep;
  const m = mesures ?? {};
  if (!(Number(m.fenetres) >= fenetresMin) || !(Number(m.mem_compte_p95_mo) > 0) || nombre(m.n_mem) == null) {
    const c = Math.max(Math.min(act, borneHaute), plancher);
    return { capacite: c, atteignable: c, raison: 'mesures_insuffisantes', projection: null, observe: nombre(m.comptes_max) };
  }
  const projection = Math.max(0, Math.floor(Math.min(nombre(m.n_mem), nombre(m.n_cpu) ?? Infinity, nombre(m.n_puce) ?? Infinity)));
  const atteignable = Math.min(borneHaute, projection);
  const observe = Math.max(0, Math.floor(Number(m.comptes_max) || 0));
  let cible = Math.min(atteignable, Math.max(dep, observe + Math.max(1, Math.floor(Number(avance) || 1))));
  let raison = cible > act ? 'mesures_hausse' : cible < act ? 'mesures_baisse' : 'stable';
  const retenue = Number(m.graves_7j) > 0 || Number(m.oom) > 0;
  if (retenue && cible > act) { cible = Math.min(act, atteignable); raison = 'retenue_signes'; }
  return { capacite: Math.max(cible, plancher), atteignable: Math.max(retenue ? Math.min(act, atteignable) : atteignable, plancher),
    raison, projection, observe, retenue };
}
export function alerteCapacite({ comptes, capacite, mesure = null, seuilPct = SEUIL_CAPACITE_PCT, maintenant = Date.now() }) {
  const taux = {};
  if (Number(capacite) > 0 && Number.isFinite(Number(comptes))) taux.comptes = Math.round((100 * Number(comptes)) / Number(capacite));
  const h = mesure && Date.parse(mesure.le) > maintenant - 15 * 60_000 ? mesure.hote ?? {} : null;
  if (h) {
    for (const [nom, cle] of [['memoire', 'mem_utilisee_max_pct'], ['processeur', 'cpu_moy_pct'], ['puce', 'puce_moy_pct']]) {
      if (h[cle] != null && Number.isFinite(Number(h[cle]))) taux[nom] = Number(h[cle]);
    }
  }
  const raisons = Object.entries(taux).filter(([, v]) => v >= seuilPct).map(([k, v]) => `${k} ${Math.round(v)} %`);
  return { atteint: raisons.length > 0, raisons, taux, seuilPct, mesure_fraiche: Boolean(h) };
}

/**
 * (06/11 soir, règle de Nico : « quand ces conditions sont réunies, l'alerte me le dit, et je décide ») Le texte de
 * l'alerte de passage à 30 comptes (pure : testée), d'après une ligne de la vue cloud_passage_30 ; null si les conditions
 * ne sont pas TOUTES réunies ou si le serveur a déjà 30 places.
 */
export function textePassage30(l, capacite) {
  if (!l?.conditions_reunies || !(Number(capacite) < 30)) return null;
  const pct = (a, b) => (Number(b) > 0 ? Math.round((100 * Number(a)) / Number(b)) : '?');
  return `Passage à 30 comptes possible sur ${l.serveur} (aujourd'hui ${capacite}) : toutes les conditions de la règle sont réunies sur 7 jours — `
    + `${l.comptes_p20} comptes ou plus sur 80 % des fenêtres (${l.fenetres}) ; mémoire projetée ${Math.round(Number(l.mem_proj_p95_mo) / 1024)} Go `
    + `(${pct(l.mem_proj_p95_mo, l.total)} %) ; processeur projeté ${l.cpu_proj_p95_pct} % ; puce projetée ${l.puce_proj_p95_pct} % ; `
    + `${l.jobs} jobs, ${pct(l.rates, l.jobs)} % ratés, p95 ${l.duree_p95_s} s ; bridage ${l.bride_med} (référence ${l.bride_med_reference}) ; `
    + `signes ${l.signes_par_compte_jour} par compte et par jour (référence ${l.signes_par_compte_jour_reference}), aucune restriction ni blocage. `
    + `Décision de Nico : NAVIGATEURS_MAX=30 (docs/cloud/REPRISE.md, « Passer de 15 à 30 »).`;
}

/** Le nom du prochain serveur (pure) : cloud-<plus grand numéro + 1>, au moins cloud-2. */
export function prochainNomServeur(serveurs) {
  const n = Math.max(1, ...(serveurs ?? []).map((s) => numeroServeur(s?.nom) ?? 0));
  return `cloud-${n + 1}`;
}
/** L'adresse d'un serveur neuf (pure) : cloud-2.fillsell.app… (cloud-1 garde cloud.fillsell.app). */
export const domaineDuServeur = (nom) => `${nom}.fillsell.app`;

/**
 * LA DÉCISION (pure : testée). places libres = cloud_places_libres (rendu par le battement) ou, à défaut, la somme
 * des places des serveurs vivants. Sous le seuil : UN serveur neuf, préparé par le seul DOYEN, jamais pendant une
 * création en cours ; une création bloquée (> 45 min) ne se relance pas seule : elle se dit.
 */
export function planFlotte({ serveurs = [], placesLibres = null, seuilPlacesLibres = 2, nomCourant = null, maintenant = Date.now() }) {
  const vivants = (serveurs ?? []).filter((s) => estVivant(s, maintenant));
  const calculees = vivants.reduce((n, s) => n + Math.max(0, (Number(s.capacite) || 0) - (Number(s.comptes) || 0)), 0);
  const libres = Number.isFinite(Number(placesLibres)) && placesLibres != null ? Number(placesLibres) : calculees;
  const seuil = Math.max(0, Number(seuilPlacesLibres) || 0);
  const doyen = vivants.map((s) => s.nom).sort(ordreNoms)[0] ?? null;
  const creations = (serveurs ?? []).filter((s) => s?.etat === 'en_creation');
  const enCours = creations.filter((s) => maintenant - Date.parse(s.cree_le ?? '') < CREATION_EN_COURS_MS);
  const bloquees = creations.filter((s) => !(maintenant - Date.parse(s.cree_le ?? '') < CREATION_EN_COURS_MS));
  const base = { placesLibres: libres, seuil, sousLeSeuil: libres < seuil, doyen, vivants: vivants.length };
  if (!base.sousLeSeuil) return { ...base, creer: 0, raison: 'places_suffisantes' };
  if (enCours.length) return { ...base, creer: 0, raison: 'creation_en_cours', enCreation: enCours.map((s) => s.nom) };
  if (bloquees.length) return { ...base, creer: 0, raison: 'creation_bloquee', enCreation: bloquees.map((s) => s.nom) };
  if (nomCourant && doyen && nomCourant !== doyen) return { ...base, creer: 0, raison: 'pas_le_doyen' };
  if (!doyen) return { ...base, creer: 0, raison: 'aucun_serveur_vivant' };
  return { ...base, creer: 1, raison: 'sous_le_seuil', nom: prochainNomServeur(serveurs), domaine: domaineDuServeur(prochainNomServeur(serveurs)) };
}

/** Le .env d'un serveur neuf (pure) : celui du serveur qui crée (même coffre, mêmes clés), nom et adresse propres. */
export function envPourNouveauServeur(texte, { nom, domaine }) {
  const remplacer = { SERVEUR_NOM: nom, DOMAINE: domaine, ENDURANCE: '0', NAVIGATEURS_MAX: '' };
  const vus = new Set();
  const lignes = String(texte ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => {
    const m = /^([A-Z0-9_]+)=/.exec(l);
    if (!m || !(m[1] in remplacer)) return l;
    vus.add(m[1]);
    return `${m[1]}=${remplacer[m[1]]}`;
  });
  for (const [k, v] of Object.entries(remplacer)) if (!vus.has(k)) lignes.push(`${k}=${v}`);
  return lignes.join('\n').replace(/\n*$/, '\n');
}

const SUR = {
  sha: /^[0-9a-f]{7,40}$/, domaine: /^[a-z0-9][a-z0-9.-]{1,120}$/, image: /^ghcr\.io\/[a-z0-9./-]+@sha256:[0-9a-f]{64}$/,
  destinations: /^[0-9.:,]*$/, url: /^https:\/\/[^\s'"]+$/,
};
const verifier = (nom, v) => { if (!SUR[nom].test(String(v ?? ''))) throw new Error(`flotte : ${nom} refusé (${String(v).slice(0, 40)})`); return v; };

/**
 * Le script d'amorce d'un serveur neuf (pure) : le socle de outils/installer-serveur.sh, puis les gestes distants de
 * outils/deployer.sh (paquet téléchargé par URL signée au lieu de scp). ⚠️ Miroir de ces deux scripts : les garder
 * d'accord.
 */
export function amorcePour({ sha, domaine, imageSteel, urlPaquet, destinations = '' }) {
  verifier('sha', sha); verifier('domaine', domaine); verifier('image', imageSteel); verifier('destinations', destinations);
  verifier('url', urlPaquet);
  return `#!/bin/bash
# FillSell Cloud — amorce d'un serveur neuf (flotte.js). Journal : /var/log/fillsell-amorce.log
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SHA='${sha}'; DOMAINE='${domaine}'; IMAGE_STEEL='${imageSteel}'; DESTINATIONS='${destinations}'
P="/srv/fillsell-cloud/paquets/$SHA"
apt-get update -qq
apt-get install -yq --no-install-recommends docker.io docker-compose-v2 iptables fail2ban unattended-upgrades rsync jq curl >/dev/null
mkdir -p /etc/ssh/sshd_config.d /etc/docker
printf 'PasswordAuthentication no\\nKbdInteractiveAuthentication no\\nPermitRootLogin prohibit-password\\n' > /etc/ssh/sshd_config.d/90-fillsell.conf
cat > /etc/systemd/system/fillsell-pare-feu.service <<'F'
[Unit]
Description=FillSell Cloud - les navigateurs ne sortent que par les proxys IPRoyal
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
[Install]
WantedBy=multi-user.target
F
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" }, "live-restore": true }' > /etc/docker/daemon.json
mkdir -p /srv/fillsell-cloud/profils /srv/fillsell-cloud/extension /srv/fillsell-cloud/deploiement /srv/fillsell-cloud/caddy/data /srv/fillsell-cloud/caddy/config /srv/fillsell-cloud/etat /srv/fillsell-cloud/paquets
chmod 700 /srv/fillsell-cloud
systemctl restart ssh
systemctl enable --now docker >/dev/null 2>&1
systemctl restart docker
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1
install -m 600 /root/fillsell-env /srv/fillsell-cloud/.env && rm -f /root/fillsell-env
curl -fsS --retry 5 --retry-delay 10 '${urlPaquet}' -o /root/paquet.tgz
rm -rf "$P" && mkdir -p "$P" && tar xzf /root/paquet.tgz -C "$P" && rm -f /root/paquet.tgz
docker pull -q "$IMAGE_STEEL" >/dev/null
docker build -q -t "fillsell-orchestrateur:$SHA" "$P" >/dev/null
LOC=/srv/fillsell-cloud/etat/chromium-locales
VCHR=$(docker run --rm --network none --entrypoint dpkg-query "$IMAGE_STEEL" -W -f '\${Version}' chromium 2>/dev/null || true)
if [ -n "$VCHR" ]; then
  mkdir -p "$LOC"
  docker run --rm --network bridge -u 0 -v "$LOC:/out" --entrypoint sh "$IMAGE_STEEL" -c \\
    "apt-get -qq update >/dev/null && cd /tmp && apt-get -qq download chromium-l10n=$VCHR && dpkg-deb -x chromium-l10n_*.deb x \\
     && cp x/usr/lib/chromium/locales/fr.pak /out/fr.pak && echo $VCHR > /out/VERSION" || echo "fr.pak non récupéré"
fi
rm -rf /srv/fillsell-cloud/extension && cp -r "$P/extension" /srv/fillsell-cloud/extension
cp -r "$P"/deploiement/. /srv/fillsell-cloud/deploiement/
# Les unités du pare-feu (deploiement/systemd/ : dont fillsell-pare-feu-maj.path, qui rejoue le pare-feu quand
# l'orchestrateur change etat/proxys-permis.txt) remplacent celle écrite plus haut.
for u in "$P"/deploiement/systemd/*.service "$P"/deploiement/systemd/*.path "$P"/deploiement/systemd/*.timer; do [ -f "$u" ] && cp "$u" /etc/systemd/system/; done
if [ -n "$DESTINATIONS" ]; then printf '%s\\n' "$DESTINATIONS" | tr ',' '\\n' > /srv/fillsell-cloud/deploiement/proxys-permis.txt; fi
printf 'VERSION_ORCHESTRATEUR=%s\\nDOMAINE=%s\\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
docker network inspect fillsell-cloud >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell fillsell-cloud >/dev/null
systemctl daemon-reload
systemctl enable fillsell-pare-feu.service >/dev/null 2>&1
for u in "$P"/deploiement/systemd/*.path "$P"/deploiement/systemd/*.timer; do [ -f "$u" ] && systemctl enable --now "$(basename "$u")" >/dev/null 2>&1; done
sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
cd /srv/fillsell-cloud/deploiement
VERSION_ORCHESTRATEUR="$SHA" DOMAINE="$DOMAINE" docker compose up -d
echo "amorcé : $SHA sur $DOMAINE"
`;
}

/** Le cloud-init d'un serveur neuf (pure) : l'amorce et le .env en fichiers (base64), lancés une fois. */
export function cloudInitPour({ amorce, envTexte }) {
  const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  const texte = `#cloud-config
write_files:
  - path: /root/fillsell-amorce.sh
    permissions: '0700'
    encoding: b64
    content: ${b64(amorce)}
  - path: /root/fillsell-env
    permissions: '0600'
    encoding: b64
    content: ${b64(envTexte)}
runcmd:
  - [ bash, -c, "bash /root/fillsell-amorce.sh > /var/log/fillsell-amorce.log 2>&1" ]
`;
  if (Buffer.byteLength(texte, 'utf8') > USER_DATA_MAX) throw new Error(`flotte : user_data de ${Buffer.byteLength(texte)} octets (> ${USER_DATA_MAX})`);
  return texte;
}

/** Le corps EXACT de POST /v1/servers (pure). */
export function corpsCreationHetzner({ nom, type, lieu, userData, cleSsh = [], pareFeu = null }) {
  return {
    name: `fillsell-${nom}`, server_type: type, location: lieu, image: IMAGE_SERVEUR, start_after_create: true,
    user_data: userData, ssh_keys: cleSsh, ...(pareFeu ? { firewalls: [{ firewall: pareFeu }] } : {}),
    public_net: { enable_ipv4: true, enable_ipv6: true },
    labels: { fillsell: 'cloud', serveur: nom },
  };
}

/** Un résumé SANS secret du plan (le user_data n'y est que par sa taille et son empreinte). */
export function resumePlan(plan) {
  const ud = plan?.corps?.user_data;
  return {
    ...plan, corps: plan?.corps ? { ...plan.corps, user_data: ud ? `<${Buffer.byteLength(ud)} octets, sha256 ${createHash('sha256').update(ud).digest('hex').slice(0, 16)}>` : null } : null,
  };
}

/** Le client de l'API Hetzner Cloud (GET libres ; POST seulement par executer, derrière les deux interrupteurs). */
export function creerClientHetzner({ jeton, fetch: f = globalThis.fetch }) {
  const appel = async (methode, chemin, corps) => {
    if (!jeton) throw new Error('Hetzner : jeton absent (HCLOUD_TOKEN)');
    const r = await f(`https://api.hetzner.cloud/v1${chemin}`, {
      method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Hetzner ${methode} ${chemin} → HTTP ${r.status} ${d?.error?.code ?? ''}`);
    return d;
  };
  return { disponible: Boolean(jeton), get: (c) => appel('GET', c), post: (c, b) => appel('POST', c, b) };
}

/** Le client Cloudflare (DNS du serveur neuf, nuage gris). */
export function creerClientCloudflare({ jeton, fetch: f = globalThis.fetch }) {
  const appel = async (methode, chemin, corps) => {
    const r = await f(`https://api.cloudflare.com/client/v4${chemin}`, {
      method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.success === false) throw new Error(`Cloudflare ${methode} ${chemin} → HTTP ${r.status}`);
    return d;
  };
  return {
    disponible: Boolean(jeton),
    async poserA(domaine, ipv4) {
      const zone = (await appel('GET', '/zones?name=fillsell.app')).result?.[0]?.id;
      if (!zone) throw new Error('Cloudflare : zone fillsell.app introuvable');
      return appel('POST', `/zones/${zone}/dns_records`, { type: 'A', name: domaine, content: ipv4, ttl: 60, proxied: false });
    },
  };
}

/** Le paquet courant en tar.gz (pour le serveur neuf), lu sur le disque du serveur qui crée. */
function empaqueterDefaut(dossier) {
  return new Promise((ok, ko) => {
    const p = spawn('tar', ['czf', '-', '-C', dossier, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const morceaux = []; let err = '';
    p.stdout.on('data', (d) => morceaux.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', ko);
    p.on('close', (c) => (c === 0 ? ok(Buffer.concat(morceaux)) : ko(new Error(`tar : ${err.slice(0, 200)}`))));
  });
}

export function creerFlotte({ config, base, navigateurs, journal, alertes, hetzner = null, cloudflare = null,
  lireFichier = (p) => readFile(p, 'utf8'), empaqueter = empaqueterDefaut, maintenant = () => Date.now() }) {
  const hz = hetzner ?? creerClientHetzner({ jeton: config.hetznerJeton });
  const cf = cloudflare ?? creerClientCloudflare({ jeton: config.cloudflareJeton });
  let dernierBattement = null;
  let absente = false;
  let derniereAlerteSeuil = 0;
  let derniereAlerteCapacite = 0;
  let derniereLecturePassage = 0;
  let derniereAlertePassage = 0;
  let dernierPlanJournalise = '';
  // (07/11, décision 4) LA CAPACITÉ DU MOMENT : fixe (NAVIGATEURS_MAX) ou mesurée (capaciteMesuree, relue chaque heure).
  const auto = config.navigateursMaxAuto === true;
  let capaciteCourante = Math.max(0, Number(config.navigateursMax) || 0);
  let etatCapacite = { capacite: capaciteCourante, atteignable: capaciteCourante, raison: auto ? 'depart' : 'fixe' };
  let derniereEvaluation = 0;

  /**
   * (07/11, décision 4) La capacité réévaluée sur les MESURES (cloud_capacite_mesures, 24 h) ; au démarrage (avant le
   * premier tour du planificateur) puis une fois par heure. Un changement est journalisé et dit à support@.
   */
  async function evaluerCapacite() {
    if (!auto) return etatCapacite;
    derniereEvaluation = maintenant();
    let mesures = null;
    try {
      const { data, error } = await base.rpc('cloud_capacite_mesures', { p_serveur: config.serveurNom, p_heures: 24 });
      mesures = error ? null : data;
    } catch { mesures = null; }
    let comptesServis = dernierBattement?.comptes;
    if (!Number.isFinite(Number(comptesServis))) {
      comptesServis = (await lireComptesDuServeur(base, config.serveurNom).catch(() => null))?.comptes?.length ?? 0;
    }
    const r = capaciteMesuree({ depart: config.capaciteDepart ?? 15, plafond: config.capacitePlafond ?? 30, theorique: config.capaciteTheorique ?? null,
      avance: config.capaciteAvance ?? 5, actuelle: capaciteCourante, comptesServis, mesures });
    const avant = capaciteCourante;
    capaciteCourante = r.capacite;
    etatCapacite = { ...r, comptes: Number(comptesServis) || 0, mesures_le: mesures?.derniere_le ?? null };
    if (r.capacite !== avant) {
      journal.alerte('capacite_changee', { serveur: config.serveurNom, avant, apres: r.capacite, ...etatCapacite });
      await alertes?.signaler('serveur', `Capacité de ${config.serveurNom} : ${avant} → ${r.capacite} comptes (${r.raison} ; mesurée atteignable ${r.atteignable}, `
        + `${r.observe ?? '?'} comptes au plus sur 24 h, plafond ${config.capacitePlafond ?? 30}). Aucun geste à faire.`, { capacite: etatCapacite });
    }
    return etatCapacite;
  }

  /** (06/11 soir) Le rendu connu : le dernier lu dans un navigateur, sinon etat/rendu-serveur.json (relu à chaque fois). */
  async function renduConnu() {
    const r = navigateurs.dernierRendu?.();
    if (r) return r;
    try { return JSON.parse(await lireFichier(`${config.dossierEtat}/rendu-serveur.json`)); } catch { return null; }
  }

  /** (06/11 soir) La dernière mesure de l'hôte (cloud_mesures) ; null tant que la migration 20261106210000 n'est pas en base. */
  async function derniereMesure() {
    try {
      const { data, error } = await base.from('cloud_mesures').select('le, hote').eq('serveur', config.serveurNom)
        .order('le', { ascending: false }).limit(1);
      return error ? null : (data?.[0] ?? null);
    } catch { return null; }
  }

  /** (06/11 soir) La ligne de CE serveur dans cloud_passage_30 ; null tant que la migration 20261106210000 n'est pas en base. */
  async function lirePassage30() {
    try {
      const { data, error } = await base.from('cloud_passage_30').select('*').eq('serveur', config.serveurNom).limit(1);
      return error ? null : (data?.[0] ?? null);
    } catch { return null; }
  }

  async function battre() {
    const service = serviceDuServeur({ config, rendu: await renduConnu() });
    const { data, error } = await base.rpc('cloud_serveur_battre', {
      p_nom: config.serveurNom, p_domaine: config.domaine, p_ipv4: config.serveurIpv4 || null,
      p_capacite: capaciteCourante, p_ouverts: navigateurs.ouverts().length,
      p_details: { capacite_auto: auto, memoire_navigateur: config.memoireNavigateur, service,
        ...(auto ? { capacite: { raison: etatCapacite.raison, atteignable: etatCapacite.atteignable, depart: config.capaciteDepart ?? 15,
          plafond: config.capacitePlafond ?? 30 } } : {}) },
    });
    if (error) {
      if (fonctionAbsente(error)) { if (!absente) journal.info('flotte_absente', { raison: 'migration 20261103201000 pas encore en base' }); absente = true; return null; }
      throw new Error(`cloud_serveur_battre : ${error.message}`);
    }
    absente = false;
    dernierBattement = { ...data, le: maintenant() };
    return data;
  }

  async function reglages() {
    const { data } = await base.from('coin_config').select('key, value')
      .in('key', ['cloud_places_seuil', 'cloud_serveurs_auto', 'cloud_serveur_type', 'cloud_serveur_lieu', 'cloud_capacite_alerte_pct']);
    const v = Object.fromEntries((data ?? []).map((l) => [l.key, Number(l.value)]));
    return {
      seuil: Number.isFinite(v.cloud_places_seuil) ? v.cloud_places_seuil : 2,
      capaciteAlertePct: v.cloud_capacite_alerte_pct >= 10 && v.cloud_capacite_alerte_pct <= 100 ? v.cloud_capacite_alerte_pct : SEUIL_CAPACITE_PCT,
      auto: v.cloud_serveurs_auto === 1,
      type: typeDepuisCode(v.cloud_serveur_type), lieu: lieuDepuisCode(v.cloud_serveur_lieu),
    };
  }

  /** Le plan complet d'un serveur neuf — sans rien créer (le corps porte une URL de paquet factice). */
  async function preparer(decision, r) {
    const manques = [];
    const dep = config.dossierDeploiement;
    const sha = /VERSION_ORCHESTRATEUR=([0-9a-f]+)/.exec(await lireFichier(`${dep}/.env`).catch(() => ''))?.[1] ?? null;
    if (!sha) manques.push('version déployée illisible (deploiement/.env)');
    const destinations = (await lireFichier(`${dep}/proxys-permis.txt`).catch(() => '')).split(/\s+/).filter(Boolean).join(',');
    const envSource = await lireFichier(config.fichierEnv).catch(() => '');
    if (!envSource) manques.push('.env illisible');
    let cleSsh = []; let pareFeu = null;
    if (hz.disponible) {
      cleSsh = ((await hz.get('/ssh_keys').catch(() => null))?.ssh_keys ?? []).map((k) => k.id);
      pareFeu = (await hz.get('/firewalls?name=fillsell-cloud').catch(() => null))?.firewalls?.[0]?.id ?? null;
      if (!cleSsh.length) manques.push('aucune clé SSH au projet Hetzner');
    } else manques.push('jeton Hetzner absent (HCLOUD_TOKEN)');
    if (!cf.disponible) manques.push(`DNS à poser à la main : ${decision.domaine} (CLOUDFLARE_API_TOKEN absent)`);
    const plan = { nom: decision.nom, domaine: decision.domaine, type: r.type, lieu: r.lieu, sha, cleSsh, pareFeu, manques,
      etapes: ['noter « en_creation »', `paquet ${sha ?? '?'} → stockage cloud-paquets (URL signée 2 h)`, `POST /v1/servers (${r.type}, ${r.lieu})`,
        cf.disponible ? `DNS A ${decision.domaine} (Cloudflare, nuage gris)` : 'DNS : à poser', 'battement du serveur neuf → actif'] };
    if (sha && envSource) {
      const amorce = amorcePour({ sha, domaine: decision.domaine, imageSteel: config.imageNavigateur, urlPaquet: 'https://a-blanc.invalid/paquet.tgz', destinations });
      plan.corps = corpsCreationHetzner({ nom: decision.nom, type: r.type, lieu: r.lieu, cleSsh, pareFeu,
        userData: cloudInitPour({ amorce, envTexte: envPourNouveauServeur(envSource, { nom: decision.nom, domaine: decision.domaine }) }) });
    }
    return { plan, envSource, destinations };
  }

  /** ⛔ Crée VRAIMENT le serveur. Appelé seulement derrière les deux interrupteurs. */
  async function executer(decision, r, { plan, envSource, destinations }) {
    if (plan.manques.some((m) => !m.startsWith('DNS'))) throw new Error(`flotte : création impossible (${plan.manques.join(' ; ')})`);
    await base.rpc('cloud_serveur_noter_creation', { p_nom: plan.nom, p_domaine: plan.domaine, p_hetzner_id: null, p_type: plan.type, p_ipv4: null, p_details: { etape: 'paquet' } });
    const tgz = await empaqueter(`${config.dossierPaquets}/${plan.sha}`);
    const chemin = `${plan.sha}.tgz`;
    const up = await base.storage.from('cloud-paquets').upload(chemin, tgz, { upsert: true, contentType: 'application/gzip' });
    if (up.error) throw new Error(`stockage : ${up.error.message}`);
    const sig = await base.storage.from('cloud-paquets').createSignedUrl(chemin, 7200);
    if (sig.error || !sig.data?.signedUrl) throw new Error(`URL signée : ${sig.error?.message ?? 'absente'}`);
    const amorce = amorcePour({ sha: plan.sha, domaine: plan.domaine, imageSteel: config.imageNavigateur, urlPaquet: sig.data.signedUrl, destinations });
    const corps = corpsCreationHetzner({ nom: plan.nom, type: plan.type, lieu: plan.lieu, cleSsh: plan.cleSsh, pareFeu: plan.pareFeu,
      userData: cloudInitPour({ amorce, envTexte: envPourNouveauServeur(envSource, { nom: plan.nom, domaine: plan.domaine }) }) });
    const cree = await hz.post('/servers', corps);
    const id = cree?.server?.id ?? null;
    const ipv4 = cree?.server?.public_net?.ipv4?.ip ?? null;
    await base.rpc('cloud_serveur_noter_creation', { p_nom: plan.nom, p_domaine: plan.domaine, p_hetzner_id: id, p_type: plan.type, p_ipv4: ipv4, p_details: { etape: 'cree' } });
    let dns = 'a_poser';
    if (cf.disponible && ipv4) dns = await cf.poserA(plan.domaine, ipv4).then(() => 'pose').catch((e) => `echec : ${e.message}`);
    journal.alerte('flotte_serveur_cree', { nom: plan.nom, hetzner_id: id, ipv4, type: plan.type, lieu: plan.lieu, dns });
    await alertes?.signaler('serveur', `Serveur Cloud ${plan.nom} créé (${plan.type}, ${plan.lieu}, ${ipv4 ?? '?'}) — DNS : ${dns}.`);
    return { cree: true, id, ipv4, dns };
  }

  /** Un tour de flotte (toutes les 10 min) : la décision, l'alerte de seuil, le plan à blanc ou la création. */
  async function tour() {
    if (absente) return { absente: true };
    const { data: serveurs, error } = await base.from('cloud_serveurs').select('nom, domaine, capacite, comptes, ouverts, etat, vu_le, cree_le');
    if (error) { if (fonctionAbsente(error) || /cloud_serveurs/.test(error.message)) return { absente: true }; throw new Error(`cloud_serveurs : ${error.message}`); }
    const r = await reglages();
    const decision = planFlotte({ serveurs, placesLibres: dernierBattement?.places_libres ?? null, seuilPlacesLibres: r.seuil,
      nomCourant: config.serveurNom, maintenant: maintenant() });
    if (decision.sousLeSeuil && maintenant() - derniereAlerteSeuil >= 6 * 3600_000 && (decision.creer || decision.raison !== 'pas_le_doyen')) {
      derniereAlerteSeuil = maintenant();
      await alertes?.signaler('serveur', `Places Cloud sous le seuil : ${decision.placesLibres} libre(s) pour un seuil de ${decision.seuil} (${decision.raison}).`, { flotte: decision });
    }
    if (decision.raison === 'creation_bloquee') {
      await alertes?.signaler('serveur', `Création de serveur Cloud bloquée depuis plus de 45 min : ${decision.enCreation.join(', ')}.`);
    }
    // (07/11, décision 4) La capacité mesurée, relue une fois par heure (la première fois : au démarrage, index.js).
    if (auto && maintenant() - derniereEvaluation >= 3600_000) await evaluerCapacite().catch((e) => journal.alerte('capacite_evaluation_echec', { erreur: e.message }));
    // (06/11 soir ; 07/11 : 80 %, sur la capacité ATTEIGNABLE) La capacité RÉELLE de ce serveur : une alerte, puis un
    // rappel au plus toutes les 6 h tant qu'elle tient. Aucun serveur n'est commandé par elle : Nico décide.
    const capaciteReelle = auto ? etatCapacite.atteignable : capaciteCourante;
    const capacite = alerteCapacite({ comptes: dernierBattement?.comptes, capacite: capaciteReelle, mesure: await derniereMesure(),
      seuilPct: r.capaciteAlertePct, maintenant: maintenant() });
    if (capacite.atteint && maintenant() - derniereAlerteCapacite >= 6 * 3600_000) {
      derniereAlerteCapacite = maintenant();
      journal.alerte('capacite_seuil', { serveur: config.serveurNom, ...capacite });
      await alertes?.signaler('serveur', `Capacité de ${config.serveurNom} : seuil de ${capacite.seuilPct} % atteint — ${capacite.raisons.join(', ')} `
        + `(${dernierBattement?.comptes ?? '?'} comptes pour ${capaciteReelle}${auto ? ` mesurés atteignables, ${capaciteCourante} ouverts à la vente` : ''}). `
        + 'Marche à suivre : docs/cloud/REPRISE.md, « Ajouter un serveur » (aucun serveur n\'est commandé automatiquement).',
      { capacite });
    }
    // (06/11 soir) La règle de passage à 30 comptes (vue cloud_passage_30) : lue une fois par heure tant que ce serveur a
    // moins de 30 places ; une alerte quand TOUTES les conditions sont réunies, un rappel au plus par 24 h. Nico décide.
    // (07/11, décision 4) Seulement en capacité FIXE (NAVIGATEURS_MAX) : la capacité mesurée monte seule.
    if (!auto && capaciteCourante < 30 && maintenant() - derniereLecturePassage >= 3600_000) {
      derniereLecturePassage = maintenant();
      const ligne = await lirePassage30();
      const texte = textePassage30(ligne, capaciteCourante);
      if (texte && maintenant() - derniereAlertePassage >= 24 * 3600_000) {
        derniereAlertePassage = maintenant();
        journal.alerte('passage_30_possible', { serveur: config.serveurNom });
        await alertes?.signaler('serveur', texte, { passage_30: ligne });
      }
    }
    if (!decision.creer) return { decision };
    const prep = await preparer(decision, r);
    const autorise = config.hetznerCreationAutorisee === true && r.auto && hz.disponible;
    if (!autorise) {
      const resume = resumePlan(prep.plan);
      const cle = JSON.stringify({ n: resume.nom, t: resume.type, l: resume.lieu, s: resume.sha, m: resume.manques });
      if (cle !== dernierPlanJournalise) {
        dernierPlanJournalise = cle;
        journal.info('flotte_plan_a_blanc', { interrupteurs: { env: config.hetznerCreationAutorisee === true, coin_config: r.auto, jeton: hz.disponible }, plan: resume });
      }
      return { decision, plan: resumePlan(prep.plan), aBlanc: true };
    }
    const fait = await executer(decision, r, prep);
    return { decision, plan: resumePlan(prep.plan), fait };
  }

  return { battre, tour, preparer, evaluerCapacite, dernierBattement: () => dernierBattement,
    capacite: () => capaciteCourante, etatCapacite: () => etatCapacite };
}
