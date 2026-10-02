// Autotest — la fenêtre « Vendre » enregistre une vraie vente (point 8, 02/10
// soir). `node scripts/vente-modale-selftest.mjs` (src/utils/venteModale.js).
// Règles de la base relevées le 02/10 (enregistrer_vente_atomique en prod) :
// annonce de la plateforme vendue → 'sold', jamais retirée ; copies prouvées
// des autres plateformes → retrait armé sans délai, SEULEMENT si le stock
// tombe à 0 ; vente partielle → un exemplaire décompté, rien de retiré.
import { codePlateformeVente, libellePlateformeVente, prixPrerempli, choixPlateformesVente,
  verdictVente, texteAvertissementEnLigne, CODES_VENTE } from "../src/utils/venteModale.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LE CODE ENVOYÉ À LA BASE");
ok(codePlateformeVente("Vinted") === "vinted" && codePlateformeVente("eBay") === "ebay" && codePlateformeVente("Leboncoin") === "leboncoin",
  "anciens libellés → codes");
ok(codePlateformeVente("lbc") === "leboncoin" && codePlateformeVente("Le bon coin") === "leboncoin", "Leboncoin sous ses autres noms");
ok(codePlateformeVente("Ailleurs") === "ailleurs" && codePlateformeVente("") === "ailleurs" && codePlateformeVente(null) === "ailleurs"
  && codePlateformeVente("en main propre") === "ailleurs", "vide / Ailleurs / main propre → 'ailleurs'");
ok(codePlateformeVente("Vestiaire Collective") === "Vestiaire Collective", "texte libre inconnu : rendu tel quel (le serveur le garde comme libellé)");
ok(CODES_VENTE.every((c) => codePlateformeVente(c) === c), "un code reste un code");
ok(libellePlateformeVente("ailleurs") === "Ailleurs / en main propre" && libellePlateformeVente("ebay") === "eBay", "libellés lisibles");

console.log("\n2. LE PRIX PRÉ-REMPLI");
ok(prixPrerempli({ sell: 12 }) === "12", "prix affiché de l'article");
ok(prixPrerempli({ sell: "12,5" }) === "12.5" && prixPrerempli({ sell: 9.999 }) === "10", "virgule et arrondi au centime");
ok(prixPrerempli({ sell: null }) === "" && prixPrerempli({ sell: 0 }) === "" && prixPrerempli({}) === "", "aucun prix connu : champ vide, rien d'inventé");
ok(prixPrerempli({ prix_vente: 7 }) === "7", "ligne brute (prix_vente) aussi");

console.log("\n3. LES PLATEFORMES RÉELLES DE L'ARTICLE");
const enLigne = [{ platform: "vinted", url: "https://www.vinted.fr/items/1" }, { platform: "beebs", url: null }];
const ch = choixPlateformesVente({ enLigne });
ok(ch.lu && ch.principales.map((p) => p.code).join(",") === "vinted,beebs", "ses annonces en ligne d'abord, dans l'ordre du Stock", JSON.stringify(ch));
ok(ch.autres.join(",") === "leboncoin,ebay,opla", "les autres repliées (annonce postée hors FillSell)");
ok(!choixPlateformesVente({ enLigne, oplaVisible: false }).autres.includes("opla"), "après la sortie d'Opla : Opla cachée aux comptes non reliés");
ok(choixPlateformesVente({ enLigne: [{ platform: "opla" }], oplaVisible: false }).principales[0]?.code === "opla",
  "Opla EN LIGNE pour cet article : proposée quand même (c'est une plateforme réelle)");
ok(choixPlateformesVente({ enLigne: null }).lu === false, "lecture pas encore aboutie : signalée");
ok(choixPlateformesVente({ enLigne: [] }).principales.length === 0, "aucune annonce : rien en avant, tout dans « Autre plateforme »");

console.log("\n4. CE QUI VA SE PASSER (verdict vrai)");
const v1 = verdictVente({ plateforme: "vinted", enLigne, quantiteStock: 1, quantiteVendue: 1 });
ok(v1.ton === "retrait" && /Ton annonce Vinted est marquée vendue — elle n'est jamais retirée/.test(v1.lignes.join(" "))
  && /L'annonce sur Beebs sera retirée automatiquement, tout de suite/.test(v1.lignes.join(" ")), "vendu sur Vinted : Vinted gardée, Beebs retirée", v1.lignes.join(" | "));
const v2 = verdictVente({ plateforme: "ailleurs", enLigne, quantiteStock: 1 });
ok(/Les annonces sur Vinted et Beebs seront retirées automatiquement/.test(v2.lignes.join(" ")), "ailleurs : toutes les annonces en ligne partent", v2.lignes.join(" | "));
const v3 = verdictVente({ plateforme: "vinted", enLigne, quantiteStock: 3, quantiteVendue: 1 });
ok(v3.ton === "neutre" && /Il restera 2 exemplaires en stock : aucune annonce n'est retirée/.test(v3.lignes[0]), "3 exemplaires, 1 vendu : rien de retiré", v3.lignes.join(" | "));
const v4 = verdictVente({ plateforme: "vinted", enLigne, quantiteStock: 3, quantiteVendue: 3 });
ok(v4.ton === "retrait", "les 3 vendus d'un coup : stock à 0, les copies partent");
const v5 = verdictVente({ plateforme: "ebay", enLigne: [], quantiteStock: 1 });
ok(v5.ton === "neutre" && /rien à retirer/.test(v5.lignes.join(" ")), "aucune annonce en ligne : rien à retirer");
const v6 = verdictVente({ plateforme: null, enLigne });
ok(/Choisis où l'article a été vendu/.test(v6.lignes[0]), "rien de choisi : on le demande, aucune présélection");
const v7 = verdictVente({ plateforme: "vinted", enLigne: [{ platform: "vinted" }], quantiteStock: 1 });
ok(v7.ton === "neutre" && /Aucune autre annonce en ligne/.test(v7.lignes.join(" ")), "seule l'annonce vendue est en ligne : rien d'autre à retirer");
ok(verdictVente({ plateforme: "Vinted", enLigne, quantiteStock: 1 }).ton === "retrait", "un ancien libellé passe par le même code");
ok(!/10 minutes|Supprime la vente avant/.test(texteAvertissementEnLigne("fr")), "plus de « dans 10 minutes » ni de promesse d'annulation : la base arme sans délai");
ok(/S'il reste des exemplaires en stock, rien n'est retiré/.test(texteAvertissementEnLigne("fr")), "carte vocale : le cas multi-exemplaires est dit");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ fenêtre « Vendre » : plateformes réelles, prix pré-rempli, verdict vrai");
