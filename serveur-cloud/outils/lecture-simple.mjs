// (02/11 soir, demande de Nico : « une lecture simple de Vinted, Leboncoin, Beebs et Depop, sans publier ») UNE LECTURE
// SIMPLE D'UNE PLATEFORME CONNECTÉE, dans le navigateur Cloud ouvert du compte : un onglet de fond sur la page d'accueil
// du site, puis la lecture du compte de « Me connecter » (expressionLectureCompte : l'état HTTP, la présence d'un
// identifiant — ni jeton ni courriel ne sortent). Rien n'est saisi, rien n'est publié.
// Une vérification anti-robot (cadre DataDome) n'est JAMAIS forcée : l'onglet reste ouvert le temps que la règle du Cloud
// (verifications.js, relevé de chaque minute) la voie, ferme la plateforme et la montre dans l'app (« Résoudre »).
//   docker compose exec -T orchestrateur node outils/lecture-simple.mjs <user_id> <plateforme>
import { connecterCdp } from '../src/cdp.js';
import { creerDocker } from '../src/docker.js';
import { nomConteneur } from '../src/navigateur.js';
import { DEFINITIONS, expressionLectureCompte } from '../src/plateformes.js';

const [user, plateforme] = process.argv.slice(2);
const def = DEFINITIONS[plateforme];
const expr = expressionLectureCompte(plateforme);
if (!/^[0-9a-f-]{36}$/.test(user ?? '') || !def?.hoteSite || !expr) { console.error('usage : lecture-simple.mjs <user_id> <vinted|leboncoin|beebs|depop>'); process.exit(1); }
const docker = creerDocker({ socket: process.env.SOCKET_DOCKER || '/var/run/docker.sock' });
const ins = await docker.inspecter(nomConteneur(user));
const ip = ins?.NetworkSettings?.Networks?.[process.env.RESEAU_DOCKER || 'fillsell-cloud']?.IPAddress;
if (!ins?.State?.Running || !ip) { console.log(JSON.stringify({ ok: false, raison: 'navigateur_ferme' })); process.exit(1); }

const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 30_000 });
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const bilan = { le: new Date().toISOString(), plateforme };
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
let ouvert = true;
cdp.on((m) => { if (m.method === 'Target.targetDestroyed' && m.params?.targetId === targetId) ouvert = false; });
await cdp.send('Target.setDiscoverTargets', { discover: true });
try {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url: `https://${def.hoteSite}/` }, sessionId);
  const cadresDataDome = async () => (await cdp.send('Target.getTargets')).targetInfos
    .filter((t) => /captcha-delivery\.com/.test(t.url)).map((t) => new URL(t.url).pathname);
  for (let i = 0; i < 30 && ouvert; i++) {
    await pause(1000);
    const etat = await cdp.send('Runtime.evaluate', { expression: '({ pret: document.readyState, adresse: location.href.split("?")[0], dd: [...document.querySelectorAll("iframe")].some((f) => /captcha-delivery/.test(f.src)) })', returnByValue: true }, sessionId).catch(() => null);
    const v = etat?.result?.value;
    if (v?.dd || (await cadresDataDome()).length) { bilan.verification = (await cadresDataDome())[0] ?? 'cadre DataDome'; break; }
    if (v?.pret === 'complete') { bilan.page = v.adresse; break; }
  }
  if (bilan.verification) {
    // Jamais forcée : la règle du Cloud la voit (relevé d'une minute), ferme la plateforme, l'app propose « Résoudre ».
    for (let i = 0; i < 90 && ouvert; i++) await pause(1000);
    bilan.laissee_a_la_regle = !ouvert;
  } else if (bilan.page) {
    await pause(2500);
    bilan.compte = (await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId))?.result?.value ?? null;
  } else bilan.page = 'muette';
} finally {
  if (ouvert) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  cdp.fermer();
}
console.log(JSON.stringify(bilan));
process.exit(0);
