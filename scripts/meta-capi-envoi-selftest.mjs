// VERROU (17/11/2026, ordre de Nico — « les inscriptions n'arrivent pas chez Meta ») : L'API DE CONVERSIONS ENVOIE
// VRAIMENT, ET UN ÉCHEC NE PASSE PLUS JAMAIS INAPERÇU.
//
// Cause prouvée : les secrets META_CAPI_TOKEN_<pixel> n'existaient pas ; chaque inscription notait « jeton_absent »
// (usage_logs) et rien ne le disait à personne — 2 jours, aucune inscription reçue par Meta côté serveur.
// Ce verrou garde :
//   1. jeton ABSENT → statut « jeton_absent », une ligne d'erreur qui nomme le secret, et au 4e échec d'affilée (plus
//      de 3) UNE alerte à support@ — pas au 3e, pas au 5e ;
//   2. jeton PRÉSENT → l'événement part (adresse, corps, jeton hors de toute trace), statut « envoye » ;
//   3. le serveur n'envoie qu'au pixel FillSell Web 1425992186075849 (le 921207750637065 du compte perso : navigateur) ;
//   4. l'essai Cloud (StartTrial) et le premier paiement (Subscribe, Purchase), tous canaux, avec valeur et devise ;
//      jamais sans l'accord web de l'inscription, jamais un compte ou un achat de test, une fois par compte ;
//   5. les branchements : mails Cloud (tous canaux), 7 jours offerts, alerte de paiement, fonction meta-inscription.
// Adresses : domaines fictifs (exemple.invalid) — la règle des comptes de test ne lit que la partie avant « @ ».
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const fin = () => { console.log(`\n${n - ko}/${n} vérifications`); process.exit(ko ? 1 : 0); };

let m, env;
try {
  m = await import('../supabase/functions/_shared/meta-capi.js');
  env = await import('../supabase/functions/_shared/meta-capi-envoi.js');
} catch (e) { ok(false, `modules absents (${e.message})`); fin(); }

const U = '3f0c2a5e-8b1d-4c7a-9e21-5d4b6a7c8e90';
const PIXEL = '1425992186075849';
const JETON = 'JETON-DOUBLURE-NE-DOIT-JAMAIS-APPARAITRE';
const D = '@exemple.invalid';

/** Doublures : base (traces), secrets, réseau Meta, mail d'alerte. */
function banc({ jeton = true, reponse = { ok: true, status: 200, corps: { events_received: 1, fbtrace_id: 'AbC123' } }, compte = { id: U, email: `Cliente${D}` }, accord = { contexte: { fbp: 'fb.1.1794778800000.1234567890', fbc: null, ua: 'Mozilla/5.0 Essai' } }, deja = [] } = {}) {
  const traces = [], appels = [], alertes = [], erreurs = [];
  const deps = {
    lireJeton: (nom) => (jeton && nom === `META_CAPI_TOKEN_${PIXEL}` ? JETON : null),
    fetch: async (url, init) => { appels.push({ url, init, corps: JSON.parse(init.body) }); if (reponse instanceof Error) throw reponse; return { ok: reponse.ok, status: reponse.status, json: async () => reponse.corps }; },
    ecrireTrace: async (t) => { traces.push(t); },
    lireTracesRecentes: async (k) => traces.filter((t) => m.FEATURES_SUIVIES.includes(t.feature)).map((t) => t.metadata).reverse().slice(0, k),
    envoyerAlerte: async (a) => { alertes.push(a); },
    lireCompte: async (id) => (id === compte?.id ? compte : null),
    lireAccord: async () => accord,
    lireDejaEnvoyes: async () => [...deja, ...traces.filter((t) => t.feature === m.FEATURE_EVENEMENT).map((t) => t.metadata.nom)],
    journal: { log: () => {}, warn: () => {}, error: (s) => erreurs.push(String(s)) },
    maintenant: () => Date.parse('2026-11-17T15:00:00Z'),
  };
  return { deps, traces, appels, alertes, erreurs };
}
const evInscription = { event_name: 'CompleteRegistration', event_id: 'e1', action_source: 'website', user_data: {} };

console.log('1. Jeton ABSENT : une trace claire, une alerte au 4e échec d\'affilée');
{
  const b = banc({ jeton: false });
  const r = await env.envoyerAuxPixels({ evenement: evInscription, deps: b.deps });
  ok(JSON.stringify(r.pixels) === JSON.stringify({ [PIXEL]: 'jeton_absent' }) && b.appels.length === 0, 'statut « jeton_absent », rien envoyé à Meta');
  for (let i = 1; i <= 5; i++) {
    await env.tracerEtSurveiller({ deps: b.deps, feature: m.FEATURE_INSCRIPTION, userId: U, metadata: { nom: 'CompleteRegistration', pixels: r.pixels } });
    if (i === 3) ok(b.alertes.length === 0, 'au 3e échec : aucune alerte (pas « plus de 3 »)');
    if (i === 4) ok(b.alertes.length === 1 && /jeton absent/.test(b.alertes[0].sujet) && /META_CAPI_TOKEN_/.test(b.alertes[0].html), 'au 4e échec : UNE alerte, qui dit « jeton absent » et le secret à recréer');
  }
  ok(b.alertes.length === 1, 'au 5e échec : pas de 2e alerte (une par série)');
  ok(b.traces.length === 5 && b.traces.every((t) => t.metadata.pixels[PIXEL] === 'jeton_absent'), 'une trace par envoi, statut lisible');
  ok(b.erreurs.some((e) => /ENVOI À META RATÉ/.test(e) && /META_CAPI_TOKEN_1425992186075849/.test(e)), 'une ligne d\'erreur claire qui nomme le secret absent');
  // Un succès coupe la série : 4 nouveaux échecs → une nouvelle alerte.
  await env.tracerEtSurveiller({ deps: b.deps, feature: m.FEATURE_INSCRIPTION, userId: U, metadata: { pixels: { [PIXEL]: 'envoye' } } });
  for (let i = 0; i < 4; i++) await env.tracerEtSurveiller({ deps: b.deps, feature: m.FEATURE_EVENEMENT, userId: U, metadata: { nom: 'Purchase', pixels: { [PIXEL]: 'http_400:Invalid parameter' } } });
  ok(b.alertes.length === 2 && !/jeton absent/.test(b.alertes[1].sujet) && /refuse/.test(b.alertes[1].html), 'après un succès, 4 refus de Meta → une 2e alerte (cause : refus)');
  // Les essais de Nico ne comptent jamais.
  const c = banc({ jeton: false });
  for (let i = 0; i < 6; i++) await env.tracerEtSurveiller({ deps: c.deps, feature: m.FEATURE_ESSAI, metadata: { pixels: { [PIXEL]: 'jeton_absent' } }, suivie: false });
  ok(c.alertes.length === 0, 'les essais (meta_capi_essai) ne déclenchent jamais d\'alerte');
  ok(m.doitAlerter([]) === false && m.serieEchecs([{ pixels: {} }]) === 1, 'aucune trace : pas d\'alerte ; trace sans pixel = échec');
  const alerte = m.texteAlerte([{ nom: 'Purchase', pixels: { [PIXEL]: 'jeton_absent' } }]);
  ok(!/exemple\.invalid|cliente/i.test(alerte.html + alerte.sujet), 'le mail d\'alerte ne porte aucune donnée de personne');
  const casse = banc({ jeton: false });
  casse.deps.envoyerAlerte = async () => { throw new Error('Resend indisponible'); };
  let leve = false;
  try { for (let i = 0; i < 4; i++) await env.tracerEtSurveiller({ deps: casse.deps, feature: m.FEATURE_INSCRIPTION, userId: U, metadata: { pixels: { [PIXEL]: 'jeton_absent' } } }); } catch { leve = true; }
  ok(!leve && casse.erreurs.some((e) => /alerte impossible/.test(e)), 'une alerte qui ne part pas : dit, jamais remontée');
}

console.log('2. Jeton PRÉSENT : l\'événement part, statut « envoye »');
{
  const b = banc();
  const r = await env.envoyerAuxPixels({ evenement: evInscription, deps: b.deps });
  ok(b.appels.length === 1 && b.appels[0].url === `https://graph.facebook.com/${m.VERSION_GRAPH}/${PIXEL}/events`, 'un envoi, au pixel FillSell Web, à l\'API de conversions');
  ok(b.appels[0]?.corps.data[0].event_id === 'e1' && b.appels[0]?.corps.access_token === JETON && !('test_event_code' in (b.appels[0]?.corps ?? {})), 'l\'événement et le jeton (lu dans le secret), sans code de test');
  ok(r.pixels[PIXEL] === 'envoye' && r.fbtrace[PIXEL] === 'AbC123', 'statut « envoye » (et l\'identifiant de trace Meta)');
  await env.tracerEtSurveiller({ deps: b.deps, feature: m.FEATURE_INSCRIPTION, userId: U, metadata: { pixels: r.pixels } });
  ok(b.alertes.length === 0 && b.erreurs.length === 0 && !JSON.stringify(b.traces).includes(JETON), 'aucune erreur, aucune alerte, jamais le jeton dans une trace');
  const t = banc();
  await env.envoyerAuxPixels({ evenement: evInscription, deps: t.deps, testEventCode: 'TEST12345' });
  ok(t.appels[0]?.corps.test_event_code === 'TEST12345', 'essai de Nico : le code de « Tester les événements » part');
  const refus = banc({ reponse: { ok: false, status: 400, corps: { error: { message: 'Invalid OAuth access_token=ABCDEF' } } } });
  const rr = await env.envoyerAuxPixels({ evenement: evInscription, deps: refus.deps });
  ok(/^http_400:/.test(rr.pixels[PIXEL]) && !rr.pixels[PIXEL].includes('ABCDEF'), 'un refus de Meta : « http_400:… », le jeton masqué');
  const coupe = banc({ reponse: new Error('réseau coupé') });
  ok(/^echec:/.test((await env.envoyerAuxPixels({ evenement: evInscription, deps: coupe.deps })).pixels[PIXEL]), 'réseau coupé : « echec:… », jamais une erreur remontée');
  ok(m.statutReponse({ ok: true, status: 200, corps: { events_received: 0 } }) !== 'envoye', '200 sans événement reçu : pas « envoye »');
}

console.log('3. Les pixels du serveur');
ok(JSON.stringify(m.PIXELS_CAPI) === JSON.stringify(['1425992186075849']), 'le serveur n\'envoie qu\'au pixel FillSell Web (portefeuille FillSell)');
ok(JSON.stringify(m.PIXELS_NAVIGATEUR_SEUL) === JSON.stringify(['921207750637065']) && m.PIXELS_META.length === 2, 'le pixel du compte perso reste au navigateur (les deux pixels du navigateur inchangés)');

console.log('4. L\'essai Cloud et le premier paiement');
{
  ok(m.estCompteDeTest(`nicolas.svobodny+test3${D}`) && m.estCompteDeTest(`nicolas.svobodny${D}`) && m.estCompteDeTest(`hoosslocal${D}`) && m.estCompteDeTest(`googlereview${D}`)
    && m.estCompteDeTest(`test${D}`) && m.estCompteDeTest(`nicotest${D}`) && m.estCompteDeTest(`nicotest2${D}`) && m.estCompteDeTest(''), 'comptes de test de Nico reconnus (alias compris ; adresse illisible = test)');
  ok(!m.estCompteDeTest(`celeste.test${D}`) && !m.estCompteDeTest(`testarossa${D}`) && !m.estCompteDeTest(`cliente${D}`), 'jamais un vrai compte pris pour un test');
  ok(JSON.stringify(m.lireMontant('24.99 EUR')) === '{"montant":24.99,"devise":"EUR"}' && JSON.stringify(m.lireMontant({ montant: 49.99, devise: 'eur' })) === '{"montant":49.99,"devise":"EUR"}'
    && m.lireMontant(null) === null && m.lireMontant('—') === null && m.lireMontant({ montant: 0, devise: 'EUR' }) === null, 'montants lus à la source (texte des alertes, objet des mails) ; sans source : rien');
  const dc = m.demandesDeCloud([{ evenement: 'essai_debut' }, { evenement: 'paiement', faits: { contexte: 'renouvellement', montant: { montant: 24.99, devise: 'EUR' } } }], { montant: 49.99, devise: 'EUR' });
  ok(dc.length === 1 && dc[0].nom === 'StartTrial' && dc[0].montant.montant === 49.99, 'essai_debut → StartTrial au prix de la 1re échéance ; un renouvellement n\'est pas un premier paiement');
  const dp = m.demandesDeCloud([{ evenement: 'paiement', faits: { contexte: 'fin_essai', montant: { montant: 49.99, devise: 'EUR' } } }]);
  ok(dp.map((d) => d.nom).join() === 'Subscribe,Purchase' && dp[1].montant.devise === 'EUR', 'fin d\'essai payée → Subscribe + Purchase au montant payé');
  ok(m.demandesDeCloud([{ evenement: 'arret_essai' }, { evenement: 'impaye' }]).length === 0, 'arrêt, impayé : rien');
  ok(m.demandesDePaiement({ ok: true, type: 'abonnement', montant: '9.99 EUR' }).map((d) => d.nom).join() === 'Subscribe,Purchase'
    && m.demandesDePaiement({ ok: true, type: 'pack', montant: '4.99 EUR' }).map((d) => d.nom).join() === 'Purchase', 'paiement crédité : abonnement → Subscribe + Purchase ; pack → Purchase');
  ok(m.demandesDePaiement({ ok: true, test: true, type: 'abonnement' }).length === 0 && m.demandesDePaiement({ ok: false, type: 'abonnement' }).length === 0, 'achat de test, paiement non crédité : rien');

  const b = banc();
  const bilan = await env.conversionsMeta({ deps: b.deps, userId: U, canal: 'stripe', demandes: [{ nom: 'Subscribe', montant: '49.99 EUR' }, { nom: 'Purchase', montant: '49.99 EUR' }] });
  const ev = b.appels.map((a) => a.corps.data[0]);
  ok(bilan.map((x) => x.resultat).join() === 'envoye,envoye' && ev.map((e) => e.event_name).join() === 'Subscribe,Purchase', 'Stripe : Subscribe et Purchase envoyés');
  ok(ev[1]?.custom_data?.value === 49.99 && ev[1]?.custom_data?.currency === 'EUR', 'avec la valeur et la devise');
  ok(ev[1]?.action_source === 'website' && ev[1]?.event_source_url === 'https://fillsell.app/app' && ev[1]?.user_data.client_user_agent === 'Mozilla/5.0 Essai' && ev[1]?.user_data.fbp === 'fb.1.1794778800000.1234567890', 'Stripe : « website », navigateur et fbp gardés à l\'inscription');
  ok(ev[1]?.user_data.em[0] === sha(`cliente${D}`) && ev[1]?.user_data.external_id[0] === sha(U) && !/cliente|exemple/i.test(JSON.stringify(ev)), 'e-mail (minuscules) et identifiant en SHA-256, jamais en clair');
  ok(!('client_ip_address' in (ev[1]?.user_data ?? {})), 'aucune adresse IP gardée pour un événement d\'après');
  ok(b.traces.length === 2 && b.traces.every((t) => t.feature === 'meta_capi_evenement' && t.metadata.pixels[PIXEL] === 'envoye' && t.metadata.valeur === 49.99), 'une trace meta_capi_evenement par envoi, « envoye », avec la valeur');
  const encore = await env.conversionsMeta({ deps: b.deps, userId: U, canal: 'stripe', demandes: [{ nom: 'Purchase', montant: '49.99 EUR' }] });
  ok(encore[0]?.resultat === 'deja_envoye' && b.appels.length === 2, 'une fois par compte (« le premier paiement »)');
  ok(ev[0]?.event_id === (await m.idEvenementServeur(U, 'Subscribe')) && ev[0]?.event_id !== ev[1]?.event_id, 'identifiant d\'événement stable par compte et par nom (Meta dédoublonne un rejeu)');

  const a = banc();
  await env.conversionsMeta({ deps: a.deps, userId: U, canal: 'apple', demandes: [{ nom: 'StartTrial', montant: { montant: 49.99, devise: 'EUR' } }] });
  const ea = a.appels[0]?.corps.data[0];
  ok(ea?.event_name === 'StartTrial' && ea.action_source === 'system_generated' && !('client_user_agent' in ea.user_data) && ea.custom_data.value === 49.99, 'Apple : StartTrial en « system_generated », avec valeur');
  const g = banc();
  const bg = await env.conversionsMeta({ deps: g.deps, userId: U, canal: 'google', demandes: [{ nom: 'Subscribe', montant: null }, { nom: 'Purchase', montant: null }] });
  ok(bg.map((x) => x.resultat).join() === 'envoye,montant_absent' && g.appels.length === 1, 'Google sans montant : Subscribe part, Purchase jamais sans valeur');

  const sansAccord = banc({ accord: null });
  ok((await env.conversionsMeta({ deps: sansAccord.deps, userId: U, canal: 'apple', demandes: [{ nom: 'StartTrial', montant: null }] }))[0].resultat === 'sans_accord_web' && sansAccord.appels.length === 0, 'sans accord web à l\'inscription (compte de l\'app, bandeau refusé) : rien ne part');
  const test = banc({ compte: { id: U, email: `nicolas.svobodny+cloud${D}` } });
  ok((await env.conversionsMeta({ deps: test.deps, userId: U, canal: 'stripe', demandes: [{ nom: 'Purchase', montant: '9 EUR' }] }))[0].resultat === 'compte_de_test' && test.appels.length === 0, 'compte de test : rien ne part');
  const achat = banc();
  ok((await env.conversionsMeta({ deps: achat.deps, userId: U, canal: 'apple', test: true, demandes: [{ nom: 'Purchase', montant: '9 EUR' }] }))[0].resultat === 'achat_de_test' && achat.appels.length === 0, 'achat de test (bac à sable) : rien ne part');
  const casse = banc();
  casse.deps.lireCompte = async () => { throw new Error('base indisponible'); };
  let leve = false;
  try { await env.conversionsMeta({ deps: casse.deps, userId: U, canal: 'stripe', demandes: [{ nom: 'Purchase', montant: '9 EUR' }] }); } catch { leve = true; }
  ok(!leve, 'une panne ne remonte jamais (un paiement ne dépend pas de Meta)');
  const absent = banc({ jeton: false });
  await env.conversionsMeta({ deps: absent.deps, userId: U, canal: 'stripe', demandes: [{ nom: 'Subscribe', montant: '9 EUR' }] });
  ok(absent.traces[0]?.metadata.pixels[PIXEL] === 'jeton_absent', 'jeton absent pour un paiement : trace « jeton_absent » aussi');
}

console.log('5. Les branchements');
const cloud = lire('supabase/functions/_shared/cloud-mails-envoi.ts');
const tunnel = lire('supabase/functions/email-tunnel/index.ts');
const fn = lire('supabase/functions/meta-inscription/index.ts');
const deno = lire('supabase/functions/_shared/meta-capi-deno.ts');
ok(/await conversionsMetaCloud\(admin, \{ \.\.\.p, lirePrix: lirePrixUneFois \}, prefixe\);\n  const bilanClient = await mailsClient\(/.test(cloud) && /conversionsMetaEnArrierePlan\(admin, envoyerEmail, \{/.test(cloud),
  'mails Cloud (Stripe, Apple, Google) : essai et paiement envoyés à Meta, au prix lu pour le mail (porte d\'envoi du module)');
ok(/if \(p\.test === true\) \{[\s\S]{0,400}?return retenus;\n  \}/.test(cloud) && /async function conversionsMetaCloud[\s\S]{0,200}?if \(p\.test === true\) return;/.test(cloud), 'un achat de test sort avant (aucun envoi)');
ok(/export async function alerteSeuleCloud[\s\S]{0,600}?await conversionsMetaCloud\(/.test(cloud), 'les 7 jours offerts : StartTrial');
ok(/const ok = a\.ok === true;[\s\S]{0,700}?conversionsMetaEnArrierePlan\(supabase, envoyerEmail, \{[\s\S]{0,300}?demandes: demandesDePaiement\(a\)/.test(tunnel), 'alerte de paiement (tous canaux) : le premier paiement envoyé à Meta');
ok(/EdgeRuntime\.waitUntil\(sur\)/.test(deno), 'en arrière-plan : un webhook n\'attend jamais Meta');
ok(/envoyerAuxPixels\(\{ evenement: r\.evenement, deps \}\)/.test(fn) && /tracerEtSurveiller\(\{\n    deps, feature: FEATURE_INSCRIPTION/.test(fn), 'meta-inscription : même envoi, même trace, même alerte');
ok(/contexte: \{ fbp: demande\.fbp, fbc: demande\.fbc, ua:/.test(fn) && !/contexte:[^\n]*\bip\b/.test(fn), 'l\'inscription garde fbp, fbc et le navigateur (jamais l\'IP)');
ok(/req\.headers\.get\("x-cron-secret"\) === secret/.test(fn) && /FEATURE_ESSAI/.test(fn) && /IP_ESSAI = "192\.0\.2\.10"/.test(fn), 'essai de Nico : secret de cron seulement, compte fictif, trace à part');
ok(/Deno\.env\.get\(nom\)/.test(deno) && /type: "meta_capi_alerte", categorie: "support"/.test(deno) && !/^import[^\n]*desinscription/m.test(deno),
  'jetons lus dans les secrets ; alerte par la porte d\'envoi unique (passée par l\'appelant, jamais importée), à support@');
const jetonEnClair = /EA[A-Z][A-Za-z0-9]{40,}/; // (17/11) les jetons de jeu de données commencent aussi par « EAI »
ok(![fn, cloud, tunnel, deno, lire('supabase/functions/_shared/meta-capi.js'), lire('supabase/functions/_shared/meta-capi-envoi.js')].some((t) => jetonEnClair.test(t)), 'aucun jeton Meta écrit dans le code');
const legal = lire('src/pages/Legal.jsx');
ok(/au début de ton premier essai gratuit et à ton premier paiement/.test(legal) && /when your first free trial starts and at your first payment/.test(legal) && /Un compte créé dans l'app n'envoie rien à Meta/.test(legal), 'la politique de confidentialité dit ce qui part (FR et EN), et que l\'app seule n\'envoie rien');

fin();
