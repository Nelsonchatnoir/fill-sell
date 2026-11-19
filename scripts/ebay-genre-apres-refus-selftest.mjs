// selftest:ebay-genre-apres-refus — (18/11, point 5 de Nico — 2f8b09d2)
// APRÈS UN REFUS, LE RAYON eBAY SE CHOISIT AVEC LE GENRE DE L'ARTICLE, JAMAIS AVEC CELUI DU RAYON REFUSÉ.
//
//   npm run selftest:ebay-genre-apres-refus
//
// Cas (compte 2f8b09d2, tâche de2b3a54, 17/11 22:28) : « Parka longue NikeLab ACG Gore-Tex taille S », étagère Vinted
// 2551 (Hommes › … › Vestes coupe-vent), copie eBay au genre deviné « Femme » → 63862 « Femme : … › Manteaux, vestes
// et gilets » refusé par l'app → 57988 « Homme : … », DANS les suggestions d'eBay, écarté par l'IA parce qu'on lui
// disait « Femme » → « aucun rayon eBay sûr », en pause pour toujours (rejouée une fois sous 2026-11-09).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };
const charger = async (f) => { try { return await import(pathToFileURL(path.join(RACINE, f)).href); } catch (e) { return { __absent: String(e?.message ?? e).slice(0, 200) }; } };

const G = await charger('supabase/functions/_shared/ebay-genre-apres-refus.js');
const VB = await charger('supabase/functions/_shared/vinted-branche.ts');
const RR = await charger('supabase/functions/_shared/rayon-refuse-ebay.ts');
const RC = await charger('supabase/functions/_shared/ebay-rayon-a-notre-charge.js');
const EC = await charger('src/utils/ebayCategories.js');
const { FEUILLES } = await charger('src/utils/arbres/ebayFeuilles.js');
ok(!G.__absent, 'le module _shared/ebay-genre-apres-refus.js existe', G.__absent);
// Une fonction absente rend undefined (l'assertion qui suit échoue, sans tout arrêter).
const appel = (n, ...a) => { try { return typeof G[n] === 'function' ? G[n](...a) : undefined; } catch (e) { return { __erreur: e.message }; } };
const correspondance = (i, g) => {
  const id = EC.getEbayCategoryId?.(i, g); const chemin = EC.getEbayCategoryPath?.(i, g);
  return id && chemin ? { id: String(id), chemin } : null;
};

// La tâche réelle, telle qu'elle est en base (champs utiles).
const TITRE = 'Parka longue NikeLab ACG Gore‑Tex taille S kaki olive neuve avec étiquette';
const DESCRIPTION = "Superbe parka longue NikeLab ACG Gore‑Tex, coloris Olive Canvas / Volt Glow, en taille S. Modèle technique et recherché, référence AQ3516‑395. Les deux premières photos ont été générées pour mettre en valeur le vêtement porté sur mannequin.";
const REFUSE = ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : vêtements', 'Manteaux, vestes et gilets'];
const PF = { genre: 'Femme', categorie_icone: '🧥', categorie_source: 'icone_non_confirmee', ebayCategoryId: 63862, ebayCategoryPath: REFUSE,
  categorie_verification: { chemin_icone: REFUSE, objet: 'parka', source_avant: 'catalog_vinted', verdict: 'incoherent' } };
const SUGGESTIONS = ["142562 Collections > Militaria > Uniformes, coiffures, casques > L'après-guerre", '63862 ' + REFUSE.join(' > '),
  '63861 Vêtements, accessoires > Femme : vêtements, accessoires > Femme : vêtements > Robes',
  '57988 Vêtements, accessoires > Homme : vêtements, accessoires > Homme : vêtements > Manteaux, vestes et gilets',
  '51933 Vêtements, accessoires > Enfant : vêtements, accessoires > Garçon : vêtements, accessoires > Vêtements garçon (2-16 ans) > Manteaux, vestes et gilets',
  "134391 Sports, vacances > Sports d'hiver > Skis", '134426 Sports, vacances > Rugby > Equipements',
  '63864 Vêtements, accessoires > Femme : vêtements, accessoires > Femme : vêtements > Jupes',
  '185083 Vêtements, accessoires > Femme : vêtements, accessoires > Femme : vêtements > Vêtements de sport > Brassières',
  "93328 Sports, vacances > Sports d'hiver > Equipements de neige"].map((s) => { const i = s.indexOf(' '); return { id: s.slice(0, i), chemin: s.slice(i + 1).split(' > ') }; });

console.log("1. Le cas 2f8b09d2 : l'étagère Vinted où le vendeur l'a rangé fait le genre");
ok(VB.brancheVinted?.(2551) === 'Homme' && VB.etagereVinted?.(2551)?.chemin.join(' › ') === 'Hommes › Vêtements › Manteaux et vestes › Vestes › Vestes coupe-vent',
  'étagère 2551 = « Hommes › … › Vestes coupe-vent » → Homme (arbre relevé)');
const etagereAttr = appel('etagereDeLaFiche', { categorieVinted: { v: 2551, source: 'vinted_detail' }, colonne: 2551 }, VB.brancheVinted);
ok(etagereAttr?.genre === 'Homme' && /2551 \(attribut\)/.test(etagereAttr?.via ?? ''), `l'attribut d'un relevé d'abord (${JSON.stringify(etagereAttr)})`);
const etagereCol = appel('etagereDeLaFiche', { categorieVinted: null, colonne: 2551 }, VB.brancheVinted);
ok(etagereCol?.genre === 'Homme' && /2551 \(colonne\)/.test(etagereCol?.via ?? ''), 'sinon la colonne vinted_catalog_id (942 tâches eBay sur 2 794 n\'ont qu\'elle)');
ok(appel('etagereDeLaFiche', { categorieVinted: { v: 2551, source: 'ia' }, colonne: null }, VB.brancheVinted) === null, "un attribut qui ne vient pas d'un relevé ne compte pas");
ok(appel('etagereDeLaFiche', { categorieVinted: { v: 3048, source: 'vinted_detail' }, colonne: 3048 }, VB.brancheVinted) === null, 'une étagère sans public (Livres et médias › VHS) : rien');
const g = appel('genreApresRefus', { genre: PF.genre, titre: TITRE, description: DESCRIPTION, pf: PF, etagere: etagereAttr });
ok(g?.genre === 'Homme' && g.source === 'etagere_vinted' && g.avant === 'Femme' && g.change === true, `genre deviné « Femme » contraire à l'étagère → « Homme » (${JSON.stringify(g)})`);
const corr = appel('rayonDeLaCorrespondance', { icone: PF.categorie_icone, genre: g?.genre, refuses: [REFUSE], idRefuse: '63862', correspondance });
ok(corr?.id === '57988' && corr.chemin.join(' > ') === 'Vêtements, accessoires > Homme : vêtements, accessoires > Homme : vêtements > Manteaux, vestes et gilets',
  `notre correspondance 🧥 + Homme → 57988 (${corr?.id})`);
ok(Boolean(FEUILLES?.some((f) => f.id === '57988') && FEUILLES?.some((f) => f.id === '63862')), "57988 et 63862 sont des feuilles de l'arbre eBay France relevé");
const restantes = RR.suggestionsSansRefus?.(SUGGESTIONS, [REFUSE], '63862') ?? [];
ok(restantes.length === 9 && !restantes.some((s) => s.id === '63862'), "les 10 suggestions d'eBay moins le rayon refusé : 9 (comme le 17/11)");
const cand = appel('avecCandidat', restantes, corr);
ok(cand?.[0]?.id === '57988' && cand.filter((s) => s.id === '57988').length === 1 && cand.length === 9, 'la correspondance en tête, jamais en double');
ok(appel('avecCandidat', restantes, null) === restantes, 'sans correspondance : les suggestions telles quelles');

console.log("\n2. Ce qui prime sur l'étagère, et ce qui ne change pas");
const G2 = (x) => appel('genreApresRefus', x);
// (19/11, décision de Nico) L'étagère Vinted fait foi AVANT toute déduction de l'app — le texte compris (titre réécrit
// par l'IA) : _shared/genre-etagere-vinted.js, scripts/ebay-genre-etagere-selftest.mjs. Sans étagère, le texte prime.
ok(G2({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: PF, etagere: etagereAttr })?.genre === 'Homme', "l'étagère Vinted prime sur le genre écrit dans le titre (décision du 19/11)");
ok(G2({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: PF, etagere: null })?.genre === 'Femme', 'sans étagère : le genre écrit dans le titre prime (règle du 30/10)');
ok(G2({ genre: 'Femme', titre: TITRE, pf: { ...PF, categorie_source: 'choix_humain' }, etagere: etagereAttr })?.genre === 'Femme', 'un rayon choisi par la personne : son genre reste');
ok(G2({ genre: 'Femme', titre: TITRE, pf: { ...PF, genre_du_choix: { de: 'vinted' } }, etagere: etagereAttr })?.genre === 'Femme', "un public choisi à l'écran : son genre reste");
ok(G2({ genre: 'Homme', titre: TITRE, pf: PF, etagere: etagereAttr })?.change === false, "genre déjà celui de l'étagère : rien ne change");
ok(G2({ genre: 'Bébé', titre: 'Combinaison pilote', pf: {}, etagere: { genre: 'Enfant', via: 'étagère Vinted 1193' } })?.genre === 'Bébé', 'Bébé sous une étagère « Enfants » : compatible, gardé');
ok(G2({ genre: 'Femme', titre: TITRE, pf: PF, etagere: null })?.genre === 'Femme' && G2({ genre: 'Femme', titre: TITRE, pf: PF, etagere: null })?.change === false,
  "sans étagère Vinted : le genre d'avant, au caractère près");
ok(G2({ genre: '', titre: TITRE, pf: PF, etagere: etagereAttr })?.genre === 'Homme', "genre vide : l'étagère le donne");
ok(appel('rayonDeLaCorrespondance', { icone: '🧥', genre: 'Femme', refuses: [REFUSE], idRefuse: '63862', correspondance }) === null, 'la correspondance ne rend jamais le rayon refusé');
ok(appel('rayonDeLaCorrespondance', { icone: null, genre: 'Homme', refuses: [REFUSE], idRefuse: '63862', correspondance }) === null, 'sans icône : aucune feuille ajoutée');

console.log('\n3. ebay-api-worker : la règle branchée dans le choix après refus, et la tâche en pause rejouée');
const W = lire('supabase/functions/ebay-api-worker/index.ts');
const iRefus = W.indexOf('const refuses = mappingRefuseParLApp(pf as Record<string, unknown>, cheminMappe);');
const iFin = W.indexOf('// ── RÈGLE N°2 : eBAY BAT UNE ICÔNE DEVINÉE', iRefus);
const bloc = iRefus > 0 && iFin > iRefus ? W.slice(iRefus, iFin) : '';
ok(/from "\.\.\/_shared\/ebay-genre-apres-refus\.js"/.test(W) && /import \{ brancheVinted \} from "\.\.\/_shared\/vinted-branche\.ts"/.test(W)
  && /from "\.\.\/\.\.\/\.\.\/src\/utils\/ebayCategories\.js"/.test(W), 'le worker importe la règle, la branche Vinted et notre correspondance');
ok(/const gr = genreApresRefus\(/.test(bloc) && /const restantes = avecCandidat\(suggestionsSansRefus\(suggestions, refuses, mappee\), parCorrespondance\)/.test(bloc),
  "dans le bloc du rayon refusé : genre de l'article, correspondance en tête");
ok(/choisirApresRefus\(restantes, \{\s*titre, genre: gr\.genre/.test(bloc) && !/choisirApresRefus\(restantes, \{\s*titre, genre: pf\.genre/.test(bloc),
  "l'IA reçoit le genre de l'article, plus celui du rayon refusé");
ok(/\.select\("titre, attributs, vinted_catalog_id"\)/.test(W), 'lireInventaire lit aussi la colonne vinted_catalog_id');
ok((W.match(/__etagere: etagereDeLaFiche\(|\.__etagere = etagereDeLaFiche\(/g) ?? []).length === 2, "l'étagère de la fiche voyage jusqu'à resoudreCategorie, en production ET au rejeu à blanc");
ok(/delete \(pf as Record<string, unknown>\)\.__etagere;/.test(W) && /delete \(pf as Record<string, unknown>\)\.__description;/.test(W), 'les champs de passage ne sont jamais écrits sur la tâche');
ok(/genre_apres_refus: \{ avant: gr\.avant, genre: gr\.genre/.test(W), 'le genre retenu suit le rayon qui part, tracé avec le genre deviné d\'avant');
ok(/rejouée avec les règles du \$\{REGLE_RAYON_VERSION\}/.test(W) && !/rejouée avec les règles du 09\/11/.test(W), 'la trace du rejeu dit la version des règles, plus « 09/11 » figé');
ok(String(RC.REGLE_RAYON_VERSION) >= '2026-11-18', `REGLE_RAYON_VERSION relevée (${RC.REGLE_RAYON_VERSION}, au moins 2026-11-18) : les pauses « chez nous » repartent seules`);
const job = { status: 'needs_user', platform: 'ebay', action: 'publish', platform_fields: { needs_user_source: 'ebay_rayon_a_notre_charge',
  last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_choisir' }, rayon_rejoue: { version: '2026-11-09', le: '2026-11-17T21:30:05.573Z' }, ebayCategorieAttente: { choix: [] } } };
ok(RC.aRejouer?.(job) === true, 'la tâche de2b3a54 (rejouée sous 2026-11-09) est rejouée une fois sous la nouvelle version');
ok(RC.aRejouer?.({ ...job, platform_fields: { ...job.platform_fields, rayon_rejoue: { version: RC.REGLE_RAYON_VERSION } } }) === false, 'une fois, jamais en boucle');

console.log(`\n${echecs ? '✗' : '✓'} selftest:ebay-genre-apres-refus — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
