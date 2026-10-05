// Un client Chrome DevTools Protocol minimal (protocole « à plat » : une seule
// connexion pour le navigateur, une sessionId par cible). Assez pour les
// cookies, le stockage de l'extension, les fenêtres, le flux d'images et les
// gestes de l'écran « Me connecter » — rien de plus, aucune magie.
import WebSocket from 'ws';

export function connecterCdp(url, { delaiAppelMs = 60_000, delaiOuvertureMs = 30_000 } = {}) {
  return new Promise((resoudre, rejeter) => {
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    const minuterie = setTimeout(() => { ws.terminate(); rejeter(new Error('CDP : ouverture trop longue')); }, delaiOuvertureMs);
    let prochain = 0;
    const attente = new Map();
    const ecouteurs = new Set();
    let ferme = false;

    ws.on('message', (brut) => {
      let m;
      try { m = JSON.parse(brut.toString('utf8')); } catch { return; }
      if (m.id != null) {
        const a = attente.get(m.id);
        if (!a) return;
        attente.delete(m.id);
        clearTimeout(a.t);
        if (m.error) a.rejeter(Object.assign(new Error(`CDP ${a.methode} : ${m.error.message}`), { cdp: m.error }));
        else a.resoudre(m.result ?? {});
        return;
      }
      for (const f of ecouteurs) { try { f(m); } catch { /* un écouteur ne casse jamais les autres */ } }
    });
    ws.on('close', () => {
      ferme = true;
      for (const [, a] of attente) { clearTimeout(a.t); a.rejeter(new Error('CDP : connexion fermée')); }
      attente.clear();
      for (const f of ecouteurs) { try { f({ method: '__ferme__' }); } catch { /* rien */ } }
    });
    ws.on('error', (e) => { if (!ferme) { clearTimeout(minuterie); rejeter(e); } });
    ws.on('open', () => {
      clearTimeout(minuterie);
      resoudre({
        /** Appelle une méthode, sur le navigateur ou (sessionId) sur une cible. */
        send(methode, params = {}, sessionId = undefined) {
          if (ferme) return Promise.reject(new Error('CDP : connexion fermée'));
          const id = ++prochain;
          return new Promise((ok, ko) => {
            const t = setTimeout(() => { attente.delete(id); ko(new Error(`CDP ${methode} : délai dépassé`)); }, delaiAppelMs);
            attente.set(id, { resoudre: ok, rejeter: ko, t, methode });
            ws.send(JSON.stringify(sessionId ? { id, method: methode, params, sessionId } : { id, method: methode, params }));
          });
        },
        /** Écoute tous les évènements ; rend la fonction qui arrête d'écouter. */
        on(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
        fermer() { try { ws.close(); } catch { /* déjà fermé */ } },
        get ferme() { return ferme; },
      });
    });
  });
}

/** Attache une cible (onglet, service worker) et rend sa sessionId. */
export async function attacher(cdp, targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  return sessionId;
}
