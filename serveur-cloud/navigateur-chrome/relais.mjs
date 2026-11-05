// (30/10, lot D) LE RELAIS DU NAVIGATEUR CHROME DU CLOUD — dans le conteneur, sans dépendance.
//   · 127.0.0.1:3128 (PORT_RELAIS) : le proxy que Chrome utilise. Il relaie vers le proxy IPRoyal du compte
//     (PROXY_AMONT), et les seuls hôtes de Beebs vers PROXY_BEEBS s'il existe (IP résidentielle réservée à Beebs,
//     décision de Nico) ; les identifiants du proxy ne sont jamais donnés à Chrome ni journalisés.
//   · 127.0.0.1:3129 (PORT_EXTENSION) : l'extension FillSell Cloud signée (CRX) et son update.xml, pour l'installation
//     par stratégie d'entreprise (ExtensionInstallForcelist) — Chrome officiel ignore --load-extension.
//   · (30/10, règle de Nico) LE VERROU DES PLATEFORMES : une plateforme n'est joignable QUE si le compte y est connecté
//     (PLATEFORMES_PERMISES, posé par l'orchestrateur depuis le coffre), ou pendant son « Me connecter ». Toute autre
//     requête vers une plateforme reçoit 403 SANS aucune connexion vers le proxy : aucune tâche de l'extension
//     (sonde, relevés, ventes, détection de vente, messagerie…) ne peut plus visiter seule une plateforme. Les tiers
//     (DataDome, Google, Apple, Kiabi, Facebook, Supabase, fillsell.app) passent toujours.
//   · (04/11 soir, essai GPU) LES RÉGIES PUBLICITAIRES (PUBLICITE = « a,b,c », posée par l'orchestrateur quand
//     BLOQUER_PUBLICITE=1) : refusées en 403 SANS connexion amont, comme chez un bloqueur de pub — la parité du filtre du
//     moteur steel (navigateur.js, DOMAINES_PUBLICITE). Comptées à part (GET /etat → publicites).
//   · 0.0.0.0:3130 (PORT_CONTROLE) : le contrôle du verrou, pour l'orchestrateur seul — en-tête X-Jeton =
//     JETON_CONTROLE (aléatoire à chaque ouverture, jamais journalisé) ; POST /permis {"plateformes":[…]} remplace
//     l'ensemble, GET /etat rend { permises, refus }. Sans jeton configuré, le contrôle refuse tout.
//   · (05/11 soir, lot « Ouverture du Cloud », point 11) LE RÉESSAI SUR PLACE : un tunnel vers le proxy amont qui échoue
//     pour une cause PASSAGÈRE (connexion refusée, coupée ou muette ; réponse 502/503/504 du proxy) est retenté sur place,
//     RELAIS_ESSAIS fois au plus en quelques secondes (attentes 0,4 s puis 1,2 s), avant de rendre 502 à Chrome — jamais
//     sur un refus net (403, 407 : une nouvelle tentative n'y changerait rien). LES COUPURES sont comptées par jour (heure
//     de Paris) et par plateforme (GET /etat → coupures : { jour: { plateforme: { echecs, reprises, secours } } }, 7 jours) :
//     echecs = rendus à Chrome, reprises = passés au réessai. L'IP DE SECOURS (PROXY_SECOURS) n'est essayée qu'après tous
//     les réessais ; elle est COUPÉE par défaut (décision de Nico : une IP partagée entre comptes les relierait).
// Les ports sont paramétrables : le poste Windows lancera un relais par utilisateur.
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PLATEFORMES_VERROU = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop', 'ebay', 'opla']);
// Les domaines PROPRES de chaque plateforme (pages, API, images, CDN maison) — jamais un tiers.
const DOMAINES = [
  ['vinted', /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2})?$/i],        // vinted.fr, vinted.com, vinted.co.uk, vinted.net (images)
  ['leboncoin', /(^|\.)leboncoin\.fr$/i],
  ['beebs', /(^|\.)beebs\.app$/i],
  ['depop', /(^|\.)depop\.com$/i],
  ['ebay', /(^|\.)(ebay|ebayimg|ebaystatic|ebaydesc)\.[a-z]{2,3}(\.[a-z]{2})?$/i],
  ['opla', /(^|\.)opla\.co$/i],
];

/** La plateforme d'un hôte (pur : testé), ou null pour un tiers. */
export function plateformeDe(hote) {
  const h = String(hote ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '');
  if (!h) return null;
  return DOMAINES.find(([, re]) => re.test(h))?.[0] ?? null;
}

/** (04/11 soir) Les domaines des régies lus d'une chaîne « a,b » (pure) : minuscules, formes invalides écartées. */
export function lireDomaines(texte) {
  return [...new Set(String(texte ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/\.$/, ''))
    .filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)))];
}
/** (04/11 soir) L'hôte est-il une régie de la liste (domaine ou sous-domaine) ? (pure) */
export function estRegie(hote, domaines) {
  const h = String(hote ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '');
  return Boolean(h) && (domaines ?? []).some((d) => h === d || h.endsWith(`.${d}`));
}

/** La liste des plateformes permises lue d'une chaîne « a,b » (pure) : inconnues écartées. */
export function lirePermises(texte) {
  return new Set(String(texte ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((p) => PLATEFORMES_VERROU.includes(p)));
}

/** (05/11 soir, point 11) Le jour d'un instant, heure de Paris (pure) : « AAAA-MM-JJ ». */
export const jourParisRelais = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/**
 * (05/11 soir, point 11) Une panne de tunnel est-elle PASSAGÈRE ? (pure : testée) — `cause` = code d'erreur réseau, ou
 * le code HTTP rendu par le proxy amont. Un refus net (403, 407) ne se retente jamais.
 */
export function pannePassagere(cause) {
  if (typeof cause === 'number') return cause === 502 || cause === 503 || cause === 504;
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'EAI_AGAIN', 'FERME_AVANT_REPONSE', 'DELAI'].includes(String(cause));
}
export const ATTENTES_REESSAI_MS = Object.freeze([400, 1200]);

const amont = (u) => {
  if (!u) return null;
  const x = new URL(u);
  const auth = x.username ? `Basic ${Buffer.from(`${decodeURIComponent(x.username)}:${decodeURIComponent(x.password)}`).toString('base64')}` : null;
  return { hote: x.hostname, port: Number(x.port || 80), auth };
};

const ecouter = (serveur, port, hote) => new Promise((ok, ko) => {
  serveur.once('error', ko);
  serveur.listen(port, hote, () => { serveur.off('error', ko); ok(serveur.address().port); });
});

/**
 * Démarre le relais (les trois serveurs). Rend { ports, permises(), refus(), fermer() }.
 * Testé tel quel : tests/verrou.test.mjs le lance en local avec un faux proxy amont.
 */
export async function demarrerRelais({
  proxyAmont, proxyBeebs = null, proxySecours = null, permises = '', jetonControle = '', publicite = '',
  portRelais = 3128, portExtension = 3129, portControle = 3130, hoteControle = '0.0.0.0', dossierCrx = '/extension-crx',
  essais = 3, delaiTunnelMs = 10_000, maintenant = () => Date.now(), attentesReessaiMs = ATTENTES_REESSAI_MS,
} = {}) {
  const DEFAUT = amont(proxyAmont);
  const BEEBS = amont(proxyBeebs);
  const SECOURS = amont(proxySecours);
  if (!DEFAUT) throw new Error('PROXY_AMONT absent');
  const pour = (hote) => (BEEBS && /(^|\.)beebs\.app$/i.test(String(hote)) ? BEEBS : DEFAUT);
  let permis = lirePermises(permises);
  const refus = new Map(); // hôte → nombre de requêtes refusées
  const regies = lireDomaines(publicite);
  let publicites = 0;      // (04/11 soir) requêtes de régies refusées (jamais sorties)
  // (05/11 soir, point 11) Les coupures par jour (heure de Paris) et par plateforme, 7 jours gardés.
  const coupures = {};
  const compter = (hote, quoi) => {
    const jour = jourParisRelais(maintenant());
    const pf = plateformeDe(hote) ?? 'tiers';
    const j = (coupures[jour] ??= {});
    const c = (j[pf] ??= { echecs: 0, reprises: 0, secours: 0 });
    c[quoi]++;
    for (const k of Object.keys(coupures).sort().slice(0, -7)) delete coupures[k];
  };
  const regie = (hote) => { if (!regies.length || !estRegie(hote, regies)) return false; publicites++; return true; };
  /** Le verrou : true si l'hôte est une plateforme NON permise (la requête est alors refusée, rien ne sort). */
  const verrouille = (hote) => {
    const pf = plateformeDe(hote);
    if (!pf || permis.has(pf)) return false;
    const h = String(hote).toLowerCase();
    refus.set(h, (refus.get(h) ?? 0) + 1);
    return true;
  };

  const relais = http.createServer((req, res) => {
    // Requête http:// en clair (rare) : relayée telle quelle, avec les identifiants du proxy amont.
    let cible; try { cible = new URL(req.url); } catch { res.writeHead(400); res.end(); return; }
    if (verrouille(cible.hostname) || regie(cible.hostname)) { res.writeHead(403); res.end(); return; }
    const a = pour(cible.hostname);
    const entetes = { ...req.headers }; if (a.auth) entetes['proxy-authorization'] = a.auth;
    const up = http.request({ host: a.hote, port: a.port, method: req.method, path: req.url, headers: entetes }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on('error', () => { try { res.writeHead(502); res.end(); } catch { /* fermé */ } });
    req.pipe(up);
  });
  relais.on('connect', (req, client, head) => {
    const cible = String(req.url);
    const hote = cible.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    client.on('error', () => {});
    if (verrouille(hote) || regie(hote)) { client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); return; }
    // (05/11 soir, point 11) Le tunnel vers le proxy amont, retenté sur place quand la panne est passagère.
    const essayer = (a) => new Promise((fini) => {
      let regle = false;
      const up = net.connect(a.port, a.hote);
      const minuteur = setTimeout(() => { up.destroy(); finir({ ok: false, cause: 'DELAI' }); }, delaiTunnelMs);
      function finir(r) { if (regle) return; regle = true; clearTimeout(minuteur); fini(r); }
      up.once('connect', () => {
        up.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n${a.auth ? `Proxy-Authorization: ${a.auth}\r\n` : ''}\r\n`);
        let tampon = Buffer.alloc(0);
        const lire = (d) => {
          tampon = Buffer.concat([tampon, d]);
          const fin = tampon.indexOf('\r\n\r\n');
          if (fin < 0) return;
          up.off('data', lire);
          const statut = Number(/^HTTP\/1\.[01] (\d{3})/.exec(tampon.subarray(0, fin).toString())?.[1] ?? 0);
          if (statut !== 200) { up.destroy(); finir({ ok: false, cause: statut || 'FERME_AVANT_REPONSE' }); return; }
          finir({ ok: true, up, reste: tampon.subarray(fin + 4) });
        };
        up.on('data', lire);
        up.once('end', () => finir({ ok: false, cause: 'FERME_AVANT_REPONSE' }));
      });
      up.once('error', (e) => { up.destroy(); finir({ ok: false, cause: e?.code ?? 'ECONNRESET' }); });
    });
    (async () => {
      let r = null;
      for (let n = 0; n < Math.max(1, essais); n++) {
        if (n > 0) await new Promise((ok) => setTimeout(ok, attentesReessaiMs[Math.min(n - 1, attentesReessaiMs.length - 1)]));
        if (client.destroyed) return;
        r = await essayer(pour(hote));
        if (r.ok) { if (n > 0) compter(hote, 'reprises'); break; }
        if (!pannePassagere(r.cause)) break;
      }
      if (!r?.ok && SECOURS && pannePassagere(r?.cause) && !client.destroyed) {
        r = await essayer(SECOURS);
        if (r.ok) compter(hote, 'secours');
      }
      if (!r?.ok) { compter(hote, 'echecs'); client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return; }
      const up = r.up;
      if (client.destroyed) { up.destroy(); return; }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (r.reste?.length) client.write(r.reste);
      if (head?.length) up.write(head);
      up.on('error', () => client.destroy());
      client.on('error', () => up.destroy());
      up.pipe(client); client.pipe(up);
    })().catch(() => { try { client.destroy(); } catch { /* fermé */ } });
  });

  const FICHIERS = { '/update.xml': ['application/xml', `${dossierCrx}/update.xml`], '/fillsell-cloud.crx': ['application/x-chrome-extension', `${dossierCrx}/fillsell-cloud.crx`] };
  const extension = http.createServer(async (req, res) => {
    const f = FICHIERS[String(req.url).split('?')[0]];
    if (!f) { res.writeHead(404); res.end(); return; }
    try { const d = await readFile(f[1]); res.writeHead(200, { 'Content-Type': f[0], 'Content-Length': d.length }); res.end(d); }
    catch { res.writeHead(404); res.end(); }
  });

  const jeton = Buffer.from(String(jetonControle ?? ''));
  const jetonValide = (recu) => {
    const r = Buffer.from(String(recu ?? ''));
    return jeton.length >= 16 && r.length === jeton.length && timingSafeEqual(r, jeton);
  };
  const controle = http.createServer((req, res) => {
    const repondre = (code, corps) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    // Aucune réponse aux pré-vols CORS : une page ouverte dans Chrome ne peut pas joindre ce contrôle.
    if (!jetonValide(req.headers['x-jeton'])) return repondre(401, { erreur: 'jeton' });
    if (req.method === 'GET' && req.url === '/etat') return repondre(200, { permises: [...permis].sort(), refus: Object.fromEntries(refus), publicites, coupures });
    if (req.method === 'POST' && req.url === '/permis') {
      let corps = '';
      req.on('data', (d) => { corps += d; if (corps.length > 4096) req.destroy(); });
      req.on('end', () => {
        let liste;
        try { liste = JSON.parse(corps)?.plateformes; } catch { return repondre(400, { erreur: 'json' }); }
        if (!Array.isArray(liste) || liste.some((p) => !PLATEFORMES_VERROU.includes(String(p)))) return repondre(400, { erreur: 'plateformes' });
        permis = new Set(liste.map(String));
        return repondre(200, { permises: [...permis].sort() });
      });
      return undefined;
    }
    return repondre(404, { erreur: 'inconnu' });
  });

  const ports = {
    relais: await ecouter(relais, portRelais, '127.0.0.1'),
    extension: await ecouter(extension, portExtension, '127.0.0.1'),
    controle: await ecouter(controle, portControle, hoteControle),
  };
  return {
    ports,
    permises: () => [...permis].sort(),
    refus: () => Object.fromEntries(refus),
    publicites: () => publicites,
    coupures: () => JSON.parse(JSON.stringify(coupures)),
    fermer: () => Promise.all([relais, extension, controle].map((s) => new Promise((ok) => s.close(() => ok())))),
  };
}

// Lancé tel quel dans le conteneur (demarrer.sh : node /relais.mjs) ; importé par les tests sans rien démarrer.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = process.env;
  demarrerRelais({
    proxyAmont: e.PROXY_AMONT, proxyBeebs: e.PROXY_BEEBS || null, proxySecours: e.PROXY_SECOURS || null, permises: e.PLATEFORMES_PERMISES || '',
    essais: Number(e.RELAIS_ESSAIS || 3),
    jetonControle: e.JETON_CONTROLE || '', publicite: e.PUBLICITE || '',
    portRelais: Number(e.PORT_RELAIS || 3128), portExtension: Number(e.PORT_EXTENSION || 3129), portControle: Number(e.PORT_CONTROLE || 3130),
    // Le poste Windows (un relais par utilisateur, sur la même machine) l'écoute en local seulement.
    hoteControle: e.HOTE_CONTROLE || '0.0.0.0',
  }).catch((err) => { console.error(`relais : ${err.message}`); process.exit(1); });
}
