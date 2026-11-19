// selftest:mails-plateformes-completes — (15/11/2026, point 1 du lot (2) de Nico) DEPOP OUBLIÉE DANS LES MAILS.
//
//   npm run selftest:mails-plateformes-completes
//
// Constat de Nico : le mail « Bienvenue sur FillSell » (version Cloud livrée le matin du 15/11, d0b954c, comme la version
// sans Cloud) annonçait « Vinted, Leboncoin, eBay et Beebs » et n'affichait que quatre logos. Depop manquait, alors que
// FillSell publie aussi sur Depop. Cause : _shared/plateformes.ts excluait Depop des plateformes PROPOSÉES
// (SLUGS_PLATEFORMES_PROPOSEES, depuis le 09/10) — la source unique de la phrase, du bandeau de logos et du pied de carte
// de TOUS les mails ; et le blast blast_relaunch_aout d'email-tunnel portait sa propre liste en dur (texte, « Quatre
// plateformes », « les trois autres », quatre logos). Opla n'est plus proposée (sortie du 02/10) : jamais rajoutée.
// Ce test, sans réseau, sans base, sans envoi :
//   1. la source unique : Vinted, Leboncoin, eBay, Beebs, Depop, dans cet ordre, jamais Opla ; un logo par plateforme
//      dans public/email/, au même format que les autres (PNG 128 × 128 RGBA, coins transparents, poids comparable) ;
//   2. REND chaque mail qui énumère les plateformes proposées — bienvenue (FR, EN, Cloud, sans Cloud, avec et sans lien de
//      désinscription) et blast_relaunch_aout (rendu par la VRAIE fonction d'email-tunnel) : chaque énumération cite les
//      cinq, dans l'ordre ; le bandeau montre les cinq logos, dans l'ordre, et tient sur un téléphone de 360 px ; un
//      nombre écrit (« cinq plateformes », « quatre autres ») est juste ; jamais Opla ;
//   3. REND tous les autres mails (comment ça marche, relances de tâches, lien d'installation, résiliation, impayés,
//      veille et événements du Cloud, ventes, rafale, relance manuelle) : leur pied de carte cite les cinq ; aucun
//      n'énumère quatre plateformes ou plus sans Depop ; aucun n'affiche Opla ; blast_sync_dressing (mail Vinted) n'a ni
//      liste ni logos ; un mail neuf d'emails-fillsell.ts doit être classé ici ;
//   4. LECTURE DU SOURCE : aucun gabarit de mail ne garde une liste de plateformes, un logo de plateforme ni un nombre
//      de plateformes écrits en dur ; le bandeau, le pied et le blast lisent _shared/plateformes.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
let total = 0, echecs = 0;
const ok = (c, m, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && d ? `\n      ← ${String(d).slice(0, 500)}` : ''}`); };
const titre = (t) => console.log(`\n${t}`);

// La liste attendue (décision de Nico du 15/11/2026) : les cinq plateformes où FillSell publie, dans l'ordre des mails.
const ATTENDUES = ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop'];
const NOMS = ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'];
const N = NOMS.length;
const LANGUES = ['fr', 'en'];
const LIEN = 'https://fillsell.app/desinscription?t=jeton-factice';

// Le texte que lit la personne (balises, styles et entités retirés ; « &middot; » du pied rendu en « · »).
const texteVisible = (html) => String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&nbsp;|&#847;|&zwnj;/g, ' ')
  .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
// Une énumération : deux noms de plateformes ou plus, séparés par « , », « et », « and » ou « · ».
const NOM = '(?:Vinted|Leboncoin|eBay|Beebs|Depop|Opla)';
const RE_ENUM = new RegExp(`\\b${NOM}\\b(?:(?:\\s*,\\s*|\\s+(?:et|and)\\s+|\\s*·\\s*)\\b${NOM}\\b)+`, 'g');
const enumerations = (t) => [...String(t).matchAll(RE_ENUM)].map((m) => ({ brut: m[0], noms: m[0].match(new RegExp(NOM, 'g')) }));
const complete = (noms) => JSON.stringify(noms) === JSON.stringify(NOMS);
// Les logos de plateformes affichés (public/email/logo-*), dans l'ordre, avec leur alt. (19/11 après-midi) Le logo d'UNE
// vente, au fil de sa ligne (classe fs-logo-vente, plateformeEnLigne — verrou selftest:mail-vente-logo-plateforme), n'est
// pas un bandeau des plateformes proposées : mis à part ici.
const logosAffiches = (html) => [...String(html).matchAll(/<img [^>]*src="https:\/\/fillsell\.app\/email\/(logo-[^"]+)"[^>]*>/g)]
  .map((m) => ({ fichier: m[1], alt: m[0].match(/alt="([^"]*)"/)?.[1] ?? '', classe: m[0].match(/class="([^"]*)"/)?.[1] ?? '' }))
  .filter((x) => !/\bfs-logo-vente\b/.test(x.classe));
// Le pied de carte du gabarit (_shared/email-template.ts : « FillSell … Vinted · Leboncoin · … »).
const piedDeCarte = (html) => {
  const m = String(html).match(/<td align="right" valign="middle" class="fs-hide-sm"[^>]*>([^<]*)<\/td>/);
  return m ? m[1].split(' &middot; ') : null;
};
// Les nombres de plateformes écrits en lettres : « cinq plateformes / publications », « quatre autres plateformes »,
// « sur les cinq » — justes pour cinq plateformes proposées.
const MOTS_NOMBRES = { zéro: 0, zero: 0, un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5, six: 6, sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10 };
const MOT = `(${Object.keys(MOTS_NOMBRES).join('|')})`;
const nombresFaux = (t) => {
  const fautes = [];
  for (const m of t.matchAll(new RegExp(`(?<![\\wÀ-ÿ])${MOT}\\s+(?:autres\\s+plateformes|other\\s+marketplaces)\\b`, 'gi'))) if (MOTS_NOMBRES[m[1].toLowerCase()] !== N - 1) fautes.push(m[0]);
  for (const m of t.matchAll(new RegExp(`(?<![\\wÀ-ÿ])${MOT}\\s+(?:plateformes|publications|marketplaces)\\b`, 'gi'))) if (MOTS_NOMBRES[m[1].toLowerCase()] !== N) fautes.push(m[0]);
  for (const m of t.matchAll(new RegExp(`\\b(?:sur|on)\\s+(?:les|the|all)\\s+${MOT}(?![\\wÀ-ÿ])(?!\\s+autres)`, 'gi'))) if (MOTS_NOMBRES[m[1].toLowerCase()] !== N) fautes.push(m[0]);
  return fautes;
};
// Largeur du bandeau de logos sur un téléphone : la règle mobile du gabarit si elle existe, sinon la taille d'ordinateur
// (52 px, 7 px de chaque côté, la première cellule sans marge à gauche).
// Place utile sur un téléphone de 360 px : 360 − 2×12 (marge du mail) − 2×1 (bord de la carte) − 2×22 (fs-pad sur
// téléphone) − 2×1 (bord du bandeau) − 2×12 (marge intérieure du bandeau) = 264 px.
const PLACE_TELEPHONE_360 = 264;
const largeurTelephone = (html) => {
  const n = logosAffiches(html).length;
  const css = String(html).match(/@media only screen and \(max-width:620px\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
  const w = css.match(/\.fs-logo \{[^}]*width:(\d+)px/);
  const p = css.match(/\.fs-logo-cell \{[^}]*padding-left:(\d+)px[^}]*padding-right:(\d+)px/);
  return w && p ? n * (Number(w[1]) + Number(p[1]) + Number(p[2])) : n * 52 + (2 * n - 1) * 7;
};

const P = await imp('supabase/functions/_shared/plateformes.ts');
const E = await imp('supabase/functions/_shared/emails-fillsell.ts');
const T = await imp('supabase/functions/_shared/email-template.ts');

// ═══ 1. La source unique ═════════════════════════════════════════════════════════════════════════════════════════
titre('1. _shared/plateformes.ts : les plateformes proposées sont Vinted, Leboncoin, eBay, Beebs, Depop — jamais Opla');
{
  const lues = [...(P.SLUGS_PLATEFORMES_PROPOSEES ?? [])];
  ok(JSON.stringify(lues) === JSON.stringify(ATTENDUES), 'SLUGS_PLATEFORMES_PROPOSEES = vinted, leboncoin, ebay, beebs, depop (dans cet ordre)', `lu : ${lues.join(', ')}`);
  ok(!lues.includes('opla'), 'Opla n’est pas proposée (sortie du 02/10/2026)');
  ok(P.toutesLesPlateformes('fr') === 'Vinted, Leboncoin, eBay, Beebs et Depop' && P.toutesLesPlateformes('en') === 'Vinted, Leboncoin, eBay, Beebs and Depop',
    'toutesLesPlateformes : « Vinted, Leboncoin, eBay, Beebs et Depop » / « … and Depop »', `${P.toutesLesPlateformes('fr')} | ${P.toutesLesPlateformes('en')}`);
  ok(P.labelPlateforme('opla') === 'Opla' && P.plateformesEnClair(['opla'], 'fr') === 'Opla', 'Opla reste NOMMÉE pour une vente vue sur Opla (« Vendu sur Opla »), sans être proposée');

  // Les logos : un fichier de public/email/ par plateforme proposée, au même format (en-tête PNG lu octet par octet).
  const png = (fichier) => {
    const f = path.join(RACINE, 'public', 'email', fichier);
    if (!existsSync(f)) return null;
    const b = readFileSync(f);
    return { signature: b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', l: b.readUInt32BE(16), h: b.readUInt32BE(20), bits: b[24], couleur: b[25], octets: b.length };
  };
  const formats = ATTENDUES.map((s) => ({ s, fichier: P.PLATEFORMES[s]?.logo, ...png(P.PLATEFORMES[s]?.logo ?? '') }));
  const absents = formats.filter((x) => !x.fichier || x.l === undefined);
  ok(absents.length === 0, 'chaque plateforme proposée a son logo dans public/email/', absents.map((x) => x.s).join(', '));
  const malFormes = formats.filter((x) => !(x.signature && x.l === 128 && x.h === 128 && x.bits === 8 && x.couleur === 6 && x.octets > 1000 && x.octets < 12000));
  ok(malFormes.length === 0, `même format pour les ${N} logos : PNG 128 × 128, 8 bits, RGBA, 1 à 12 Ko (${formats.map((x) => `${x.fichier} ${x.octets} o`).join(' · ')})`,
    malFormes.map((x) => `${x.fichier} : ${x.l}×${x.h} ${x.bits} bits type ${x.couleur} ${x.octets} o`).join(' | '));
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { sharp = null; }
  if (sharp) {
    const coins = [];
    for (const x of formats.filter((y) => y.fichier && y.l)) {
      const { data, info } = await sharp(path.join(RACINE, 'public', 'email', x.fichier)).raw().toBuffer({ resolveWithObject: true });
      const alpha = (px, py) => data[(py * info.width + px) * info.channels + 3];
      coins.push({ f: x.fichier, a: [alpha(0, 0), alpha(127, 0), alpha(0, 127), alpha(127, 127)] });
    }
    ok(coins.every((c) => c.a.every((a) => a === 0)), 'coins arrondis transparents sur chaque logo (la pastille des autres)', coins.filter((c) => c.a.some((a) => a !== 0)).map((c) => `${c.f} ${c.a}`).join(' | '));
  }
}

// Les vérifications d'un mail qui ÉNUMÈRE les plateformes proposées (phrase, logos, nombres).
const verifierListeProposee = (tag, html, { logos }) => {
  const vis = texteVisible(html);
  const enums = enumerations(vis);
  const fausses = enums.filter((e) => !complete(e.noms));
  ok(enums.length > 0 && fausses.length === 0, `${tag} : chaque liste de plateformes cite les cinq, dans l’ordre (${enums.length} liste(s))`, fausses.map((e) => `« ${e.brut} »`).join(' | ') || 'aucune liste trouvée');
  ok(!/opla/i.test(vis) && !/logo-opla/.test(html), `${tag} : jamais Opla`);
  const nf = nombresFaux(vis);
  ok(nf.length === 0, `${tag} : aucun nombre de plateformes faux (« quatre plateformes », « les trois autres »…)`, nf.join(' | '));
  if (logos) {
    const l = logosAffiches(html);
    const attendus = ATTENDUES.map((s) => P.PLATEFORMES[s]?.logo);
    ok(JSON.stringify(l.map((x) => x.fichier)) === JSON.stringify(attendus) && JSON.stringify(l.map((x) => x.alt)) === JSON.stringify(NOMS),
      `${tag} : le bandeau montre les cinq logos, dans l’ordre, chacun nommé (alt)`, l.map((x) => `${x.fichier}/${x.alt}`).join(', '));
  }
};

// ═══ 2. Les mails qui énumèrent les plateformes proposées ═══════════════════════════════════════════════════════════
titre('2. Bienvenue (FR, EN, Cloud, sans Cloud) et blast_relaunch_aout : la phrase et les logos des cinq plateformes');
{
  for (const lang of LANGUES) for (const cloud of [false, true]) for (const lien of ['', LIEN]) {
    const m = E.mailBienvenue(lang, lien, cloud ? { cloud: true } : {});
    const tag = `bienvenue ${lang.toUpperCase()} ${cloud ? 'Cloud' : 'sans Cloud'}${lien ? ' (lien de désinscription)' : ''}`;
    verifierListeProposee(tag, m.html, { logos: true });
    const phrase = lang === 'fr' ? 'il part sur Vinted, Leboncoin, eBay, Beebs et Depop.' : 'it goes out on Vinted, Leboncoin, eBay, Beebs and Depop.';
    if (!lien) ok(texteVisible(m.html).includes(phrase), `${tag} : « ${phrase} »`);
    if (!lien && !cloud) {
      const w = largeurTelephone(m.html);
      const classes = logosAffiches(m.html).every((x) => /\bfs-logo\b/.test(x.classe)) || w === logosAffiches(m.html).length * 52 + (2 * logosAffiches(m.html).length - 1) * 7;
      ok(w <= PLACE_TELEPHONE_360 && classes, `${tag} : le bandeau tient sur un téléphone de 360 px (${w} px pour ${PLACE_TELEPHONE_360} px utiles)`);
    }
  }

  // Le blast d'août, rendu par la vraie fonction d'email-tunnel (types retirés), avec les vrais modules qu'elle importe.
  const tunnel = readFileSync(path.join(RACINE, 'supabase/functions/email-tunnel/index.ts'), 'utf8');
  const sourceSansTypes = (code) => { const w = process.emitWarning; process.emitWarning = () => {}; try { return stripTypeScriptTypes(code); } finally { process.emitWarning = w; } };
  const importDePlateformes = (tunnel.match(/import \{([^}]*)\} from "\.\.\/_shared\/plateformes\.ts";/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rendre = (nom) => {
    const code = sourceSansTypes(extraireFonctionJs(tunnel, nom));
    // Seuls les noms qu'email-tunnel importe VRAIMENT de _shared/plateformes.ts sont fournis (plus CWS_URL, d'emails-fillsell).
    const deps = { CWS_URL: E.CWS_URL };
    for (const k of importDePlateformes) deps[k] = P[k];
    const noms = Object.keys(deps);
    return new Function(...noms, `${code}\nreturn ${nom}();`)(...noms.map((k) => deps[k]));
  };
  let blast = null;
  try { blast = rendre('blastRelaunchHtml'); } catch (e) { blast = null; ok(false, 'blast_relaunch_aout rendu par la fonction d’email-tunnel', String(e?.message ?? e)); }
  if (blast) {
    verifierListeProposee('blast_relaunch_aout', blast, { logos: true });
    const vis = texteVisible(blast);
    ok(/Cinq plateformes/.test(vis) && /Une annonce, cinq publications/.test(vis) && /Il part sur les cinq\./.test(vis)
      && /Sur les cinq plateformes/.test(vis) && /des quatre autres plateformes/.test(vis),
      'blast_relaunch_aout : « Cinq plateformes », « Une annonce, cinq publications », « Il part sur les cinq », « les quatre autres »');
    ok(/Nico/.test(vis) && /Fondateur de FillSell/.test(vis) && /Salut,/.test(vis), 'blast_relaunch_aout : même salut, même signature « Nico / Fondateur de FillSell »');
  }

  // Le blast « sync du dressing » : un mail VINTED, sans liste ni logos (choix explicite du 07/08) — non concerné.
  let sync = null;
  try { sync = rendre('blastSyncDressingHtml'); } catch (e) { sync = null; ok(false, 'blast_sync_dressing rendu par la fonction d’email-tunnel', String(e?.message ?? e)); }
  if (sync) {
    const vis = texteVisible(sync);
    ok(enumerations(vis).length === 0 && logosAffiches(sync).length === 0 && !/opla/i.test(vis) && /Vinted/.test(vis),
      'blast_sync_dressing : mail Vinted, aucune liste de plateformes, aucun logo (non concerné)', enumerations(vis).map((e) => e.brut).join(' | '));
  }
}

// ═══ 3. Tous les autres mails : le pied de carte, et aucune liste incomplète ═══════════════════════════════════════
titre('3. Tous les autres mails : pied de carte « Vinted · Leboncoin · eBay · Beebs · Depop », aucune liste sans Depop, jamais Opla');
{
  // Le classement de CHAQUE mail d'emails-fillsell.ts (un mail neuf casse ce test tant qu'il n'est pas classé ici).
  const CLASSEMENT = {
    mailBienvenue: 'énumère les plateformes proposées (phrase, logos, pied)',
    mailCommentCaMarche: 'pied seul', mailLienExtension: 'pied seul', mailResiliation: 'pied seul', mailPaiementEchoue: 'pied seul',
    mailRappelVeilleCloud: 'pied seul', mailCloud: 'pied seul', mailRelanceCloud: 'pied seul',
    mailRelanceJobs: 'pied + les plateformes DES TÂCHES (liste précise, pas les plateformes proposées)',
    mailVentes: 'pied + « Vendu sur X » (une vente précise)', mailRafale: 'pied + la plateforme de chaque vente',
  };
  const exportes = Object.keys(E).filter((k) => /^mail[A-Z]/.test(k) && typeof E[k] === 'function').sort();
  ok(JSON.stringify(exportes) === JSON.stringify(Object.keys(CLASSEMENT).sort()), `les ${exportes.length} mails d’emails-fillsell.ts sont tous classés`, `exportés : ${exportes.join(', ')}`);

  const PE = await imp('supabase/functions/_shared/paiement-echoue.js');
  const CM = await imp('supabase/functions/_shared/cloud-mails.js');
  const RL = await imp('supabase/functions/_shared/cloud-relances.js');
  const fautes = [];
  let rendus = 0;
  const voir = (ou, html) => {
    rendus++;
    const pied = piedDeCarte(html);
    if (!pied || !complete(pied)) fautes.push(`${ou} : pied « ${(pied ?? ['(absent)']).join(' · ')} »`);
    const vis = texteVisible(html);
    for (const e of enumerations(vis)) if (new Set(e.noms).size >= 4 && !complete(e.noms)) fautes.push(`${ou} : liste « ${e.brut} »`);
    if (/opla/i.test(vis) || /logo-opla/.test(html)) fautes.push(`${ou} : Opla`);
    const l = logosAffiches(html);
    if (l.length && JSON.stringify(l.map((x) => x.alt)) !== JSON.stringify(NOMS)) fautes.push(`${ou} : logos ${l.map((x) => x.alt).join(', ')}`);
    const nf = nombresFaux(vis);
    if (nf.length) fautes.push(`${ou} : ${nf.join(', ')}`);
  };
  for (const lang of LANGUES) {
    for (const cloud of [false, true]) for (const lien of ['', LIEN]) {
      voir(`bienvenue/${lang}/${cloud ? 'cloud' : 'sans'}`, E.mailBienvenue(lang, lien, cloud ? { cloud: true } : {}).html);
      voir(`comment ça marche/${lang}/${cloud ? 'cloud' : 'sans'}`, E.mailCommentCaMarche(lang, lien, cloud ? { cloud: true } : {}).html);
    }
    for (const cas of [1, 2]) for (const plateformes of [['vinted'], ['leboncoin', 'depop'], ['beebs', 'ebay', 'vinted']])
      voir(`relance des tâches ${cas}/${lang}/${plateformes.join('+')}`, E.mailRelanceJobs(cas, { titres: ['Veste', 'Lampe'], plateformes, depuis: '2026-11-14T10:00:00Z', extensionVueLe: cas === 2 ? '2026-11-13T10:00:00Z' : null }, lang).html);
    voir(`lien d’installation/${lang}`, E.mailLienExtension(lang).html);
    voir(`résiliation/${lang}`, E.mailResiliation({ formule: 'Pro', demandeLe: '2026-11-15T10:00:00Z', finAcces: '2026-12-01T10:00:00Z' }, lang).html);
    for (const contexte of PE.CONTEXTES ?? ['souscription', 'renouvellement', 'fin_essai']) for (const cause of PE.CAUSES ?? ['3ds', 'carte_refusee', 'carte_expiree', 'autre'])
      for (const [offre, plan] of [['cloud', 'Cloud'], ['formule_cloud', 'Pro + Cloud'], [null, 'Premium']])
        voir(`impayé ${offre ?? 'formule'}/${contexte}/${cause}/${lang}`, E.mailPaiementEchoue({ lang, cause, contexte, lienFacture: 'https://invoice.stripe.com/i/x', relanceLe: '2026-11-18T10:00:00Z', abonnementActif: contexte === 'renouvellement', offre, plan }).html);
    // (18/11) Les deux relances Cloud : le pied de carte, aucune liste incomplète.
    for (const t of [RL.texteRelanceArret({ lang, finIso: '2026-11-21T10:00:00Z' }), RL.texteRelanceEssai({ lang })]) voir(`relance Cloud ${t.sujet}/${lang}`, E.mailRelanceCloud({ ...t, lang }, LIEN).html);
    for (const canal of ['stripe', 'apple', 'google', null]) for (const prix of [null, { montant: 24.99, devise: 'EUR' }])
      voir(`veille Cloud ${canal}/${lang}`, E.mailRappelVeilleCloud({ lang, finIso: '2026-11-16T10:00:00Z', canal, prix, formule: canal === 'stripe' ? 'pro_cloud' : null }).html);
    for (const evenement of CM.EVENEMENTS_MAIL ?? []) for (const canal of ['stripe', 'apple', 'google', null]) for (const formule of [null, 'pro_cloud'])
      for (const faits of [{}, { contexte: 'fin_essai' }, { abonne: true }, { finIso: '2026-11-22T10:00:00Z', prochaineIso: '2026-12-22T10:00:00Z', arreteIso: '2026-11-16T10:00:00Z', montant: '24,99 €' }]) {
        let t = null;
        try { t = CM.texteMailCloud({ evenement, lang, canal, faits: formule ? { ...faits, formule } : faits, prix: '24,99 €' }); } catch { t = null; }
        if (t) voir(`Cloud ${evenement}/${canal}/${formule ?? 'cloud seul'}/${lang}`, E.mailCloud({ ...t, lang }).html);
      }
    voir(`vente/${lang}`, E.mailVentes({ ventes: [{ titre: 'Veste', plateforme: 'depop', prixVente: 30, benefice: 12 }], retraitsACliquer: 2, retraitsBeebsAuto: 1, dejaVendu: ['ebay'] }, lang).html);
    voir(`vente à confirmer/${lang}`, E.mailVentes({ ventes: [{ titre: 'Veste', plateforme: 'leboncoin', prixVente: null, benefice: null }], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, lang).html);
    voir(`ventes/${lang}`, E.mailVentes({ ventes: [{ titre: 'A', plateforme: 'vinted', prixVente: 10, benefice: null }, { titre: 'B', plateforme: 'beebs', prixVente: 9, benefice: 2 }], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang).html);
    voir(`rafale/${lang}`, E.mailRafale({ ventes: Array.from({ length: 9 }, (_, i) => ({ titre: `Jeu ${i}`, plateforme: ATTENDUES[i % N], prixVente: 8, benefice: null, aConfirmer: i === 2 })), dejaVendu: ['depop'] }, lang).html);
  }
  // La relance manuelle d'email-tunnel (texte libre de Nico, dans le gabarit) : le même pied.
  voir('relance manuelle', T.renderEmail({ titre: '', corps: [T.paragraphe('Salut,'), T.paragraphe('Un mot.')], preheader: 'Salut,', formuleFin: '', signatureNom: 'Nico', signatureRole: 'FillSell', langue: 'fr' }));
  ok(rendus > 150, `${rendus} mails rendus par le vrai code (FR, EN, Cloud, sans Cloud, chaque événement)`);
  ok(fautes.length === 0, 'chaque pied de carte cite les cinq plateformes ; aucune liste de quatre plateformes ou plus sans Depop ; jamais Opla',
    `${fautes.length} faute(s) : ${fautes.slice(0, 6).join(' | ')}`);
}

// ═══ 4. Lecture du source : aucune liste de plateformes en dur dans les gabarits ══════════════════════════════════
titre('4. Lecture du source : les gabarits de mails ne gardent aucune liste, aucun logo, aucun nombre de plateformes en dur');
{
  // Les gabarits : tout fichier de supabase/functions qui importe emails-fillsell.ts ou email-template.ts, les textes que
  // ces mails importent (paiement, veille, Cloud), et email-tunnel (les blasts). La source (plateformes.ts) exceptée.
  const fichiers = new Set([
    'supabase/functions/_shared/emails-fillsell.ts', 'supabase/functions/_shared/email-template.ts',
    'supabase/functions/_shared/cloud-mails.js', 'supabase/functions/_shared/cloud-rappel-veille.js', 'supabase/functions/_shared/paiement-echoue.js',
    'supabase/functions/email-tunnel/index.ts', 'supabase/functions/push-ventes/index.ts',
  ]);
  const parcourir = (dir) => {
    for (const n of readdirSync(path.join(RACINE, dir))) {
      const rel = `${dir}/${n}`;
      if (statSync(path.join(RACINE, rel)).isDirectory()) parcourir(rel);
      else if (/\.(ts|js)$/.test(n) && /from ["'](?:\.\.\/_shared\/|\.\/)(?:emails-fillsell|email-template)\.ts["']/.test(lire(rel))) fichiers.add(rel);
    }
  };
  parcourir('supabase/functions');
  fichiers.delete('supabase/functions/_shared/plateformes.ts');
  // Commentaires retirés (le code seulement) : blocs, commentaires HTML des gabarits (invisibles), fins de ligne « // »
  // (jamais un « https:// »).
  const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
  const fautes = [];
  for (const f of [...fichiers].sort()) {
    const code = sansCommentaires(lire(f));
    for (const e of enumerations(code)) fautes.push(`${f} : liste en dur « ${e.brut} »`);
    for (const m of code.matchAll(/logo-(?:vinted|leboncoin|ebay|beebs|depop|opla)[\w-]*\.png/g)) fautes.push(`${f} : logo en dur « ${m[0]} »`);
    for (const m of code.matchAll(new RegExp(`(?<![\\wÀ-ÿ])${MOT}\\s+(?:autres\\s+)?(?:plateformes|publications|marketplaces)\\b|\\bles\\s+(?:trois|quatre|cinq)\\b`, 'gi'))) fautes.push(`${f} : nombre en dur « ${m[0]} »`);
  }
  ok(fichiers.size >= 10, `${fichiers.size} gabarits relus (${[...fichiers].map((f) => f.replace('supabase/functions/', '')).sort().join(', ')})`);
  ok(fautes.length === 0, 'aucune liste de plateformes, aucun logo de plateforme, aucun nombre de plateformes écrit en dur', fautes.slice(0, 8).join(' | '));

  const tpl = lire('supabase/functions/_shared/email-template.ts');
  const bandeau = extraireFonctionJs(tpl, 'logosPlateformes');
  ok(/SLUGS_PLATEFORMES_PROPOSEES\.map\(/.test(bandeau) && /\$\{BASE_LOGOS\}\/\$\{p\.logo\}/.test(bandeau), 'le bandeau de logos lit SLUGS_PLATEFORMES_PROPOSEES et BASE_LOGOS');
  ok(/const ligneMarquePlateformes = SLUGS_PLATEFORMES_PROPOSEES/.test(tpl), 'le pied de carte lit SLUGS_PLATEFORMES_PROPOSEES');
  const tunnel = lire('supabase/functions/email-tunnel/index.ts');
  const blast = extraireFonctionJs(tunnel, 'blastRelaunchHtml');
  ok(/SLUGS_PLATEFORMES_PROPOSEES/.test(blast) && /PLATEFORMES\[/.test(blast) && /BASE_LOGOS/.test(blast) && /toutesLesPlateformes\(/.test(blast),
    'blast_relaunch_aout lit _shared/plateformes.ts (liste, logos, nombre)');
  const src = lire('supabase/functions/_shared/plateformes.ts');
  ok(!/SLUGS_PLATEFORMES_PROPOSEES[^\n]*s !== "depop"/.test(src), 'plateformes.ts : Depop n’est plus retirée des plateformes proposées');
}

console.log(`\n${echecs === 0 ? '✓' : '✗'} mails-plateformes-completes : ${total - echecs} vert(s), ${echecs} rouge(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);
