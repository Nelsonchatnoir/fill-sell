// selftest:ebay-modele-garde — (15/10, lot C-bis, Romain GUERIN) Un aspect eBay
// exigé déjà REMPLI n'est plus refusé au clic ; un aspect vraiment vide est
// demandé SUR L'ÉCRAN, et la publication repart seule à la réponse.
// Cas fondateur (prouvé en base) : Polaroid « One Step + Display », catégorie
// 31388, la rédaction eBay avait mis « Modèle » dans pf.modele (« OneStep+ ») :
// puce ✓ à l'écran, mais la garde du clic ne lisait que pf.ebayAspects →
// « eBay exige pour cette catégorie : Modèle. Complète ce(s) champ(s) dans les
// champs eBay de l'annonce » — et partout où la personne pouvait écrire
// « Modèle », c'était pf.modele (impasse, depuis 642b6e2 du 24/09). Les deux
// voies (worker CHAMP_PAR_ASPECT, ebay.js fields.modele) prenaient pf.modele.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const R = await import(pathToFileURL(join(ROOT, 'src/publication/moteur/regles.js')).href);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const listeFaitFoi = (platform, mode) => platform === 'ebay' && mode === 'SELECTION_ONLY';
// Rapprochement « par mots » volontairement GOURMAND : il prouverait un
// remplacement de la valeur s'il était appelé.
const voisinGourmand = (val, allowed) => allowed.find((a) => a.toLowerCase().startsWith(String(val).slice(0, 3).toLowerCase())) ?? null;
const req31388 = [
  { name: 'Marque', allowedValues: ['Polaroid', 'Canon'], mode: 'FREE_TEXT' },
  { name: 'Modèle', allowedValues: ['OneStep 2', 'SX-70', 'Polaroid Now'], mode: 'FREE_TEXT' },
  { name: 'Type', allowedValues: ['Instantané', 'Compact'], mode: 'FREE_TEXT' },
];

console.log('1. La garde lit « Modèle » et « Capacité de stockage » là où ils vivent');
{
  const pfE = { marque: 'Polaroid', modele: 'OneStep+', ebayAspects: { Type: 'Instantané' } };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: req31388, outils: { nearestAllowedValue: voisinGourmand, listeFaitFoi } });
  ok(v.missingEmpty.length === 0, 'Romain : pf.modele « OneStep+ » → plus aucun refus au clic');
  ok(pfE.modele === 'OneStep+' && !v.rapproches.some((r) => r.name === 'Modèle'), 'la valeur part telle qu\'écrite : jamais remplacée par une voisine de la liste');
  ok(v.horsListe.some((h) => h.name === 'Modèle'), 'hors liste FREE_TEXT → simple avertissement, la liste n\'est qu\'une suggestion');
}
{
  const pfE = { marque: 'Polaroid', modele: '', ebayAspects: { Type: 'Instantané' } };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: req31388, outils: { nearestAllowedValue: voisinGourmand, listeFaitFoi } });
  ok(v.missingEmpty.length === 1 && v.missingEmpty[0] === 'Modèle', 'vraiment vide (ni pf.modele ni ebayAspects) → toujours demandé, jamais inventé');
}
{
  const pfE = { marque: 'Polaroid', ebayAspects: { Type: 'Instantané', 'Modèle': 'Polaroid P Coca-Cola' } };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: req31388, outils: { nearestAllowedValue: () => null, listeFaitFoi } });
  ok(v.missingEmpty.length === 0, '14/10 : « Modèle » posé par l\'IA dans ebayAspects → passe toujours (rien ne régresse)');
}
{
  const pfE = { marque: 'Apple', stockage: '256 Go', ebayAspects: {} };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: [{ name: 'Capacité de stockage', allowedValues: ['128 Go', '256 Go'], mode: 'FREE_TEXT' }], outils: { nearestAllowedValue: voisinGourmand, listeFaitFoi } });
  ok(v.missingEmpty.length === 0 && pfE.stockage === '256 Go', 'Capacité de stockage lue dans pf.stockage (catégorie 9355)');
}
{
  const pfE = { modele: 'Inconnu 3000', ebayAspects: {} };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: [{ name: 'Modèle', allowedValues: ['A', 'B'], mode: 'SELECTION_ONLY' }], outils: { nearestAllowedValue: voisinGourmand, listeFaitFoi } });
  ok(v.invalides.some((x) => x.name === 'Modèle') && pfE.modele === 'Inconnu 3000', 'liste qui FAIT FOI : hors liste → question, jamais une valeur voisine imposée');
}
{
  const pfE = { marque: '', taille: 'EU 42', matiere: 'Unique', ebayAspects: {} };
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: [{ name: 'Marque', allowedValues: ['Zara'], mode: 'FREE_TEXT' }, { name: 'Matière', allowedValues: ['Taille unique'], mode: 'SELECTION_ONLY' }], outils: { nearestAllowedValue: (val, a) => (val === 'Unique' ? a[0] : null), listeFaitFoi } });
  ok(v.missingEmpty.includes('Marque') && pfE.matiere === 'Taille unique', 'les quatre champs d\'avant (Marque, Taille, Couleur, Matière) : comportement inchangé');
}

console.log('2. La réponse se lit comme la garde la lit (relance sans boucle)');
{
  const pfE = { modele: '', ebayAspects: { Type: 'Instantané' } };
  ok(R.aspectsEbayEncoreVides(pfE, ['Modèle', 'Type']).join() === 'Modèle', 'avant la réponse : « Modèle » encore vide');
  pfE.modele = 'OneStep+';
  ok(R.aspectsEbayEncoreVides(pfE, ['Modèle', 'Type']).length === 0, 'après la réponse (écrite dans pf.modele par la question) : plus rien de vide');
  ok(pfE.modele === 'OneStep+' && Object.keys(pfE.ebayAspects).join() === 'Type', 'lecture sur une COPIE : la copie eBay n\'est jamais modifiée');
}
{
  const ecran = lire('src/components/ListingPreviewScreen.jsx');
  ok(/aspectsEbayEncoreVides\(pfE, relanceEbay\.noms\)/.test(ecran) && /handlePublishRef\.current\?\.\(\)/.test(ecran), 'Confirmer : la publication repart seule quand la réponse est écrite');
  ok(/relanceEbayFaites\.current\.has\(cleRelance\)/.test(ecran) && /stepPublishEbayRequiredMissingManuel/.test(ecran), 'une fois par ensemble de champs : un second refus attend le bouton (jamais de boucle)');
  ok(/actif\.tagName === "INPUT"/.test(ecran) && /addEventListener\("focusout", planifier\)/.test(ecran), 'une saisie libre part quand on quitte le champ, jamais à la première lettre');
  const tr = lire('src/i18n/translations.js');
  ok(!/dans les champs eBay de l'annonce/.test(tr) && /réponds à la question sur cet écran, la publication repart toute seule/.test(tr), 'le message ne renvoie plus vers « les champs eBay de l\'annonce »');
  const worker = lire('supabase/functions/_shared/ebay-publication.ts');
  ok(/"Modèle": "modele",\s*\n?\s*"Capacité de stockage": "stockage"/.test(worker), 'voie API : le worker lit déjà pf.modele / pf.stockage (rien à changer côté serveur)');
  const ext = lire('chrome-extension/content-scripts/ebay.js');
  ok(/fillSpecificTracked\(\["Modèle"\], fields\.modele\)/.test(ext), 'voie navigateur : l\'extension remplit « Modèle » depuis fields.modele (rien à changer)');
}

console.log(`\n✓ ebay-modele-garde : ${n} contrôles verts`);
