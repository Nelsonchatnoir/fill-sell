// VERROU — lot « zéro friction » du 14/11/2026 (A1, A2, A3 — Nico) : plus aucun abandon dû à un champ.
// « Jamais de valeur inventée au hasard. Si la valeur est certaine → posée sans rien demander. Si elle est seulement
// probable → pré-remplie avec la meilleure valeur et un choix en 1 tap, jamais un champ vide qui bloque. Le dernier
// écran doit toujours laisser partir ce qui est prêt. »
// Mesuré au 13/11 (7 jours) : 44 sorties au dernier écran, 26 juste après un champ ; « Âge » Beebs 324 questions /
// 99 abandons (205 / 80 sur « Livres > Autres livres ») ; 66 clics eBay « bloqué au clic » sur des champs jamais montrés.
// Ce verrou casse si : l'âge Beebs redevient une question sur un livre adulte, une pointure enfant ou un CD sans signe
// jeunesse ; un roman d'adulte reste en « Autres livres » ; un « Produit » Leboncoin sans option nommée redevient un
// champ vide ; une plateforme qui attend grise de nouveau tout le bouton ; eBay refuse de nouveau un clic sur un champ
// que l'écran n'a pas montré. Données SYNTHÉTIQUES (aucun cas client).
import fs from "node:fs";
import { ageBeebsAuto, ageBeebsProbable, ageDeLaPointure, rayonBeebsDuLivre } from "../supabase/functions/_shared/champs-requis-auto.js";
import { valeurProbable, phraseValeurProbable } from "../src/publication/moteur/valeursProbables.js";

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m); } };
const AGES = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
const J = ["Jeux, jouets et loisirs"];
const v = (r) => r?.valeur ?? null;

console.log("A1 — l'âge Beebs : certain");
ok(v(ageBeebsAuto({ chemin: [...J, "Jeux d'extérieur et sport", "Rollers et skates"], textes: ["Rollers enfant pointure 34", ""], allowedValues: AGES })) === "8 ans - 12 ans", "pointure 34 écrite (une seule tranche) → « 8 ans - 12 ans », certain");
ok(ageBeebsAuto({ chemin: [...J, "Jeux d'extérieur et sport", "Rollers et skates"], textes: ["Rollers et protections du 32 au 35", ""], allowedValues: AGES }) === null, "plage 32 → 35 à cheval sur deux tranches : jamais « certain »");
ok(ageDeLaPointure(["Casque de ski taille 51/54 cm"]) === null, "un tour de tête (« 51/54 cm ») n'est pas une pointure");
ok(ageDeLaPointure(["Lot de 2 jeux, de 10 à 12 joueurs"]) === null, "« de 10 à 12 » n'est pas une pointure");
ok(v(ageBeebsAuto({ chemin: [...J, "Multimédia", "Jeux vidéo"], textes: ["GTA V", "pegi 18"], allowedValues: AGES })) === "16 ans et +", "PEGI 18 → « 16 ans et + » (inchangé)");
ok(ageBeebsAuto({ chemin: [...J, "Livres", "Autres livres"], textes: ["Le Petit Prince", "Saint-Exupéry, Folio"], allowedValues: AGES }) === null, "ni adulte ni jeunesse écrits : jamais « certain » (inchangé)");

console.log("A1 + A3 — l'âge Beebs : probable (pré-rempli, montré, un geste pour le changer)");
ok(v(ageBeebsProbable({ chemin: [...J, "Jeux d'extérieur et sport", "Rollers et skates"], textes: ["Rollers et protections du 32 au 35", ""], allowedValues: AGES })) === "8 ans - 12 ans", "rollers du 32 au 35 → « 8 ans - 12 ans » (milieu de la plage)");
ok(v(ageBeebsProbable({ chemin: [...J, "Livres", "Autres livres"], textes: ["Magazine de jeux vidéo rétro n°12", "Ce magazine a été vérifié, il ne manque pas de pages."], allowedValues: AGES })) === "16 ans et +", "magazine sans signe jeunesse → « 16 ans et + »");
ok(v(ageBeebsProbable({ chemin: [...J, "Livres", "Autres livres"], textes: ["Livre de tennis, pensez comme un champion", "Bon état, lu une fois"], allowedValues: AGES })) === "16 ans et +", "essai / livre pratique sans signe jeunesse → « 16 ans et + »");
ok(v(ageBeebsProbable({ chemin: [...J, "Multimédia", "CD"], textes: ["CD single rap français 1996", ""], allowedValues: AGES })) === "16 ans et +", "CD sans signe jeunesse → « 16 ans et + »");
ok(ageBeebsProbable({ chemin: [...J, "Livres", "Autres livres"], textes: ["Lot de 9 livres Petit Ours Brun", ""], allowedValues: AGES }) === null, "Petit Ours Brun (signe jeunesse) : jamais « 16 ans et + »");
ok(ageBeebsProbable({ chemin: [...J, "Multimédia", "DVD"], textes: ["DVD dessin animé pour enfants", ""], allowedValues: AGES }) === null, "DVD pour enfants : jamais « 16 ans et + »");
ok(ageBeebsProbable({ chemin: [...J, "Livres", "Romans pour enfant"], textes: ["Roman", ""], allowedValues: AGES }) === null, "rayon « Romans pour enfant » : aucun âge probable");
ok(v(ageBeebsProbable({ chemin: [...J, "Jeux de société"], textes: ["Jeu d'apéro entre amis", "Pour adultes, culture générale"], allowedValues: AGES })) === "16 ans et +", "jeu de société pour adultes → « 16 ans et + »");
ok(ageBeebsProbable({ chemin: [...J, "Jeux de société"], textes: ["Jeu incollable famille", "Pour enfant et adulte"], allowedValues: AGES }) === null, "jeu « enfant et adulte » : la question (signe jeunesse)");
ok(v(ageBeebsProbable({ chemin: [...J, "Puzzles"], textes: ["Puzzle 1000 pièces paysage", ""], allowedValues: AGES })) === "12 ans - 16 ans", "puzzle de 1000 pièces → « 12 ans - 16 ans »");
ok(ageBeebsProbable({ chemin: [...J, "Figurines"], textes: ["Figurine cheval", ""], allowedValues: AGES }) === null, "figurine sans indice : la question (rien d'inventé)");
ok(ageBeebsProbable({ chemin: [...J, "Multimédia", "Jeux vidéo"], textes: ["Jeu PS1 PAL", ""], allowedValues: AGES }) === null, "jeu vidéo sans PEGI : la question (rien d'inventé)");

console.log("A1 — un livre adulte ne reste pas dans un rayon Beebs pour enfants");
const AL = [...J, "Livres", "Autres livres"];
ok(JSON.stringify(rayonBeebsDuLivre({ chemin: AL, textes: ["Le carnet de lady X, éditions de poche", "Roman traduit de l'italien, couverture illustrée"] })?.chemin) === JSON.stringify([...J, "Livres", "Romans pour adultes"]), "roman sans signe jeunesse en « Autres livres » → « Romans pour adultes »");
ok(JSON.stringify(rayonBeebsDuLivre({ chemin: AL, textes: ["Livre de recettes de pâtisserie", ""] })?.chemin) === JSON.stringify([...J, "Livres", "Livres de recettes"]), "livre de recettes → « Livres de recettes »");
ok(JSON.stringify(rayonBeebsDuLivre({ chemin: [...J, "Livres", "Romans pour enfant"], textes: ["Twisted – tome 1", "Romance new adult"] })?.chemin) === JSON.stringify([...J, "Livres", "Romans pour adultes"]), "« new adult » rangé en « Romans pour enfant » → « Romans pour adultes »");
ok(rayonBeebsDuLivre({ chemin: AL, textes: ["Roman jeunesse dès 8 ans", ""] }) === null, "roman jeunesse : le rayon de l'IA reste");
ok(rayonBeebsDuLivre({ chemin: [...J, "Livres", "Romans pour enfant"], textes: ["Roman", "Bon état"] }) === null, "« Romans pour enfant » sans signe adulte : reste");
ok(rayonBeebsDuLivre({ chemin: ["Mode", "Femme", "Robes"], textes: ["Roman"] }) === null, "hors des livres : rien");

console.log("A2 + A3 — la valeur probable des autres champs");
const vp = (o) => valeurProbable(o);
ok(vp({ platform: "vinted", key: "video_game_ratings", label: "Classification", allowedValues: ["PEGI 3", "PEGI 7", "Non précisé"] })?.valeur === "Non précisé"
  && vp({ platform: "vinted", key: "video_game_ratings", label: "Classification", allowedValues: ["PEGI 3", "Non précisé"] })?.certitude === "certaine", "classification d'un jeu inconnue → « Non précisé » (vrai : certaine)");
ok(vp({ platform: "leboncoin", key: "image_sound_product", label: "Produit", allowedValues: ["Enceintes", "Casque", "Autres"] })?.valeur === "Autres", "Leboncoin « Produit » sans option nommée → « Autres » (probable)");
ok(vp({ platform: "leboncoin", key: "music_type", label: "Type", allowedValues: ["Guitares et basses", "Pianos et claviers", "Autre"] })?.certitude === "probable", "Leboncoin « Type » d'instrument → « Autre », probable");
ok(vp({ platform: "ebay", key: "Type", label: "Type", allowedValues: ["Boucle de ceinture"] })?.valeur === "Boucle de ceinture", "eBay : la SEULE valeur suggérée pour le rayon (« Boucle de ceinture »)");
ok(vp({ platform: "beebs", key: "Taille", label: "Taille", allowedValues: ["S / 36", "M / 38", "Autre"] }) === null, "une taille ne se devine jamais (même avec « Autre » dans la liste)");
ok(vp({ platform: "vinted", key: "brand", label: "Marque", allowedValues: ["Nike", "Autre"] }) === null, "une marque ne se devine jamais");
ok(vp({ platform: "leboncoin", key: "condition", label: "État", allowedValues: ["Très bon état", "Autre"] }) === null, "un état ne se devine jamais (la question « État » du 13/11 reste)");
ok(vp({ platform: "leboncoin", key: "clothing_type", label: "Univers", allowedValues: ["Femme", "Homme", "Enfant", "Autre"] }) === null, "un public (univers, genre) ne se devine jamais");
ok(vp({ platform: "beebs", key: "Console", label: "Console", allowedValues: ["PS4", "Switch", "Autre"] }) === null, "la machine d'un jeu garde sa règle (jamais « Autre » à sa place)");
ok(vp({ platform: "ebay", key: "Matière doublure externe", label: "Matière doublure externe", allowedValues: ["Coton", "Polyester", "Laine"] }) === null, "matière eBay sans neutre : rien d'inventé");
ok(vp({ platform: "beebs", key: "Âge", label: "Âge", allowedValues: AGES, chemin: AL, textes: ["Magazine rétro", ""] })?.valeur === "16 ans et +", "l'Âge Beebs passe par sa règle");
ok(/FillSell a choisi « Autres »/.test(phraseValeurProbable({ valeur: "Autres", motif: "x", certitude: "probable" })), "la carte dit ce que FillSell a choisi, et qu'on peut le changer");

console.log("A3 — l'écran : pose visible, bouton qui laisse partir ce qui est prêt, clic eBay jamais mort");
const L = fs.readFileSync(new URL("../src/components/ListingPreviewScreen.jsx", import.meta.url), "utf8");
const S = fs.readFileSync(new URL("../src/publication/StepperNouveau.jsx", import.meta.url), "utf8");
const B = fs.readFileSync(new URL("../src/publication/BlocQuestions.jsx", import.meta.url), "utf8");
const E = fs.readFileSync(new URL("../src/publication/EcranSuivi.jsx", import.meta.url), "utf8");
const R = fs.readFileSync(new URL("../src/utils/resolutionPublication.js", import.meta.url), "utf8");
ok(/const final = variante !== "nouvelle" \? enrichi : enrichi\.map/.test(L) && /source: `probable:\$\{prob\.source\}`/.test(L), "la valeur probable est posée en DERNIER, nouveau stepper seulement");
ok(/if \(d\.probable\) noterPoseProbable\(/.test(L) && /feature: "valeur_probable"/.test(L), "chaque pose probable est montrée (posesMemoire, sorte « probable ») et tracée (valeur_probable)");
ok(/pose\.sorte === "probable"/.test(B) && /<ChoixEnPuces valeurs=\{pose\.allowedValues\}/.test(B), "la carte d'une valeur probable se change en un geste (puces)");
ok(/const plateformesRetenuesAuClic = variante !== "nouvelle"/.test(L) && /const publishChips = \[\.\.\.plateformesPubliables\]\.filter\(p => !plateformesRetenuesAuClic\.includes\(p\)\)/.test(L), "une plateforme qui attend est RETENUE (sortie du compte du bouton), pas toutes");
ok(!/\(variante === "nouvelle" && plateformesBloqueesChamps\.length > 0\) \|\|/.test(L) && /\(variante === "nouvelle" && publishChips\.length === 0 && plateformesRetenuesAuClic\.length > 0\)/.test(L), "le bouton ne grise plus pour UNE plateforme (seulement si plus rien ne part)");
ok(/\(variante !== "nouvelle" && \(ebayRequiredStatus \?\? \[\]\)\.some\(aspectBloquant\)\)/.test(L) && /\(variante !== "nouvelle" && missingSharedFields\.length > 0\)/.test(L), "eBay et un champ partagé ne grisent plus tout (nouveau stepper)");
ok(/if \(missingSharedFields\.length && variante !== "nouvelle"\)/.test(L) && /for \(const a of \(ebayRequiredStatus \?\? \[\]\)\.filter\(aspectBloquant\)\) ajouter\("ebay", a\.name\)/.test(L), "au clic, le champ partagé et l'aspect eBay qui attendent retiennent LEUR plateforme");
ok(/logChampBloquant\("laisse_au_depot"/.test(L) && /guardMessages\.length = 0;/.test(L), "un champ eBay jamais montré à l'écran ne refuse plus le clic (laissé au dépôt)");
ok(/data-retenues=/.test(S) && /retirables\.length && m\.selected\.size > 1 && disabled/.test(S), "le bouton dit nommément qui attend ; « Continuer sans X » seulement quand rien ne part");
ok(/m\.publieesSansPf \?\? \[\]\)\.filter/.test(E), "l'écran de suivi nomme ce qu'attend chaque plateforme retenue");
ok(/champsManquantsParPf: champsRetenusPrevus,/.test(L), "la carte « Partira sur … » dit la même chose que le clic (champ partagé, aspect eBay)");
ok(/rayonBeebsDuLivre\(\{ chemin: pfB\.beebsCategoryPath/.test(R), "la résolution range le livre adulte (Beebs) après tous les choix");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
