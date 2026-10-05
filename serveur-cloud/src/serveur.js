// Le serveur HTTP de l'orchestrateur, derrière Caddy (TLS) :
//   GET  /sante                → { ok, serveur, navigateurs } (rien de personnel)
//   GET  /connexion?ticket=…   → la page autonome « Me connecter » (test)
//   GET  /connexion/client.js  → le client partagé avec l'app
//   WS   /connexion/ws         → l'écran « Me connecter » (app ou page autonome)
// Tout le reste : 404. Aucune page ne se met en cache.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const ENTETES = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export function creerServeur({ config, connexions, navigateurs, journal, dossierPublic }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  const originesPermises = new Set([...config.origines, `https://${config.domaine}`]);

  const serveur = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && u.pathname === '/sante') {
        res.writeHead(200, { ...ENTETES, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, serveur: config.serveurNom, navigateurs: navigateurs.ouverts().length, le: new Date().toISOString() }));
      }
      if (req.method === 'GET' && u.pathname === '/connexion') {
        const html = await readFile(`${dossierPublic}/connexion.html`);
        res.writeHead(200, { ...ENTETES, 'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src wss://${config.domaine}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` });
        return res.end(html);
      }
      if (req.method === 'GET' && u.pathname === '/connexion/client.js') {
        const js = await readFile(`${dossierPublic}/clientConnexion.js`);
        res.writeHead(200, { ...ENTETES, 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(js);
      }
      res.writeHead(404, ENTETES);
      res.end();
    } catch (e) {
      journal.erreur('http_echec', { chemin: u.pathname, erreur: e.message });
      res.writeHead(500, ENTETES);
      res.end();
    }
  });

  serveur.on('upgrade', (req, socket, tete) => {
    const u = new URL(req.url, 'http://x');
    const origine = req.headers.origin ?? '';
    if (u.pathname !== '/connexion/ws' || (origine && !originesPermises.has(origine))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, tete, (ws) => connexions.brancher(ws, origine));
  });

  return {
    ecouter: () => new Promise((ok) => serveur.listen(config.port, '127.0.0.1', ok)),
    fermer: () => new Promise((ok) => { wss.close(); serveur.close(() => ok()); }),
  };
}
