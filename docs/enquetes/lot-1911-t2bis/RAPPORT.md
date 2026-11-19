# Lot du 19/11 — T2 bis : décisions de Nico sur le lot T2 (points 1 à 9)

> Heure de Paris. Comptes par leur id8. Suite du rapport `docs/enquetes/lot-1811-t2/RAPPORT.md`.

## 1. Migration A « vente avant le suivi » — APPLIQUÉE
- Feu vert de Nico (19/11). md5 de prod relus avant : `push_noter` 31f8991857f493e5ec277eb399689679,
  `push_noter_commande_vinted` 2cf1bb10fe432f2b29a2677ec3b671cf (= base de la migration). Base jetable reprouvée juste
  avant (29/29, 31/31). `db query -f` puis `migration repair --status applied 20261118233000`. Installé :
  `vente_avant_suivi` af326908…, `push_noter` 73243ec6…, `push_noter_commande_vinted` daa7d7cc…. INVERSE prêt.
- Preuve sur les données réelles (garde rejouée, en lecture seule, sur les 2 093 mails de vente envoyés en 30 jours) :
  2 064 (182 comptes) partent comme avant ; 29 auraient été retenus — `avant_suivi:date` 13 (4 comptes),
  `avant_suivi:etat_initial` 15 (5 comptes), `avant_suivi:vente_relevee` 1 : exactement les 29 ventes antérieures du
  18/11. Ventes notées depuis l'application : voir l'état de prod (à relire au fil des vraies ventes).

## 2. Lien « Me désinscrire » dans le mail de vente
- `mailVentes` / `mailRafale` (`_shared/emails-fillsell.ts`) : option `lienDesinscription` → le pied du gabarit montre
  « Me désinscrire » (« Unsubscribe ») ; sans lien, le mail d'avant à l'octet (comparé à HEAD). push-ventes pose le lien
  sur les deux chemins (`lienDuMailDeVente` → `lienDesinscription()` : le jeton de l'adresse, le même que le marketing).
- Verrou `selftest:mail-vente-lien-desinscription` : rouge sur HEAD (8 échecs sur 21), vert 21/21 — lien rendu,
  posé, chaîne clic → point d'entrée → registre → porte, refus définitif, simulation avant/après.
- Essai réel (le vrai point d'entrée email-desinscription v17) : une adresse d'essai `@exemple.invalid` posée avec un
  jeton, GET → `desinscrit:false`, POST `desinscrire` → `desinscrit:true` (origine `lien_email`) ; lignes d'essai effacées.

## 3. Relances et désinscription
- `job_pending_relaunch` et `relance_manuelle` (email-tunnel) passent en `notification` : filtrées par la désinscription,
  lien visible ; refus « desinscrit » = la réservation reste (jamais retentée chaque heure). Les relances Cloud
  (Sonnet-1) : `marketing`, non touchées. Verrou `selftest:mail-vente-desinscrit` complété (rouge sur HEAD : 4 échecs).

## 4. Genre eBay : l'étagère Vinted fait foi
- Cause : le genre de la copie eBay se décidait dans l'app (`resoudrePublication`, règle du texte puis auto-genre) sans
  lire l'étagère. Règle unique `_shared/genre-etagere-vinted.js`, lue par l'app (`resolutionPublication.js`) et le worker
  (`ebay-genre-apres-refus.js`) : choix de la personne > étagère genrée > (sans étagère) l'ordre d'avant à l'octet.
- Verrou `selftest:ebay-genre-etagere` : rouge 37/47 → vert 47/47 ; 58 selftests eBay/genre verts.
- Mesure 60 jours : 1 106 copies sur une fiche à étagère genrée ; 91 changeraient de genre (77 publiées, 20 comptes),
  915 déjà d'accord, 17 choix de la personne inchangés. Rien de déjà en ligne n'est réécrit.
- **Question** : un genre TAPÉ à la main dans le champ Genre de la carte eBay ne laisse aucune trace : l'étagère l'emporte
  (comme la règle du texte avant). Le fermer = une ligne dans ListingPreviewScreen.jsx (trace du choix).

## 5. Extension 0.6.193
- Copie Cloud montée (voir l'état de prod). Chrome Web Store :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.193-A-TELEVERSER\fillsell-extension-0.6.193-cws.zip` (seul dans son
  dossier ; 0.6.192 rangée dans `build\CWS-PERIMES\`).
- d5531b8e : la preuve « nom et prénom remplis » attend que la 0.6.193 tourne chez elle (après la publication du Web
  Store) — à relire en base (`profiles.extension_build`, jobs Leboncoin `last_diagnostic.identite`).

## 6. f5fab0e0 : 6 articles eBay bloqués chez nous
- Racine commune : là où la publication s'arrêtait (après un refus de l'app, ou « à confirmer »), le serveur ne regardait
  que le TITRE de la fiche — jamais l'objet vu (Lens/IA) ni l'étagère Vinted. `_shared/ebay-rayon-de-l-article.js` :
  rayon CORROBORÉ (objet + étagère/famille) → part sans IA ; après refus, second tour IA avec objet, étagère, ISBN et
  suggestions eBay sur l'OBJET ; « à confirmer » : corroboré → part, sinon l'étagère arbitre et l'IA stricte choisit dans
  ses rayons, sinon la question (le vrai doute). `REGLE_RAYON_VERSION` 2026-11-19 (rejeu une fois, sans geste).
- Attendu : statue → 36025, 4 poules → 36025, lot de 4 coffrets → 28145, anneaux lumineux → 19591 (déterministes) ;
  « Bowling story » (un livre) → IA, 171243 attendu ; poisson paulownia → IA stricte, 36025 ou 20150 attendus (sinon la
  question revient). Verrou `selftest:ebay-rayon-maison-deco` (rouge 3/40 → vert 45/45). Résultat réel : état de prod.

## 7. Bouilloire : « annonces identiques » (25002)
- Corrigé (règle, tous comptes) : source `ebay_annonce_identique`, vrai message, aucune relance proposée, reprise seule
  quand l'annonce identique est vendue ou retirée. Verrou `selftest:ebay-doublon-25002` (rouge 47 → vert 49/49).
- **Proposition (non codée)** — « série eBay » : sur un geste explicite de la personne (« Vendre ces 5 articles en une
  seule annonce eBay »), UNE annonce eBay de quantité N reliée aux N fiches (jamais regroupées sur un titre seul).
  Pour le client : le Stock garde 5 lignes (« 1 annonce eBay ×5 »), un prix, des photos (la 1re fiche), un état. Ventes :
  une vente eBay de quantité q passe q fiches en vendu (les plus anciennes en stock), retire leurs annonces ailleurs ;
  une vente ailleurs baisse la quantité eBay de 1 (retrait seulement à 0). Risques : survente si la baisse rate, mauvaise
  fiche marquée vendue (prix d'achat, marge), plafond de quantité des nouveaux vendeurs. À coder : table de série, geste,
  quantité à la publication, lecture de la quantité des commandes (`ebay_commande_appliquer`), baisse automatique,
  affichage, selftests, ventes réelles de test — plusieurs jours, décision de Nico. Aujourd'hui (B) : une annonce par
  fiche, celles qu'eBay refuse attendent et partent seules.

## 8. Politiques eBay pour les retraits (rien de changé)
- Aujourd'hui, un retrait eBay (article vendu ailleurs) bloqué pendant une déconnexion d'eBay ne repart, à la reconnexion,
  que si le compte a ses trois règles de vente (livraison, paiement, retours) ; sinon l'annonce reste en ligne alors que
  l'article est vendu (risque de double vente). Ne plus les exiger pour les retraits les ferait partir dès la
  reconnexion — retirer une annonce n'en a pas besoin — sans rien changer aux publications.

## 9. OTA
- Voir l'état de prod (numéro servi, contenu : lot T1 5205363 + f762d1e et ce lot).
