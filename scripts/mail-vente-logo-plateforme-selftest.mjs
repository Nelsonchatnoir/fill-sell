// VERROU « CHAQUE ARTICLE DU MAIL DE VENTE PORTE SA PLATEFORME : SON NOM ET SON LOGO » (19/11/2026 après-midi, ordre de Nico)
// `npm run selftest:mail-vente-logo-plateforme` — sans base, sans réseau : il rend les vrais gabarits.
// Cas : le client Business 447d920c. Le mail GROUPÉ (commande Vinted de 5 articles, note 13988, 19/11 09:13) ne montrait
// pas la plateforme de chaque article, alors que le mail d'un article la montrait (dans l'objet, « Vendu sur Vinted »).
// Les données étaient justes (relu en base : push-ventes passe à chaque ligne la plateforme de SA note — la tête d'une
// commande, chaque note d'un groupe, chaque ligne d'une rafale) : la plateforme n'était qu'un mot du même gris, au bout
// d'un long titre (« « Livre Barbie - Métiers 01 - Maîtresse d'école » — Vinted : vendu 1 € »), rien ne la faisait voir.
// La règle (_shared/email-template.ts, plateformeEnLigne ; _shared/emails-fillsell.ts, ligneDeVente) : dans les TROIS
// formes (un article, plusieurs, récapitulatif de rafale), chaque ligne d'une plateforme connue porte le LOGO de SA
// plateforme (PNG hébergé sur fillsell.app/email/, le fichier du bandeau, 22 × 22 en attributs, alt = le nom) suivi de
// son NOM en gras, même quand tout le mail est sur la même plateforme. « Vendu ailleurs » et une plateforme inconnue :
// aucun logo, le texte d'avant. Rien d'autre ne change (objet, ouverture, boutons, pied, lien « Me désinscrire »).
// Ce verrou CASSE si : une ligne perd son logo ou son nom, un logo n'est pas celui de sa ligne, une image n'est pas un
// PNG hébergé (base64, SVG), un logo apparaît sur « ailleurs », le type `vente:` de push-ventes change, ou le reste du
// mail bouge d'un octet par rapport à la référence d'avant (8f68590).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sansLogosDesVentes } from './lib/mail-vente-objet.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)}` : ''}`); } };
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const texte = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const E = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/emails-fillsell.ts')).href);
const P = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/plateformes.ts')).href);
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' };
const BASE = 'https://fillsell.app/email/';
const LIEN = 'https://fillsell.app/desinscription?t=jeton-essai-0123456789abcdef';
const v = (titre, plateforme, prixVente = 12, benefice = null, extra = {}) => ({ titre, plateforme, prixVente, benefice, ...extra });

// Les lignes de la liste à puces du mail (listePuces : la cellule de texte de chaque puce), HTML brut.
const lignesDuMail = (html) => [...String(html).matchAll(/<td valign="top" style="padding:0 0 (?:0|14px) 0; font-family:[^"]*">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
// Une ligne porte-t-elle le logo ET le nom de `slug` ? (un seul logo ; le bon fichier ; alt = nom ; 22 × 22 en attributs ;
// le nom écrit juste à côté, en gras ; le texte de la ligne le dit.)
const verifierLigne = (ligne, slug) => {
  const imgs = [...ligne.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  const nom = NOMS[slug];
  const fichier = P.PLATEFORMES[slug]?.logo;
  const fautes = [];
  if (imgs.length !== 1) fautes.push(`${imgs.length} image(s)`);
  const img = imgs[0] ?? '';
  if (!fichier || !img.includes(`src="${BASE}${fichier}"`)) fautes.push(`src ${img.match(/src="([^"]*)"/)?.[1] ?? '(absent)'}`);
  if (!img.includes(`alt="${nom}"`)) fautes.push(`alt ${img.match(/alt="([^"]*)"/)?.[1] ?? '(absent)'}`);
  if (!/ width="22"/.test(img) || !/ height="22"/.test(img)) fautes.push('largeur/hauteur absentes');
  const apres = img ? ligne.slice(ligne.indexOf(img) + img.length) : '';
  if (!new RegExp(`^&nbsp;<strong[^>]*>${nom}</strong>`).test(apres)) fautes.push('nom pas écrit à côté du logo');
  if (!texte(ligne).includes(`— ${nom}`)) fautes.push(`texte « ${texte(ligne)} »`);
  return fautes;
};

console.log('1. Chaque forme × chaque plateforme (FR et EN) : chaque ligne porte le nom ET le logo de SA plateforme, même quand tout le mail est sur la même');
for (const [slug, nom] of Object.entries(NOMS)) for (const lang of ['fr', 'en']) {
  const formes = [
    ['un article', E.mailVentes({ ventes: [v('Robe', slug)], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang), 1],
    ['un article, à confirmer, prix inconnu', E.mailVentes({ ventes: [v('Robe', slug, null)], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, lang), 1],
    ['groupe de 5, même plateforme (le cas de la note 13988)', E.mailVentes({ ventes: [1, 2, 3, 4, 5].map((i) => v(`Livre ${i}`, slug, 1.4)), retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang), 5],
    ['groupe, bénéfice connu et prix inconnu mêlés', E.mailVentes({ ventes: [v('A', slug, 20, 8), v('B', slug, null), v('C', slug, 0.4)], retraitsACliquer: 1, retraitsBeebsAuto: 0 }, lang), 3],
    ['récapitulatif de rafale, même plateforme', E.mailRafale({ ventes: Array.from({ length: 8 }, (_, i) => v(`Jeu ${i}`, slug, 8, null, { aConfirmer: i === 2 })) }, lang), 8],
  ];
  for (const [forme, m, attendu] of formes) {
    const lignes = lignesDuMail(m.html);
    const fautes = lignes.map((l, i) => { const f = verifierLigne(l, slug); return f.length ? `ligne ${i + 1} : ${f.join(', ')}` : null; }).filter(Boolean);
    ok(lignes.length === attendu && fautes.length === 0, `${nom}/${lang}, ${forme} : ${lignes.length} ligne(s), chacune « ${nom} » + son logo`, `${lignes.length} ligne(s) ; ${fautes.join(' | ')}`);
  }
}

console.log('2. Plateformes mélangées, « ailleurs » et plateforme inconnue');
{
  const cinq = Object.keys(NOMS);
  for (const lang of ['fr', 'en']) {
    const groupe = E.mailVentes({ ventes: cinq.map((s) => v(`Article ${s}`, s)), retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang);
    const lg = lignesDuMail(groupe.html);
    ok(lg.length === 5 && lg.every((l, i) => verifierLigne(l, cinq[i]).length === 0), `${lang} : un groupe des cinq plateformes — chaque ligne porte la SIENNE (nom et logo)`, lg.map((l, i) => verifierLigne(l, cinq[i]).join(',')).join(' | '));
    const raf = E.mailRafale({ ventes: Array.from({ length: 10 }, (_, i) => v(`Jeu ${i}`, cinq[i % 5], 8)) }, lang);
    const lr = lignesDuMail(raf.html);
    ok(lr.length === 10 && lr.every((l, i) => verifierLigne(l, cinq[i % 5]).length === 0), `${lang} : une rafale mélangée de 10 ventes — chaque vente porte la sienne`);
  }
  const mix = E.mailVentes({ ventes: [v('Robe', 'vinted'), v('Lampe', 'ailleurs', null), v('Sac', 'ailleurs', 30)], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  const lm = lignesDuMail(mix.html);
  ok(lm.length === 3 && verifierLigne(lm[0], 'vinted').length === 0 && !/<img/.test(lm[1]) && !/<img/.test(lm[2])
    && texte(lm[1]) === '« Lampe » — vendu ailleurs' && texte(lm[2]) === '« Sac » — vendu ailleurs : vendu 30 €',
  '« vendu ailleurs » : aucun logo, le texte d\'avant ; la ligne Vinted à côté garde le sien', lm.map(texte).join(' | '));
  const seulAilleurs = E.mailVentes({ ventes: [v('Lampe', 'ailleurs')], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'en');
  ok(!/<img [^>]*fs-logo-vente/.test(seulAilleurs.html) && lignesDuMail(seulAilleurs.html).length === 1, 'une seule vente « ailleurs » (EN) : aucun logo de plateforme');
  const inconnue = E.mailRafale({ ventes: [v('Bol', 'inconnue'), v('Tasse', 'vinted')] }, 'fr');
  const li = lignesDuMail(inconnue.html);
  ok(li.length === 2 && !/<img/.test(li[0]) && !/inconnue/.test(li[0]) && verifierLigne(li[1], 'vinted').length === 0,
    'plateforme inconnue : aucun logo, jamais le slug brut ; la ligne d\'à côté garde le sien', li.map(texte).join(' | '));
  const casse = E.mailVentes({ ventes: [v('Robe', ' Vinted ')], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  ok(verifierLigne(lignesDuMail(casse.html)[0] ?? '', 'vinted').length === 0, 'un slug en majuscules ou entouré d\'espaces (« Vinted ») : la même ligne, avec son logo');
}

console.log('3. Les logos : des PNG hébergés sur fillsell.app (public/email/), jamais d\'image embarquée');
{
  const m = E.mailRafale({ ventes: Object.keys(NOMS).map((s) => v(`A ${s}`, s)) }, 'fr');
  const imgs = [...m.html.matchAll(/<img [^>]*class="fs-logo-vente"[^>]*>/g)].map((x) => x[0]);
  ok(imgs.length === 5, `${imgs.length} logo(s) de plateforme dans les lignes d'une rafale des cinq plateformes`);
  ok(!/src="data:/i.test(m.html) && !/\.svg/i.test(m.html) && !/<svg/i.test(m.html), 'aucune image en base64, aucun SVG dans le mail');
  for (const slug of [...Object.keys(NOMS), 'opla']) {
    const f = P.PLATEFORMES[slug]?.logo;
    const chemin = path.join(RACINE, 'public', 'email', String(f));
    const b = f && existsSync(chemin) ? readFileSync(chemin) : null;
    ok(!!b && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && b.length < 12000, `${slug} : public/email/${f} existe, PNG de ${b ? b.length : 0} octets (servi en ${BASE}${f})`);
  }
  ok(P.BASE_LOGOS === 'https://fillsell.app/email', 'la base des logos est fillsell.app/email (servie par Vercel depuis public/email/)');
}

console.log('4. Rien d\'autre ne change : logos des lignes mis à part, le mail identique à l\'octet à la référence (8f68590), objet compris');
{
  const REF = '8f68590';
  const dir = path.join(RACINE, 'build', 'selftest-mail-vente-logo-plateforme', REF);
  let A = null;
  try {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const fichiers = execFileSync('git', ['ls-tree', '--name-only', REF, 'supabase/functions/_shared/'], { cwd: RACINE, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|js)$/.test(f));
    for (const f of fichiers) writeFileSync(path.join(dir, path.basename(f)), execFileSync('git', ['show', `${REF}:${f}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
    A = await import(pathToFileURL(path.join(dir, 'emails-fillsell.ts')).href);
  } catch (e) { ok(false, `référence ${REF} lisible`, e.message); }
  if (A) {
    const cas = [];
    for (const slug of [...Object.keys(NOMS), 'ailleurs', 'inconnue']) {
      cas.push([`un article ${slug}`, (M, l) => M.mailVentes({ ventes: [v('Robe d\'été <b>', slug, 15, 4)], retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, l)]);
      cas.push([`un article ${slug} à confirmer`, (M, l) => M.mailVentes({ ventes: [v('Robe', slug, null)], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, l)]);
      // (19/11 après-midi) Montants ronds ici : le prix au centime a changé exprès (verrou selftest:mail-vente-prix-exact).
      cas.push([`groupe ${slug}`, (M, l) => M.mailVentes({ ventes: [v('A & B', slug, 14), v('', slug, 0.4), v(null, slug, 30, -2)], retraitsACliquer: 2, retraitsBeebsAuto: 1, dejaVendu: ['ebay'], lienDesinscription: LIEN }, l)]);
      cas.push([`rafale ${slug}`, (M, l) => M.mailRafale({ ventes: Array.from({ length: 8 }, (_, i) => v(`Jeu « ${i} »`, slug, i % 3 ? 8 : null, i % 2 ? 3 : null, { aConfirmer: i === 1 })), dejaVendu: ['beebs'], lienDesinscription: LIEN }, l)]);
    }
    cas.push(['groupe mélangé', (M, l) => M.mailVentes({ ventes: Object.keys(NOMS).map((s) => v(s, s)).concat([v('x', 'ailleurs')]), retraitsACliquer: 0, retraitsBeebsAuto: 0 }, l)]);
    cas.push(['rafale mélangée', (M, l) => M.mailRafale({ ventes: Object.keys(NOMS).map((s) => v(s, s, null)).concat([v('x', 'ailleurs')]) }, l)]);
    const ecarts = [];
    for (const [nom, f] of cas) for (const l of ['fr', 'en']) {
      const avant = f(A, l), apres = f(E, l);
      if (avant.sujet !== apres.sujet) ecarts.push(`${nom}/${l} : objet « ${apres.sujet} » ≠ « ${avant.sujet} »`);
      else if (avant.html !== sansLogosDesVentes(apres.html)) ecarts.push(`${nom}/${l} : html`);
    }
    ok(ecarts.length === 0, `${cas.length * 2} mails (FR, EN) : même objet, et tout le reste à l'octet — ouverture, textes des lignes, boutons, pied, lien « Me désinscrire »`, ecarts.slice(0, 6).join(' | '));
    const avecLogos = cas.filter(([nom]) => !/ailleurs|inconnue/.test(nom)).every(([, f]) => f(E, 'fr').html !== f(A, 'fr').html);
    ok(avecLogos, 'et les mails des plateformes connues ne sont PAS ceux d\'avant (les logos sont là)');
  }
}

console.log('5. push-ventes : chaque ligne reçoit la plateforme de SA note ; type `vente:` et catégorie inchangés');
{
  const pv = lire('supabase/functions/push-ventes/index.ts');
  ok((pv.match(/subject: sujet, html, type: `vente:\$\{n\.id\}`/g) ?? []).length === 2 && (pv.match(/categorie: "notification", dedup: "reservation"/g) ?? []).length === 2,
    'les deux envois gardent le type `vente:<note>` (hors plafond des relances) et la catégorie « notification »');
  ok(/ligneDuMail\(admin, a, String\(n\.plateforme \?\? ""\)\)/.test(pv) && /ligneDuMail\(admin, a, String\(m\.plateforme \?\? ""\)\)/.test(pv) && /ligneDuMail\(admin, a, String\(l\.plateforme \?\? ""\)\)/.test(pv),
    'la plateforme d\'une ligne vient de sa note (tête d\'une commande, chaque note du groupe, chaque ligne de la rafale)');
  const PM = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/plafond-mails.js')).href);
  ok(Array.isArray(PM.PREFIXES_HORS_PLAFOND) && PM.PREFIXES_HORS_PLAFOND.includes('vente:'), 'le préfixe « vente: » reste hors du plafond des relances (_shared/plafond-mails.js)');
}

console.log(ko ? `\n✗ mail-vente-logo-plateforme : ${ko} échec(s) sur ${n}` : `\n✓ mail-vente-logo-plateforme : ${n}/${n}`);
process.exit(ko ? 1 : 0);
