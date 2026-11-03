// LE CONTRÔLE D'UNE IP (entrée dans le pool, sortie du repos) — depuis un
// navigateur NEUF, sans profil, sans compte, sans extension, par le proxy de
// l'IP : l'IP de sortie et le pays (ipinfo), les listes noires publiques (DNS).
// ⛔ (30/10, règle de Nico) AUCUNE plateforme n'est visitée : les pages d'accueil de Vinted, Leboncoin et eBay,
// ouvertes ici par un navigateur Linux neuf à chaque entrée d'IP, étaient des visites de robot (DataDome) sur l'IP
// même qu'on donnait ensuite à un compte. Le verdict d'une plateforme vient de la personne, dans « Me connecter ».
// Rend la forme lue par cloud_controle_manques :
//   { fait_le, ip_sortie, pays, listes_noires: [], plateformes: { visite: 'aucune' } }
// (cloud_controle_manques veut un objet non vide sans « bloque » : on y dit ce qui est vrai, rien n'a été visité.)
//
// (03/11, point 2 de Nico — SEULE exception à la règle du 30/10) LA VISITE DE CONTRÔLE D'UNE PLATEFORME : une IP dont
// une plateforme a refusé l'accès (cloud_ips.refus, « non prouvé ») reçoit UNE visite de la page d'accueil de cette
// plateforme, dans un navigateur de contrôle jetable sur cette IP, avec l'apparence du produit (langues fr-FR, fr,
// en-US, en ; fuseau de Paris ; français de Chromium) — jamais sur une IP tenue par un compte, au plus une par heure
// (entretien.js), aucun geste dans la page (rien n'est cliqué ni glissé), la page lue sans réseau (mondes isolés).
// passe / glissière (un appareil neuf en reçoit une) = le refus tombe ; « Accès temporairement restreint » = prouvé.
import { resolve4 } from 'node:dns/promises';
import { rm, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { connecterCdp } from './cdp.js';
import { ENV_ESSAI_0111, LANCEMENT_AVEC_ECRAN, corpsSession, exigerPareFeu, fichierLangueChromium, paquetLangueFr } from './navigateur.js';
import { EXPRESSION_EMPREINTE } from './empreinte.js';
import { EXPRESSION_ETAT_PAGE, TEXTE_ACCES_RESTREINT } from './plateformes.js';

// (03/11) La SEULE page qu'une visite de contrôle ouvre, par plateforme (une page d'accueil, aucun compte).
export const ACCUEILS_CONTROLE = Object.freeze({
  beebs: 'https://www.beebs.app/fr',
  leboncoin: 'https://www.leboncoin.fr/',
  vinted: 'https://www.vinted.fr/',
  depop: 'https://www.depop.com/',
});
const HOTES_CONTROLE = Object.freeze({ beebs: /(^|\.)beebs\.app$/i, leboncoin: /(^|\.)leboncoin\.fr$/i, vinted: /(^|\.)vinted\.fr$/i, depop: /(^|\.)depop\.com$/i });
export const VISITE_DUREE_MAX_MS = 30_000;   // on regarde au plus 30 s
export const VISITE_DUREE_MIN_MS = 10_000;   // « passe » seulement après 10 s sans anti-robot (il peut arriver après le chargement)

/**
 * (03/11) LE VERDICT D'UNE VISITE DE CONTRÔLE (pure : testée). `echantillons` : [{ t (ms depuis la navigation),
 * e: l'état de la page (EXPRESSION_ETAT_PAGE) ou null, texteCadres: le texte des cadres DataDome }].
 *   restreint : un cadre « bloqué » (t=bv) ou un refus ÉCRIT, dans la page ou dans le cadre DataDome ;
 *   glissiere : une glissière (passable — un appareil neuf en reçoit une : l'IP n'est pas refusée) ;
 *   passe     : la page de la plateforme chargée, sans anti-robot, depuis au moins VISITE_DUREE_MIN_MS ;
 *   indetermine : rien de tout ça (vérification de l'appareil restée, page muette) — le refus reste, revisité à 24 h.
 */
export function verdictVisite(echantillons, plateforme, { dureeMinMs = VISITE_DUREE_MIN_MS } = {}) {
  const liste = (Array.isArray(echantillons) ? echantillons : []).filter((x) => x && Number.isFinite(Number(x.t)));
  if (liste.some((x) => x.e?.bloque || x.e?.restreint || TEXTE_ACCES_RESTREINT.test(String(x.texteCadres ?? '')))) return 'restreint';
  if (liste.some((x) => x.e?.captcha)) return 'glissiere';
  const fin = liste.at(-1);
  const re = HOTES_CONTROLE[plateforme];
  if (fin?.e?.pret && !fin.e.interstitiel && re?.test(String(fin.e.hote ?? '')) && Number(fin.t) >= dureeMinMs) return 'passe';
  return 'indetermine';
}

const LISTES = [
  { zone: 'zen.spamhaus.org', liste: (a) => /^127\.0\.0\.(2|3|4|9|10|11)$/.test(a) },
  { zone: 'bl.spamcop.net', liste: (a) => a === '127.0.0.2' },
];
// Les SEULES adresses qu'un contrôle d'IP lit (30/10) : jamais une plateforme.
export const ADRESSES_CONTROLE = Object.freeze(['https://ipinfo.io/json']);
// Un MUR, c'est la page de blocage elle-même : le cadre captcha de DataDome
// (geo.captcha-delivery.com), « Access is temporarily restricted » (Beebs, 26/09),
// Imperva, Akamai. ⛔ JAMAIS le seul mot « datadome » : Vinted (static-assets
// …/datadome/tags.js) et Leboncoin (<script id="datadome">) chargent ce script sur
// TOUTES leurs pages ouvertes — le 05/10, l'IP de test 94.194.94.233 a été mise
// au rebut à son contrôle d'entrée alors que les deux accueils s'ouvraient
// (titres et menus lus par la même lecture).
export const MURS = /captcha-delivery|Access is temporarily restricted|Pardon Our Interruption|Access Denied/i;

/** Le verdict d'une page d'accueil lue par le contrôle : 'ok' | 'bloque' | 'indetermine' (rien lu). */
export function verdictPage(html) {
  if (!html) return 'indetermine';
  return MURS.test(html) ? 'bloque' : 'ok';
}

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

/** (30/10) Le relevé d'un contrôle d'IP, par la fonction de lecture du navigateur (testé : aucune plateforme lue). */
export async function releverControle(lire, ip, { listes = listesNoires, maintenant = () => new Date() } = {}) {
  const resultat = { fait_le: null, ip_sortie: null, pays: null, listes_noires: [], plateformes: { visite: 'aucune' } };
  const info = await lire(ADRESSES_CONTROLE[0]);
  const json = info.match(/\{[\s\S]*"ip"[\s\S]*\}/)?.[0]?.replace(/<[^>]+>/g, '');
  try { const p = JSON.parse(json); resultat.ip_sortie = p.ip ?? null; resultat.pays = p.country ?? null; } catch { /* illisible : manque nommé */ }
  resultat.listes_noires = await listes(ip);
  resultat.fait_le = maintenant().toISOString();
  return resultat;
}

export function creerControles({ config, docker, journal }) {
  /** Un navigateur NEUF (sans profil, sans compte, sans extension) par le proxy, le temps de `travail(lire, cdp, sessionId)`. */
  async function avecNavigateurNeuf({ ipId, proxyUrl, apparenceProduit = false }, travail) {
    const nom = `fs-ctl-${ipId}-${randomBytes(3).toString('hex')}`;
    const profil = `ctl-${ipId}-${randomBytes(4).toString('hex')}`;
    let cdp = null;
    await exigerPareFeu(config);
    // (03/11) La visite de contrôle d'une plateforme : l'apparence du produit (le français de Chromium, comme
    // specConteneur) — les langues et le fuseau viennent déjà de corpsSession.
    const binds = [`${config.dossierProfils}/${profil}:/app/api/user-data-dir`];
    if (apparenceProduit) {
      const existe = (f) => access(f).then(() => true, () => false);
      if (await existe(fichierLangueChromium(config))) binds.push(`${fichierLangueChromium(config)}:/etc/chromium.d/fillsell-langue:ro`);
      if (await existe(paquetLangueFr(config))) binds.push(`${paquetLangueFr(config)}:/usr/lib/chromium/locales/fr.pak:ro`);
    }
    try {
      // (01/11) Le même lancement que les navigateurs des comptes (l'essai du 01/11), sans extension.
      await docker.creer(nom, {
        Image: config.imageNavigateur, Entrypoint: ['/bin/sh', '-c'], Cmd: [LANCEMENT_AVEC_ECRAN],
        Env: [...ENV_ESSAI_0111],
        Labels: { 'fillsell.cloud': '1', 'fillsell.controle': String(ipId) },
        HostConfig: { Binds: binds, Memory: 1024 ** 3, ShmSize: 1024 ** 3, Init: true, NetworkMode: config.reseauDocker, AutoRemove: false },
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
        body: JSON.stringify((({ extensions, ...corps }) => corps)(corpsSession({ proxyUrl }))),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw new Error(`steel : session de contrôle → HTTP ${r.status}`);
      cdp = await connecterCdp(`ws://${adr}:3000/`);
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId);
      const lire = async (url, attenteMs = 6000) => {
        await cdp.send('Page.navigate', { url }, sessionId);
        await new Promise((res) => setTimeout(res, attenteMs));
        const v = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement ? document.documentElement.outerHTML.slice(0, 200000) : ""', returnByValue: true }, sessionId);
        return String(v?.result?.value ?? '');
      };
      return await travail(lire, cdp, sessionId);
    } finally {
      try { cdp?.fermer(); } catch { /* rien */ }
      await docker.supprimer(nom).catch(() => {});
      await rm(`${config.dossierProfils}/${profil}`, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function controler({ ipId, ip, proxyUrl }) {
    return avecNavigateurNeuf({ ipId, proxyUrl }, async (lire) => {
      const resultat = await releverControle(lire, ip);
      journal.info('controle_ip', { ip_id: ipId, pays: resultat.pays, sortie_conforme: resultat.ip_sortie === ip, plateformes: resultat.plateformes, listes: resultat.listes_noires.length });
      return resultat;
    });
  }

  /**
   * (30/10, lot D) L'ESSAI D'UNE PAGE DE CONNEXION en accès DIRECT (première et seule navigation : aucune recherche,
   * aucun détour) — Beebs, bloqué par DataDome le 26/09 (autre IP, navigateur Steel). Rend le titre, le verdict
   * (mur ou non), si un formulaire de connexion est là, et une capture PNG (base64). Rien n'est saisi, aucun compte.
   */
  async function essaiPageConnexion({ ipId, proxyUrl, url, attenteMs = 12_000 }) {
    return avecNavigateurNeuf({ ipId, proxyUrl }, async (lire, cdp, sessionId) => {
      const html = await lire(url, attenteMs);
      const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId))?.result?.value;
      const titre = String(await ev('document.title') ?? '');
      const urlFinale = String(await ev('location.href') ?? '');
      const formulaire = Boolean(await ev("!!document.querySelector('input[type=email], input[type=password], input[name*=mail i], button[data-testid*=login i], a[href*=google], a[href*=apple]')"));
      const { data: capture } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const extrait = String(await ev("document.body ? document.body.innerText.slice(0, 600) : ''") ?? '');
      const r = { fait_le: new Date().toISOString(), url, url_finale: urlFinale, titre, verdict: verdictPage(html), formulaire, extrait, capture };
      journal.info('essai_page_connexion', { ip_id: ipId, url, verdict: r.verdict, formulaire, titre: titre.slice(0, 80) });
      return r;
    });
  }
  /** (30/10, lot D) Ce que voit un site : en-têtes renvoyés par un écho public, puis l'empreinte JavaScript. */
  async function empreinte({ ipId, proxyUrl, options = {} }) {
    return avecNavigateurNeuf({ ipId, proxyUrl, options }, async (lire, cdp, sessionId) => {
      const entetes = await lire('https://httpbin.org/headers', 5000);
      const ev = await cdp.send('Runtime.evaluate', { expression: EXPRESSION_EMPREINTE, awaitPromise: true, returnByValue: true }, sessionId);
      let e = null; try { e = JSON.parse(ev?.result?.value ?? 'null'); } catch { e = null; }
      return { entetes: (entetes.match(/\{[\s\S]*\}/)?.[0] ?? '').replace(/<[^>]+>/g, '').slice(0, 2000), empreinte: e };
    });
  }
  /**
   * (03/11, point 2 de Nico) LA VISITE DE CONTRÔLE d'une plateforme sur une IP au refus « non prouvé » : UNE page
   * d'accueil (ACCUEILS_CONTROLE), regardée au plus 30 s, lue sans réseau (mondes isolés : la page ne voit rien), aucun
   * geste. Rend { fait_le, plateforme, url, verdict, echantillons } (lu par cloud_ip_refus_visite).
   */
  async function visiterPlateforme({ ipId, proxyUrl, plateforme }) {
    const url = ACCUEILS_CONTROLE[plateforme];
    if (!url) throw new Error(`visite de contrôle : plateforme inconnue (${plateforme})`);
    return avecNavigateurNeuf({ ipId, proxyUrl, apparenceProduit: true }, async (_lire, cdp, sessionId) => {
      const lireIsole = async (expression, frameId, sid = sessionId) => {
        const w = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: 'fillsell-controle' }, sid).catch(() => null);
        if (!w?.executionContextId) return null;
        const r = await cdp.send('Runtime.evaluate', { expression, contextId: w.executionContextId, returnByValue: true }, sid).catch(() => null);
        return r?.result?.value ?? null;
      };
      const texteCadres = async (arbre) => {
        let t = '';
        const lire = "String((document.body && document.body.innerText) || '').slice(0, 2000)";
        const ids = [];
        const parcourir = (n) => { if (!n) return; if (/captcha-delivery\.com/i.test(String(n.frame?.url ?? ''))) ids.push(n.frame.id); for (const c of n.childFrames ?? []) parcourir(c); };
        parcourir(arbre);
        for (const id of ids) t += ` ${await lireIsole(lire, id) ?? ''}`;
        if (!t.trim()) {
          // Cadre hors processus : sa propre cible.
          const cibles = await cdp.send('Target.getTargets').catch(() => null);
          for (const c of (cibles?.targetInfos ?? []).filter((x) => x.type === 'iframe' && /captcha-delivery\.com/i.test(String(x.url)))) {
            const sid = await cdp.send('Target.attachToTarget', { targetId: c.targetId, flatten: true }).then((x) => x.sessionId).catch(() => null);
            if (!sid) continue;
            const r = await cdp.send('Runtime.evaluate', { expression: lire, returnByValue: true }, sid).catch(() => null);
            t += ` ${r?.result?.value ?? ''}`;
            await cdp.send('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
          }
        }
        return t;
      };
      const debut = Date.now();
      await cdp.send('Page.navigate', { url }, sessionId);
      const echantillons = [];
      let verdict = 'indetermine';
      while (Date.now() - debut < VISITE_DUREE_MAX_MS) {
        await new Promise((r) => setTimeout(r, 2500));
        const { frameTree } = await cdp.send('Page.getFrameTree', {}, sessionId).catch(() => ({}));
        const e = frameTree?.frame?.id ? await lireIsole(EXPRESSION_ETAT_PAGE, frameTree.frame.id) : null;
        const ech = { t: Date.now() - debut, e, texteCadres: (e?.interstitiel || e?.captcha) ? await texteCadres(frameTree) : '' };
        echantillons.push(ech);
        verdict = verdictVisite(echantillons, plateforme);
        if (verdict === 'restreint' || verdict === 'glissiere') break;
        if (verdict === 'passe' && echantillons.length >= 2 && verdictVisite(echantillons.slice(0, -1), plateforme) === 'passe') break;
      }
      // (03/11, première visite : « indéterminé » sans trace de ce qui a été vu) La preuve garde l'état final de la page
      // (prête, vérification de l'appareil, glissière, blocage — des booléens, aucun texte) et le compte des échantillons.
      const fin = echantillons.at(-1)?.e ?? null;
      const r = { fait_le: new Date().toISOString(), plateforme, url, verdict, echantillons: echantillons.length,
        duree_ms: Date.now() - debut, hote_final: fin?.hote ?? null,
        etat_final: fin ? { pret: fin.pret === true, interstitiel: fin.interstitiel === true, captcha: fin.captcha === true,
          bloque: fin.bloque === true, restreint: fin.restreint === true } : null,
        echantillons_interstitiel: echantillons.filter((x) => x.e?.interstitiel).length,
        echantillons_prets: echantillons.filter((x) => x.e?.pret).length };
      journal.info('visite_controle', { ip_id: ipId, plateforme, verdict, echantillons: r.echantillons, duree_ms: r.duree_ms });
      return r;
    });
  }

  return { controler, essaiPageConnexion, empreinte, visiterPlateforme };
}
