// selftest:pages-anglais — (05/11 soir, lot « Ouverture du Cloud », phase 3 point 1) les pages à part (retour de
// paiement, annulation, connexion, mot de passe, désinscription, retour eBay) et les conditions du Cloud parlent anglais
// à une personne réglée en anglais — et le français reste celui d'avant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { languePage } from '../src/pages/languePage.js';
import { messageSucces } from '../src/pages/succesAchat.js';
import { conditionsCloud } from '../src/cloud/conditionsCloud.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sansFrancais = (t) => !/[àâçéèêëîïôûùœ]/i.test(String(t).replace(/€24\.99|24,99 €/g, '')) && !/\b(ton|tes|les|pour|avec|est|sont|une)\b/i.test(String(t));

// 1. La langue d'une page à part.
const fen = (search = '', stockage = null, langue = null) => ({ location: { search }, localStorage: { getItem: () => stockage }, navigator: { language: langue } });
ok(languePage(fen('?lang=en', 'fr', 'fr-FR')) === 'en', '?lang=en prime sur tout');
ok(languePage(fen('', 'en', 'fr-FR')) === 'en' && languePage(fen('', 'fr', 'en-US')) === 'fr', 'puis le réglage de l’app (fs_lang)');
ok(languePage(fen('', null, 'en-GB')) === 'en' && languePage(fen('', null, 'fr-BE')) === 'fr', 'puis la langue du navigateur');
ok(languePage(fen('', null, null)) === 'fr' && languePage(null) === 'fr', 'sinon le français');

// 2. La page de retour du paiement.
for (const p of [{ produit: 'cloud', essai: '1' }, { produit: 'cloud' }, { produit: 'standard' }, { produit: 'pro' }, { produit: 'business' }, { produit: 'pack' }, {}]) {
  const en = messageSucces(p, 'en');
  const fr = messageSucces(p);
  ok(sansFrancais(`${en.titre} ${en.texte} ${en.suite ?? ''}`), `retour de paiement en anglais, sans un mot de français (${p.produit ?? 'neutre'})`);
  ok(en.valeur === fr.valeur && en.produit === fr.produit, `même mesure d’achat dans les deux langues (${p.produit ?? 'neutre'})`);
}
ok(messageSucces({ produit: 'cloud', essai: '1' }).titre === 'Ton FillSell Cloud démarre' && messageSucces({ produit: 'pro' }).suite === 'Annulable à tout moment, en 1 clic', 'français inchangé');

// 3. Les conditions du Cloud : traduction pour information, même structure, le français fait foi.
const FR = conditionsCloud(), EN = conditionsCloud('en');
ok(FR.titre === "Conditions d'utilisation de FillSell Cloud", 'français par défaut, inchangé');
ok(EN.articles.length === FR.articles.length && EN.articles.every((a, i) => a.ps.length === FR.articles[i].ps.length), 'anglais : mêmes articles, mêmes paragraphes');
ok(/French version prevails/.test(EN.version), 'anglais : « the French version prevails »');
ok(EN.articles.every((a) => a.ps.every((p) => sansFrancais(p.replace(/« |»|Hetzner Online GmbH|IPRoyal Services FZE LLC/g, '')))), 'anglais : aucun paragraphe en français');
ok(['case', 'accepter', 'annuler', 'lire', 'enregistrement', 'echec'].every((k) => EN[k] && sansFrancais(EN[k])), 'anglais : la case et les boutons');

// 4. Câblage des pages.
for (const f of ['src/pages/Success.jsx', 'src/pages/Cancel.jsx', 'src/pages/AuthCallback.jsx', 'src/pages/ResetPassword.jsx', 'src/pages/EbayRetour.jsx', 'src/pages/Desinscription.jsx', 'src/pages/ConditionsCloud.jsx', 'src/cloud/ConditionsCloudModale.jsx']) {
  ok(/languePage\(\)/.test(lire(f)), `${f} lit la langue de la page`);
}
ok(/MONTHS_EN = \["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"\]/.test(lire('src/pages/StatsPage.jsx')), 'Statistiques (ancienne page) : les mois en anglais');

console.log(`✓ selftest:pages-anglais — ${n} assertions`);
