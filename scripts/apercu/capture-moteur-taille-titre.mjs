// Banc « la taille du titre » (19/10) — le MOTEUR RÉEL de publication, de bout en bout, sans session.
//   node scripts/apercu/capture-moteur-taille-titre.mjs
// Pour chaque cas (moteur-taille-titre.jsx) : cocher Beebs, rédiger, vérifier, puis l'envoi tel que le
// lot le fait (m.publier) — et lire ce qui serait parti : la question « Taille » (posée ou non, journal
// champ_requis_bloquant compris) et la taille du job envoyé à spend_coins_and_publish.
// Réseau hermétique : le moteur parle au Supabase factice ; les modules qui lisent le vrai client sont
// servis ici (lecture = rien) ; toute autre requête est coupée et comptée.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5207;
const BASE = `http://localhost:${PORT}/scripts/apercu/moteur-taille-titre.html`;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
let viteMort = null;
vite.on('exit', (code) => { viteMort = code ?? 'signal'; });
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (viteMort !== null) throw new Error(`vite s’est arrêté au démarrage (code ${viteMort})`);
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite n’a pas répondu dans le délai');
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${detail ? `   ← ${detail}` : ''}`); if (!cond) echecs.push(quoi); };
const filtre = (erreurs) => erreurs.filter((x) => !/favicon|fonts\.g|net::ERR|ERR_INTERNET|Download the React DevTools|Failed to load resource/.test(x));

// Attendre une condition sur le moteur, lue dans la page.
async function attendre(page, fn, arg, quoi, limiteMs = 30000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  throw new Error(`délai dépassé : ${quoi}`);
}
const lireMoteur = (page) => page.evaluate(() => {
  const m = window.__moteur;
  const st = m?.genericRequiredStatus?.beebs ?? [];
  const taille = st.find((r) => r.key === 'Taille') ?? null;
  return {
    step: m?.step, selected: [...(m?.selected ?? [])], publiables: [...(m?.plateformesPubliables ?? [])],
    taille: taille ? { state: taille.state, value: taille.value ?? null, deduite: taille.deduite ?? null, blocking: taille.blocking ?? null } : null,
    questions: m?.questionsParPlateforme?.beebs ?? null, nbQuestions: m?.nbQuestions ?? null,
    ctaDisabled: m?.ctaDisabled, motifs: m?.motifsCtaGris ?? [], publishError: m?.publishError ?? null,
    catalogue: window.__catalogueLu.slice(-3),
  };
});

const ATTENDU = {
  deadroz: { question: false, job: '40', saisie: 'W30' },
  // Copie vide : la taille dite par le texte est POSÉE sur la copie Beebs (trace option_du_texte).
  vide: { question: false, job: '46', saisie: null, trace: true },
  conflit: { question: true },
  ornella: { question: false, job: '24 mois (86-94 cm)', saisie: '24M' },
  // (19/10 soir) La taille unique : l'option exacte de la grille, ou la question.
  unique_vide: { question: false, job: 'Taille unique', saisie: null, trace: true },
  unique_tu: { question: false, job: 'Taille unique', saisie: 'T.U' },
  unique_sans_option: { question: true },
  unique_doute: { question: true },
};

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const [cas, att] of Object.entries(ATTENDU)) {
    console.log(`\n── ${cas}`);
    const page = await navigateur.newPage({ viewport: { width: 400, height: 900 } });
    const erreurs = [];
    const sorties = [];
    await page.route((url) => url.hostname !== 'localhost', (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
      if (u.hostname.endsWith('.supabase.co')) {
        const json = (status, corps) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
        if (u.pathname.startsWith('/functions/')) return json(500, { error: 'banc : fonction non appelée ici' });
        if (u.pathname.startsWith('/auth/')) return json(401, { message: 'banc : pas de session' });
        if (u.pathname.startsWith('/rest/v1/rpc/')) return json(200, u.pathname.endsWith('/plateformes_verite') ? [] : null);
        if (u.pathname.startsWith('/rest/v1/')) {
          if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 204, body: '' });
          if (String(req.headers().accept ?? '').includes('vnd.pgrst.object')) return json(406, { code: 'PGRST116', message: 'banc : aucune ligne' });
          return json(200, []);
        }
        return json(404, { message: 'banc : route inconnue' });
      }
      if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.abort();
      sorties.push(u.href.slice(0, 120));
      return route.abort();
    });
    page.on('pageerror', (x) => erreurs.push(String(x?.stack ?? x)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto(`${BASE}?cas=${cas}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await attendre(page, () => window.__moteur && !window.__moteur.initializing && window.__moteur.publishedStateLoaded, null, 'moteur prêt');
    // Le geste du lot : Beebs seule, photos telles quelles, puis « Rédiger ».
    await page.evaluate(() => { window.__moteur.setSelected(new Set(['beebs'])); window.__moteur.setPhotoOption?.('original'); });
    await attendre(page, () => window.__moteur.selected.size === 1 && window.__moteur.selected.has('beebs'), null, 'Beebs cochée');
    await page.evaluate(() => window.__moteur.suivant());
    await attendre(page, () => window.__moteur.step === 2 && window.__moteur.platformListings, null, 'rédaction reçue');
    await page.evaluate(() => window.__moteur.suivant());
    await attendre(page, () => window.__moteur.step === 3, null, 'étape « Confirmer »');
    // Au repos (micro-appels, catalogue lu), comme le pilote du lot avant de lire.
    await attendre(page, () => window.__moteur.preparationAuRepos && (window.__moteur.genericRequiredStatus?.beebs ?? []).length > 0, null, 'au repos, catalogue lu', 40000)
      .catch(async (e) => {
        console.log('   état au délai :', JSON.stringify(await page.evaluate(() => ({ repos: window.__moteur.preparationAuRepos, gr: window.__moteur.genericRequiredStatus,
          cat: window.__catalogueLu, appels: window.__appels.slice(-25), rayons: window.__moteur.rayonsParPf, pub: [...window.__moteur.plateformesPubliables] }))).slice(0, 2500));
        console.log('   erreurs :', filtre(erreurs).join(' | ').slice(0, 800));
        throw e;
      });
    await page.waitForTimeout(1500);
    const m = await lireMoteur(page);
    console.log('   moteur :', JSON.stringify(m));
    const journalTaille = await page.evaluate(() => window.__journal.filter((l) => l?.feature === 'champ_requis_bloquant'
      && (l.metadata?.champs ?? []).includes('Taille') && l.metadata?.issue === 'affiche'));
    verifier(m.taille != null, `${cas} : la ligne « Taille » de Beebs est jugée (grille du rayon lue : ${m.catalogue.join(' ; ')})`);
    if (att.question) {
      verifier(m.taille?.state !== 'ok', `${cas} : la question « Taille » RESTE (doute)`, JSON.stringify(m.taille));
      verifier(m.publiables.includes('beebs') && (m.ctaDisabled || (m.motifs ?? []).length > 0 || m.taille?.blocking), `${cas} : Beebs ne part pas sans la réponse`, JSON.stringify({ cta: m.ctaDisabled, motifs: m.motifs }));
    } else {
      verifier(m.taille?.state === 'ok', `${cas} : aucune question « Taille » (ligne « ok »)`, JSON.stringify(m.taille));
      verifier(journalTaille.length === 0, `${cas} : aucune question « Taille » affichée au journal (champ_requis_bloquant)`, JSON.stringify(journalTaille).slice(0, 200));
      await page.evaluate(() => window.__moteur.publier());
      await attendre(page, () => window.__envois.length > 0 || window.__moteur.publishError, null, 'envoi', 20000).catch(() => {});
      const envoi = await page.evaluate(() => window.__envois[0]?.p_jobs ?? null);
      const job = (envoi ?? []).find((r) => r.platform === 'beebs');
      const pf = job?.platform_fields ?? {};
      console.log('   job envoyé :', JSON.stringify({ taille: pf.taille, taille_saisie: pf.taille_saisie ?? null, taille_du_texte: pf.taille_du_texte ?? null, option_du_texte: pf.option_du_texte ?? null }));
      verifier(Boolean(job), `${cas} : le job Beebs part (spend_coins_and_publish)`, (await lireMoteur(page)).publishError ?? '');
      verifier(pf.taille === att.job, `${cas} : il part avec la taille « ${att.job} »`, `taille du job : ${JSON.stringify(pf.taille)}`);
      verifier((pf.taille_saisie ?? null) === att.saisie, `${cas} : la saisie de la copie est gardée (${JSON.stringify(att.saisie)})`, JSON.stringify(pf.taille_saisie));
      if (att.trace) verifier(pf.option_du_texte?.Taille?.source === 'taille_du_texte' && pf.option_du_texte?.Taille?.valeur === att.job, `${cas} : la trace part avec le job (option_du_texte.Taille)`, JSON.stringify(pf.option_du_texte ?? null));
    }
    verifier(filtre(erreurs).length === 0, `${cas} : aucune erreur de page`, filtre(erreurs).join(' | ').slice(0, 600));
    verifier(sorties.length === 0, `${cas} : aucune requête hors de la machine`, sorties.slice(0, 3).join(' '));
    await page.close();
  }
  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ le moteur réel : la taille du titre part, le doute reste une question');
} catch (e) {
  console.error('\n❌ le banc n’a pas pu tourner :', e?.stack ?? e);
  process.exitCode = 2;
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
