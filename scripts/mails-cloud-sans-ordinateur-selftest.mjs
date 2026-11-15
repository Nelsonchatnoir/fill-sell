// selftest:mails-cloud-sans-ordinateur — (15/11/2026, point 3 du lot de Nico) LES MAILS « BIENVENUE » ET « COMMENT ÇA
// MARCHE » D'UN COMPTE FILLSELL CLOUD NE PARLENT NI DE L'ORDINATEUR, NI DE CHROME, NI DE L'EXTENSION À INSTALLER.
//
//   npm run selftest:mails-cloud-sans-ordinateur
//
// Constat : mailBienvenue (welcome : à l'inscription par handle_new_user → email-tunnel welcome_now, et en filet J+1) et
// mailCommentCaMarche (how_it_works, J+1, cron email-tunnel-daily) disaient à TOUT compte « Une extension installée dans
// Chrome sur ton ordinateur fait le travail », un bouton « Installer l'extension » vers le Chrome Web Store, « une fenêtre
// discrète qui ne te vole jamais le focus » — faux pour un client FillSell Cloud (aucun ordinateur, aucun Chrome : il
// connecte ses plateformes depuis l'app). Règle permanente de Nico (13/11/2026) : un client Cloud ne lit jamais
// « ordinateur » ni « Chrome ».
// Ce test prouve, sans réseau, sans base, sans envoi :
//   1. la règle « compte au Cloud » (_shared/mails-compte-cloud.js) : profiles.cloud_voie (la même lecture que le mail de
//      relance du 15/11 matin, fea32ce), ou un Cloud vivant (payé, ou ESSAI EN COURS : cloudVivantDuProfil de
//      _shared/cloud-option.js) ; illisible → null (le texte d'avant, jamais une erreur, jamais un mail perdu) ; lecture
//      par lots bornés ;
//   2. les deux mails d'un compte Cloud : aucun /ordinateur|computer|chrome|extension/i (texte visible ET HTML, lien du
//      Chrome Web Store compris), plus « fenêtre discrète » / « focus » (le seul passage de how_it_works lié à
//      l'ordinateur, sans aucun des mots ci-dessus) ; le nom « FillSell Cloud » ; mise en page, logos, sujet, préheader,
//      signature inchangés (seul le texte change) ;
//   3. un compte sans Cloud : le rendu est identique, OCTET POUR OCTET, à celui de 3cac01f (avant ce correctif) ;
//   4. le recensement : chaque mail automatique qu'un compte Cloud peut recevoir, rendu par le vrai code, est propre ; les
//      deux mails qui parlent de l'extension (relance des tâches, lien d'installation) ne partent jamais à un compte Cloud
//      sans qu'il le demande (câblage relu) ; un mail neuf de emails-fillsell.ts doit être classé ici ;
//   5. le câblage d'email-tunnel (welcome immédiat, J+1, aperçus) : lecture Cloud séparée de la langue, jamais bloquante.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
let total = 0, echecs = 0;
const ok = (c, m, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && d ? `\n      ← ${String(d).slice(0, 500)}` : ''}`); };
const titre = (t) => console.log(`\n${t}`);

// Le texte que lit la personne (balises, styles et entités retirés) ; le HTML brut est contrôlé à part (liens).
const texteVisible = (html) => String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#847;|&zwnj;/g, ' ').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
// Les mots interdits à un client Cloud (« computer » pour l'anglais) — et, pour how_it_works, la fenêtre de l'ordinateur.
const INTERDIT = /ordinateur|computer|chrome|extension/i;
const FENETRE_PC = /fenêtre discrète|vole jamais le focus|discreet window|steals your focus/i;
const NOM_INTERDIT = /\boption\b|\badd-on\b|sans ordinateur|no computer/i;
// (08/11, Nico) Jamais un « on » qui exécute à la place de la personne dans un texte du Cloud.
const ON_EXECUTE = /\bon publie|\bon te fait|\bon travaille|\bwe post|\bwe work\b/i;
const extrait = (s, re) => String(s).match(new RegExp(`.{0,50}(?:${re.source}).{0,40}`, 'i'))?.[0] ?? '';
const squelette = (html) => String(html).replace(/>[^<]*</g, '><').replace(/<(\/?[a-zA-Z0-9]+)[^>]*>/g, '<$1>');
const images = (html) => [...String(html).matchAll(/<img [^>]*src="([^"]+)"/g)].map((x) => x[1]).join('|');
const LANGUES = ['fr', 'en'];
const LIEN = 'https://fillsell.app/desinscription?t=jeton-factice';

const E = await imp('supabase/functions/_shared/emails-fillsell.ts');
const M = await imp('supabase/functions/_shared/mails-compte-cloud.js').catch((e) => { console.log(`  (module _shared/mails-compte-cloud.js absent : ${String(e?.message ?? e).slice(0, 90)})`); return null; });

// ═══ 1. La règle « compte au Cloud » ═══════════════════════════════════════════════════════════════════════════════
titre('1. Compte au Cloud au moment de l’envoi : cloud_voie, ou Cloud payé / essai en cours ; illisible → le texte d’avant');
{
  const T = Date.parse('2026-11-15T10:00:00Z');
  const f = M?.compteAuCloudPourMail;
  ok(typeof f === 'function', '_shared/mails-compte-cloud.js exporte compteAuCloudPourMail');
  const v = (p) => (typeof f === 'function' ? f(p, T) : undefined);
  ok(v({ cloud_voie: true }) === true, 'cloud_voie vrai (la lecture du mail de relance, fea32ce) → Cloud');
  ok(v({ cloud_voie: false, is_cloud: true }) === true, 'Cloud payé (is_cloud) → Cloud');
  ok(v({ cloud_voie: false, cloud_essai_debut: '2026-11-15T09:59:00Z', cloud_essai_fin: '2026-11-22T09:59:00Z', cloud_essai_arrete: false }) === true,
    'essai Cloud qui DÉMARRE (début il y a une minute, drapeau pas encore relu) → Cloud');
  ok(v({ cloud_voie: false, cloud_essai_debut: '2026-11-01T10:00:00Z', cloud_essai_fin: '2026-11-08T10:00:00Z' }) === false, 'essai fini → pas Cloud (ses tâches repassent par l’extension)');
  ok(v({ cloud_voie: false, cloud_essai_debut: '2026-11-14T10:00:00Z', cloud_essai_fin: '2026-11-21T10:00:00Z', cloud_essai_arrete: true }) === false, 'essai arrêté → pas Cloud');
  ok(v({ cloud_voie: false, is_cloud: false }) === false && v({}) === false, 'compte sans Cloud → pas Cloud');
  ok(v(null) === null && v(undefined) === null && v('x') === null, 'profil illisible → null (le texte d’avant)');
  ok(typeof M?.COLONNES_CLOUD_MAIL === 'string' && ['id', 'cloud_voie', 'is_cloud', 'cloud_essai_debut', 'cloud_essai_fin', 'cloud_essai_arrete']
    .every((c) => M.COLONNES_CLOUD_MAIL.split(',').map((s) => s.trim()).includes(c)), 'les colonnes lues : id, cloud_voie, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete');
  const src = M ? lire('supabase/functions/_shared/mails-compte-cloud.js') : '';
  ok(/import \{ cloudVivantDuProfil \} from "\.\/cloud-option\.js"/.test(src) && /cloud_voie === true/.test(src), 'aucune règle recopiée : cloudVivantDuProfil (cloud-option.js) + cloud_voie === true');

  // La lecture par lots, contre une fausse base.
  const lireC = M?.lireCloudDesComptes;
  ok(typeof lireC === 'function', 'lireCloudDesComptes exportée');
  if (typeof lireC === 'function') {
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const appels = [];
    const base = (comportement) => ({
      from: (table) => ({ select: (cols) => ({ in: async (col, tranche) => {
        appels.push({ table, cols, col, n: tranche.length });
        return comportement(tranche);
      } }) }),
    });
    const lignes = (tranche) => ({ data: tranche.filter((id) => id !== 'u7').map((id) => ({ id, cloud_voie: id === 'u3', is_cloud: id === 'u120' })), error: null });
    const r1 = await lireC({ base: base(lignes), ids: [...ids, 'u3', null, ''], maintenant: Date.parse('2026-11-15T10:00:00Z') });
    ok(appels.length === 3 && appels.every((a) => a.table === 'profiles' && a.col === 'id' && a.n <= 100 && a.cols === M.COLONNES_CLOUD_MAIL),
      `lecture de profiles par lots de 100 au plus (250 comptes → ${appels.length} lectures, ${appels.map((a) => a.n).join('/')}) : jamais tronquée à 1 000`);
    ok(r1.get('u3') === true && r1.get('u120') === true && r1.get('u0') === false && r1.get('u7') === null && r1.size === 250,
      'u3 (cloud_voie) et u120 (payé) → Cloud ; u0 → pas Cloud ; u7 (profil absent) → null ; doublons et vides ignorés');
    appels.length = 0;
    let n = 0;
    const r2 = await lireC({ base: base((tr) => { n++; if (n === 1) return { data: null, error: { message: 'timeout' } }; if (n === 2) throw new Error('réseau'); return lignes(tr); }), ids });
    ok(r2.get('u0') === null && r2.get('u150') === null && r2.get('u203') === false, 'un lot en erreur, un lot qui jette : leurs comptes → null (texte d’avant), les autres lus');
    const r3 = await lireC({ base: { from: () => { throw new Error('client cassé'); } }, ids: ['a'] }).catch(() => 'JETÉ');
    ok(r3 !== 'JETÉ' && r3.get('a') === null, 'client illisible : jamais d’exception, le compte → null');
    const r4 = await lireC({ base: base(lignes), ids: [] });
    ok(r4.size === 0, 'aucune cible : aucune lecture');
  }
}

// ═══ 2. Les deux mails d'un compte Cloud ══════════════════════════════════════════════════════════════════════════
titre('2. welcome et how_it_works d’un compte Cloud : ni ordinateur, ni Chrome, ni extension — même mise en page');
{
  for (const [nom, fn] of [['welcome', E.mailBienvenue], ['how_it_works', E.mailCommentCaMarche]]) {
    for (const lang of LANGUES) {
      for (const lien of ['', LIEN]) {
        const c = fn(lang, lien, { cloud: true });
        const a = fn(lang, lien);
        const vis = texteVisible(c.html);
        const tag = `${nom} (${lang}${lien ? ', lien de désinscription' : ''})`;
        ok(!INTERDIT.test(vis) && !INTERDIT.test(c.sujet), `${tag} : aucun « ordinateur / computer / Chrome / extension » dans le texte`, extrait(vis, INTERDIT));
        ok(!INTERDIT.test(c.html), `${tag} : ni dans le HTML (aucun lien vers le Chrome Web Store)`, extrait(c.html, INTERDIT));
        ok(!FENETRE_PC.test(vis), `${tag} : pas de « fenêtre discrète qui ne te vole jamais le focus »`, extrait(vis, FENETRE_PC));
        if (lang === 'fr' && !lien) {
          ok(/FillSell Cloud/.test(vis), `${tag} : il nomme FillSell Cloud`);
          ok(!NOM_INTERDIT.test(vis) && !ON_EXECUTE.test(vis), `${tag} : ni « option » ni « sans ordinateur », aucun « on » qui exécute`, extrait(vis, NOM_INTERDIT) || extrait(vis, ON_EXECUTE));
        }
        ok(c.sujet === a.sujet && squelette(c.html) === squelette(a.html) && images(c.html) === images(a.html) && (nom !== 'welcome' || images(c.html).includes('https://fillsell.app/email/logo-')),
          `${tag} : même sujet, même mise en page (balises), mêmes logos — seul le texte change`);
        ok(/Nico/.test(vis) && /FillSell/.test(vis) && (lang === 'fr' ? /Salut,/ : /Hi,/).test(vis), `${tag} : même salut, même signature « Nico / FillSell »`);
      }
    }
  }
  const wc = E.mailBienvenue('fr', '', { cloud: true });
  ok(/href="https:\/\/fillsell\.app"/.test(wc.html) && /Connecter mes plateformes/.test(texteVisible(wc.html)),
    'welcome Cloud : le bouton ouvre FillSell, le texte dit où connecter ses plateformes (Réglages → Abonnement → FillSell Cloud)');
}

// ═══ 3. Un compte sans Cloud : identique, octet pour octet, à 3cac01f ═══════════════════════════════════════════════
const REF = '3cac01f';
titre(`3. Compte sans Cloud (ou Cloud illisible) : rendu identique à l’octet à ${REF}, avant ce correctif`);
{
  const dirRef = path.join(RACINE, 'build', 'selftest-mails-cloud-sans-ordinateur', REF);
  let A = null;
  try {
    rmSync(dirRef, { recursive: true, force: true });
    mkdirSync(dirRef, { recursive: true });
    const fichiers = execFileSync('git', ['ls-tree', '--name-only', REF, 'supabase/functions/_shared/'], { cwd: RACINE, encoding: 'utf8' })
      .split('\n').filter((f) => /\.(ts|js)$/.test(f));
    for (const f of fichiers) {
      writeFileSync(path.join(dirRef, path.basename(f)), execFileSync('git', ['show', `${REF}:${f}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
    }
    A = await import(pathToFileURL(path.join(dirRef, 'emails-fillsell.ts')).href);
  } catch (e) { A = null; console.log(`  (référence illisible : ${String(e?.message ?? e).slice(0, 120)})`); }
  ok(A != null, `gabarit de référence ${REF} chargé`);
  if (A) {
    // Toutes les façons de dire « pas Cloud » : rien, {}, false, null (illisible), une valeur qui n'est pas le booléen vrai.
    const pasCloud = [undefined, {}, { cloud: false }, { cloud: null }, { cloud: undefined }, { cloud: 'true' }, { cloud: 1 }];
    for (const [nom, fa, fe] of [['welcome', A.mailBienvenue, E.mailBienvenue], ['how_it_works', A.mailCommentCaMarche, E.mailCommentCaMarche]]) {
      const ecarts = [];
      for (const lang of LANGUES) for (const lien of ['', LIEN]) {
        const avant = fa(lang, lien);
        for (const o of pasCloud) {
          const apres = o === undefined ? fe(lang, lien) : fe(lang, lien, o);
          if (apres.sujet !== avant.sujet || apres.html !== avant.html) ecarts.push(`${lang}/${lien ? 'lien' : 'sans'}/${JSON.stringify(o)}`);
        }
      }
      ok(ecarts.length === 0, `${nom} : sans Cloud, sujet et HTML identiques à l’octet à ${REF} (FR, EN, avec ou sans lien, ${pasCloud.length} façons de dire « pas Cloud »)`, ecarts.join(', '));
    }
    const autres = ['mailLienExtension', 'mailResiliation', 'mailVentes', 'mailRafale', 'mailRelanceJobs', 'mailPaiementEchoue', 'mailRappelVeilleCloud', 'mailCloud'];
    ok(autres.every((k) => String(A[k]) === String(E[k])), 'les autres mails de emails-fillsell.ts ne changent pas d’une ligne', autres.filter((k) => String(A[k]) !== String(E[k])).join(', '));
  }
}

// ═══ 4. Le recensement des mails automatiques qu'un compte Cloud peut recevoir ═════════════════════════════════════
titre('4. Recensement : chaque mail automatique qu’un compte Cloud peut recevoir, rendu par le vrai code, est propre');
{
  const PE = await imp('supabase/functions/_shared/paiement-echoue.js');
  const CM = await imp('supabase/functions/_shared/cloud-mails.js');
  // Le classement de CHAQUE mail de emails-fillsell.ts (un mail neuf casse ce test tant qu'il n'est pas classé ici).
  const CLASSEMENT = {
    mailBienvenue: 'corrigé', mailCommentCaMarche: 'corrigé',
    mailCloud: 'propre', mailRappelVeilleCloud: 'propre', mailPaiementEchoue: 'propre', mailVentes: 'propre', mailRafale: 'propre', mailResiliation: 'propre',
    mailRelanceJobs: 'jamais au Cloud', mailLienExtension: 'à la demande de la personne',
  };
  const exportes = Object.keys(E).filter((k) => /^mail[A-Z]/.test(k) && typeof E[k] === 'function').sort();
  ok(JSON.stringify(exportes) === JSON.stringify(Object.keys(CLASSEMENT).sort()), `les ${exportes.length} mails de emails-fillsell.ts sont tous classés`, `exportés : ${exportes.join(', ')}`);

  const fautes = [];
  let rendus = 0;
  const voir = (ou, m) => {
    rendus++;
    const t = `${m.sujet} ${texteVisible(m.html)}`;
    if (INTERDIT.test(t) || INTERDIT.test(m.html)) fautes.push(`${ou} : ${extrait(t, INTERDIT) || extrait(m.html, INTERDIT)}`);
  };
  for (const lang of LANGUES) {
    voir(`welcome/${lang}`, E.mailBienvenue(lang, LIEN, { cloud: true }));
    voir(`how_it_works/${lang}`, E.mailCommentCaMarche(lang, LIEN, { cloud: true }));
    // Les mails du Cloud (webhooks Stripe, Apple, Google → _shared/cloud-mails.js) : chaque événement × canal × formule.
    for (const evenement of CM.EVENEMENTS_MAIL ?? []) for (const canal of ['stripe', 'apple', 'google', null]) for (const formule of [null, 'premium_cloud', 'pro_cloud', 'business_cloud'])
      for (const faits of [{}, { aucunPrelevement: true }, { contexte: 'fin_essai' }, { contexte: 'debut' }, { retraitCloud: true }, { abonne: true },
        { finIso: '2026-11-22T10:00:00Z', prochaineIso: '2026-12-22T10:00:00Z', arreteIso: '2026-11-16T10:00:00Z', montant: '24,99 €' }]) {
        let t = null;
        try { t = CM.texteMailCloud({ evenement, lang, canal, faits: formule ? { ...faits, formule } : faits, prix: '24,99 €' }); } catch { t = null; }
        if (t) voir(`cloud ${evenement}/${canal}/${formule ?? 'cloud seul'}`, E.mailCloud({ ...t, lang }));
      }
    // La veille de la fin d'essai (email-tunnel, passage horaire).
    for (const canal of ['stripe', 'apple', 'google', null]) for (const prix of [null, { montant: 24.99, devise: 'EUR' }])
      voir(`veille ${canal}`, E.mailRappelVeilleCloud({ lang, finIso: '2026-11-16T10:00:00Z', canal, prix, formule: canal === 'stripe' ? 'pro_cloud' : null }));
    // L'impayé Stripe (stripe-webhook → email-tunnel) : le Cloud, une formule avec Cloud, et la FORMULE d'un compte qui a aussi le Cloud seul.
    for (const contexte of PE.CONTEXTES ?? ['souscription', 'renouvellement', 'fin_essai']) for (const cause of PE.CAUSES ?? ['3ds', 'carte_refusee', 'carte_expiree', 'autre'])
      for (const [offre, plan] of [['cloud', 'Cloud'], ['formule_cloud', 'Pro + Cloud'], [null, 'Premium'], [null, 'Business']])
        voir(`impayé ${offre ?? 'formule'}/${contexte}/${cause}`, E.mailPaiementEchoue({ lang, cause, contexte, lienFacture: 'https://invoice.stripe.com/i/x', relanceLe: '2026-11-18T10:00:00Z', abonnementActif: contexte === 'renouvellement', offre, plan }));
    // Les ventes (push-ventes) et l'accusé de résiliation (cancel-subscription).
    voir('vente', E.mailVentes({ ventes: [{ titre: 'Veste', plateforme: 'vinted', prixVente: 30, benefice: 12 }], retraitsACliquer: 2, retraitsBeebsAuto: 1, dejaVendu: ['ebay'] }, lang));
    voir('vente à confirmer', E.mailVentes({ ventes: [{ titre: 'Veste', plateforme: 'leboncoin', prixVente: null, benefice: null }], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, lang));
    voir('rafale', E.mailRafale({ ventes: Array.from({ length: 9 }, (_, i) => ({ titre: `Jeu ${i}`, plateforme: 'beebs', prixVente: 8, benefice: null, aConfirmer: i === 2 })), dejaVendu: ['depop'] }, lang));
    voir('résiliation', E.mailResiliation({ formule: 'Pro', demandeLe: '2026-11-15T10:00:00Z', finAcces: '2026-12-01T10:00:00Z' }, lang));
  }
  ok(rendus > 300, `${rendus} mails rendus pour un compte Cloud par le vrai code`);
  ok(fautes.length === 0, 'aucun « ordinateur / computer / Chrome / extension » dans un mail automatique d’un compte Cloud', fautes.slice(0, 6).join(' | '));

  // Les deux mails qui parlent de l'extension, et pourquoi un compte Cloud ne les reçoit pas sans les demander.
  const tunnel = lire('supabase/functions/email-tunnel/index.ts');
  const relance = tunnel.slice(tunnel.indexOf('if (body?.job_relaunch === true) {'));
  ok(relance.length > 1000 && /if \(prof\.cloud_voie === true\) \{[\s\S]{0,200}continue;/.test(relance)
    && relance.indexOf('if (prof.cloud_voie === true) {') < relance.indexOf('mailRelanceJobs('),
    'relance des tâches (« installe l’extension », « ton ordinateur ») : sautée pour un compte au Cloud actif AVANT tout rendu (fea32ce)');
  const sel = lire('supabase/functions/send-extension-link/index.ts');
  ok(/auth\.getUser\(jwt\)/.test(sel) && /if \(authError \|\| !authUser\) return json\(\{ ok: false, reason: "unauthorized" \}, 401\);/.test(sel)
    && /const destinataire = authUser\.email/.test(sel),
    'lien d’installation (send-extension-link) : seulement à la demande de la personne connectée (son JWT, sa propre adresse)');
  let appelants = '';
  try { appelants = execFileSync('git', ['grep', '-l', 'functions/v1/send-extension-link', '--', 'supabase/migrations', 'supabase/functions'], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { appelants = ''; }
  ok(appelants === '', 'aucun cron, déclencheur ni fonction n’appelle send-extension-link (seule l’app, sur un geste)');
}

// ═══ 5. Le câblage d'email-tunnel ══════════════════════════════════════════════════════════════════════════════════
titre('5. email-tunnel : Cloud lu au moment de l’envoi (welcome immédiat, J+1, aperçus), séparément de la langue, jamais bloquant');
{
  const t = lire('supabase/functions/email-tunnel/index.ts');
  ok(/import \{ lireCloudDesComptes \} from "\.\.\/_shared\/mails-compte-cloud\.js";/.test(t), 'email-tunnel importe la règle (aucune règle recopiée)');
  const imm = t.slice(t.indexOf('if (welcomeNow && welcomeUserId && welcomeUserEmail) {'), t.indexOf('// ── Test mode: send the 2 tunnel templates'));
  ok(imm.length > 200 && /\.select\("lang"\)\s*\.eq\("id", welcomeUserId\)/.test(imm), 'welcome immédiat : la lecture de la langue est celle d’avant (une lecture Cloud ratée ne change jamais la langue)');
  ok(/const cloudWelcome = \(await lireCloudDesComptes\(\{ base: supabase, ids: \[welcomeUserId\] \}\)\)\.get\(String\(welcomeUserId\)\) === true;/.test(imm)
    && /mailBienvenue\(\s*lang,\s*await lienDesinscription\(welcomeUserEmail, welcomeUserId\)\.catch\(\(\) => ""\),\s*\{ cloud: cloudWelcome \},\s*\)/.test(imm),
    'welcome immédiat (handle_new_user) : Cloud lu pour CE compte, passé au mail (vrai seulement si lu vrai)');
  const j1 = t.slice(t.indexOf('// ── Trigger 1: J+1 welcome'));
  ok(/const cloudParCompte = await lireCloudDesComptes\(\{ base: supabase, ids: idsCibles \}\);/.test(t)
    && t.indexOf('const cloudParCompte = await lireCloudDesComptes') < t.indexOf('// ── Trigger 1: J+1 welcome'),
    'J+1 : Cloud lu UNE fois pour les inscrits de la veille, par lots, avant les deux boucles');
  ok((j1.match(/\{ cloud: cloudParCompte\.get\(user\.user_id\) === true \}/g) ?? []).length === 2
    && /mailBienvenue\(\s*lang,[\s\S]{0,120}\{ cloud: cloudParCompte\.get\(user\.user_id\) === true \}/.test(j1)
    && /mailCommentCaMarche\(\s*lang,[\s\S]{0,120}\{ cloud: cloudParCompte\.get\(user\.user_id\) === true \}/.test(j1),
    'J+1 : welcome (filet) et how_it_works reçoivent le Cloud du compte');
  ok(/const cloudTest = body\?\.test_cloud === true;/.test(t) && /mailBienvenue\(langTest, lien, \{ cloud: cloudTest \}\)/.test(t) && /mailCommentCaMarche\(langTest, lien, \{ cloud: cloudTest \}\)/.test(t),
    'aperçu (adresse de test seulement) : {"test_cloud": true} montre la version du Cloud ; sans lui, l’aperçu d’avant');
  ok(!/mailBienvenue\(\s*lang,\s*await lienDesinscription\([^)]*\)\.catch\(\(\) => ""\),\s*\)/.test(t) && !/mailCommentCaMarche\(\s*lang,\s*await lienDesinscription\([^)]*\)\.catch\(\(\) => ""\),\s*\)/.test(t),
    'plus aucun envoi réel de ces deux mails sans la réponse « Cloud ou pas »');
  ok(/type: "welcome"/.test(t) && /type: "how_it_works"/.test(t) && (t.match(/categorie: "marketing", dedup: "reservation"/g) ?? []).length >= 2,
    'types, catégorie et dédup inchangés (welcome, how_it_works : marketing, réservation)');
}

console.log(`\n${echecs === 0 ? '✓' : '✗'} mails-cloud-sans-ordinateur : ${total - echecs} vert(s), ${echecs} rouge(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);
