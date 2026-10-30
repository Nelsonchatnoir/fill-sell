// (30/10, lot D) LE RELAIS DU NAVIGATEUR CHROME DU CLOUD — dans le conteneur, sans dépendance.
//   · 127.0.0.1:3128 : le proxy que Chrome utilise. Il relaie vers le proxy IPRoyal du compte (PROXY_AMONT), et
//     les seuls hôtes de Beebs vers PROXY_BEEBS s'il existe (IP résidentielle réservée à Beebs, décision de Nico) ;
//     les identifiants du proxy ne sont jamais donnés à Chrome ni journalisés.
//   · 127.0.0.1:3129 : l'extension FillSell Cloud signée (CRX) et son update.xml, pour l'installation par
//     stratégie d'entreprise (ExtensionInstallForcelist) — Chrome officiel ignore --load-extension.
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';

const amont = (u) => {
  if (!u) return null;
  const x = new URL(u);
  const auth = x.username ? `Basic ${Buffer.from(`${decodeURIComponent(x.username)}:${decodeURIComponent(x.password)}`).toString('base64')}` : null;
  return { hote: x.hostname, port: Number(x.port || 80), auth };
};
const DEFAUT = amont(process.env.PROXY_AMONT);
const BEEBS = amont(process.env.PROXY_BEEBS);
if (!DEFAUT) { console.error('relais : PROXY_AMONT absent'); process.exit(1); }
export const pour = (hote) => (BEEBS && /(^|\.)beebs\.app$/i.test(String(hote)) ? BEEBS : DEFAUT);

const relais = http.createServer((req, res) => {
  // Requête http:// en clair (rare) : relayée telle quelle, avec les identifiants du proxy amont.
  let cible; try { cible = new URL(req.url); } catch { res.writeHead(400); res.end(); return; }
  const a = pour(cible.hostname);
  const entetes = { ...req.headers }; if (a.auth) entetes['proxy-authorization'] = a.auth;
  const up = http.request({ host: a.hote, port: a.port, method: req.method, path: req.url, headers: entetes }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  up.on('error', () => { try { res.writeHead(502); res.end(); } catch { /* fermé */ } });
  req.pipe(up);
});
relais.on('connect', (req, client, head) => {
  const cible = String(req.url);
  const a = pour(cible.split(':')[0]);
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
relais.listen(3128, '127.0.0.1');

const FICHIERS = { '/update.xml': ['application/xml', '/extension-crx/update.xml'], '/fillsell-cloud.crx': ['application/x-chrome-extension', '/extension-crx/fillsell-cloud.crx'] };
http.createServer(async (req, res) => {
  const f = FICHIERS[String(req.url).split('?')[0]];
  if (!f) { res.writeHead(404); res.end(); return; }
  try { const d = await readFile(f[1]); res.writeHead(200, { 'Content-Type': f[0], 'Content-Length': d.length }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
}).listen(3129, '127.0.0.1');
