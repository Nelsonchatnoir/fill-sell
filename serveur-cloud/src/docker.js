// Un client minimal de l'API Docker Engine, par la socket unix (aucune dépendance).
// Sert à créer, démarrer, arrêter et supprimer les conteneurs steel-browser —
// un par compte — et rien d'autre.
import http from 'node:http';

export function creerDocker({ socket = '/var/run/docker.sock' } = {}) {
  function appel(methode, chemin, corps, { attendu = [200, 201, 204, 304] } = {}) {
    return new Promise((resoudre, rejeter) => {
      const donnees = corps == null ? null : Buffer.from(JSON.stringify(corps));
      const req = http.request({
        socketPath: socket, method: methode, path: `/v1.43${chemin}`,
        headers: { 'Content-Type': 'application/json', ...(donnees ? { 'Content-Length': donnees.length } : {}) },
        timeout: 120_000,
      }, (res) => {
        const morceaux = [];
        res.on('data', (m) => morceaux.push(m));
        res.on('end', () => {
          const texte = Buffer.concat(morceaux).toString('utf8');
          let json = null;
          try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
          if (!attendu.includes(res.statusCode)) {
            const e = new Error(`docker ${methode} ${chemin} → ${res.statusCode} ${json?.message ?? texte.slice(0, 200)}`);
            e.statut = res.statusCode;
            return rejeter(e);
          }
          resoudre(json);
        });
      });
      req.on('timeout', () => req.destroy(new Error(`docker ${methode} ${chemin} : délai dépassé`)));
      req.on('error', rejeter);
      if (donnees) req.write(donnees);
      req.end();
    });
  }

  const filtre = (f) => encodeURIComponent(JSON.stringify(f));

  return {
    /** Conteneurs FillSell Cloud (étiquette fillsell.cloud=1), arrêtés compris. */
    async lister() {
      return (await appel('GET', `/containers/json?all=true&filters=${filtre({ label: ['fillsell.cloud=1'] })}`)) ?? [];
    },
    async inspecter(nom) {
      try { return await appel('GET', `/containers/${encodeURIComponent(nom)}/json`); } catch (e) { if (e.statut === 404) return null; throw e; }
    },
    async creer(nom, spec) {
      return appel('POST', `/containers/create?name=${encodeURIComponent(nom)}`, spec);
    },
    async demarrer(nom) {
      return appel('POST', `/containers/${encodeURIComponent(nom)}/start`, null);
    },
    async arreter(nom, secondes = 20) {
      return appel('POST', `/containers/${encodeURIComponent(nom)}/stop?t=${secondes}`, null, { attendu: [204, 304, 404] });
    },
    async supprimer(nom) {
      return appel('DELETE', `/containers/${encodeURIComponent(nom)}?force=true&v=true`, null, { attendu: [204, 404] });
    },
    async reseau(nom) {
      try { return await appel('GET', `/networks/${encodeURIComponent(nom)}`); } catch (e) { if (e.statut === 404) return null; throw e; }
    },
    async creerReseau(nom, sousReseau) {
      return appel('POST', '/networks/create', {
        Name: nom, Driver: 'bridge', CheckDuplicate: true,
        IPAM: { Config: [{ Subnet: sousReseau }] },
        Options: { 'com.docker.network.bridge.name': 'br-fillsell' },
        Labels: { 'fillsell.cloud': '1' },
      });
    },
    async stats(nom) {
      try { return await appel('GET', `/containers/${encodeURIComponent(nom)}/stats?stream=false&one-shot=true`); } catch { return null; }
    },
  };
}
