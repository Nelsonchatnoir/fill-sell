// L'ESSAI « Me connecter » Leboncoin + Beebs dans un navigateur STEEL hébergé (30/10, demande de Nico) — le parcours de
// essai-me-connecter-pc.mjs (PC Windows de Nico : glissière LBC, formulaire Beebs ; Shadow : deux glissières), dans le
// navigateur en ligne de Steel (steel.dev : Linux, région us-east seule, rendu logiciel attendu), qui avait passé
// Leboncoin le 26/09 (prototype fillsell-cloud-proto). Depuis le PC (Git Bash), clé Steel dans l'environnement
// STEEL_API_KEY (jamais en argument, jamais affichée) :
//   node serveur-cloud/outils/essai-me-connecter-steel.mjs <sortie> --envoyer-extension   envoie la copie Cloud
//        (build/extension-cloud) à Steel et note son identifiant Steel dans <sortie>/extension-steel.json
//   node serveur-cloud/outils/essai-me-connecter-steel.mjs <sortie> --verifier   session Steel, proxy MORT : extension,
//        carte graphique et empreinte d'une page about:blank ; aucune page de site ; session rendue aussitôt
//   node serveur-cloud/outils/essai-me-connecter-steel.mjs <sortie> --a-blanc    tout le parcours, proxy MORT (aucune
//        plateforme jointe) — pour éprouver l'outil sur Steel
//   node serveur-cloud/outils/essai-me-connecter-steel.mjs <sortie> < proxy      L'ESSAI (URL du proxy sur l'entrée
//        standard : jamais en argument, jamais affichée)
//
// Ce qui est celui de la production : la copie Cloud de l'extension, profil NEUF (aucun profil Steel chargé ni gardé),
// et « Me connecter » de src/connexion.js piloté par CDP (format téléphone, images, un accusé par image comme l'app).
// Une seule ouverture par plateforme. Le déguisement de Steel est COUPÉ (stealthConfig.skipFingerprintInjection, comme
// le 26/09) et aucun captcha n'est résolu (solveCaptcha: false).
// Ce qui diffère, et pourquoi :
//   · la machine : celle de Steel (c'est l'objet de l'essai) ;
//   · pas de relais local ni de verrou : Steel reçoit le proxy lui-même (proxyUrl), comme le 26/09 ; sans session
//     FillSell, la copie Cloud ne sonde aucune plateforme (7e49884) ;
//   · la session FillSell n'est pas posée et la base n'est pas lue (comme essai-me-connecter-pc.mjs).
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import * as journal from '../src/journal.js';
import { connecterCdp } from '../src/cdp.js';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION = path.resolve(ICI, '..', '..', 'build', 'extension-cloud');
const STEEL = 'https://api.steel.dev/v1';
const ID_EXTENSION = 'dnankhhfellobiobloopcjgkdioblpjd';
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const PROXY_MORT = 'http://essai:essai@127.0.0.1:9';
const SESSION_MS = 10 * 60_000; // l'offre Launch plafonne à 15 min ; rendue dès la fin de l'essai
const OBSERVATION_MS = 25_000;
const INSTANTS_MS = [5_000, 12_000, 25_000];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const sortie = process.argv[2];
const envoyerExtension = process.argv.includes('--envoyer-extension');
const verifier = process.argv.includes('--verifier');
const aBlanc = process.argv.includes('--a-blanc');
const seulement = process.argv.find((a) => a.startsWith('--seulement='))?.slice(12).split(',') ?? ['leboncoin', 'beebs'];
const cle = process.env.STEEL_API_KEY ?? '';
if (!sortie || !cle) { console.error('usage : STEEL_API_KEY=… node outils/essai-me-connecter-steel.mjs <sortie> [--envoyer-extension|--verifier|--a-blanc] < proxy'); process.exit(1); }
if (!existsSync(path.join(EXTENSION, 'manifest.json'))) { console.error('build/extension-cloud absent : node scripts/cloud/build-extension-cloud.mjs'); process.exit(1); }
await mkdir(sortie, { recursive: true });

/** Appel REST Steel ; l'erreur ne recopie jamais la clé. */
async function steel(methode, chemin, corps) {
  const r = await fetch(`${STEEL}${chemin}`, {
    method: methode,
    headers: { 'steel-api-key': cle, ...(corps && !(corps instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: corps instanceof FormData ? corps : corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`Steel ${methode} ${chemin} → HTTP ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : {};
}

if (envoyerExtension) {
  const zip = new JSZip();
  const parcourir = async (dossier, prefixe) => {
    for (const e of await readdir(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) await parcourir(complet, `${prefixe}${e.name}/`);
      else zip.file(`${prefixe}${e.name}`, await readFile(complet));
    }
  };
  await parcourir(EXTENSION, '');
  const version = JSON.parse(await readFile(path.join(EXTENSION, 'manifest.json'), 'utf8')).version;
  const donnees = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const formulaire = new FormData();
  formulaire.append('file', new Blob([donnees], { type: 'application/zip' }), `fillsell-cloud-${version}.zip`);
  const r = await steel('POST', '/extensions', formulaire);
  const id = r.id ?? r.extension?.id ?? null;
  await writeFile(path.join(sortie, 'extension-steel.json'), `${JSON.stringify({ id, version, envoyee_le: new Date().toISOString() }, null, 2)}\n`);
  console.log(JSON.stringify({ extension_steel: id, version }));
  process.exit(id ? 0 : 1);
}

const lireEntree = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });
const proxyUrl = verifier || aBlanc ? PROXY_MORT : await lireEntree();
if (!verifier && !aBlanc && !/^http:\/\/[^@\s]+@\d+\.\d+\.\d+\.\d+:\d+$/.test(proxyUrl)) { console.error('proxy illisible sur l\'entrée standard'); process.exit(1); }
const fichierExtension = path.join(sortie, 'extension-steel.json');
const extensionSteel = existsSync(fichierExtension) ? JSON.parse(await readFile(fichierExtension, 'utf8')).id : null;
if (!extensionSteel) { console.error('copie Cloud pas encore envoyée à Steel : --envoyer-extension d\'abord'); process.exit(1); }
const fichierBilan = path.join(sortie, verifier ? 'bilan-verification.json' : aBlanc ? 'bilan-a-blanc.json' : 'bilan.json');
if (!verifier && !aBlanc && existsSync(fichierBilan)) { console.error(`essai déjà fait (${fichierBilan}) : un essai = une fois`); process.exit(1); }

const bilan = { mode: verifier ? 'verification' : aBlanc ? 'a_blanc' : 'essai', debut: new Date().toISOString(), plateformes: {} };
let session = null;
let cdp = null;

const EXPRESSION_VERIFICATION = `(() => {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return JSON.stringify({ webgl: gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
    vendeur: gl && ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null, ecran: [screen.width, screen.height],
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, langues: navigator.languages, pdf: navigator.pdfViewerEnabled,
    plugins: navigator.plugins.length, coeurs: navigator.hardwareConcurrency, memoire: navigator.deviceMemory, webdriver: navigator.webdriver,
    plateforme: navigator.platform, ua: navigator.userAgent });
})()`;

try {
  // 1. La session Steel : profil neuf (aucun profileId, rien gardé), déguisement coupé, aucun résolveur.
  session = await steel('POST', '/sessions', {
    timeout: SESSION_MS,
    proxyUrl,
    solveCaptcha: false,
    stealthConfig: { skipFingerprintInjection: true },
    extensionIds: [extensionSteel],
  });
  bilan.session = { id: session.id, region: session.region ?? null, creee_le: session.createdAt ?? null };
  cdp = await connecterCdp(`wss://connect.steel.dev?apiKey=${encodeURIComponent(cle)}&sessionId=${encodeURIComponent(session.id)}`, { delaiAppelMs: 90_000 });
  const version = await cdp.send('Browser.getVersion').catch(() => null);
  bilan.navigateur = version?.product ?? null;
  // 2. L'extension Cloud doit être là AVANT toute page (sinon : arrêt, aucune plateforme ouverte).
  let ext = null;
  for (let i = 0; i < 20 && !ext; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    ext = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${ID_EXTENSION}/`));
    if (!ext) await pause(1000);
  }
  bilan.extension = ext ? ext.url : null;
  if (!ext) throw new Error('extension Cloud absente : aucune plateforme ouverte');
  // 3. La carte graphique vue par le navigateur (aucune page, aucun script).
  const info = await cdp.send('SystemInfo.getInfo').catch(() => null);
  const g = info?.gpu;
  bilan.carte_graphique = g ? { appareils: (g.devices ?? []).map((d) => `${d.vendorString} ${d.deviceString} ${d.driverVersion}`.trim()),
    rendu: g.auxAttributes?.glRenderer ?? null, webgl: g.featureStatus?.webgl ?? null, gpu_compositing: g.featureStatus?.gpu_compositing ?? null } : null;
  if (verifier) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const v = await cdp.send('Runtime.evaluate', { expression: EXPRESSION_VERIFICATION, returnByValue: true }, sessionId);
    bilan.page = JSON.parse(v?.result?.value ?? 'null');
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
  console.log(JSON.stringify({ session: bilan.session, navigateur: bilan.navigateur, extension: bilan.extension, carte_graphique: bilan.carte_graphique, page: bilan.page ?? null }));
  if (!verifier) {
    const h = { cdp, ip: 'steel', conteneur: 'steel', profilId: 'steel', ouvertLe: Date.now(), moteur: 'steel', navigateur: bilan.navigateur };
    const navigateurs = { ouvrir: async () => h, ouvert: () => h, ouverts: () => [NICO], fermer: async () => {} };
    const postes = { ouvrir: async () => h, extensionId: async () => ID_EXTENSION };
    const coffre = { sauvegarderCookies: async () => ({ refuse: 'essai' }) };
    const base = {
      rpc: async (nom) => ({ data: nom === 'cloud_comptes_a_servir' ? [{ user_id: NICO, etat_cloud: 'actif' }] : null, error: null }),
      from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }), update: () => ({ eq: async () => ({}) }) }),
    };
    const config = { comptesAutorises: [NICO], cleTickets: randomBytes(32).toString('base64'), supabaseUrl: '', cleAnon: '' };
    const connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal });

    /** L'app, telle que clientConnexion.js : ouvrir (ticket), un accusé par image, fermer. */
    const essayer = async (plateforme) => {
      const etats = [];
      let image = null, images = 0, surMessage = null;
      const ws = {
        readyState: 1, bufferedAmount: 0,
        send(donnee, o) {
          if (o?.binary) {
            images++; image = Buffer.from(donnee).subarray(4);
            setImmediate(() => surMessage?.(Buffer.from(JSON.stringify({ t: 'ack' })), false));
          } else etats.push({ le: new Date().toISOString(), ...JSON.parse(donnee) });
        },
        close() { ws.readyState = 3; },
        on(ev, f) { if (ev === 'message') surMessage = f; },
      };
      connexions.brancher(ws, 'essai-steel');
      const t0 = Date.now();
      const ticket = signerTicket({ user: NICO, minutes: 10 }, config.cleTickets);
      await surMessage(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket, plateforme, largeur: 390, hauteur: 844, dpr: 3, lang: 'fr' })), false);
      const t1 = Date.now();
      const releves = [];
      for (const instant of INSTANTS_MS) {
        await pause(Math.max(0, t1 + instant - Date.now()));
        const { targetInfos: cibles } = await cdp.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
        const fichier = `${plateforme}-${instant / 1000}s.jpg`;
        if (image) await writeFile(path.join(sortie, `${bilan.mode}-${fichier}`), image);
        releves.push({ a_s: instant / 1000, images, fichier: image ? `${bilan.mode}-${fichier}` : null,
          cibles: cibles.filter((c) => c.type === 'page' || c.type === 'iframe').map((c) => ({ type: c.type, url: String(c.url).slice(0, 160), titre: String(c.title).slice(0, 120) })) });
      }
      await surMessage(Buffer.from(JSON.stringify({ t: 'fermer' })), false);
      bilan.plateformes[plateforme] = { ouverture_s: Math.round((t1 - t0) / 100) / 10, observation_s: OBSERVATION_MS / 1000, etats, releves };
    };
    if (seulement.includes('leboncoin')) await essayer('leboncoin');
    if (seulement.includes('leboncoin') && seulement.includes('beebs')) await pause(5000);
    if (seulement.includes('beebs')) await essayer('beebs');
  }
} catch (e) {
  bilan.erreur = String(e?.message ?? e).replaceAll(cle, '***').slice(0, 300);
} finally {
  try { cdp?.fermer(); } catch { /* déjà parti */ }
  // La session est TOUJOURS rendue (facturée à la seconde) ; puis son compteur relu, preuve du coût.
  if (session?.id) {
    await steel('POST', `/sessions/${encodeURIComponent(session.id)}/release`, {}).catch((e) => { bilan.rendue = `ÉCHEC ${e.message.slice(0, 120)}`; });
    await pause(3000);
    const s = await steel('GET', `/sessions/${encodeURIComponent(session.id)}`).catch(() => null);
    bilan.compteur = s ? { statut: s.status, duree_s: Math.round((s.duration ?? 0) / 1000), credits: s.creditsUsed ?? null, octets_proxy: s.proxyBytesUsed ?? null } : null;
  }
  bilan.fin = new Date().toISOString();
  await writeFile(fichierBilan, `${JSON.stringify(bilan, null, 2)}\n`);
  console.log(JSON.stringify({ fin: bilan.fin, compteur: bilan.compteur ?? null, erreur: bilan.erreur ?? null }));
  process.exit(0);
}
