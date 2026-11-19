// VERROU « LE MAIL DE VENTE NOMME TOUJOURS LA PLATEFORME, DANS L'OBJET ET DANS LE TEXTE » (19/11/2026, point 6 de Nico)
// `npm run selftest:mail-vente-plateforme-objet` — sans base, sans réseau : il rend les vrais gabarits.
// Cas : le client Business 447d920c branche nos mails de vente dans sa domotique. Le 19/11 à 09:13, la commande Vinted de
// 5 articles (note 13988) partait sous l'objet « 5 articles vendus 🎉 », sans plateforme ; la phrase d'ouverture non plus.
// La règle : les trois formes du mail de vente (un article, plusieurs, récapitulatif de rafale) ont UN objet stable,
// lisible par un filtre — « Vente <Plateforme(s)> — N article(s) vendu(s) 🎉 » (en : « Sale <Platform(s)> — N item(s)
// sold 🎉 ») — et la phrase d'ouverture dit « sur <Plateforme(s)> » ; chaque ligne garde sa plateforme (un récapitulatif
// qui mélange les plateformes : chaque vente porte la sienne). Rien d'autre ne change (lien de désinscription compris).
// Ce verrou CASSE si : un objet perd la plateforme ou change de format, une plateforme est oubliée, une ligne perd sa
// plateforme, ou le reste du mail bouge d'un octet par rapport à la référence d'avant (61c88fd).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { avecObjetEtOuvertureDe, OBJET_VENTE_RE } from './lib/mail-vente-objet.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300)}` : ''}`); } };
const texte = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&nbsp;|&#847;|&zwnj;/g, ' ').replace(/\s+/g, ' ').trim();
const E = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/emails-fillsell.ts')).href);
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' };
const v = (titre, plateforme, prixVente = 12) => ({ titre, plateforme, prixVente, benefice: null });
const LIEN = 'https://fillsell.app/desinscription?t=jeton-essai-0123456789abcdef';

console.log('1. Chaque plateforme, chaque forme : l\'objet stable et la phrase d\'ouverture la nomment');
for (const [slug, nom] of Object.entries(NOMS)) {
  const un = E.mailVentes({ ventes: [v('Robe', slug)], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  ok(un.sujet === `Vente ${nom} — 1 article vendu 🎉` && texte(un.html).includes(`vient d'être enregistrée sur ${nom} :`), `${nom}, un article : « ${un.sujet} »`, un.sujet);
  const plusieurs = E.mailVentes({ ventes: [v('A', slug), v('B', slug), v('C', slug)], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  ok(plusieurs.sujet === `Vente ${nom} — 3 articles vendus 🎉` && texte(plusieurs.html).includes(`viennent d'être enregistrées sur ${nom} :`), `${nom}, plusieurs articles : « ${plusieurs.sujet} »`, plusieurs.sujet);
  const rafale = E.mailRafale({ ventes: [v('A', slug), v('B', slug), v('C', slug), v('D', slug)] }, 'fr');
  ok(rafale.sujet === `Vente ${nom} — 4 articles vendus 🎉` && texte(rafale.html).includes(`arrivées d'un coup sur ${nom}.`), `${nom}, récapitulatif de rafale : « ${rafale.sujet} »`, rafale.sujet);
  const en = E.mailVentes({ ventes: [v('Robe', slug)], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'en');
  ok(en.sujet === `Sale ${nom} — 1 item sold 🎉` && texte(en.html).includes(`recorded on ${nom}:`), `${nom}, en anglais : « ${en.sujet} »`, en.sujet);
  for (const m of [un, plusieurs, rafale, en]) if (!OBJET_VENTE_RE.test(m.sujet)) ok(false, `format stable (${m.sujet})`);
}

console.log('2. Le cas du 19/11 (commande Vinted de 5 articles, note 13988) et les ventes mélangées');
{
  const c = E.mailVentes({ ventes: [1, 2, 3, 4, 5].map((i) => v(`Livre ${i}`, 'vinted', 1.4)), retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  ok(c.sujet === 'Vente Vinted — 5 articles vendus 🎉' && texte(c.html).includes("5 ventes viennent d'être enregistrées sur Vinted :"), `commande Vinted de 5 articles : « ${c.sujet} »`, c.sujet);
  const mix = E.mailVentes({ ventes: [v('Robe', 'leboncoin'), v('Pull', 'vinted')], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  const tm = texte(mix.html);
  ok(mix.sujet === 'Vente Vinted et Leboncoin — 2 articles vendus 🎉' && tm.includes('« Robe » — Leboncoin') && tm.includes('« Pull » — Vinted'), 'deux plateformes : l\'objet les nomme, chaque ligne porte la sienne', mix.sujet);
  const raf = E.mailRafale({ ventes: [v('Robe', 'leboncoin'), v('Pull', 'vinted'), v('Jean', 'ebay'), v('Body', 'beebs'), v('Veste', 'depop')] }, 'fr');
  const tr = texte(raf.html);
  ok(OBJET_VENTE_RE.test(raf.sujet) && Object.values(NOMS).every((x) => raf.sujet.includes(x)) && ['« Robe » — Leboncoin', '« Pull » — Vinted', '« Jean » — eBay', '« Body » — Beebs', '« Veste » — Depop'].every((x) => tr.includes(x)),
    `rafale des cinq plateformes : « ${raf.sujet} », chaque vente porte la sienne`, raf.sujet);
  const ailleurs = E.mailVentes({ ventes: [v('Sac', 'ailleurs')], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr');
  ok(ailleurs.sujet === 'Vente ailleurs — 1 article vendu 🎉' && OBJET_VENTE_RE.test(ailleurs.sujet), 'plateforme inconnue (« vendu ailleurs ») : « Vente ailleurs — 1 article vendu 🎉 », même format', ailleurs.sujet);
  const confirmer = E.mailVentes({ ventes: [v('Robe', 'vinted')], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true }, 'fr');
  ok(confirmer.sujet === 'Vente Vinted — 1 article vendu 🎉' && texte(confirmer.html).includes("vient d'être repérée sur Vinted :"), 'vente à confirmer : même objet, « repérée sur Vinted »');
}

console.log('3. Rien d\'autre ne change : le reste du mail identique à l\'octet à la référence (61c88fd)');
{
  const REF = '61c88fd';
  const dir = path.join(RACINE, 'build', 'selftest-mail-vente-plateforme-objet', REF);
  let A = null;
  try {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const fichiers = execFileSync('git', ['ls-tree', '--name-only', REF, 'supabase/functions/_shared/'], { cwd: RACINE, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|js)$/.test(f));
    for (const f of fichiers) writeFileSync(path.join(dir, path.basename(f)), execFileSync('git', ['show', `${REF}:${f}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
    A = await import(pathToFileURL(path.join(dir, 'emails-fillsell.ts')).href);
  } catch (e) { ok(false, `référence ${REF} lisible`, e.message); }
  if (A) {
    const cas = [
      ['un article', (M, l) => M.mailVentes({ ventes: [v('Robe', 'leboncoin', 15)], retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, l)],
      ['plusieurs', (M, l) => M.mailVentes({ ventes: [v('Robe', 'leboncoin', 15), v('Pull', 'vinted', 8)], retraitsACliquer: 2, retraitsBeebsAuto: 1, lienDesinscription: LIEN }, l)],
      ['à confirmer', (M, l) => M.mailVentes({ ventes: [v('Robe', 'vinted', 15)], retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: true, lienDesinscription: LIEN }, l)],
      ['rafale', (M, l) => M.mailRafale({ ventes: [v('Robe', 'leboncoin', 15), v('Pull', 'vinted', 8), v('Jean', 'ebay', 20)], dejaVendu: ['beebs'], lienDesinscription: LIEN }, l)],
    ];
    const ecarts = [];
    for (const [nom, f] of cas) for (const l of ['fr', 'en']) {
      const avant = f(A, l), apres = f(E, l);
      if (avant.html !== avecObjetEtOuvertureDe(apres, avant).html) ecarts.push(`${nom}/${l}`);
    }
    ok(ecarts.length === 0, 'objet et phrase d\'ouverture mis à part, tout le reste à l\'octet (lignes, boutons, pied, lien « Me désinscrire »), FR et EN', ecarts.join(', '));
    ok(cas.every(([, f]) => f(E, 'fr').html.includes(`href="${LIEN}"`)), 'le lien « Me désinscrire » est toujours là');
  }
}

console.log('4. push-ventes prend l\'objet du gabarit, sans le réécrire');
{
  const pv = readFileSync(path.join(RACINE, 'supabase/functions/push-ventes/index.ts'), 'utf8');
  ok((pv.match(/const \{ sujet, html \} = /g) ?? []).length === 2 && (pv.match(/subject: sujet, html, type: `vente:\$\{n\.id\}`/g) ?? []).length === 2, 'les deux envois partent sous l\'objet rendu par mailVentes / mailRafale');
}

console.log(ko ? `\n✗ mail-vente-plateforme-objet : ${ko} échec(s) sur ${n}` : `\n✓ mail-vente-plateforme-objet : ${n}/${n}`);
process.exit(ko ? 1 : 0);
