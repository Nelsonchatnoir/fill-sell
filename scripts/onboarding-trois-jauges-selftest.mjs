// ═══════════════════════════════════════════════════════════════════════════
// LE PARCOURS D'ENTRÉE — GRILLE À 3 JAUGES ET VOIE FILLSELL CLOUD (04/11/2026, lot 3)
//     npm run selftest:onboarding-trois-jauges
//     (node scripts/onboarding-trois-jauges-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Maquettes validées par Nico le 03/11 : o-parcours, o-voie (v3), o-cloud-essai, o-cloud-connexion (v3),
// o-extension, o-releve, o-remontees, o-free, o-fin. Écrans RENDUS côté serveur (Vite SSR + react-dom/server,
// comme cout-publication), sans réseau ni base ; les règles pures (plan.js, entree/regles.js) EXÉCUTÉES.
// Ce qu'il prouve :
//   1. les étapes visibles selon téléphone / ordinateur × Cloud visible / invisible × grille 0 / 1 × voie Cloud /
//      extension — et, à 0 Cloud fermé, la liste d'avant, dans l'ordre ;
//   2. les textes clés de chaque écran neuf ou réécrit, fr et en, chiffres LUS dans coin_config ;
//   3. avec la grille, plus aucune promesse d'automatique au Free (« toutes seules » = le Pro seulement) ;
//   4. aucun « 20 € » ni « 24,99 » écrit en dur dans src/entree/ (le prix vient de CLOUD_PRIX_AFFICHE) ;
//   5. rien de neuf à 0 : le parcours entier rendu étape par étape, sans un mot neuf, Cloud fermé même avec l'achat
//      passé par l'hôte ;
//   6. les garde-fous : étapes passables sauf le récap, drapeau onboarded_at, télémétrie historique, 44 px, animations
//      transform/opacity, achat par le chemin existant, z-index pendant l'achat.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 900)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESP, ' ');
const texte = (html) => net(String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
// Le code sans ses commentaires (lignes //, blocs /* */ et {/* */}).
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n').map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, '$1')).join('\n');

// La grille posée en base le 04/11 (migration 20261104000000_trois_jauges_interrupteur), interrupteur levé.
const K1 = {
  grille_trois_jauges: 1, jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0, jauge_lens_business: 600,
};
const K0 = { ...K1, grille_trois_jauges: 0 };
const MAINTENANT = Date.parse('2026-11-03T12:00:00.000Z');   // essai jusqu'au 10 novembre (Paris)

globalThis.document ??= { body: {} };
let magasin = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k) => (k in magasin ? magasin[k] : null), setItem: (k, v) => { magasin[k] = String(v); }, removeItem: (k) => { delete magasin[k]; } },
  configurable: true, writable: true,
});

const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const P = await vite.ssrLoadModule('/src/entree/plan.js');
  const R = await vite.ssrLoadModule('/src/entree/regles.js');
  const TX = await vite.ssrLoadModule('/src/entree/textes.js');
  const PAL = await vite.ssrLoadModule('/src/utils/palier.js');
  const CR = await vite.ssrLoadModule('/src/cloud/regles.js');
  const CFG = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const PE = await vite.ssrLoadModule('/src/entree/ParcoursEntree.jsx');
  const E = {};
  for (const n of ['EtapeVoie', 'EtapeCloud', 'EtapeCloudConnexion', 'EtapeExtension', 'EtapeReleve', 'EtapeDebut', 'EtapeRepublication', 'EtapeFree', 'EtapeFin']) {
    E[n] = await vite.ssrLoadModule(`/src/entree/${n}.jsx`);
  }
  const PRIX = PAL.CLOUD_PRIX_AFFICHE;

  // ── Les contextes ──────────────────────────────────────────────────────────────────────────────────────────
  const LECTURE_ESSAI = { etat: 'ok', cloud: { etat: 'aucun', essaiPris: false, actif: false }, luLe: MAINTENANT, relire() {} };
  const LECTURE_ACTIVE = { etat: 'ok', cloud: { etat: 'essai', essaiPris: true, actif: true, essaiFin: '2026-11-10T12:00:00.000Z' }, luLe: MAINTENANT, relire() {} };
  const cloudObjet = ({ parcours = false, actif = false, achat = { etat: 'repos', message: null }, fermee = false, inscrit = false, cx = null, lang = 'fr' } = {}) => ({
    ouvert: parcours, parcours, actif, lecture: actif ? LECTURE_ACTIVE : LECTURE_ESSAI, offre: actif ? null : { essai: true },
    vente: { fermee, dispo: fermee ? { vente: false, inscrit, rang: inscrit ? 3 : null } : null, inscrire: async () => true },
    achat, lancerEssai: async () => 'actif',
    dates: R.datesEssai(MAINTENANT, lang),
    essaiFinCourt: actif ? R.dateCourte('2026-11-10T12:00:00.000Z', lang) : null,
    connexions: cx ?? { etat: 'lecture', lignes: [], ebayRelie: null, relire() {}, connectees: 0, total: 0 },
  });
  const ctx = (o = {}) => {
    const lang = o.lang ?? 'fr';
    const grille = o.grille ?? false;
    const K = grille ? (o.K ?? K1) : null;
    const cloud = o.cloud ?? cloudObjet({ lang });
    const voie = o.voie ?? null;
    return {
      lang, fr: lang !== 'en', user: { id: 'u1', email: 'camille@exemple.fr' }, demanderPseudo: o.pseudo ?? true, surTelephone: o.tel ?? true,
      choix: o.choix ?? { plateformes: ['vinted', 'leboncoin'], debute: false }, majChoix() {}, enregistrerPlateformes() {},
      extensionVue: false, syncMultiOuverte: true, envoi: { etat: o.envoi ?? 'idle', email: 'camille@exemple.fr', envoyeA: 0, raison: null },
      secondesRestantes: 0, envoyerLien: async () => ({ ok: true }), releve: o.releve ?? { etat: 'idle' }, lancerReleve: async () => {},
      murs: [], releveVinted: null, ebayRelie: o.ebayRelie ?? false, setEbayRelie() {}, journaliser() {}, jetonRef: { current: null },
      plateformesFermees: o.fermees ?? [],
      K, grille: R.planEntree(K, 'gratuit') != null, plan: R.planEntree(K, o.palier ?? 'gratuit'), palier: o.palier ?? 'gratuit',
      voie, choisirVoie() {}, cloud, cloudChoisi: cloud.parcours && voie === 'cloud', cloudPris: cloud.parcours && voie === 'cloud' && cloud.actif,
      plateforme: o.plateforme ?? 'ios',
    };
  };
  const props = { pseudo: '', setPseudo() {}, onSuivant() {}, onAller() {}, onTerminer() {} };
  const rendre = (n, c) => renderToStaticMarkup(h(E[n].default, { c, T: TX.textesEntree(c.lang), ...props }));
  // Les coches (✓) sont décoratives (aria-hidden) : le texte lu ne les garde pas.
  const lu = (n, c) => texte(rendre(n, c)).replace(/✓ ?/g, '');

  // ── 1. Les étapes visibles ─────────────────────────────────────────────────────────────────────────────────
  console.log('1. Les étapes visibles (téléphone / ordinateur × Cloud visible / invisible × grille 0 / 1 × voie)');
  {
    const AVANT = ['plateformes', 'extension', 'releve', 'republication', 'pseudo', 'fin'];
    const liste = ({ tel, visible, grille, voie = null, actif = false, palier = 'gratuit', choix = { plateformes: ['vinted', 'leboncoin'], debute: false } }) => {
      const lecture = actif ? LECTURE_ACTIVE : LECTURE_ESSAI;
      const parcours = R.parcoursCloud({ ouvert: tel && visible, lecture, voie, actif });
      return P.etapesVisibles({ choix, demanderPseudo: true, cloud: { parcours, actif }, voie, plan: R.planEntree(grille ? K1 : K0, palier) }).map((e) => e.id);
    };
    const avec = (base, grille) => (grille ? [...base.slice(0, -2), 'free', ...base.slice(-2)] : base);
    for (const grille of [false, true]) {
      for (const tel of [true, false]) {
        for (const visible of [false, true]) {
          for (const voie of [null, 'cloud', 'extension']) {
            for (const actif of voie === 'cloud' ? [false, true] : [false]) {
              const ids = liste({ tel, visible, grille, voie, actif });
              let attendu;
              if (!tel || !visible) attendu = AVANT;
              else if (voie === 'cloud') attendu = ['plateformes', 'voie', 'cloud', ...(actif ? ['cloud_connexion'] : []), 'releve', 'republication', 'pseudo', 'fin'];
              else attendu = ['plateformes', 'voie', 'extension', 'releve', 'republication', 'pseudo', 'fin'];
              attendu = avec(attendu, grille);
              ok(JSON.stringify(ids) === JSON.stringify(attendu),
                `${tel ? 'téléphone' : 'ordinateur'}, Cloud ${visible ? 'visible' : 'invisible'}, grille ${grille ? 1 : 0}, voie ${voie ?? 'à choisir'}${voie === 'cloud' ? (actif ? ' (essai actif)' : ' (essai pas encore pris)') : ''} : ${ids.join(' → ')}`,
                `attendu ${attendu.join(' → ')}`);
            }
          }
        }
      }
    }
    // À 0, Cloud fermé : la liste d'AVANT, dans l'ordre, pour chaque réponse à « Où tu vends ? ».
    const histo = (choix, pseudo) => P.etapesVisibles({ choix, demanderPseudo: pseudo, cloud: { parcours: false, actif: false }, voie: null, plan: null }).map((e) => e.id).join(',');
    ok(histo({ plateformes: ['vinted', 'ebay'], debute: false }, true) === 'plateformes,ebay,extension,releve,republication,pseudo,fin', 'à 0 : eBay coché → plateformes, ebay, extension, releve, republication, pseudo, fin (comme avant)');
    ok(histo({ plateformes: [], debute: true }, false) === 'plateformes,extension,debut,republication,fin', 'à 0 : rien en ligne, nom connu → plateformes, extension, debut, republication, fin (comme avant)');
    ok(histo({ plateformes: ['beebs'], debute: false }, false) === 'plateformes,extension,releve,republication,fin', 'à 0 : sans eBay ni pseudo → plateformes, extension, releve, republication, fin');
    // Un contexte À L'ANCIENNE (sans aucune clé neuve) voit aussi la liste d'avant.
    ok(P.etapesVisibles({ choix: { plateformes: ['vinted'], debute: false }, demanderPseudo: true }).map((e) => e.id).join(',') === 'plateformes,extension,releve,republication,pseudo,fin', 'un contexte sans les clés neuves : la liste d’avant');
    ok(!liste({ tel: true, visible: true, grille: true, palier: 'premium' }).includes('free') && liste({ tel: false, visible: false, grille: true }).includes('free'),
      '« Ton plan Free » : avec la grille et pour un compte Free seulement — aussi sur ordinateur, jamais pour un Premium');
    ok(liste({ tel: true, visible: true, grille: false, voie: 'cloud', choix: { plateformes: [], debute: true } }).join(',') === 'plateformes,voie,cloud,debut,republication,pseudo,fin', 'voie Cloud et rien en ligne : « Je débute » après l’essai');
    // La règle de la voie Cloud, ses bords.
    const pc = (o) => R.parcoursCloud({ ouvert: true, voie: null, actif: false, ...o });
    ok(pc({ lecture: LECTURE_ESSAI }) && !pc({ lecture: { etat: 'lecture' } }) && !pc({ lecture: { etat: 'echec' } }) && !R.parcoursCloud({ ouvert: false, lecture: LECTURE_ESSAI, voie: 'cloud', actif: true }),
      'parcoursCloud : seulement une lecture SÛRE d’un essai proposable (en lecture, en échec, fermé : rien)');
    ok(!pc({ lecture: { etat: 'ok', cloud: { etat: 'essai_termine', essaiPris: true, actif: false } } }) && !pc({ lecture: LECTURE_ACTIVE }),
      'parcoursCloud : essai déjà pris, option déjà active sans choix : pas de voie (jamais un essai promis à tort)');
    ok(pc({ lecture: LECTURE_ACTIVE, voie: 'cloud', actif: true }) && pc({ lecture: { etat: 'lecture' }, voie: 'extension' }),
      'parcoursCloud : reste vraie une fois l’essai pris sur la voie, et pendant la relecture d’un choix déjà fait (reprise)');
    ok(P.ETAPES.filter((e) => e.passable === false).map((e) => e.id).join(',') === 'fin', 'chaque étape est passable (« Passer »), sauf le récap');
  }

  // ── 2. Les textes clés ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\n2. Les textes clés (maquettes du 03/11)');
  const P_FR = net(PRIX);
  {
    const cV = ctx({ cloud: cloudObjet({ parcours: true }) });
    const v = lu('EtapeVoie', cV);
    const vHtml = rendre('EtapeVoie', cV);
    ok(/L.étape qui compte Comment tu veux publier \?/.test(v) && /Tes annonces doivent être déposées sur chaque plateforme, avec ton compte\. i Choisis qui s.en charge : tu pourras changer plus tard\./.test(v),
      'voie : titre, phrase et son point « i »', v.slice(0, 300));
    ok(/7 jours offerts FillSell Cloud Tout depuis ton téléphone Sans ordinateur\. FillSell publie, remonte et retire tes annonces Vinted, Leboncoin, Beebs et Depop depuis ses serveurs, même quand tout est éteint\./.test(v),
      'voie : la carte Cloud devant, pastille « 7 jours offerts », plateformes lues dans config/cloudOffer.js', v);
    ok(v.includes('Rien à installer Ventes vues en direct Sans engagement Essayer 7 jours offerts') && v.includes(`Puis ${P_FR}/mois. Tu l'arrêtes en un geste, on te prévient la veille.`),
      `voie : « Essayer 7 jours offerts » et « Puis ${P_FR}/mois » (CLOUD_PRIX_AFFICHE)`, v);
    ok(/Extension Chrome Sur ton ordinateur, gratuit Installée une fois dans Chrome, elle dépose tes annonces avec tes comptes déjà connectés\. Ton ordinateur doit être allumé pour publier\. Utiliser mon ordinateur Gratuite, sans carte, pour toujours\./.test(v),
      'voie : l’extension en alternative claire, avec SON bouton', v);
    ok(/Tu pourras passer de l.un à l.autre dans Réglages, quand tu veux\./.test(v) && !/aria-checked="true"|aria-pressed="true"/.test(vHtml) && (vHtml.match(/<button/g) || []).length === 3,
      'voie : rien de pré-coché, trois boutons (le « i », le Cloud, l’extension)');
    ok(/aria-label="Il te faut déjà un compte sur chaque plateforme"/.test(vHtml) && /width:20px;height:20px/.test(vHtml) && /position:absolute;inset:-12px/.test(vHtml),
      'voie : le point « i » dessiné à 20 px, zone tactile 20 + 2 × 12 = 44 px, nommé pour les lecteurs d’écran');
    ok(!/data-entree="info-voie"/.test(vHtml), 'voie : la petite fenêtre est fermée à l’arrivée');
    const info = texte(renderToStaticMarkup(h(E.EtapeVoie.FenetreInfo, { T: TX.textesEntree('fr'), onFermer() {} })));
    ok(/Il te faut déjà un compte sur chaque plateforme FillSell se connecte à tes comptes Vinted, Leboncoin, Beebs, Depop ou eBay déjà créés\. Il ne crée pas de compte à ta place\./.test(info)
      && /Pas encore de compte sur l.une d.elles \? Crée-le d.abord sur la plateforme, puis reviens : rien n.est perdu, tu la connecteras plus tard\./.test(info)
      && /Avec le Cloud, tu te connectes sur la page de connexion de la plateforme\. Avec l.extension, FillSell utilise les comptes déjà ouverts dans Chrome\. Compris$/.test(info),
    'la fenêtre du « i » : les trois phrases, mot pour mot, et « Compris »', info);
    const vEn = lu('EtapeVoie', ctx({ lang: 'en', cloud: cloudObjet({ parcours: true, lang: 'en' }) }));
    ok(/How do you want to post\?/.test(vEn) && /Try 7 days free/.test(vEn) && /Use my computer/.test(vEn) && !/ordinateur|annonces|Réglages|offerts/.test(vEn), 'voie en anglais : aucun mot français', vEn);
  }
  {
    // L'essai : la date vient de maintenant + 7 jours, comme la feuille des formules.
    const attendu = CR.dateLongue(CR.finEssaiSiOnCommence(MAINTENANT), 'fr');
    ok(attendu === '10 novembre' && R.datesEssai(MAINTENANT, 'fr').jourVeille === 'Lundi 9 novembre' && R.datesEssai(MAINTENANT, 'fr').jourFin === 'Mardi 10 novembre',
      'les dates de l’essai : finEssaiSiOnCommence (maintenant + 7 jours, heure de Paris), la veille et le jour de bascule', JSON.stringify(R.datesEssai(MAINTENANT, 'fr')));
    const cC = (o = {}) => ctx({ voie: 'cloud', cloud: cloudObjet({ parcours: true, ...o }), grille: o.grille ?? true, plateforme: o.plateforme ?? 'ios' });
    const e = lu('EtapeCloud', cC());
    ok(/FillSell Cloud · 7 jours offerts Rien à payer avant le 10 novembre Pendant 7 jours, tes annonces partent de nos serveurs, pilotées depuis ton téléphone\. Tu ne paies que si tu continues\./.test(e),
      'essai : la date de bascule EST le titre', e.slice(0, 260));
    ok(e.includes(`Aujourd'hui Carte demandée, 0 € prélevé. Lundi 9 novembre On te prévient, dans l'app et par e-mail. Mardi 10 novembre ${P_FR}/mois, sauf si tu arrêtes avant. Sans engagement.`),
      'essai : la frise — aujourd’hui, la veille (le rappel), la bascule avec le prix', e);
    ok(/Ce que fait le Cloud Vinted, Leboncoin, Beebs et Depop : publiés, remontés et retirés après une vente, ordinateur éteint Tes ventes vues en direct, sur ton téléphone eBay part déjà de nos serveurs, pour tout le monde Tes quotas restent ceux de ton plan : en Free, 5 annonces, 50 publications et 30 remontées par mois/.test(e),
      'essai : « Ce que fait le Cloud », la dernière ligne dit les quotas Free (lus dans coin_config)', e);
    ok(/Commencer mes 7 jours offerts L.essai passe par l.App Store : tu l.arrêtes aussi dans tes abonnements Apple\. Je préfère utiliser mon ordinateur$/.test(e), 'essai (iPhone) : le bouton, la ligne App Store, « Je préfère utiliser mon ordinateur »', e.slice(-220));
    ok(/L.essai passe par Google Play : tu l.arrêtes aussi dans tes abonnements Google Play\./.test(lu('EtapeCloud', cC({ plateforme: 'android' })))
      && /L.essai passe par une page de paiement sécurisée : tu l.arrêtes en un geste dans Réglages › Abonnement\./.test(lu('EtapeCloud', cC({ plateforme: 'web' }))),
    'essai : la ligne du canal suit la plateforme (Google Play, web)');
    const k40 = { ...K1, jauge_remontees_free: 40 };
    ok(/en Free, 5 annonces, 50 publications et 40 remontées par mois/.test(lu('EtapeCloud', { ...cC(), K: k40, grille: true })), 'essai : les quotas suivent coin_config (40 remontées si la base dit 40)');
    // (05/11 soir, décision l) Entre la carte et le bouton : les mentions d'abonnement (renouvellement, EULA, confidentialité).
    ok(/Tes quotas restent ceux de ton plan (Abonnements à renouvellement automatique : .*?Politique de confidentialité )?Commencer/.test(lu('EtapeCloud', cC({ grille: false }))) && !/\d+ annonces/.test(lu('EtapeCloud', cC({ grille: false }))), 'essai sans la grille : « Tes quotas restent ceux de ton plan », sans chiffre');
    ok(/On prépare ta place…/.test(lu('EtapeCloud', cC({ achat: { etat: 'en_cours', message: null } }))), 'essai en cours : le mot de l’achat existant (« On prépare ta place… »)');
    ok(/Toutes les places FillSell Cloud sont prises/.test(lu('EtapeCloud', cC({ achat: { etat: 'refuse', message: 'Toutes les places FillSell Cloud sont prises pour l\'instant. Rien n\'a été demandé à ta carte.' } }))),
      'essai refusé : le message rendu par l’achat est dit à l’écran (le toast de l’app est sous le parcours)');
    const plein = lu('EtapeCloud', cC({ fermee: true }));
    ok(/FillSell Cloud Complet pour le moment Toutes les places FillSell Cloud sont prises\. Inscris-toi/.test(plein) && /Être prévenu\(e\) Je préfère utiliser mon ordinateur$/.test(plein)
      && !/Commencer|\/mois|Rien à payer|Carte demandée|App Store/.test(plein), 'toutes les places prises : la liste d’attente existante, jamais une vente (ni prix, ni frise, ni bouton d’achat)', plein);
    ok(/Tu es sur la liste \(n° 3\)/.test(lu('EtapeCloud', cC({ fermee: true, inscrit: true }))), 'liste d’attente : inscrit(e), son rang');
    const en = lu('EtapeCloud', { ...cC(), lang: 'en', cloud: cloudObjet({ parcours: true, lang: 'en' }) });
    ok(/Nothing to pay before 10 November/.test(en) && /Monday 9 November/.test(en) && !/novembre|ordinateur|Rien à/.test(en), 'essai en anglais : dates et mots anglais', en.slice(0, 400));
  }
  {
    const cx = (lignes, ebayRelie = false) => ({ etat: 'ok', lignes, ebayRelie, relire() {}, connectees: lignes.filter((l) => l.etat === 'connecte').length, total: lignes.length });
    const L4 = [{ id: 'vinted', nom: 'Vinted', etat: 'connecte', verif: null }, { id: 'leboncoin', nom: 'Leboncoin', etat: 'a_connecter', verif: null },
      { id: 'beebs', nom: 'Beebs', etat: 'a_connecter', verif: null }, { id: 'depop', nom: 'Depop', etat: 'a_connecter', verif: null }];
    const cX = ctx({ voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true, cx: cx(L4) }) });
    const x = lu('EtapeCloudConnexion', cX);
    ok(/Cloud activé · essai jusqu.au 10\/11 Connecte tes comptes, une fois La page de connexion de chaque plateforme s.ouvre ici\. Ensuite, FillSell publie depuis ses serveurs, même ordinateur éteint\./.test(x),
      'connexions : « Cloud activé · essai jusqu’au 10/11 » (la fin RÉELLE de l’essai), titre, phrase', x.slice(0, 260));
    ok(/Vinted Connecté Leboncoin/.test(x) && /Leboncoin À connecter Me connecter/.test(x) && /Beebs À connecter Me connecter/.test(x) && /Depop À connecter Me connecter/.test(x)
      && /eBay Par la connexion officielle d.eBay Relier eBay/.test(x) && x.indexOf('Vinted Connecté') < x.indexOf('Depop À connecter') && x.indexOf('Depop À connecter') < x.indexOf('Relier eBay'),
      'connexions : mêmes états et mêmes mots que « Me connecter » (Connecté, À connecter, Me connecter, Relier eBay)', x);
    ok(/Seule la page de connexion s.ouvre : connecte-toi avec ton compte déjà créé sur la plateforme, FillSell n.en crée pas\. Connecte une plateforme maintenant, les autres quand tu veux, dans Réglages › Mes plateformes\./.test(x)
      && /Continuer 1 plateforme connectée sur 4$/.test(x), 'connexions : la phrase v3 (« FillSell n’en crée pas »), « Continuer » et « 1 plateforme connectée sur 4 »', x.slice(-300));
    const html = rendre('EtapeCloudConnexion', cX);
    ok((html.match(/min-height:44px/g) || []).length >= 4, 'connexions : chaque bouton fait 44 px de haut');
    const L3 = L4.filter((l) => l.id !== 'leboncoin');
    ok(/sur 3$/.test(lu('EtapeCloudConnexion', ctx({ voie: 'cloud', fermees: ['leboncoin'], cloud: cloudObjet({ parcours: true, actif: true, cx: cx(L3) }) }))), 'connexions : Leboncoin fermé (adresse hors de France) → « sur 3 »');
    const verif = lu('EtapeCloudConnexion', ctx({ voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true, cx: cx([{ ...L4[0], verif: 'a_resoudre' }, ...L4.slice(1)], true) }) }));
    ok(/Vinted Vérification à résoudre Résoudre la vérification/.test(verif) && /eBay Relié par l.API eBay/.test(verif) && !/Relier eBay/.test(verif), 'connexions : la vérification à résoudre et eBay relié, comme « Me connecter »', verif);
    ok(/Lecture de tes connexions…/.test(lu('EtapeCloudConnexion', ctx({ voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true }) }))), 'connexions : en lecture, le mot de « Me connecter »');
    ok(/import \{ Vue \} from '\.\.\/cloud\/MeConnecterCloud'/.test(lire('src/entree/EtapeCloudConnexion.jsx')) && /useCallback\(\(connectee\) =>/.test(lire('src/entree/EtapeCloudConnexion.jsx')),
      'connexions : la page de connexion est la Vue de MeConnecterCloud (réutilisée, pas recopiée), refermée par un rappel STABLE');
  }
  {
    // L'extension, choisie (téléphone, Cloud visible) — et celle d'avant sinon.
    const choisie = lu('EtapeExtension', ctx({ voie: 'extension', cloud: cloudObjet({ parcours: true }) }));
    const htmlChoisie = rendre('EtapeExtension', ctx({ voie: 'extension', cloud: cloudObjet({ parcours: true }) }));
    ok(/^Extension Chrome · gratuite Ton ordinateur fait le travail/.test(choisie) && /Finalement, je n.ai pas d.ordinateur$/.test(choisie),
      'extension choisie : « Extension Chrome · gratuite », le lien « Finalement, je n’ai pas d’ordinateur »', choisie.slice(-200));
    ok(/Tu pilotes depuis ce téléphone\. Une extension Chrome, installée une fois sur ton ordinateur, dépose et relève tes annonces avec tes comptes déjà connectés — jamais tes mots de passe\./.test(choisie) && /M.envoyer le lien pour mon ordinateur/.test(choisie) && /Du téléphone à l.ordinateur/.test(choisie),
      'extension choisie : l’écran d’aujourd’hui au mot près (texte, bouton du lien, tuto)');
    const htmlAvant = rendre('EtapeExtension', ctx());
    ok(/depop/i.test(htmlChoisie) && !/depop/i.test(htmlAvant), 'extension choisie : Depop rejoint les logos du schéma (pas dans l’écran d’avant)');
    const src = sansCommentaires(lire('src/entree/EtapeExtension.jsx'));
    ok(/c\.surTelephone && \(voieFaite\s*\?[\s\S]*?extFinalement[\s\S]*?:\s*<VoieSansOrdinateur/.test(src), 'extension choisie : la rangée « Je n’ai pas d’ordinateur » (VoieSansOrdinateur) n’est rendue QUE hors de la voie (le choix est fait)');
    const avant = lu('EtapeExtension', ctx());
    ok(/^L.étape qui compte Ton ordinateur fait le travail/.test(avant) && !/Finalement|Extension Chrome · gratuite/.test(avant), 'Cloud invisible : l’étape extension d’avant (kicker, pas de lien de retour)', avant.slice(0, 120));
  }
  {
    const cP = ctx({ voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true }), grille: true });
    const r = lu('EtapeReleve', cP);
    ok(/Appuie sur « Synchroniser mes annonces » : FillSell lit, depuis ses serveurs, tes annonces déjà publiées \(titres, prix, photos\)/.test(r) && /Rien à laisser allumé : la lecture se fait depuis nos serveurs\./.test(r) && !/Ton ordinateur doit être allumé|l.extension lit/.test(r),
      'relevé avec le Cloud : « depuis nos serveurs », plus un mot de l’ordinateur', r);
    ok(/On lit tes annonces\. Rien n.est publié, modifié ni supprimé\. Et l.import ne compte dans aucune jauge, même avec 500 annonces\./.test(r), 'relevé avec la grille : l’import ne compte dans aucune jauge');
    const rExt = lu('EtapeReleve', ctx({ voie: 'extension', cloud: cloudObjet({ parcours: true }) }));
    ok(/l.extension lit tes annonces déjà publiées/.test(rExt) && /Ton ordinateur doit être allumé, avec Chrome et l.extension FillSell/.test(rExt) && !/aucune jauge/.test(rExt), 'relevé avec l’extension (grille 0) : l’écran d’avant');
    ok(/elle part dès que FillSell Cloud est prêt/.test(lu('EtapeReleve', { ...cP, releve: { etat: 'en_file' } })), 'relevé Cloud demandé avant que l’exécutant soit vu : jamais « sur ton ordinateur »');
    const d = lu('EtapeDebut', { ...cP, choix: { plateformes: [], debute: true } });
    ok(/FillSell la publie depuis ses serveurs\./.test(d) && /une plateforme après l.autre, même ordinateur éteint/.test(d) && !/Ton ordinateur, ouvert avec l.extension/.test(d), '« Je débute » avec le Cloud : le dépôt part de nos serveurs');
  }
  {
    const rem = lu('EtapeRepublication', ctx({ grille: true }));
    ok(/Ensuite, ça tourne Remonte tes annonces en un geste Une annonce qui date descend dans les listes\. « Remonter mes annonces », dans ton Stock, la remet en haut sur chaque plateforme\./.test(rem),
      'remontées (grille) : « Remonte tes annonces en un geste »', rem.slice(0, 260));
    ok(/Elle redescend Tu appuies sur « Remonter » Elle repart en haut En Free 30 remontées par mois Dès le Pro illimitées, et toutes seules au créneau que tu choisis/.test(rem)
      && /Rien n.est activé maintenant\. Une remontée, c.est une annonce remise en haut sur une plateforme\./.test(rem), 'remontées (grille) : « En Free : 30 remontées par mois » / « Dès le Pro : illimitées, et toutes seules… »', rem);
    ok(/En Free 45 remontées par mois Dès le Pro 900 remontées par mois, et toutes seules/.test(lu('EtapeRepublication', ctx({ grille: true, K: { ...K1, jauge_remontees_free: 45, jauge_remontees_pro: 900 } }))),
      'remontées : les chiffres suivent coin_config (grilleDuPalier), jamais en dur');
    const remEn = lu('EtapeRepublication', ctx({ grille: true, lang: 'en' }));
    ok(/Bump your listings in one tap/.test(remEn) && /On Free 30 bumps a month From Pro unlimited, and on their own/.test(remEn) && !/remontées|Réglages/.test(remEn), 'remontées en anglais', remEn);
    const rem0 = lu('EtapeRepublication', ctx());
    ok(/Tes annonces remontent toutes seules/.test(rem0) && /Les jours Le créneau Les articles/.test(rem0) && !/En Free|Dès le Pro/.test(rem0), 'remontées à 0 : l’écran d’avant');
  }
  {
    const f = lu('EtapeFree', ctx({ grille: true, voie: 'extension' }));
    ok(/Ton plan Free Ce que tu as chaque mois, sans payer De quoi lancer ton stock et voir tes premières ventes\. Tes compteurs repartent à zéro chaque mois, à la date de ton inscription\./.test(f), 'plan Free : kicker, titre, phrase', f.slice(0, 260));
    ok(/5 annonces rédigées par l.IA ou scannées avec Lens 50 publications une mise en ligne sur une plateforme 30 remontées une annonce remise en haut sur une plateforme/.test(f), 'plan Free : les 3 chiffres (lus dans coin_config) et ce qu’ils comptent', f);
    ok(/Sans limite, même en Free Import de tout ton stock, depuis toutes tes plateformes Retrait automatique partout après une vente Synchronisation de tes annonces/.test(f)
      && /Exemple : un article publié sur Vinted et Leboncoin compte 1 annonce et 2 publications\./.test(f), 'plan Free : « Sans limite, même en Free » et l’exemple « 1 annonce et 2 publications »');
    ok(/C.est parti Besoin de plus un jour \? Les formules sont dans Réglages › Abonnement\.$/.test(f) && !/Le Cloud ne change pas/.test(f), 'plan Free après l’extension : pas de bande Cloud, « Besoin de plus un jour ? »', f.slice(-200));
    const htmlF = rendre('EtapeFree', ctx({ grille: true }));
    ok((htmlF.match(/<button/g) || []).length === 1 && !/Premium|Pro\b|Business|€|S.abonner|Passer à/.test(f), 'plan Free : AUCUN bouton d’achat (un seul bouton, « C’est parti »), aucun prix');
    ok(/^7 annonces/.test(lu('EtapeFree', ctx({ grille: true, K: { ...K1, jauge_annonces_free: 7 } })).replace(/^.*?inscription\. /, '')), 'plan Free : le chiffre suit coin_config (7 si la base dit 7)');
    const fC = lu('EtapeFree', ctx({ grille: true, voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true }) }));
    ok(/^Ton plan Free \+ Cloud/.test(fC) && /Le Cloud ne change pas ces chiffres : il publie sans ordinateur\./.test(fC), 'plan Free après le Cloud : « Ton plan Free + Cloud » et sa bande');
    ok(/Your Free plan What you get each month/.test(lu('EtapeFree', ctx({ grille: true, lang: 'en' }))) && /5 listings/.test(lu('EtapeFree', ctx({ grille: true, lang: 'en' }))), 'plan Free en anglais');
  }
  {
    const fin = lu('EtapeFin', ctx({ grille: true }));
    ok(/Ton plan Free : 5 annonces, 50 publications, 30 remontées Free/.test(fin) && !/Republication auto|Automatismes/.test(fin), 'récap (grille) : « Ton plan : Free : 5 annonces, 50 publications, 30 remontées », « Republication auto » sort', fin);
    ok(/Ton plan Premium : 40 annonces, 400 publications, 1 500 remontées Premium/.test(lu('EtapeFin', ctx({ grille: true, palier: 'premium' }))), 'récap (grille) : le plan d’un Premium se dit avec SES chiffres');
    ok(/Extension Chrome/.test(fin) && !/FillSell Cloud/.test(fin), 'récap, voie extension : la ligne « Extension Chrome » comme aujourd’hui');
    const L = [{ id: 'vinted', nom: 'Vinted', etat: 'connecte' }, { id: 'leboncoin', nom: 'Leboncoin', etat: 'a_connecter' }, { id: 'beebs', nom: 'Beebs', etat: 'a_connecter' }, { id: 'depop', nom: 'Depop', etat: 'a_connecter' }];
    const finC = lu('EtapeFin', ctx({ grille: true, voie: 'cloud', cloud: cloudObjet({ parcours: true, actif: true, cx: { etat: 'ok', lignes: L, connectees: 1, total: 4, relire() {} } }) }));
    ok(/FillSell Cloud Essai gratuit jusqu.au 10\/11 Prêt Connexions 1 sur 4 : Leboncoin, Beebs, Depop à connecter À faire/.test(finC) && !/Extension Chrome/.test(finC)
      && /Prochaine étape : connecte tes autres plateformes, puis publie ta première annonce\./.test(finC), 'récap, voie Cloud : « FillSell Cloud », « Connexions », la prochaine étape du Cloud', finC);
    const fin0 = lu('EtapeFin', ctx());
    ok(/Republication auto Réglages › Automatismes À régler/.test(fin0) && !/Ton plan/.test(fin0), 'récap à 0 : la ligne « Republication auto » d’avant');
  }

  // ── 3. Aucune promesse d'automatique au Free, avec la grille ───────────────────────────────────────────────
  console.log('\n3. Avec la grille, l’automatique n’est promis qu’au Pro');
  {
    const tout = [];
    for (const lang of ['fr', 'en']) {
      for (const voie of ['cloud', 'extension']) {
        const cloud = cloudObjet({ parcours: true, actif: voie === 'cloud', lang });
        const c = ctx({ lang, grille: true, voie, cloud });
        for (const n of ['EtapeVoie', 'EtapeCloud', 'EtapeExtension', 'EtapeReleve', 'EtapeDebut', 'EtapeRepublication', 'EtapeFree', 'EtapeFin']) tout.push(lu(n, c));
      }
    }
    const t = tout.join(' \n ');
    ok(!/remontent toutes seules|rise again on their own|Republication auto|Auto relisting|Automatismes|Automations|republication automatique|automatic (relisting|reposting)/i.test(t), 'aucun écran ne promet la republication automatique (ni « remontent toutes seules », ni « Republication auto », ni Automatismes)');
    const seules = t.match(/[^.]{0,40}(toutes seules|on their own)[^.]{0,20}/g) ?? [];
    ok(seules.length > 0 && seules.every((s) => /Dès le Pro|From Pro|arrivent ensuite|then arrive/.test(s)), '« toutes seules » ne se dit que du Pro (« Dès le Pro : … toutes seules au créneau que tu choisis »)', seules.join(' | '));
  }

  // ── 4. Aucun prix en dur ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Aucun prix ni quota écrit en dur dans src/entree/');
  {
    const fichiers = fs.readdirSync(join(ROOT, 'src/entree')).filter((f) => /\.(jsx?|mjs)$/.test(f));
    const fautes = [];
    for (const f of fichiers) {
      const code = sansCommentaires(lire(`src/entree/${f}`));
      if (/\b20\s?€|24[,.]99|19[,.]99|€\s?20\b/.test(code)) fautes.push(`${f} : prix`);
      if (/\b(5|30|40|50|120|400|1 ?200|1 ?500) (annonces|publications|remontées|listings|bumps)\b/.test(code)) fautes.push(`${f} : quota`);
    }
    ok(fichiers.length >= 20 && fautes.length === 0, `aucun « 20 € », « 24,99 » ni quota chiffré dans le code de src/entree/ (${fichiers.length} fichiers lus)`, fautes.join(' · '));
    ok(TX.textesEntree('fr').voieCloudNote.includes(PAL.CLOUD_PRIX_AFFICHE.replace(/ /g, String.fromCharCode(0xa0))) && /CLOUD_PRIX_AFFICHE/.test(lire('src/entree/textes.js')),
      'le prix affiché vient de CLOUD_PRIX_AFFICHE (utils/palier.js) — il suivra le lot qui le corrige');
  }

  // ── 5. Rien de neuf à 0 ────────────────────────────────────────────────────────────────────────────────────
  console.log('\n5. À 0 et Cloud fermé : le parcours d’avant, sans un mot neuf');
  {
    ok(CFG.CLOUD_OFFER_ENABLED === false && CFG.cloudOfferVisible('u1') === false, 'le Cloud est fermé (CLOUD_OFFER_ENABLED = false, aucun témoin)');
    const NEUF = /Comment tu veux publier|Rien à payer avant|Connecte tes comptes|Ton plan|Ce que tu as chaque mois|Remonte tes annonces en un geste|Finalement, je n.ai pas d.ordinateur|Extension Chrome · gratuite|aucune jauge|depuis nos serveurs|How do you want to post|Your Free plan|Bump your listings in one tap/;
    const vus = new Set();
    let neufs = [];
    for (const lang of ['fr', 'en']) {
      for (const tel of [true, false]) {
        for (const choix of [{ plateformes: ['vinted', 'ebay'], debute: false }, { plateformes: [], debute: true }]) {
          for (const etape of ['plateformes', 'ebay', 'voie', 'cloud', 'cloud_connexion', 'extension', 'releve', 'debut', 'republication', 'free', 'pseudo', 'fin']) {
            magasin = { fs_entree_etape: etape, fs_entree_choix: JSON.stringify(choix) };
            if (tel) globalThis.window = { innerWidth: 390 }; else delete globalThis.window;
            const t = texte(renderToStaticMarkup(h(PE.default, {
              lang, user: { id: 'u1', email: 'camille@exemple.fr' }, onDone() {}, demanderPseudo: true, onUsername() {},
              palier: 'gratuit', essaiCloud: async () => ({ etat: 'actif' }),
            })));
            if (NEUF.test(t)) neufs.push(`${lang}/${tel ? 'tel' : 'ordi'}/${etape} : ${t.match(NEUF)[0]}`);
            const m = t.match(/Où tu vends|Where do you sell|Relie ton compte eBay|Link your eBay|Ton ordinateur fait le travail|Your computer does the work|Tu ne ressaisis rien|You retype nothing|On part de ta première annonce|We start with your first|Tes annonces remontent toutes seules|Your listings rise again|Comment on t.appelle|What should we call you|À toi de jouer|Over to you/);
            if (m) vus.add(m[0]);
          }
        }
      }
    }
    delete globalThis.window;
    ok(neufs.length === 0, 'aucun mot neuf dans le parcours entier rendu à chaque étape (fr, en, téléphone, ordinateur), même avec palier et achat passés par l’hôte', neufs.slice(0, 6).join(' | '));
    ok(vus.size >= 16, `les étapes d'avant sont bien atteintes (${vus.size} titres vus sur 16)`, [...vus].join(', '));
    const ctxSrc = sansCommentaires(lire('src/entree/useCloudEntree.js'));
    ok(/const ouvert = Boolean\(surTelephone && userId && typeof essaiCloud === 'function' && cloudOfferVisible\(userId\)\);/.test(ctxSrc)
      && /useCloudProfil\(userId, \{ actif: ouvert \}\)/.test(ctxSrc) && /useDisponibiliteCloud\(\{ actif: ouvert \}\)/.test(ctxSrc),
    'la voie Cloud ne lit rien tant qu’elle est fermée (téléphone + cloudOfferVisible + achat fourni)');
    const uce = sansCommentaires(lire('src/entree/useContexteEntree.js'));
    ok(/from\('coin_config'\)\.select\('key, value'\)\.in\('key', CLES_CONFIG_ENTREE\)/.test(uce) && /const grille = grilleActiveConfig\(K\);/.test(uce) && /useState\(null\)/.test(uce),
      'coin_config : UNE lecture bornée, K null tant qu’elle n’est pas revenue (illisible = pas de grille)');
  }

  // ── 6. Les garde-fous ──────────────────────────────────────────────────────────────────────────────────────
  console.log('\n6. Les garde-fous du parcours');
  {
    const coque = sansCommentaires(lire('src/entree/ParcoursEntree.jsx'));
    ok(/await marquerEntreeFaite\(user\?\.id\);/.test(coque) && /marquerEntreeFaiteAuVol\(user\.id, c\.jetonRef\.current\)/.test(coque) && /localStorage\.removeItem\(ENTREE_VOIE_KEY\)/.test(coque),
      'le drapeau profiles.onboarded_at est posé à la fin ET à la sortie en route ; le choix de voie est effacé à la fin');
    ok(/c\.journaliser\(etape\.id === 'extension' \? 'plus_tard' : `passe_\$\{etape\.id\}`\)/.test(coque) && /c\.journaliser\('continuer_telephone'\)/.test(lire('src/entree/EtapeExtension.jsx')),
      'télémétrie : les valeurs historiques (« plus_tard », « continuer_telephone », passe_*) sont intactes');
    const neuves = ['voie_cloud', 'voie_extension', 'voie_info', 'voie_retour', 'cloud_essai_demande', 'cloud_ordinateur', 'cloud_connexion_ouverte', 'plan_free_compris'];
    const tousSrc = ['EtapeVoie', 'EtapeCloud', 'EtapeCloudConnexion', 'EtapeExtension', 'EtapeFree'].map((n) => lire(`src/entree/${n}.jsx`)).join('\n');
    ok(neuves.every((v) => tousSrc.includes(`'${v}'`)), `télémétrie : des valeurs NEUVES pour la voie (${neuves.join(', ')})`);
    const zCond = Number(lire('src/cloud/ConditionsCloudModale.jsx').match(/zIndex: (\d+)/)?.[1]);
    const zAchat = Number(coque.match(/Z_PENDANT_ACHAT_CLOUD = (\d+)/)?.[1]);
    ok(/zIndex: c\.cloud\?\.achat\?\.etat === 'en_cours' \? Z_PENDANT_ACHAT_CLOUD : Z_PARCOURS/.test(coque) && /Z_PARCOURS = 9980/.test(coque) && zAchat < zCond && zAchat > 1100,
      `pendant l'achat seulement, le parcours passe sous la case des conditions du Cloud (${zAchat} < ${zCond}), sinon 9980 comme avant`);
    const app = lire('src/App.jsx');
    ok(/essaiCloud=\{cloudOfferVisible\(user\.id\)&&achatCloud\?\(origine\)=>\{logTunnel\('cloud_cta_click',\{origine,declencheur:'clic'\}\);return achatCloud\.acheter\(origine\);\}:null\}/.test(app) && /palier=\{palier\}/.test(app),
      'App : l’achat de l’essai passe par achatCloud.acheter (le chemin existant), null tant que le Cloud est fermé ; aucun paiement réécrit');
    const cloudSrc = sansCommentaires(lire('src/entree/useCloudEntree.js') + lire('src/entree/EtapeCloud.jsx'));
    ok(!/create-checkout-session|purchasePremium|cloud_essai_preparer_moi|validate-google-purchase/.test(cloudSrc), 'aucun appel de paiement dans src/entree/ (ni Stripe, ni boutique, ni préparation)');
    // Animations : transform / opacity seulement, keyframes déjà déclarées, réduites par prefers-reduced-motion.
    const css = (await vite.ssrLoadModule('/src/entree/theme.js')).CSS_ENTREE;
    const neufsFichiers = ['EtapeVoie', 'EtapeCloud', 'EtapeCloudConnexion', 'EtapeFree'].map((n) => lire(`src/entree/${n}.jsx`)).join('\n');
    const anims = [...neufsFichiers.matchAll(/animation: '(en\w+)/g)].map((m) => m[1]);
    ok(anims.every((a) => new RegExp(`@keyframes ${a} `).test(css)) && !/transition: '[^']*(width|height|top|left|margin)/.test(neufsFichiers),
      `animations des étapes neuves : keyframes existantes (${[...new Set(anims)].join(', ') || 'aucune en ligne'}), rien qui déclenche un reflow`);
    ok(/className="en-anime"/.test(lire('src/entree/EtapeVoie.jsx')) && /\.en-anime, \.en-anime \* \{ animation: none !important \}/.test(css), 'la petite fenêtre du « i » respecte prefers-reduced-motion (classe en-anime)');
    // src/cloud/ est LU (états, mots, achat, Vue), jamais recopié ni modifié par ce lot.
    const imports = ['EtapeVoie', 'EtapeCloud', 'EtapeCloudConnexion', 'useCloudEntree', 'regles'].map((n) => lire(`src/entree/${n}.${n.startsWith('Etape') ? 'jsx' : 'js'}`)).join('\n');
    ok(/from '\.\.\/cloud\/useCloudProfil'/.test(imports) && /from '\.\.\/cloud\/useDisponibiliteCloud'/.test(imports) && /from '\.\.\/cloud\/executant'/.test(imports) && /finEssaiSiOnCommence/.test(imports),
      'la voie Cloud réutilise src/cloud/ (useCloudProfil, useDisponibiliteCloud, executant, finEssaiSiOnCommence) au lieu de le recopier');
  }
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S), ` : '✓ '}${verts} vérification(s) verte(s)`);
process.exit(rouges ? 1 : 0);
