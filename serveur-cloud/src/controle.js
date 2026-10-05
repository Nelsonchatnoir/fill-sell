// LE CONTRÔLE D'UNE IP (entrée dans le pool, sortie du repos) — depuis un
// navigateur NEUF, sans profil, sans compte, sans extension, par le proxy de
// l'IP : l'IP de sortie et le pays (ipinfo), les listes noires publiques (DNS),
// et les pages d'accueil de Vinted, Leboncoin et eBay (ouvertes ou bloquées).
// Rend la forme lue par cloud_controle_manques :
//   { fait_le, ip_sortie, pays, listes_noires: [], plateformes: { vinted, leboncoin, ebay } }
import { resolve4 } from 'node:dns/promises';
import { rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { connecterCdp } from './cdp.js';

const LISTES = [
  { zone: 'zen.spamhaus.org', liste: (a) => /^127\.0\.0\.(2|3|4|9|10|11)$/.test(a) },
  { zone: 'bl.spamcop.net', liste: (a) => a === '127.0.0.2' },
];
const PAGES = { vinted: 'https://www.vinted.fr/', leboncoin: 'https://www.leboncoin.fr/', ebay: 'https://www.ebay.fr/' };
const MURS = /captcha-delivery|Access is temporarily restricted|datadome|Pardon Our Interruption|Access Denied/i;

/** Listes noires publiques : rend celles qui listent l'IP ([] = propre ; une réponse 127.255.x = indéterminé, jamais « listée »). */
export async function listesNoires(ip) {
  const inverse = String(ip).split('.').reverse().join('.');
  const out = [];
  for (const l of LISTES) {
    try {
      const reps = await resolve4(`${inverse}.${l.zone}`);
      if (reps.some(l.liste)) out.push(l.zone);
    } catch { /* NXDOMAIN = pas listée */ }
  }
  return out;
}

export function creerControles({ config, docker, journal }) {
  async function controler({ ipId, ip, proxyUrl }) {
    const nom = `fs-ctl-${ipId}-${randomBytes(3).toString('hex')}`;
    const profil = `ctl-${ipId}-${randomBytes(4).toString('hex')}`;
    const resultat = { fait_le: null, ip_sortie: null, pays: null, listes_noires: [], plateformes: {} };
    let cdp = null;
    try {
      await docker.creer(nom, {
        Image: config.imageNavigateur, Cmd: ['--no-nginx'],
        Env: ['CHROME_HEADLESS=false', 'SKIP_FINGERPRINT_INJECTION=true', 'DEFAULT_TIMEZONE=Europe/Paris',
          'CHROME_USER_DATA_DIR=/tmp/navigateur-au-repos', 'CHROME_ARGS=--lang=fr-FR --accept-lang=fr-FR,fr', 'HOST=0.0.0.0', 'PORT=3000'],
        Labels: { 'fillsell.cloud': '1', 'fillsell.controle': String(ipId) },
        HostConfig: { Binds: [`${config.dossierProfils}/${profil}:/app/api/user-data-dir`], Memory: 1024 ** 3, NetworkMode: config.reseauDocker, AutoRemove: false },
      });
      await docker.demarrer(nom);
      const ins = await docker.inspecter(nom);
      const adr = ins?.NetworkSettings?.Networks?.[config.reseauDocker]?.IPAddress;
      for (let i = 0; i < 40; i++) {
        try { if ((await fetch(`http://${adr}:3000/v1/health`, { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* attend */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
      const r = await fetch(`http://${adr}:3000/v1/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyUrl, persist: true, skipFingerprintInjection: true, timezone: 'Europe/Paris', headless: false }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw new Error(`steel : session de contrôle → HTTP ${r.status}`);
      cdp = await connecterCdp(`ws://${adr}:3000/`);
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId);
      const lire = async (url) => {
        await cdp.send('Page.navigate', { url }, sessionId);
        await new Promise((res) => setTimeout(res, 6000));
        const v = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement ? document.documentElement.outerHTML.slice(0, 200000) : ""', returnByValue: true }, sessionId);
        return String(v?.result?.value ?? '');
      };
      const info = await lire('https://ipinfo.io/json');
      const json = info.match(/\{[\s\S]*"ip"[\s\S]*\}/)?.[0]?.replace(/<[^>]+>/g, '');
      try { const p = JSON.parse(json); resultat.ip_sortie = p.ip ?? null; resultat.pays = p.country ?? null; } catch { /* illisible : manque nommé */ }
      for (const [pf, url] of Object.entries(PAGES)) {
        const html = await lire(url).catch(() => '');
        resultat.plateformes[pf] = !html ? 'indetermine' : MURS.test(html) ? 'bloque' : 'ok';
      }
      resultat.listes_noires = await listesNoires(ip);
      resultat.fait_le = new Date().toISOString();
      journal.info('controle_ip', { ip_id: ipId, pays: resultat.pays, sortie_conforme: resultat.ip_sortie === ip, plateformes: resultat.plateformes, listes: resultat.listes_noires.length });
      return resultat;
    } finally {
      try { cdp?.fermer(); } catch { /* rien */ }
      await docker.supprimer(nom).catch(() => {});
      await rm(`${config.dossierProfils}/${profil}`, { recursive: true, force: true }).catch(() => {});
    }
  }
  return { controler };
}
