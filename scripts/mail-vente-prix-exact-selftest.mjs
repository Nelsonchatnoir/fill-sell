// VERROU « LE MAIL DE VENTE ÉCRIT LE PRIX EXACT, AU CENTIME » (19/11/2026 après-midi, décision de Nico)
// `npm run selftest:mail-vente-prix-exact` — sans base, sans réseau : il rend les vrais gabarits.
// Cas : le client Business 447d920c. La commande Vinted de 7 € du 19/11 09:13 (note 13988 : 5 livres à 1,40 €) s'écrivait
// « vendu 1 € » sur chacune des cinq lignes : _shared/emails-fillsell.ts arrondissait à l'euro (eurosPrix → euros,
// Math.round ; le bénéfice aussi). Règle (euros / eurosPrix) : le montant EXACT, au centime, dans les trois formes (un
// article, plusieurs, récapitulatif de rafale), FR et EN, prix et bénéfice — la forme de la notification de la MÊME vente
// (formaterPrix, _shared/push-envoi.ts) : un montant rond sans centimes (« 15 € », en : « €15 »), sinon au centime
// (« 1,40 € », en : « €1.40 »). Jamais « 0 € » pour un prix (règle du 16/10). Rien d'autre ne change.
// Ce verrou CASSE si : un prix ou un bénéfice est arrondi, un montant rond prend des centimes, la forme diffère de la
// notification, une ligne dit « 0 € », ou le reste du mail bouge d'un octet par rapport à la référence (HEAD, avant le
// prix exact ; logos des lignes mis à part — verrou selftest:mail-vente-logo-plateforme).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sansLogosDesVentes } from './lib/mail-vente-objet.mjs';
// (19/11) La référence « avant » est FIGÉE : b8df5c4, le dernier commit avant le prix au centime (6646aa5). HEAD la
// contient désormais : la comparer à HEAD comparerait le code à lui-même.
const REF_AVANT = 'b8df5c4';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)}` : ''}`); } };
// `--avant` : le même verrou sur le gabarit de HEAD (arrondi à l'euro) — il doit être ROUGE.
const AVANT = process.argv.includes('--avant');
const copieDeHead = (nom) => {
  const dir = path.join(RACINE, 'build', 'selftest-mail-vente-prix-exact', nom);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const fichiers = execFileSync('git', ['ls-tree', '--name-only', REF_AVANT, 'supabase/functions/_shared/'], { cwd: RACINE, encoding: 'utf8' }).split('\n').filter((x) => /\.(ts|js)$/.test(x));
  for (const x of fichiers) writeFileSync(path.join(dir, path.basename(x)), execFileSync('git', ['show', `${REF_AVANT}:${x}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
  return pathToFileURL(path.join(dir, 'emails-fillsell.ts')).href;
};
const E = await import(AVANT ? copieDeHead('avant') : pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/emails-fillsell.ts')).href);
if (AVANT) console.log('(--avant : le gabarit de HEAD, arrondi à l\'euro)');
const P = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/push-envoi.ts')).href);
const v = (titre, plateforme, prixVente, benefice = null, extra = {}) => ({ titre, plateforme, prixVente, benefice, ...extra });
// Les lignes de la liste à puces (listePuces), en texte (logos des lignes mis à part — le nom seul —, balises retirées,
// entités rendues).
const CELLULE = /<td valign="top" style="padding:0 0 (?:0|14px) 0; font-family:[^"]*">([\s\S]*?)<\/td>/g;
const lignes = (html) => [...sansLogosDesVentes(html).matchAll(CELLULE)]
  .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
const formes = (ventes, lang) => [
  ['un article', E.mailVentes({ ventes: ventes.slice(0, 1), retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang), 1],
  ['plusieurs', E.mailVentes({ ventes, retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang), ventes.length],
  ['rafale', E.mailRafale({ ventes }, lang), ventes.length],
];

console.log('1. Le cas réel : commande Vinted de 7 € = 5 × 1,40 € (note 13988, 19/11 09:13)');
{
  const titres = ["Livre Barbie - Métiers 01 - Maîtresse d'école", 'Livre Barbie - Métiers 04 - Fermière', 'Livre Barbie - Métiers 06 - Infirmière',
    'Livre Barbie - Métiers 07 - Cavalière', 'Livre Barbie - Métiers 09 - Patineuse'];
  // push-ventes passe le prix de chaque article tel que la base le sert (push_ventes.articles : « 1.40 ») → prixVenteConnu.
  const ventes = titres.map((t) => v(t, 'vinted', P.prixVenteConnu('1.40')));
  for (const lang of ['fr', 'en']) for (const [forme, m, nb] of formes(ventes, lang)) {
    const l = lignes(m.html);
    const attendu = titres.slice(0, nb).map((t) => (lang === 'fr' ? `« ${t} » — Vinted : vendu 1,40 €` : `« ${t} » — Vinted : sold for €1.40`));
    ok(JSON.stringify(l) === JSON.stringify(attendu), `${lang}, ${forme} : ${nb} ligne(s) « ${lang === 'fr' ? 'vendu 1,40 €' : 'sold for €1.40'} »`, l.join(' | '));
    ok(!/vendu 1 €|sold for €1(?![.\d])/.test(l.join('\n')), `${lang}, ${forme} : jamais « ${lang === 'fr' ? 'vendu 1 €' : 'sold for €1'} »`);
  }
  const total = lignes(E.mailVentes({ ventes, retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr').html)
    .reduce((s, x) => s + Number((x.match(/vendu ([\d,]+) €/)?.[1] ?? 'NaN').replace(',', '.')), 0);
  ok(Math.abs(total - 7) < 1e-9, `les cinq prix lus dans le mail font la commande : ${total.toFixed(2)} € (7 € attendus)`);
}

console.log('2. Chaque forme, FR et EN : le prix exact, la forme de la notification de la même vente (formaterPrix)');
{
  // [prix, FR, EN]
  const PRIX = [[15, '15 €', '€15'], [1.4, '1,40 €', '€1.40'], [12.99, '12,99 €', '€12.99'], [18.6, '18,60 €', '€18.60'], [0.5, '0,50 €', '€0.50'],
    [0.4, '0,40 €', '€0.40'], [100, '100 €', '€100'], [7.05, '7,05 €', '€7.05'], [14.999999999, '15 €', '€15'], [0.1 + 0.2, '0,30 €', '€0.30']];
  const fautes = [];
  for (const [prix, fr, en] of PRIX) for (const lang of ['fr', 'en']) {
    const ventes = [v('Robe', 'leboncoin', prix), v('Pull', 'ebay', prix)];
    const attendu = lang === 'fr' ? `« Robe » — Leboncoin : vendu ${fr}` : `« Robe » — Leboncoin : sold for ${en}`;
    for (const [forme, m] of formes(ventes, lang)) if (lignes(m.html)[0] !== attendu) fautes.push(`${prix}/${lang}/${forme} : « ${lignes(m.html)[0]} »`);
    // Même forme que la notification (formaterPrix), au centime près (un prix flottant de 14,999999999 s'y écrit « 15,00 € »).
    const push = P.formaterPrix(Math.round(prix * 100) / 100, 'EUR', lang);
    if (push !== (lang === 'fr' ? fr : en)) fautes.push(`${prix}/${lang} : notification « ${push} » ≠ mail « ${lang === 'fr' ? fr : en} »`);
  }
  ok(fautes.length === 0, `${PRIX.length} prix × 3 formes × FR/EN : le prix exact ; rond sans centimes ; la forme de la notification`, fautes.slice(0, 6).join(' | '));
}

console.log('3. Le bénéfice : exact, au centime, même règle (signe gardé)');
{
  const cas = [
    // [prix, bénéfice (tel que margeUnitaire le rend), FR, EN]
    [1.4, 1.4 - 0.5, 'vendu 1,40 €, +0,90 € de bénéfice', 'sold for €1.40, +€0.90 profit'],
    [14, 5, 'vendu 14 €, +5 € de bénéfice', 'sold for €14, +€5 profit'],
    [12.5, -2.5, 'vendu 12,50 €, -2,50 € de bénéfice', 'sold for €12.50, €-2.50 profit'],
    [9.99, 9.99 - 3.2, 'vendu 9,99 €, +6,79 € de bénéfice', 'sold for €9.99, +€6.79 profit'],
    [3, 0, 'vendu 3 €, +0 € de bénéfice', 'sold for €3, +€0 profit'],
  ];
  const fautes = [];
  for (const [prix, benef, fr, en] of cas) for (const lang of ['fr', 'en']) {
    for (const [forme, m] of formes([v('Jeu', 'vinted', prix, benef), v('Bol', 'beebs', 2)], lang)) {
      const l = lignes(m.html)[0];
      if (l !== `« Jeu » — Vinted : ${lang === 'fr' ? fr : en}`) fautes.push(`${prix}/${benef}/${lang}/${forme} : « ${l} »`);
    }
  }
  ok(fautes.length === 0, `${cas.length} bénéfices × 3 formes × FR/EN : exacts (« +0,90 € » et plus « +1 € »)`, fautes.slice(0, 6).join(' | '));
}

console.log('4. Les règles d\'avant tiennent : prix inconnu sans montant, jamais « 0 € », « ailleurs », « à confirmer »');
{
  const m = E.mailRafale({ ventes: [v('A', 'vinted', null), v('B', 'ailleurs', 2.3), v('C', 'depop', 0.004), v('D', 'ebay', 4.2, null, { aConfirmer: true })] }, 'fr');
  const l = lignes(m.html);
  ok(JSON.stringify(l) === JSON.stringify(['« A » — Vinted : vendu', '« B » — vendu ailleurs : vendu 2,30 €', '« C » — Depop : vendu 0,00 €', '« D » — eBay : vendu 4,20 € (à confirmer)']),
    'prix inconnu : « vendu » sans montant ; « ailleurs » au centime ; un prix sous le centime jamais « 0 € » ; « (à confirmer) » gardé', l.join(' | '));
  ok(!/vendu 0 €|€0(?![.\d])/.test(m.html), 'aucun « 0 € » dans le mail');
}

console.log('5. Rien d\'autre ne change : logos mis à part, le mail identique à l\'octet à la référence (HEAD), lignes mises à part');
{
  const REF = REF_AVANT;
  let A = null;
  try { A = await import(copieDeHead('ref')); } catch (e) { ok(false, `référence ${REF} lisible`, e.message); }
  if (A) {
    const LIEN = 'https://fillsell.app/desinscription?t=jeton-essai-0123456789abcdef';
    const rondes = [v('Veste', 'vinted', 35, 22), v('Lampe', 'leboncoin', 20), v(null, 'ebay', 12, -4), v('Sac', 'ailleurs', 18), v('Badge', 'beebs', 0.4), v('Body', 'depop', null)];
    const centimes = [v('Livre', 'vinted', 1.4), v('Robe', 'leboncoin', 18.6, 7.4), v('Sac', 'ailleurs', 12.99, 0.9), v('Jean', 'ebay', 0.5, -1.25)];
    const cas = (ventes) => [
      (M, l) => M.mailVentes({ ventes: ventes.slice(0, 1), retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, l),
      (M, l) => M.mailVentes({ ventes, retraitsACliquer: 2, retraitsBeebsAuto: 1, dejaVendu: ['ebay'], lienDesinscription: LIEN }, l),
      (M, l) => M.mailVentes({ ventes, retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, l),
      (M, l) => M.mailRafale({ ventes: ventes.map((x, i) => ({ ...x, aConfirmer: i === 1 })), dejaVendu: ['beebs'], lienDesinscription: LIEN }, l),
    ];
    const sansLignes = (html) => String(html).replace(CELLULE, (t, c) => t.replace(c, '…'));
    const e1 = [], e2 = [];
    for (const l of ['fr', 'en']) {
      cas(rondes).forEach((f, i) => { const a = f(A, l), b = f(E, l); if (a.sujet !== b.sujet || a.html !== sansLogosDesVentes(b.html)) e1.push(`${i}/${l}`); });
      cas(centimes).forEach((f, i) => { const a = f(A, l), b = f(E, l); if (a.sujet !== b.sujet || sansLignes(a.html) !== sansLignes(sansLogosDesVentes(b.html))) e2.push(`${i}/${l}`); });
    }
    ok(e1.length === 0, 'montants ronds (et 0,40 €) : objet et mail identiques à l\'octet, logos mis à part — trois formes, FR et EN', e1.join(', '));
    ok(e2.length === 0, 'montants au centime : seules les lignes changent (objet, ouverture, paragraphes, boutons, pied, lien « Me désinscrire » à l\'octet)', e2.join(', '));
  }
}

console.log(ko ? `\n✗ mail-vente-prix-exact : ${ko} échec(s) sur ${n}` : `\n✓ mail-vente-prix-exact : ${n}/${n}`);
process.exit(ko ? 1 : 0);
