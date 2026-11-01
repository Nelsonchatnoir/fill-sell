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
//   · (01/11) connectée = le COMPTE LU par le serveur dans cette page, revenue sur le site de la plateforme
//     (plateformes.js, expressionLectureCompte) — jamais le seul cookie, jamais la fenêtre fermée ; alors le coffre
//     est sauvegardé, le compte de plateforme noté pour l'essai unique, et l'écran dit « vérifié » SANS se fermer :
//     une étape demandée ensuite par la plateforme (téléphone, code) se finit ici ; « J'ai fini » ferme ;
//   · (01/11) la personne qui quitte l'app (lire un SMS, un courriel) ne perd rien : la page reste ouverte
//     REPRISE_MS, et le même « Me connecter » rouvert la reprend telle quelle ;
//   · 15 minutes au plus, 5 minutes sans geste → fermé.
//
// Protocole (WebSocket /connexion/ws) — client → serveur, JSON :
//   { t:'ouvrir', jeton? | ticket?, plateforme, largeur, hauteur, dpr }
//   { t:'ack' } · { t:'toucher', type:'debut'|'deplacer'|'fin', x, y } · { t:'molette', x, y, dy }
//   { t:'texte', s } · { t:'touche', cle } · { t:'termine' } · { t:'fermer' }
// serveur → client : JSON { t:'etat', etape, message? } · { t:'clavier', ouvert } ;
//   binaire = une image JPEG (4 octets de numéro, puis l'image).
//   (01/11) étapes : … · 'verifie' (compte lu, l'écran reste ouvert) · 'connecte' (final, après « J'ai fini »).
import { PLATEFORMES_CLOUD, DEFINITIONS, navigationPermise, urlPourJournal, estConnectee, identifiantCompte,
  retourDeclare, expressionLectureCompte, verdictLectureCompte } from './plateformes.js';
import { verifierTicket } from './tickets.js';
import { lireDansExtension } from './sessionFillsell.js';

const DUREE_MAX_MS = 15 * 60_000;
const INACTIVITE_MS = 5 * 60_000;
const SONDE_MS = 2000;
// (01/11) Une lecture du compte au plus toutes les 5 s pendant que la personne finit ses étapes (une requête que la
// page fait elle-même, jamais une rafale).
export const LECTURE_COMPTE_MS = 5000;
// (01/11) Essai de Nico : Leboncoin (21:01, 21:04) et Depop (21:17) fermés 14 à 80 s après l'ouverture, « client
// parti » — l'app quittée pour lire le code reçu ; la page et sa vérification en cours partaient avec. La page attend
// désormais le retour de la personne autant que l'inactivité permise.
export const REPRISE_MS = INACTIVITE_MS;
export const ECHELLE_IMAGES_MAX = 2;
// Garde anti-boucle des refus de navigation (05/10) : 5 refus en 20 s = arrêt.
/**
 * (30/10) Une page appartient à « Me connecter » seulement si elle a été OUVERTE par la page de connexion (ou par une
 * de ses fenêtres). Target.setDiscoverTargets annonce aussi les onglets DÉJÀ ouverts, sans openerId, alors que la
 * cible n'existe pas encore : `[undefined].includes(undefined)` les adoptait tous, puis la fermeture de l'écran les
 * fermait (essai du PC de Nico : Chrome sous Windows s'est fermé avec son dernier onglet ; en production, un onglet de
 * travail de l'extension aurait été fermé en pleine publication).
 */
export function ouverteParLaConnexion(targetInfo, idsConnexion) {
  const ouvreur = targetInfo?.openerId;
  return Boolean(ouvreur) && (idsConnexion ?? []).filter(Boolean).includes(ouvreur);
}

export const REFUS_MAX = 5;
export const REFUS_FENETRE_MS = 20_000;
// (01/11, « la touche effacer ne marche pas ») Le rejeu, lui, efface (mesuré dans Chromium : keyDown Backspace →
// « bonjour mond ») ; c'est le téléphone qui n'envoyait rien (clientConnexion.js). Le clavier entier est rejoué : effacer
// à droite, un mot (Ctrl+Retour arrière = l'effacement par mot de Chrome sous Linux), jusqu'au début de la ligne,
// flèches, début et fin.
const K = (key, code, windowsVirtualKeyCode, extra = {}) => ({ key, code, windowsVirtualKeyCode, ...extra });
const CTRL = 2, MAJ = 8;
export const TOUCHES = Object.freeze({
  Backspace: [K('Backspace', 'Backspace', 8)],
  Delete: [K('Delete', 'Delete', 46)],
  MotPrecedent: [K('Backspace', 'Backspace', 8, { modifiers: CTRL })],
  MotSuivant: [K('Delete', 'Delete', 46, { modifiers: CTRL })],
  LignePrecedente: [K('Home', 'Home', 36, { modifiers: MAJ }), K('Backspace', 'Backspace', 8)],
  Enter: [K('Enter', 'Enter', 13, { text: '\r' })],
  Tab: [K('Tab', 'Tab', 9)],
  ArrowLeft: [K('ArrowLeft', 'ArrowLeft', 37)],
  ArrowRight: [K('ArrowRight', 'ArrowRight', 39)],
  ArrowUp: [K('ArrowUp', 'ArrowUp', 38)],
  ArrowDown: [K('ArrowDown', 'ArrowDown', 40)],
  Home: [K('Home', 'Home', 36)],
  End: [K('End', 'End', 35)],
  Escape: [K('Escape', 'Escape', 27)],
});
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
    verifie: (nom) => `${nom} est connecté : ton compte est vérifié. Si ${nom} te demande encore quelque chose (code, téléphone), termine-le ici, puis appuie sur « J'ai fini ».`,
    etapes: (nom) => `Termine les étapes demandées par ${nom} (code, téléphone…) : la page reste ouverte jusqu'au bout.`,
    pasConnecte: (nom) => `Tu n'es pas encore connecté à ${nom} : termine la connexion sur la page.`,
    reprise: 'Te revoilà : ta page de connexion est restée ouverte.',
    bloquee: 'Cette page n\'est pas la connexion : on y revient.',
    boucle: (nom) => `La page de connexion de ${nom} ne s'ouvre pas comme prévu. On arrête ici et on regarde de notre côté : réessaie plus tard.`,
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
    verifie: (nom) => `${nom} is connected: your account is verified. If ${nom} still asks for something (code, phone), finish it here, then tap "I'm done".`,
    etapes: (nom) => `Finish the steps ${nom} asks for (code, phone…): the page stays open until you're done.`,
    pasConnecte: (nom) => `You're not signed in to ${nom} yet: finish signing in on the page.`,
    reprise: 'Welcome back: your sign-in page stayed open.',
    bloquee: 'That page isn\'t the sign-in page: taking you back.',
    boucle: (nom) => `The ${nom} sign-in page isn't opening as expected. We're stopping here and looking into it on our side: try again later.`,
    refuse: (nom) => `This ${nom} account was already used for a free trial. The trial stops; you can take the add-on without a trial.`,
    inactif: 'The No computer add-on isn\'t active on this account.',
    occupe: 'Another sign-in was open: it has just been closed.',
    expire: 'Closed after a while without activity. Open "Sign in" again whenever you like.',
    erreur: 'The sign-in page isn\'t responding. Try again in a moment.',
    non_autorise: 'Sign in to FillSell again, then retry.',
  },
});

export function creerConnexions({ config, base, postes, navigateurs, coffre, journal, surVerifiee = null }) {
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
          const dims = { largeur: borne(m.largeur, 280, 540), hauteur: borne(m.hauteur, 420, 1000), dpr: borne(m.dpr, 1, 3) };
          const ancienne = actives.get(user);
          // (01/11) Le même « Me connecter » rouvert (retour dans l'app après un SMS, un courriel) : la page reprend.
          if (ancienne?.reprenable(m.plateforme)) {
            vue = ancienne;
            await vue.reprendre({ ws, envoyer, lang, ...dims });
            return;
          }
          if (ancienne) { ancienne.fermer('remplacee'); envoyer({ t: 'etat', etape: 'info', message: txt.occupe }); }
          vue = creerVue({ user, compte, plateforme: m.plateforme, lang, ws, envoyer, ...dims, origine });
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
      vue?.geste(m, ws).catch((e) => journal.alerte('connexion_geste_echec', { erreur: e.message }));
    });
    ws.on('close', () => { clearTimeout(attenteOuverture); vue?.clientParti(ws); });
  }

  function creerVue({ user, compte, plateforme, lang, ws, envoyer, largeur, hauteur, dpr }) {
    const def = DEFINITIONS[plateforme];
    let txt = MESSAGES[lang];
    // (01/11) Le canal vers le téléphone change quand la personne revient (reprendre) ; null = parti, page en attente.
    let canal = { ws, envoyer };
    let dims = { largeur, hauteur, dpr };
    const dire = (o) => canal?.envoyer(o);
    let cdp = null;
    let cible = null;          // { targetId, sessionId, mainFrame } — la page de connexion
    const fenetres = [];       // fenêtres ouvertes par la page (Apple, Google…), la dernière est affichée
    let active = null;         // la cible dont on envoie les images
    let numero = 0, enVol = 0, enAttente = null;
    let finie = false, connectee = false;
    let dernierGeste = Date.now();
    const debut = Date.now();
    let sonde = null, arreterEcoute = null, attenteRetour = null;
    let ligneJournal = null;
    let permisesAvant = null;  // (30/10) les plateformes joignables avant CE « Me connecter » (verrou du relais)
    const retours = [];        // (01/11) les retours déclarés par la plateforme aux fournisseurs (retourDeclare)
    let derniereLecture = 0;   // (01/11) la dernière lecture du compte
    let dernierAvis = null;    // (01/11) le dernier message d'attente dit (une fois par état, jamais toutes les 2 s)
    let derniereEtape = { etape: 'demarrage', message: txt.demarrage };

    const refusNavigation = []; // instants des derniers refus de navigation (garde anti-boucle)
    const sessionDe = (sid) => [cible, ...fenetres].find((c) => c?.sessionId === sid) ?? null;
    const etat = (etape, message) => { derniereEtape = { etape, message }; dire({ t: 'etat', etape, message }); };
    const avis = (cle, message) => { if (dernierAvis === cle) return; dernierAvis = cle; etat('info', message); };

    async function preparerCible(c) {
      const s = c.sessionId;
      await cdp.send('Page.enable', {}, s);
      const { frameTree } = await cdp.send('Page.getFrameTree', {}, s);
      c.mainFrame = frameTree?.frame?.id ?? c.targetId;
      await appliquerFormat(c);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s).catch(() => {});
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, s).catch(() => {});
      // Seuls les documents PRINCIPAUX sont filtrés : les cadres (captcha, bouton Google…) passent.
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] }, s);
    }

    const appliquerFormat = (c) => cdp.send('Emulation.setDeviceMetricsOverride', { width: dims.largeur, height: dims.hauteur,
      deviceScaleFactor: dims.dpr, mobile: true, screenWidth: dims.largeur, screenHeight: dims.hauteur }, c.sessionId);

    async function diffuser(c) {
      if (active && active !== c) await cdp.send('Page.stopScreencast', {}, active.sessionId).catch(() => {});
      active = c;
      if (!canal) return;      // personne ne regarde : aucune image (la reprise relance la diffusion)
      // (01/11, « propre et fluide ») Les images au plus en 2× : nettes sur un téléphone 3×, et deux fois plus
      // légères qu'en 3× (le téléphone les agrandit). La page, elle, garde la densité du téléphone (deviceScaleFactor).
      const echelle = Math.min(dims.dpr, ECHELLE_IMAGES_MAX);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: Math.round(dims.largeur * echelle), maxHeight: Math.round(dims.hauteur * echelle), everyNthFrame: 1 }, c.sessionId);
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
        const url = p.request?.url;
        // (01/11) Une page de connexion d'un fournisseur dit où elle renverra (redirect_uri, choisi par la plateforme) :
        // ce retour exact est permis pour la suite de CE « Me connecter ».
        const r = principal ? retourDeclare(url) : null;
        if (r && !retours.some((x) => x.hote === r.hote && x.chemin === r.chemin)) {
          retours.push(r);
          journal.info('connexion_retour_declare', { user, plateforme, vers: `${r.hote}${r.chemin}`.slice(0, 160) });
        }
        if (!principal || navigationPermise(plateforme, url, retours)) {
          return cdp.send('Fetch.continueRequest', { requestId: p.requestId }, m.sessionId).catch(() => {});
        }
        journal.info('connexion_navigation_refusee', { user, plateforme, vers: urlPourJournal(url) });
        await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {});
        // (01/11) Connectée : la page reste où elle est (aucun retour forcé à la connexion, aucune boucle).
        if (connectee) return;
        // (05/10) JAMAIS DE BOUCLE : la page de connexion qui redirige elle-même
        // hors de la liste (Vinted : /member/signup → /member/register) était
        // renvoyée 4 à 5 fois par seconde, sans fin. Au REFUS_MAX-ième refus en
        // REFUS_FENETRE_MS, on arrête et on le dit ; l'alerte part au journal.
        const t = Date.now();
        refusNavigation.push(t);
        while (refusNavigation.length && t - refusNavigation[0] > REFUS_FENETRE_MS) refusNavigation.shift();
        if (refusNavigation.length >= REFUS_MAX) {
          journal.alerte('connexion_boucle', { user, plateforme, vers: urlPourJournal(url), refus: refusNavigation.length });
          etat('erreur', txt.boucle(def.nom));
          return fermer('boucle');
        }
        etat('info', txt.bloquee);
        if (c === cible) await cdp.send('Page.navigate', { url: def.pageConnexion }, cible.sessionId).catch(() => {});
        else await cdp.send('Target.closeTarget', { targetId: c.targetId }).catch(() => {});
        return;
      }
      if (m.method === 'Page.javascriptDialogOpening') {
        return cdp.send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {});
      }
      if (m.method === 'Target.targetCreated' && p.targetInfo?.type === 'page'
          && ouverteParLaConnexion(p.targetInfo, [cible?.targetId, ...fenetres.map((f) => f.targetId)])) {
        const sessionId = await cdp.send('Target.attachToTarget', { targetId: p.targetInfo.targetId, flatten: true }).then((r) => r.sessionId).catch(() => null);
        if (!sessionId) return;
        const f = { targetId: p.targetInfo.targetId, sessionId };
        fenetres.push(f);
        await preparerCible(f).catch(() => {});
        if (!navigationPermise(plateforme, p.targetInfo.url || 'about:blank', retours)) {
          journal.info('connexion_fenetre_refusee', { user, plateforme, vers: urlPourJournal(p.targetInfo.url) });
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

    /** (01/11) Le compte, lu dans la page de connexion (rien hors du site de la plateforme). */
    async function lireCompte() {
      const expression = expressionLectureCompte(plateforme);
      if (!expression || !cible) return { ok: false, http: 0, motif: 'sans_lecture' };
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, cible.sessionId).catch(() => null);
      return verdictLectureCompte(r?.result?.value);
    }

    async function verifierConnexion(manuel = false) {
      if (finie) return;
      if (Date.now() - debut > DUREE_MAX_MS || Date.now() - dernierGeste > INACTIVITE_MS) {
        if (connectee) return terminer();   // vérifiée : la fin dit « connecté », jamais « fermé faute de geste »
        etat('expire', txt.expire);
        return fermer('expiree');
      }
      // (01/11) Déjà vérifiée : la page reste ouverte pour les étapes de la plateforme ; « J'ai fini » ferme.
      if (connectee) { if (manuel) terminer(); return; }
      const { cookies } = await cdp.send('Storage.getCookies');
      if (!estConnectee(cookies, plateforme)) {
        if (manuel) etat('info', txt.pasConnecte(def.nom));
        return;
      }
      // Les cookies ne font que déclencher : seule la lecture du compte prouve la connexion.
      if (!manuel && Date.now() - derniereLecture < LECTURE_COMPTE_MS) return;
      derniereLecture = Date.now();
      const v = await lireCompte();
      if (!v.ok) {
        if (dernierAvis !== `lu:${v.motif}`) journal.info('connexion_compte_non_lu', { user, plateforme, http: v.http, motif: v.motif });
        if (manuel) { dernierAvis = null; }
        avis(`lu:${v.motif}`, txt.etapes(def.nom));
        return;
      }
      connectee = true;
      const preuve = { le: new Date().toISOString(), http: v.http };
      const bilan = await coffre.sauvegarderCookies(user, cookies, { verifiees: [plateforme], preuves: { [plateforme]: preuve } })
        .catch((e) => ({ erreur: e.message }));
      const ident = identifiantCompte(cookies, plateforme);
      let refus = null;
      if (ident) {
        const { data } = await base.rpc('cloud_essai_noter_compte_plateforme', { p_user: user, p_plateforme: plateforme, p_identifiant: ident });
        if (data && data.ok === false && data.raison === 'compte_plateforme_deja_vu') refus = data;
      }
      if (refus) {
        await annulerEssai(user).catch((e) => journal.erreur('annulation_essai_echec', { user, erreur: e.message }));
        etat('refuse', txt.refuse(def.nom));
        journal.alerte('essai_refuse_compte_plateforme', { user, plateforme });
        await journaliser('refusee', 'compte_plateforme_deja_vu');
        setTimeout(() => fermer('refusee'), 1500);
        return;
      }
      journal.info('connexion_verifiee', { user, plateforme, http: v.http, coffre: bilan });
      await journaliser('connectee', null);
      try { surVerifiee?.({ user, plateforme, http: v.http, le: preuve.le }); } catch { /* le journal de l'essai ne bloque rien */ }
      if (manuel) return terminer();
      etat('verifie', txt.verifie(def.nom));
    }

    let terminee = false;
    function terminer() {
      if (finie || terminee) return;
      terminee = true;
      etat('connecte', txt.connecte(def.nom));
      setTimeout(() => fermer('connectee'), 1500);
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
      const { error } = await base.from('cloud_connexions').update({ statut, close_le: new Date().toISOString(), raison }).eq('id', ligneJournal);
      if (error) journal.alerte('connexion_journal_echec', { user, plateforme, erreur: error.message });
    }

    async function demarrer() {
      etat('demarrage', txt.demarrage);
      // (01/11) Une ligne refusée par la base (Depop absent de la contrainte de cloud_connexions, 01/11) se DIT.
      const { data: ligne, error } = await base.from('cloud_connexions').insert({ user_id: user, plateforme, statut: 'ouverte' }).select('id').maybeSingle();
      if (error) journal.alerte('connexion_journal_echec', { user, plateforme, erreur: error.message });
      ligneJournal = ligne?.id ?? null;
      let h = navigateurs.ouvert(user);
      if (!h) h = await postes.ouvrir(user, compte, 'connexion');
      // (30/10, règle de Nico) Le verrou du relais : la plateforme de CE « Me connecter » devient joignable, en plus des
      // connectées, AVANT toute navigation ; une fermeture sans connexion la referme (fermer).
      permisesAvant = [...(h.permises ?? compte?.plateformes_connectees ?? [])];
      await navigateurs.permettre?.(user, [...permisesAvant, plateforme]);
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
      etat('pret', txt.pret);
      sonde = setInterval(() => { verifierConnexion().catch((e) => journal.alerte('connexion_sonde_echec', { erreur: e.message })); }, SONDE_MS);
      journal.info('connexion_ouverte', { user, plateforme });
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
      if (m.t === 'toucher') {
        const x = borne(m.x, 0, dims.largeur), y = borne(m.y, 0, dims.hauteur);
        const type = { debut: 'touchStart', deplacer: 'touchMove', fin: 'touchEnd' }[m.type];
        if (!type) return;
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] }, s);
        if (type === 'touchEnd') {
          setTimeout(async () => {
            const r = await cdp.send('Runtime.evaluate', { expression: ACTIF_EDITABLE, returnByValue: true }, s).catch(() => null);
            dire({ t: 'clavier', ouvert: r?.result?.value === true });
          }, 350);
        }
        return;
      }
      if (m.t === 'molette') {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: borne(m.x, 0, dims.largeur), y: borne(m.y, 0, dims.hauteur), deltaX: 0, deltaY: borne(m.dy, -2000, 2000) }, s);
        return;
      }
      // (01/11) Le clavier passe dans UNE file, dans l'ordre de la frappe : deux messages rapprochés (une lettre puis
      // effacer, un appui long) ne s'entrelacent jamais chez le navigateur.
      if (m.t === 'texte' || m.t === 'touche') {
        const passe = fileClavier.then(() => frappe(m, s));
        fileClavier = passe.catch(() => {});
        return passe;
      }
      if (m.t === 'termine') return verifierConnexion(true);
      if (m.t === 'fermer') return fermer('client');
    }

    let fileClavier = Promise.resolve();
    async function frappe(m, s) {
      if (finie) return;
      if (m.t === 'texte') {
        const t = String(m.s ?? '').slice(0, 500);
        if (t) await cdp.send('Input.insertText', { text: t }, s);
        return;
      }
      const suite = Object.hasOwn(TOUCHES, m.cle) ? TOUCHES[m.cle] : null;
      if (!suite) return;
      const n = Math.min(Math.max(1, Math.trunc(Number(m.n) || 1)), 50);   // un appui long sur effacer : n fois
      for (let i = 0; i < n; i++) {
        for (const k of suite) {
          // Sans texte : rawKeyDown (comme Puppeteer) ; Entrée porte son « \r ».
          await cdp.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...k }, s);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, ...(k.modifiers ? { modifiers: k.modifiers } : {}) }, s);
        }
      }
    }

    /** (01/11) Le téléphone est parti sans « Fermer » (app quittée, réseau coupé) : la page attend son retour. */
    function clientParti(w) {
      if (finie || !canal || canal.ws !== w) return;
      canal = null;
      enVol = 0; enAttente = null;
      if (active) cdp?.send('Page.stopScreencast', {}, active.sessionId).catch(() => {});
      journal.info('connexion_en_attente', { user, plateforme, connectee });
      attenteRetour = setTimeout(() => fermer('client_parti'), REPRISE_MS);
      attenteRetour.unref?.();
    }

    /** (01/11) Le même « Me connecter » rouvert pendant l'attente (ou pendant qu'il tourne : un autre écran) : il reprend. */
    const reprenable = (p) => !finie && p === plateforme && Boolean(cible);
    async function reprendre({ ws: w, envoyer: e, lang: l, largeur: lg, hauteur: ht, dpr: d }) {
      clearTimeout(attenteRetour); attenteRetour = null;
      const ancien = canal?.ws;
      canal = { ws: w, envoyer: e };
      if (ancien && ancien !== w) { try { ancien.close(4409, 'repris ailleurs'); } catch { /* déjà fermé */ } }
      txt = MESSAGES[l === 'en' ? 'en' : 'fr'];
      dernierGeste = Date.now();
      enVol = 0; enAttente = null;
      const changees = lg !== dims.largeur || ht !== dims.hauteur || d !== dims.dpr;
      dims = { largeur: lg, hauteur: ht, dpr: d };
      if (changees) for (const c of [cible, ...fenetres].filter(Boolean)) await appliquerFormat(c).catch(() => {});
      await diffuser(active ?? cible).catch(() => {});
      journal.info('connexion_reprise', { user, plateforme, connectee });
      dire({ t: 'etat', etape: 'pret', message: txt.reprise });
      if (connectee) dire({ t: 'etat', etape: 'verifie', message: txt.verifie(def.nom) });
      else if (derniereEtape.etape === 'info' && dernierAvis) dire({ t: 'etat', etape: 'info', message: derniereEtape.message });
    }

    function fermer(raison) {
      if (finie) return;
      finie = true;
      clearInterval(sonde);
      clearTimeout(attenteRetour);
      if (actives.get(user) === vue) actives.delete(user);
      arreterEcoute?.();
      const h = navigateurs.ouvert(user);
      // (01/11) Connectée : les cookies de la fin (étape du téléphone faite après la vérification, jetons tournés)
      // rejoignent le coffre AVANT que la page ne se ferme.
      const avantFermeture = connectee && h
        ? h.cdp.send('Storage.getCookies').then(({ cookies }) => coffre.sauvegarderCookies(user, cookies))
          .catch((e) => journal.alerte('sauvegarde_fin_connexion_echec', { user, plateforme, erreur: e.message }))
        : Promise.resolve();
      const cibles = [...fenetres, cible].filter(Boolean);
      avantFermeture.finally(() => { for (const c of cibles) cdp?.send('Target.closeTarget', { targetId: c.targetId }).catch(() => {}); });
      if (!connectee) journaliser(raison === 'expiree' ? 'abandonnee' : raison === 'erreur' ? 'erreur' : 'abandonnee', raison).catch(() => {});
      // (30/10) Sans connexion, la plateforme redevient fermée ; connectée, elle reste joignable (son coffre fait foi).
      // (01/11) Et la demi-session de cette plateforme (cookies d'une connexion jamais vérifiée) part du profil — sauf si
      // elle était déjà connectée avant ce « Me connecter » (« Reconnecter » abandonné : sa connexion reste).
      if (!connectee && permisesAvant) {
        const etaitConnectee = permisesAvant.includes(plateforme);
        Promise.resolve().then(() => navigateurs.permettre?.(user, permisesAvant))
          .then(() => (etaitConnectee ? 0 : postes.purgerPlateforme?.(user, plateforme)))
          .catch((e) => journal.alerte('verrou_retour_echec', { user, plateforme, erreur: e.message }));
      }
      journal.info('connexion_fermee', { user, plateforme, raison, connectee, duree_s: Math.round((Date.now() - debut) / 1000) });
      const w = canal?.ws;
      canal = null;
      try { if (w?.readyState === 1) w.close(1000); } catch { /* déjà fermé */ }
    }

    const vue = { demarrer, geste, fermer, clientParti, reprenable, reprendre, user };
    return vue;
  }

  return { brancher, connexionsOuvertes: () => new Set(actives.keys()), fermerTout: () => { for (const v of actives.values()) v.fermer('arret_serveur'); } };
}
