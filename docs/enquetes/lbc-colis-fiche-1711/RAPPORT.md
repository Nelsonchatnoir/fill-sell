# 17/11 — Leboncoin : le format du colis sur la fiche, lié au poids (heure de Paris)

Verrou : `selftest:lbc-colis-de-la-fiche` (rouge avant : module absent ; vert après : 15 contrôles). Aucun mail à
l'utilisateur. Aucune annonce en ligne réécrite : la règle joue au prochain dépôt de chaque annonce.

## Constat (compte Business, mails du 17/11 09:29 et 09:36)
- Republication : le poids de l'ANNONCE d'origine passait devant la fiche (`champs_repris_de_l_annonce` : « poids ← 250 g
  (annonce ; copie : 200 g) », « poids ← 2000 g (annonce ; copie : 1216 g) »). Sur ce compte, dernière annonce par fiche :
  une fiche à 300 g partie en « De 100 g à 250 g », une fiche à 500 g en « De 500 g à 1 kg » (poids de l'annonce : 1000).
- Le format venait de l'ancienne annonce ou d'un ancien « manuel » de la copie : 7 fiches à 100 g et 12 à 500 g en
  « Moyen ». Il n'existait pas sur la fiche.
- La borne 500 g n'est PAS fausse : `trancheLbcDepuisGrammes(500)` = « De 250 g à 500 g », l'extension prend le palier
  ≥ poids (500 → 500). La tranche 1 kg venait du poids de l'annonce.

## Ce qui change (pour tout le monde)
- `_shared/colis-de-la-fiche.js` (app + serveur) : format de la fiche = un choix à la main fait APRÈS le dernier
  changement de poids (rangé dans `inventaire.attributs.format_colis_lbc` = { v, source « manuel », at, poids_g }, fusion
  par le trigger existant : aucune migration) ; sinon calculé du poids : ≤ 1 kg Petit, ≤ 40 kg Moyen, au-delà
  Volumineux. Un poids changé ensuite rend le choix caduc.
- Fiche article (modale de modification) : « Format du colis (Leboncoin) » sous le poids — « Automatique, d'après le
  poids : … », Petit, Moyen, Volumineux. Changer le poids dans le formulaire remet le format au calcul.
- Carte Livraison Leboncoin du stepper : montre le format de la fiche (« d'après le poids », « choisi sur la fiche ») ;
  un format choisi sur la carte est daté et se range sur la fiche au clic Publier.
- get-pending-jobs : publication ET republication prennent le poids, la tranche « Poids du colis » (PRO) et le format de
  la fiche ; les transporteurs qui ne prennent plus ce poids sont retirés (Courrier suivi ≤ 2 kg). Devant la fiche : une
  réponse à une question sur ce job, un poids tapé ou un format choisi sur la carte pendant la publication. Fiche sans
  poids ni choix : comme avant. La republication reprise de l'annonce ne repose plus poids ni format quand la fiche les
  dit (sinon les deux se défaisaient à chaque passage). Trace `colis_de_la_fiche` sur le job.
- Un ancien « manuel » sans date (copie d'origine) cède au poids de la fiche : il ne dit pas quand il a été choisi.

## À relire
- Logs get-pending-jobs « colis de la fiche » ; `champs_repris_de_l_annonce.repris.livraison` des republications
  Leboncoin : plus de « poids ← … (annonce ; copie : …) » sur une fiche qui a un poids.
