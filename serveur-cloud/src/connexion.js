// L'ÉCRAN « ME CONNECTER » — côté serveur.
//
// La personne, sur son téléphone, voit UNE page : celle de connexion de la
// plateforme, ouverte dans SON navigateur Cloud (son IP dédiée, son profil),
// au format mobile. Elle tape, elle écrit ; on rejoue ses gestes. Rien d'autre :
//   · aucune barre d'adresse, aucune navigation libre : un document principal
//     hors de la liste de la plateforme (plateformes.js) est REFUSÉ, et la page
//     revient à la connexion ; les fenêtres Apple / Google / Facebook ouvertes
//     par la page sont suivies (c'est leur connexion à eux) ;
//   · aucun zoom (le téléphone n'en envoie pas, on n'en rejoue pas) ;
//   · aucun téléchargement, aucun choix de fichier, aucune boîte de dialogue ;
//   · connectée (cookies d'identité) → le coffre est sauvegardé, le compte de
//     plateforme est noté pour l'essai unique, l'écran se ferme ;
//   · 15 minutes au plus, 5 minutes sans geste → fermé.
//
// Protocole (WebSocket /connexion/ws) — client → serveur, JSON :
//   { t:'ouvrir', jeton? | ticket?, plateforme, largeur, hauteur, dpr }
//   { t:'ack' } · { t:'toucher', type:'debut'|'deplacer'|'fin', x, y } · { t:'molette', x, y, dy }
//   { t:'texte', s } · { t:'touche', cle } · { t:'termine' } · { t:'fermer' }
// serveur → client : JSON { t:'etat', etape, message? } · { t:'clavier', ouvert } ;
//   binaire = une image JPEG (4 octets de numéro, puis l'image).
import { PLATEFORMES_CLOUD, DEFINITIONS, navigationPermise, urlPourJournal, estConnectee, identifiantCompte } from './plateformes.js';
import { verifierTicket } from './tickets.js';
import { lireDansExtension } from './sessionFillsell.js';

const DUREE_MAX_MS = 15 * 60_000;
const INACTIVITE_MS = 5 * 60_000;
const SONDE_MS = 2000;
const TOUCHES = {
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
};
const ACTIF_EDITABLE = `(() => { const e = document.activeElement; if (!e) return false; if (e.isContentEditable) return true;
  const t = e.tagName; if (t === 'TEXTAREA') return true;
  if (t === 'INPUT') return !/^(button|submit|checkbox|radio|file|image|reset|range|color|hidden)$/i.test(e.type || 'text');
  return t === 'IFRAME'; })()`;

const borne = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

export const MESSAGES = Object.freeze({
  fr: {
    demarrage: 'On prépare ta page de connexion…',
    pret: 'Connecte-toi comme d\'habitude.',
    connecte: (nom) => `C'est fait : ${nom} est connecté. FillSell publie maintenant tes annonces depuis ses serveurs.`,
    bloquee: 'Cette page n\'est pas la connexion : on y revient.',
    refuse: (nom) => `Ce compte ${nom} a déjà servi à un essai gratuit. L'essai s'arrête ; tu peux reprendre l'option sans essai.`,
    inactif: 'L\'option Sans ordinateur n\'est pas active sur ce compte.',
    occupe: 'Une autre connexion est déjà ouverte : elle vient d\'être fermée.',
    expire: 'Fermé après un moment sans geste. Rouvre « Me connecter » quand tu veux.',
    erreur: 'La page de connexion ne répond pas. Réessaie dans un instant.',
    non_autorise: 'Reconnecte-toi à FillSell, puis réessaie.',
  },
  en: {
    demarrage: 'Getting your sign-in page ready…',
    pret: 'Sign in as usual.',
    connecte: (nom) => `Done: ${nom} is connected. FillSell now posts your listings from its servers.`,
    bloquee: 'That page isn\'t the sign-in page: taking you back.',
    refuse: (nom) => `This ${nom} account was already used for a free trial. The trial stops; you can take the add-on without a trial.`,
    inactif: 'The No computer add-on isn\'t active on this account.',
    occupe: 'Another sign-in was open: it has just been closed.',
    expire: 'Closed after a while without activity. Open "Sign in" again whenever you like.',
    erreur: 'The sign-in page isn\'t responding. Try again in a moment.',
    non_autorise: 'Sign in to FillSell again, then retry.',
  },
});

export function creerConnexions({ config, base, postes, navigateurs, coffre, journal }) {
  const actives = new Map(); // user → vue

  async function compteServi(user) {
    if (config.comptesAutorises.length && !config.comptesAutorises.includes(user)) return null;
    const { data, error } = await base.rpc('cloud_comptes_a_servir');
    if (error) throw new Error(error.message);
    const c = (data ?? []).find((x) => x.user_id === user);
    return c && c.etat_cloud !== 'essai_termine' ? c : null;
  }

  async function authentifier(m) {
    if (m.ticket) return verifierTicket(m.ticket, config.cleTickets);
    if (m.jeton) {
      const { data, error } = await base.auth.getUser(String(m.jeton));
      return error ? null : data?.user?.id ?? null;
    }
    return null;
  }

  function brancher(ws, origine) {
    let vue = null;
    let ouvert = false;
    const envoyer = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    const attenteOuverture = setTimeout(() => { if (!ouvert) ws.close(4401, 'ouverture attendue'); }, 15_000);
    let jetons = 0, fenetre = Date.now();

    ws.on('message', async (brut, binaire) => {
      if (binaire) return;
      // Au plus 80 messages par seconde (un doigt qui glisse en envoie ~60).
      if (Date.now() - fenetre > 1000) { fenetre = Date.now(); jetons = 0; }
      if (++jetons > 80) return;
      let m;
      try { m = JSON.parse(brut.toString('utf8')); } catch { return; }
      if (!ouvert) {
        if (m.t !== 'ouvrir') return;
        ouvert = true;
        clearTimeout(attenteOuverture);
        const lang = m.lang === 'en' ? 'en' : 'fr';
        const txt = MESSAGES[lang];
        try {
          const user = await authentifier(m);
          if (!user) { envoyer({ t: 'etat', etape: 'non_autorise', message: txt.non_autorise }); return ws.close(4401); }
          if (!PLATEFORMES_CLOUD.includes(m.plateforme)) return ws.close(4400, 'plateforme');
          const compte = await compteServi(user);
          if (!compte) { envoyer({ t: 'etat', etape: 'inactif', message: txt.inactif }); return ws.close(4403); }
          const ancienne = actives.get(user);
          if (ancienne) { ancienne.fermer('remplacee'); envoyer({ t: 'etat', etape: 'info', message: txt.occupe }); }
          vue = creerVue({ user, compte, plateforme: m.plateforme, lang, ws, envoyer,
            largeur: borne(m.largeur, 280, 540), hauteur: borne(m.hauteur, 420, 1000), dpr: borne(m.dpr, 1, 3), origine });
          actives.set(user, vue);
          await vue.demarrer();
        } catch (e) {
          journal.erreur('connexion_ouverture_echec', { erreur: e.message });
          envoyer({ t: 'etat', etape: 'erreur', message: MESSAGES[m.lang === 'en' ? 'en' : 'fr'].erreur });
          vue?.fermer('erreur');
          ws.close(4500);
        }
        return;
      }
      vue?.geste(m).catch((e) => journal.alerte('connexion_geste_echec', { erreur: e.message }));
    });
    ws.on('close', () => { clearTimeout(attenteOuverture); vue?.fermer('client_parti'); });
  }

  function creerVue({ user, compte, plateforme, lang, ws, envoyer, largeur, hauteur, dpr }) {
    const def = DEFINITIONS[plateforme];
    const txt = MESSAGES[lang];
    let cdp = null;
    let cible = null;          // { targetId, sessionId, mainFrame } — la page de connexion
    const fenetres = [];       // fenêtres ouvertes par la page (Apple, Google…), la dernière est affichée
    let active = null;         // la cible dont on envoie les images
    let numero = 0, enVol = 0, enAttente = null;
    let finie = false, connectee = false;
    let dernierGeste = Date.now();
    const debut = Date.now();
    let sonde = null, arreterEcoute = null;
    let ligneJournal = null;

    const sessionDe = (sid) => [cible, ...fenetres].find((c) => c?.sessionId === sid) ?? null;

    async function preparerCible(c) {
      const s = c.sessionId;
      await cdp.send('Page.enable', {}, s);
      const { frameTree } = await cdp.send('Page.getFrameTree', {}, s);
      c.mainFrame = frameTree?.frame?.id ?? c.targetId;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: dpr, mobile: true, screenWidth: largeur, screenHeight: hauteur }, s);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s).catch(() => {});
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, s).catch(() => {});
      // Seuls les documents PRINCIPAUX sont filtrés : les cadres (captcha, bouton Google…) passent.
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] }, s);
    }

    async function diffuser(c) {
      if (active && active !== c) await cdp.send('Page.stopScreencast', {}, active.sessionId).catch(() => {});
      active = c;
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: Math.round(largeur * dpr), maxHeight: Math.round(hauteur * dpr), everyNthFrame: 1 }, c.sessionId);
    }

    function envoyerImage(data) {
      if (ws.readyState !== 1) return;
      if (enVol >= 2 || ws.bufferedAmount > 1_500_000) { enAttente = data; return; }
      const img = Buffer.from(data, 'base64');
      const tete = Buffer.alloc(4); tete.writeUInt32BE(++numero >>> 0);
      ws.send(Buffer.concat([tete, img]), { binary: true });
      enVol++;
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
        const principal = p.frameId === c.mainFrame || p.resourceType === 'Document' && !p.frameId;
        if (!principal || navigationPermise(plateforme, p.request?.url)) {
          return cdp.send('Fetch.continueRequest', { requestId: p.requestId }, m.sessionId).catch(() => {});
        }
        journal.info('connexion_navigation_refusee', { user, plateforme, vers: urlPourJournal(p.request?.url) });
        await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {});
        envoyer({ t: 'etat', etape: 'info', message: txt.bloquee });
        if (c === cible) await cdp.send('Page.navigate', { url: def.pageConnexion }, cible.sessionId).catch(() => {});
        else await cdp.send('Target.closeTarget', { targetId: c.targetId }).catch(() => {});
        return;
      }
      if (m.method === 'Page.javascriptDialogOpening') {
        return cdp.send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {});
      }
      if (m.method === 'Target.targetCreated' && p.targetInfo?.type === 'page'
          && [cible?.targetId, ...fenetres.map((f) => f.targetId)].includes(p.targetInfo.openerId)) {
        const sessionId = await cdp.send('Target.attachToTarget', { targetId: p.targetInfo.targetId, flatten: true }).then((r) => r.sessionId).catch(() => null);
        if (!sessionId) return;
        const f = { targetId: p.targetInfo.targetId, sessionId };
        fenetres.push(f);
        await preparerCible(f).catch(() => {});
        if (!navigationPermise(plateforme, p.targetInfo.url || 'about:blank')) {
          await cdp.send('Target.closeTarget', { targetId: f.targetId }).catch(() => {});
          return;
        }
        await diffuser(f).catch(() => {});
        return;
      }
      if (m.method === 'Target.targetDestroyed') {
        const i = fenetres.findIndex((f) => f.targetId === p.targetId);
        if (i >= 0) {
          const [f] = fenetres.splice(i, 1);
          if (active === f) await diffuser(fenetres.at(-1) ?? cible).catch(() => {});
        } else if (cible && p.targetId === cible.targetId) {
          fermer('page_fermee');
        }
      }
    }

    async function verifierConnexion(manuel = false) {
      if (finie || connectee) return;
      if (Date.now() - debut > DUREE_MAX_MS || Date.now() - dernierGeste > INACTIVITE_MS) {
        envoyer({ t: 'etat', etape: 'expire', message: txt.expire });
        return fermer('expiree');
      }
      const { cookies } = await cdp.send('Storage.getCookies');
      if (!estConnectee(cookies, plateforme)) {
        if (manuel) envoyer({ t: 'etat', etape: 'info', message: txt.pret });
        return;
      }
      connectee = true;
      const bilan = await coffre.sauvegarderCookies(user, cookies).catch((e) => ({ erreur: e.message }));
      const ident = identifiantCompte(cookies, plateforme);
      let refus = null;
      if (ident) {
        const { data } = await base.rpc('cloud_essai_noter_compte_plateforme', { p_user: user, p_plateforme: plateforme, p_identifiant: ident });
        if (data && data.ok === false && data.raison === 'compte_plateforme_deja_vu') refus = data;
      }
      if (refus) {
        await annulerEssai(user).catch((e) => journal.erreur('annulation_essai_echec', { user, erreur: e.message }));
        envoyer({ t: 'etat', etape: 'refuse', message: txt.refuse(def.nom) });
        journal.alerte('essai_refuse_compte_plateforme', { user, plateforme });
      } else {
        envoyer({ t: 'etat', etape: 'connecte', message: txt.connecte(def.nom) });
        journal.info('connexion_reussie', { user, plateforme, coffre: bilan });
      }
      await journaliser(refus ? 'refusee' : 'connectee', refus ? 'compte_plateforme_deja_vu' : null);
      setTimeout(() => fermer(refus ? 'refusee' : 'connectee'), 1500);
    }

    /** L'essai refusé : l'abonnement d'essai est annulé avec la session FillSell
     *  du compte (cancel-subscription, option cloud — rien n'est facturé). */
    async function annulerEssai(u) {
      const h = navigateurs.ouvert(u);
      const lu = h ? await lireDansExtension(h.cdp, await postes.extensionId()).catch(() => null) : null;
      const jeton = lu?.own?.access_token;
      if (!jeton) throw new Error('aucune session FillSell pour annuler');
      const r = await fetch(`${config.supabaseUrl}/functions/v1/cancel-subscription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}`, apikey: config.cleAnon },
        body: JSON.stringify({ option: 'cloud', raison: 'compte_plateforme_deja_vu' }),
      });
      journal.info('annulation_essai', { user: u, http: r.status });
    }

    async function journaliser(statut, raison) {
      if (!ligneJournal) return;
      await base.from('cloud_connexions').update({ statut, close_le: new Date().toISOString(), raison }).eq('id', ligneJournal);
    }

    async function demarrer() {
      envoyer({ t: 'etat', etape: 'demarrage', message: txt.demarrage });
      const { data: ligne } = await base.from('cloud_connexions').insert({ user_id: user, plateforme, statut: 'ouverte' }).select('id').maybeSingle();
      ligneJournal = ligne?.id ?? null;
      let h = navigateurs.ouvert(user);
      if (!h) h = await postes.ouvrir(user, compte, 'connexion');
      cdp = h.cdp;
      arreterEcoute = cdp.on((m) => { surEvenement(m).catch(() => {}); });
      await cdp.send('Target.setDiscoverTargets', { discover: true });
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true });
      const sessionId = await cdp.send('Target.attachToTarget', { targetId, flatten: true }).then((r) => r.sessionId);
      cible = { targetId, sessionId };
      await preparerCible(cible);
      await diffuser(cible);
      await cdp.send('Page.navigate', { url: def.pageConnexion }, sessionId);
      await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
      envoyer({ t: 'etat', etape: 'pret', message: txt.pret });
      sonde = setInterval(() => { verifierConnexion().catch((e) => journal.alerte('connexion_sonde_echec', { erreur: e.message })); }, SONDE_MS);
      journal.info('connexion_ouverte', { user, plateforme });
    }

    async function geste(m) {
      if (finie || !active) return;
      const s = active.sessionId;
      if (m.t === 'ack') {
        enVol = Math.max(0, enVol - 1);
        if (enAttente) { const d = enAttente; enAttente = null; envoyerImage(d); }
        return;
      }
      dernierGeste = Date.now();
      if (m.t === 'toucher') {
        const x = borne(m.x, 0, largeur), y = borne(m.y, 0, hauteur);
        const type = { debut: 'touchStart', deplacer: 'touchMove', fin: 'touchEnd' }[m.type];
        if (!type) return;
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] }, s);
        if (type === 'touchEnd') {
          setTimeout(async () => {
            const r = await cdp.send('Runtime.evaluate', { expression: ACTIF_EDITABLE, returnByValue: true }, s).catch(() => null);
            envoyer({ t: 'clavier', ouvert: r?.result?.value === true });
          }, 350);
        }
        return;
      }
      if (m.t === 'molette') {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: borne(m.x, 0, largeur), y: borne(m.y, 0, hauteur), deltaX: 0, deltaY: borne(m.dy, -2000, 2000) }, s);
        return;
      }
      if (m.t === 'texte') {
        const t = String(m.s ?? '').slice(0, 500);
        if (t) await cdp.send('Input.insertText', { text: t }, s);
        return;
      }
      if (m.t === 'touche') {
        const k = TOUCHES[m.cle];
        if (!k) return;
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k }, s);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode }, s);
        return;
      }
      if (m.t === 'termine') return verifierConnexion(true);
      if (m.t === 'fermer') return fermer('client');
    }

    function fermer(raison) {
      if (finie) return;
      finie = true;
      clearInterval(sonde);
      if (actives.get(user) === vue) actives.delete(user);
      arreterEcoute?.();
      const cibles = [...fenetres, cible].filter(Boolean);
      for (const c of cibles) cdp?.send('Target.closeTarget', { targetId: c.targetId }).catch(() => {});
      if (!connectee) journaliser(raison === 'expiree' ? 'abandonnee' : raison === 'erreur' ? 'erreur' : 'abandonnee', raison).catch(() => {});
      journal.info('connexion_fermee', { user, plateforme, raison, duree_s: Math.round((Date.now() - debut) / 1000) });
      try { if (ws.readyState === 1) ws.close(1000); } catch { /* déjà fermé */ }
    }

    const vue = { demarrer, geste, fermer, user };
    return vue;
  }

  return { brancher, connexionsOuvertes: () => new Set(actives.keys()), fermerTout: () => { for (const v of actives.values()) v.fermer('arret_serveur'); } };
}
