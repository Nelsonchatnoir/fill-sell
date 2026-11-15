// « PAYER SUR LEBONCOIN » — la page de paiement d'un dépôt Leboncoin, dans le navigateur Cloud de la personne
// (15/11/2026, cliente 13e274de — point 2 de Nico).
//
// Le cas : compte Leboncoin PRO hors forfait. FillSell (la copie Cloud de l'extension) prépare le dépôt jusqu'à l'écran
// « Valider et payer » et LAISSE l'onglet ouvert (background.js, rendreOngletALaPersonne) ; la personne doit cliquer
// elle-même. Sur un PC, l'onglet est devant elle. Au Cloud, il est dans SON navigateur Cloud, qu'elle ne voit pas : le
// message lui disait « dans l'onglet Leboncoin ouvert sur ton ordinateur » — un geste impossible.
//
// LA VUE « payer » (même écran que « Me connecter », même protocole WebSocket : { t:'ouvrir', mode:'payer', job, … }) :
//   · seulement à l'initiative de la personne (bouton « Payer sur Leboncoin » de « À régler ») — jamais ouverte seule ;
//   · seulement pour SA tâche Leboncoin qui attend « Valider et payer » (needs_user, motif lbc_valider_et_payer) ;
//   · l'onglet est celui que l'extension SUIT (chrome.storage.session « fillsell_lbc_paiement_attendu ») : l'extension le
//     marque (attribut data-fillsell-paiement, rien d'autre), on le retrouve par cette marque — jamais un autre onglet au
//     même écran (un ancien dépôt jamais suivi : le payer publierait sans que FillSell le sache) ;
//   · ⛔ FillSell ne clique JAMAIS : seuls les gestes de la personne sont rejoués (doigt, molette, clavier). Aucun clic
//     sur « Valider et payer » ni sur aucun bouton de paiement, aucune saisie qui ne vienne pas d'elle ;
//   · ⛔ l'onglet n'est JAMAIS fermé par la vue : l'extension le surveille (page de confirmation → dépôt « publié », preuve
//     paiement_utilisateur ; onglet fermé → « Préparer à nouveau ») — la vue le rend tel quel (format, diffusion, filtre
//     retirés) ;
//   · navigation : documents principaux en https seulement, jamais une autre plateforme (Vinted, Beebs, Depop) ni eBay /
//     Opla ; les pages d'un prestataire de paiement ou d'une banque (3-D Secure) passent — refuser l'une d'elles casserait
//     un paiement en cours. Chaque hôte hors Leboncoin est journalisé ;
//   · fin : la page de confirmation de Leboncoin (ou l'annonce) vue dans l'onglet, ou la tâche « published » en base →
//     « C'est fait », FillSell reprend tout seul (get-pending-jobs prépare la publication suivante) ;
//   · onglet introuvable (navigateur Cloud redémarré, onglet fermé) : dit à la personne, et noté sur la tâche
//     (attente_paiement.onglet_ferme_le, comme l'extension) — la carte propose alors « Préparer à nouveau ».
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { urlPourJournal } from './plateformes.js';
import { evaluerDansExtension } from './sessionFillsell.js';

export const MOTIF_A_PAYER = 'lbc_valider_et_payer';
export const CLE_ATTENTE_PAIEMENT = 'fillsell_lbc_paiement_attendu';
export const ATTRIBUT_MARQUE = 'data-fillsell-paiement';
const DUREE_MAX_MS = 15 * 60_000;
const INACTIVITE_MS = 5 * 60_000;
export const REPRISE_MS = INACTIVITE_MS;
const SONDE_MS = 2000;
const LECTURE_BASE_MS = 10_000;
const ECHELLE_IMAGES_MAX = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MESSAGES_PAIEMENT = Object.freeze({
  fr: {
    demarrage: 'On ouvre ta page Leboncoin dans ton FillSell Cloud…',
    pret: 'Ta page Leboncoin, dans ton FillSell Cloud : vérifie le dépôt, puis clique toi-même « Valider et payer ». FillSell ne paie jamais à ta place.',
    reprise: 'Te revoilà : ta page Leboncoin est restée ouverte.',
    paye: "C'est fait : ton annonce est publiée sur Leboncoin. FillSell reprend tout seul la suite.",
    page_fermee: "Ta page de paiement Leboncoin n'est plus ouverte dans ton FillSell Cloud. Ferme cet écran et appuie sur « Préparer à nouveau » : FillSell la prépare de nouveau, puis tu reviens ici payer.",
    rien_a_payer: "Rien à payer : ce dépôt n'attend plus ton paiement.",
    bloquee: 'Cette page ne fait pas partie du paiement Leboncoin : tu restes sur ta page Leboncoin.',
    pasEncore: "Le paiement n'est pas encore confirmé par Leboncoin : termine-le sur la page (« Valider et payer »).",
    expire: 'Fermé après un moment sans geste. Rouvre « Payer sur Leboncoin » quand tu veux : ta page reste prête.',
    erreur: 'La page Leboncoin ne répond pas. Réessaie dans un instant.',
  },
  en: {
    demarrage: 'Opening your Leboncoin page in your FillSell Cloud…',
    pret: 'Your Leboncoin page, in your FillSell Cloud: check the listing, then click “Valider et payer” yourself. FillSell never pays for you.',
    reprise: 'Welcome back: your Leboncoin page stayed open.',
    paye: 'Done: your listing is live on Leboncoin. FillSell takes it from here on its own.',
    page_fermee: 'Your Leboncoin payment page is no longer open in your FillSell Cloud. Close this screen and tap “Prepare again”: FillSell prepares it again, then come back here to pay.',
    rien_a_payer: 'Nothing to pay: this listing is no longer waiting for your payment.',
    bloquee: "That page isn't part of the Leboncoin payment: you stay on your Leboncoin page.",
    pasEncore: 'Leboncoin has not confirmed the payment yet: finish it on the page (“Valider et payer”).',
    expire: 'Closed after a while without activity. Open “Pay on Leboncoin” again whenever you like: your page stays ready.',
    erreur: "The Leboncoin page isn't responding. Try again in a moment.",
  },
});

// Les autres plateformes du Cloud, et celles qui ne sont jamais joignables : jamais pendant un paiement Leboncoin.
const HOTES_INTERDITS = Object.freeze(['vinted.fr', 'vinted.com', 'vinted.net', 'beebs.app', 'depop.com', 'opla.co',
  'ebay.fr', 'ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.it', 'ebay.es', 'ebay.be', 'ebay.nl', 'ebay.ch', 'ebay.at', 'ebay.ie']);
const sur = (h, d) => h === d || h.endsWith(`.${d}`);

/** Un document principal permis pendant le paiement (pur, testé) : https, jamais une autre plateforme ni eBay / Opla. */
export function navigationPaiementPermise(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return !HOTES_INTERDITS.some((d) => sur(h, d));
}
/** Un hôte de Leboncoin (pur). */
export const hoteLeboncoin = (url) => { try { return sur(new URL(String(url)).hostname.toLowerCase(), 'leboncoin.fr'); } catch { return false; } };

/** La page dit-elle le dépôt conclu ? (pur, testé) Même règle que l'extension (background.js, onUpdated). */
export function paiementConclu(url) {
  const s = String(url ?? '');
  return /leboncoin\.fr\/deposer-une-annonce\/confirmation/.test(s) || /leboncoin\.fr\/(?:ad\/[^/]+|vi)\/\d{7,}/.test(s);
}

/** La tâche peut-elle être payée ici ? (pur, testé) Sa tâche Leboncoin, au mur « Valider et payer », pas close. */
export function tachePayable(job, user) {
  if (!job || String(job.user_id) !== String(user)) return false;
  const pf = job.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  return job.platform === 'leboncoin' && job.status === 'needs_user' && String(pf.last_diagnostic?.quoi ?? '') === MOTIF_A_PAYER
    && !(pf.attente_paiement && pf.attente_paiement.onglet_ferme_le);
}

/** L'expression lue dans le service worker de l'extension : l'onglet suivi pour CE dépôt, marqué pour qu'on le retrouve. */
export function expressionMarquerOnglet(jobId, jeton) {
  return `(async () => {
  const K = ${JSON.stringify(CLE_ATTENTE_PAIEMENT)};
  const a = (await chrome.storage.session.get(K))[K];
  if (!a || String(a.jobId) !== ${JSON.stringify(String(jobId))}) return { ok: false, motif: a ? 'autre_depot' : 'aucune_attente' };
  const t = await chrome.tabs.get(a.tabId).catch(() => null);
  if (!t) return { ok: false, motif: 'onglet_ferme' };
  await chrome.scripting.executeScript({ target: { tabId: a.tabId }, func: (j) => { document.documentElement.setAttribute(${JSON.stringify(ATTRIBUT_MARQUE)}, j); }, args: [${JSON.stringify(jeton)}] });
  return { ok: true, url: String(t.url || '').slice(0, 300) };
})()`;
}

/** Les platform_fields d'une tâche dont l'onglet de paiement est prouvé parti (pur) — le même champ que l'extension. */
export function champsOngletFerme(pf, maintenantIso, motif) {
  const p = pf && typeof pf === 'object' ? pf : {};
  return { ...p, attente_paiement: { ...(p.attente_paiement ?? {}), onglet_ferme_le: maintenantIso, par: `cloud_payer:${motif}` } };
}

/**
 * La vue « payer » d'un compte : { demarrer, geste, fermer, clientParti, reprenable, memePage, reprendre, user, plateforme }
 * (la même interface que les vues de connexion.js, rangée dans la même table : une page à la fois par compte).
 */
export function creerVuePaiement({ user, jobId, lang, ws, envoyer, largeur, hauteur, dpr, base, navigateurs, postes, journal, touches, surFin }) {
  const plateforme = 'leboncoin';
  let txt = MESSAGES_PAIEMENT[lang] ?? MESSAGES_PAIEMENT.fr;
  let canal = { ws, envoyer };
  let dims = { largeur, hauteur, dpr };
  const dire = (o) => canal?.envoyer(o);
  let derniereEtape = { etape: 'demarrage', message: txt.demarrage };
  const etat = (etape, message) => { derniereEtape = { etape, message }; dire({ t: 'etat', etape, message }); };
  let cdp = null, cible = null, active = null, arreterEcoute = null;
  const fenetres = [];
  let numero = 0, enVol = 0, enAttente = null;
  let finie = false, conclue = false;
  let dernierGeste = Date.now();
  const debut = Date.now();
  let sonde = null, attenteRetour = null, derniereLectureBase = 0;
  const sessionDe = (sid) => [cible, ...fenetres].find((c) => c?.sessionId === sid) ?? null;

  async function preparer(c) {
    const s = c.sessionId;
    await cdp.send('Page.enable', {}, s);
    const { frameTree } = await cdp.send('Page.getFrameTree', {}, s);
    c.mainFrame = frameTree?.frame?.id ?? c.targetId;
    // La fenêtre de l'onglet rendue visible (une fenêtre réduite ne dessine rien), puis le format du téléphone.
    try {
      const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: c.targetId });
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
    } catch { /* fenêtre illisible : la diffusion le dira */ }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: dims.largeur, height: dims.hauteur, deviceScaleFactor: dims.dpr,
      mobile: true, screenWidth: dims.largeur, screenHeight: dims.hauteur }, s);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s).catch(() => {});
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, s).catch(() => {});
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] }, s);
  }
  /** Rend l'onglet tel qu'il était (format, toucher, filtre, diffusion) — jamais fermé. */
  async function rendre(c) {
    if (!c?.sessionId) return;
    const s = c.sessionId;
    await cdp.send('Page.stopScreencast', {}, s).catch(() => {});
    await cdp.send('Fetch.disable', {}, s).catch(() => {});
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, s).catch(() => {});
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, s).catch(() => {});
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }, s).catch(() => {});
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false }, s).catch(() => {});
    await cdp.send('Target.detachFromTarget', { sessionId: s }).catch(() => {});
  }
  async function diffuser(c) {
    if (active && active !== c) await cdp.send('Page.stopScreencast', {}, active.sessionId).catch(() => {});
    active = c;
    if (!canal) return;
    const echelle = Math.min(dims.dpr, ECHELLE_IMAGES_MAX);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: Math.round(dims.largeur * echelle),
      maxHeight: Math.round(dims.hauteur * echelle), everyNthFrame: 1 }, c.sessionId);
  }
  function envoyerImage(data) {
    const w = canal?.ws;
    if (!w || w.readyState !== 1) return;
    if (enVol >= 2 || w.bufferedAmount > 1_500_000) { enAttente = data; return; }
    const img = Buffer.from(data, 'base64');
    const tete = Buffer.alloc(4); tete.writeUInt32BE(++numero >>> 0);
    w.send(Buffer.concat([tete, img]), { binary: true });
    enVol++;
  }

  /** L'onglet suivi par l'extension pour CE dépôt (marqué), ou { motif } s'il n'existe plus. */
  async function trouverOnglet(h) {
    const jeton = randomBytes(12).toString('hex');
    const id = await postes.extensionId();
    const lu = await evaluerDansExtension(h.cdp, id, expressionMarquerOnglet(jobId, jeton)).catch((e) => ({ ok: false, motif: 'extension_illisible', erreur: e.message }));
    if (!lu?.ok) return { motif: lu?.motif ?? 'extension_illisible' };
    const { targetInfos } = await h.cdp.send('Target.getTargets');
    for (const t of (targetInfos ?? []).filter((x) => x.type === 'page' && hoteLeboncoin(x.url))) {
      const sessionId = await h.cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true }).then((r) => r.sessionId).catch(() => null);
      if (!sessionId) continue;
      const r = await h.cdp.send('Runtime.evaluate', { expression: `document.documentElement.getAttribute(${JSON.stringify(ATTRIBUT_MARQUE)})`, returnByValue: true }, sessionId).catch(() => null);
      if (r?.result?.value === jeton) return { targetId: t.targetId, sessionId, url: t.url };
      await h.cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
    return { motif: 'onglet_introuvable' };
  }

  async function noterOngletParti(motif) {
    try {
      const { data: j } = await base.from('cross_post_jobs').select('id, user_id, platform, status, platform_fields').eq('id', jobId).maybeSingle();
      if (!tachePayable(j, user)) return;
      const { error } = await base.from('cross_post_jobs').update({ platform_fields: champsOngletFerme(j.platform_fields, new Date().toISOString(), motif) })
        .eq('id', jobId).eq('status', 'needs_user');
      if (error) journal.alerte('paiement_onglet_ferme_non_note', { user, job: jobId, erreur: error.message });
      else journal.info('paiement_onglet_ferme_note', { user, job: jobId, motif });
    } catch (e) { journal.alerte('paiement_onglet_ferme_non_note', { user, job: jobId, erreur: e.message }); }
  }

  async function surEvenement(m) {
    if (finie) return;
    const p = m.params ?? {};
    if (m.method === '__ferme__') return fermer('navigateur_ferme');
    if (m.method === 'Page.screencastFrame') {
      const c = sessionDe(m.sessionId);
      await cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }, m.sessionId).catch(() => {});
      if (c && c === active) envoyerImage(p.data);
      return;
    }
    if (m.method === 'Fetch.requestPaused') {
      const c = sessionDe(m.sessionId);
      if (!c) return;
      const principal = p.frameId === c.mainFrame || (p.resourceType === 'Document' && !p.frameId);
      const url = p.request?.url;
      if (!principal || navigationPaiementPermise(url)) {
        if (principal && !hoteLeboncoin(url)) journal.info('paiement_navigation_hors_leboncoin', { user, job: jobId, vers: urlPourJournal(url) });
        return cdp.send('Fetch.continueRequest', { requestId: p.requestId }, m.sessionId).catch(() => {});
      }
      journal.info('paiement_navigation_refusee', { user, job: jobId, vers: urlPourJournal(url) });
      await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {});
      etat('info', txt.bloquee);
      return;
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      // Une boîte de dialogue de la page (rare) : fermée sans rien accepter — jamais un « oui » à la place de la personne.
      return cdp.send('Page.handleJavaScriptDialog', { accept: false }, m.sessionId).catch(() => {});
    }
    // Une fenêtre ouverte par la page de paiement (prestataire, banque) : suivie et montrée, comme celle d'un fournisseur.
    if (m.method === 'Target.targetCreated' && p.targetInfo?.type === 'page' && p.targetInfo.openerId
        && [cible?.targetId, ...fenetres.map((f) => f.targetId)].includes(p.targetInfo.openerId)) {
      const sessionId = await cdp.send('Target.attachToTarget', { targetId: p.targetInfo.targetId, flatten: true }).then((r) => r.sessionId).catch(() => null);
      if (!sessionId) return;
      const f = { targetId: p.targetInfo.targetId, sessionId };
      fenetres.push(f);
      await preparer(f).catch(() => {});
      journal.info('paiement_fenetre', { user, job: jobId, vers: urlPourJournal(p.targetInfo.url) });
      await diffuser(f).catch(() => {});
      return;
    }
    if (m.method === 'Target.targetDestroyed') {
      const i = fenetres.findIndex((f) => f.targetId === p.targetId);
      if (i >= 0) {
        const [f] = fenetres.splice(i, 1);
        if (active === f) await diffuser(fenetres.at(-1) ?? cible).catch(() => {});
      } else if (cible && p.targetId === cible.targetId) {
        // L'onglet fermé (par la page, ou par un redémarrage) : l'extension le note ; la vue s'arrête.
        etat('page_fermee', txt.page_fermee);
        fermer('onglet_ferme');
      }
    }
  }

  async function verifier(manuel = false) {
    if (finie || conclue) return;
    if (Date.now() - debut > DUREE_MAX_MS || Date.now() - dernierGeste > INACTIVITE_MS) { etat('expire', txt.expire); return fermer('expiree'); }
    let url = '';
    if (cible) {
      const r = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, cible.sessionId).catch(() => null);
      url = String(r?.result?.value ?? '');
    }
    let publie = paiementConclu(url);
    if (!publie && (manuel || Date.now() - derniereLectureBase >= LECTURE_BASE_MS)) {
      derniereLectureBase = Date.now();
      const { data } = await base.from('cross_post_jobs').select('status').eq('id', jobId).maybeSingle();
      publie = data?.status === 'published';
    }
    if (publie) {
      conclue = true;
      journal.info('paiement_conclu', { user, job: jobId, page: urlPourJournal(url), duree_s: Math.round((Date.now() - debut) / 1000) });
      etat('paye', txt.paye);
      setTimeout(() => fermer('paye'), 2500);
      return;
    }
    if (manuel) etat('info', txt.pasEncore);
  }

  async function demarrer() {
    etat('demarrage', txt.demarrage);
    const { data: job } = await base.from('cross_post_jobs').select('id, user_id, platform, status, platform_fields').eq('id', jobId).maybeSingle();
    if (!tachePayable(job, user)) {
      journal.info('paiement_rien', { user, job: jobId, statut: job?.status ?? null });
      etat('rien_a_payer', txt.rien_a_payer);
      return fermer('rien_a_payer', 1500);
    }
    const h = navigateurs.ouvert(user);
    if (!h || h.moteur !== 'chrome') {
      // Le navigateur Cloud est éteint : l'onglet (et le dépôt préparé) ne survit pas à un redémarrage.
      journal.info('paiement_page_fermee', { user, job: jobId, motif: h ? 'moteur_sans_onglet' : 'navigateur_eteint' });
      await noterOngletParti(h ? 'moteur' : 'navigateur_eteint');
      etat('page_fermee', txt.page_fermee);
      return fermer('page_fermee', 1500);
    }
    cdp = h.cdp;
    const o = await trouverOnglet(h);
    if (!o.targetId) {
      journal.info('paiement_page_fermee', { user, job: jobId, motif: o.motif });
      if (o.motif !== 'extension_illisible') await noterOngletParti(o.motif);
      etat(o.motif === 'extension_illisible' ? 'erreur' : 'page_fermee', o.motif === 'extension_illisible' ? txt.erreur : txt.page_fermee);
      return fermer(o.motif, 1500);
    }
    arreterEcoute = cdp.on((m) => { surEvenement(m).catch(() => {}); });
    await cdp.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
    cible = { targetId: o.targetId, sessionId: o.sessionId };
    await preparer(cible);
    await cdp.send('Page.bringToFront', {}, cible.sessionId).catch(() => {});
    await diffuser(cible);
    etat('pret', txt.pret);
    sonde = setInterval(() => { verifier().catch((e) => journal.alerte('paiement_sonde_echec', { user, erreur: e.message })); }, SONDE_MS);
    journal.info('paiement_ouvert', { user, job: jobId, page: urlPourJournal(o.url) });
  }

  async function geste(m, depuis) {
    if (finie || !active || !canal || depuis !== canal.ws) return;
    const s = active.sessionId;
    if (m.t === 'ack') {
      enVol = Math.max(0, enVol - 1);
      if (enAttente) { const d = enAttente; enAttente = null; envoyerImage(d); }
      return;
    }
    dernierGeste = Date.now();
    const borne = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
    if (m.t === 'toucher') {
      const type = { debut: 'touchStart', deplacer: 'touchMove', fin: 'touchEnd' }[m.type];
      if (!type) return;
      const x = borne(m.x, 0, dims.largeur), y = borne(m.y, 0, dims.hauteur);
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] }, s);
      if (type === 'touchEnd') {
        setTimeout(async () => {
          const r = await cdp.send('Runtime.evaluate', { expression: `(() => { const e = document.activeElement; if (!e) return false; if (e.isContentEditable) return true; const t = e.tagName; if (t === 'TEXTAREA' || t === 'IFRAME') return true; return t === 'INPUT' && !/^(button|submit|checkbox|radio|file|image|reset|range|color|hidden)$/i.test(e.type || 'text'); })()`, returnByValue: true }, s).catch(() => null);
          dire({ t: 'clavier', ouvert: r?.result?.value === true });
        }, 350);
      }
      return;
    }
    if (m.t === 'molette') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: borne(m.x, 0, dims.largeur), y: borne(m.y, 0, dims.hauteur), deltaX: 0, deltaY: borne(m.dy, -2000, 2000) }, s);
      return;
    }
    if (m.t === 'texte') {
      const t = String(m.s ?? '').slice(0, 500);
      if (t) await cdp.send('Input.insertText', { text: t }, s);
      return;
    }
    if (m.t === 'touche') {
      const suite = Object.hasOwn(touches ?? {}, m.cle) ? touches[m.cle] : null;
      if (!suite) return;
      const n = Math.min(Math.max(1, Math.trunc(Number(m.n) || 1)), 50);
      for (let i = 0; i < n; i++) {
        for (const k of suite) {
          await cdp.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...k }, s);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, ...(k.modifiers ? { modifiers: k.modifiers } : {}) }, s);
        }
      }
      return;
    }
    if (m.t === 'termine') return verifier(true);
    if (m.t === 'fermer') return fermer('client');
  }

  function clientParti(w) {
    if (finie || !canal || canal.ws !== w) return;
    canal = null;
    enVol = 0; enAttente = null;
    if (active) cdp?.send('Page.stopScreencast', {}, active.sessionId).catch(() => {});
    journal.info('paiement_en_attente', { user, job: jobId });
    attenteRetour = setTimeout(() => fermer('client_parti'), REPRISE_MS);
    attenteRetour.unref?.();
  }
  const memePage = (p, md, job) => p === plateforme && md === 'payer' && String(job ?? '') === String(jobId);
  const reprenable = (p, md, job) => !finie && memePage(p, md, job) && Boolean(cible);
  async function reprendre({ ws: w, envoyer: e, lang: l, largeur: lg, hauteur: ht, dpr: d }) {
    clearTimeout(attenteRetour); attenteRetour = null;
    const ancien = canal;
    canal = { ws: w, envoyer: e };
    if (ancien?.ws && ancien.ws !== w) { try { ancien.envoyer({ t: 'etat', etape: 'remplacee', message: '' }); ancien.ws.close(4409, 'remplacee'); } catch { /* déjà fermée */ } }
    txt = MESSAGES_PAIEMENT[l === 'en' ? 'en' : 'fr'];
    dernierGeste = Date.now();
    enVol = 0; enAttente = null;
    const changees = lg !== dims.largeur || ht !== dims.hauteur || d !== dims.dpr;
    dims = { largeur: lg, hauteur: ht, dpr: d };
    if (changees) for (const c of [cible, ...fenetres].filter(Boolean)) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: lg, height: ht, deviceScaleFactor: d, mobile: true, screenWidth: lg, screenHeight: ht }, c.sessionId).catch(() => {});
    }
    await diffuser(active ?? cible).catch(() => {});
    journal.info('paiement_reprise', { user, job: jobId });
    dire({ t: 'etat', etape: 'pret', message: txt.reprise });
    if (derniereEtape.etape === 'info') dire({ t: 'etat', etape: 'info', message: derniereEtape.message });
  }

  function fermer(raison, delaiFermetureMs = 0) {
    if (finie) return;
    finie = true;
    clearInterval(sonde);
    clearTimeout(attenteRetour);
    arreterEcoute?.();
    // ⛔ Jamais Target.closeTarget sur l'onglet de paiement : il est rendu tel quel, l'extension le surveille.
    for (const c of [...fenetres, cible].filter(Boolean)) rendre(c).catch(() => {});
    journal.info('paiement_ferme', { user, job: jobId, raison, conclu: conclue, duree_s: Math.round((Date.now() - debut) / 1000) });
    try { surFin?.(vue); } catch { /* la table des vues ne retient rien */ }
    const c = canal;
    canal = null;
    // Remplacée par une autre page du compte : elle l'apprend (étape finale, 4409) et ne se reprend pas (connexion.js).
    if (raison === 'remplacee') { try { c?.envoyer({ t: 'etat', etape: 'remplacee', message: '' }); if (c?.ws?.readyState === 1) c.ws.close(4409, 'remplacee'); } catch { /* déjà fermée */ } return; }
    const clore = () => { try { if (c?.ws?.readyState === 1) c.ws.close(raison === 'arret_serveur' ? 1012 : 1000); } catch { /* déjà fermé */ } };
    if (delaiFermetureMs > 0) setTimeout(clore, delaiFermetureMs); else clore();
  }

  const vue = { demarrer, geste, fermer, clientParti, reprenable, memePage, reprendre, user, plateforme, mode: 'payer', job: jobId };
  return vue;
}

export const jobIdValide = (v) => (UUID.test(String(v ?? '')) ? String(v) : null);
