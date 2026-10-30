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
//   · 0.0.0.0:3130 (PORT_CONTROLE) : le contrôle du verrou, pour l'orchestrateur seul — en-tête X-Jeton =
//     JETON_CONTROLE (aléatoire à chaque ouverture, jamais journalisé) ; POST /permis {"plateformes":[…]} remplace
//     l'ensemble, GET /etat rend { permises, refus }. Sans jeton configuré, le contrôle refuse tout.
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

/** La liste des plateformes permises lue d'une chaîne « a,b » (pure) : inconnues écartées. */
export function lirePermises(texte) {
  return new Set(String(texte ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((p) => PLATEFORMES_VERROU.includes(p)));
}

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
  proxyAmont, proxyBeebs = null, permises = '', jetonControle = '',
  portRelais = 3128, portExtension = 3129, portControle = 3130, hoteControle = '0.0.0.0', dossierCrx = '/extension-crx',
} = {}) {
  const DEFAUT = amont(proxyAmont);
  const BEEBS = amont(proxyBeebs);
  if (!DEFAUT) throw new Error('PROXY_AMONT absent');
  const pour = (hote) => (BEEBS && /(^|\.)beebs\.app$/i.test(String(hote)) ? BEEBS : DEFAUT);
  let permis = lirePermises(permises);
  const refus = new Map(); // hôte → nombre de requêtes refusées
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
    if (verrouille(cible.hostname)) { res.writeHead(403); res.end(); return; }
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
    if (verrouille(hote)) { client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); return; }
    const a = pour(hote);
    const up = net.connect(a.port, a.hote, () => {
      up.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n${a.auth ? `Proxy-Authorization: ${a.auth}\r\n` : ''}\r\n`);
      let tampon = Buffer.alloc(0);
      const lire = (d) => {
        tampon = Buffer.concat([tampon, d]);
        const fin = tampon.indexOf('\r\n\r\n');
        if (fin < 0) return;
        up.off('data', lire);
        if (!/^HTTP\/1\.[01] 200/.test(tampon.subarray(0, fin).toString())) { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); up.destroy(); return; }
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const reste = tampon.subarray(fin + 4);
        if (reste.length) client.write(reste);
        if (head?.length) up.write(head);
        up.pipe(client); client.pipe(up);
      };
      up.on('data', lire);
    });
    up.on('error', () => client.destroy());
    client.on('error', () => up.destroy());
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
    if (req.method === 'GET' && req.url === '/etat') return repondre(200, { permises: [...permis].sort(), refus: Object.fromEntries(refus) });
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
    fermer: () => Promise.all([relais, extension, controle].map((s) => new Promise((ok) => s.close(() => ok())))),
  };
}

// Lancé tel quel dans le conteneur (demarrer.sh : node /relais.mjs) ; importé par les tests sans rien démarrer.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = process.env;
  demarrerRelais({
    proxyAmont: e.PROXY_AMONT, proxyBeebs: e.PROXY_BEEBS || null, permises: e.PLATEFORMES_PERMISES || '',
    jetonControle: e.JETON_CONTROLE || '',
    portRelais: Number(e.PORT_RELAIS || 3128), portExtension: Number(e.PORT_EXTENSION || 3129), portControle: Number(e.PORT_CONTROLE || 3130),
    // Le poste Windows (un relais par utilisateur, sur la même machine) l'écoute en local seulement.
    hoteControle: e.HOTE_CONTROLE || '0.0.0.0',
  }).catch((err) => { console.error(`relais : ${err.message}`); process.exit(1); });
}
