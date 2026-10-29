# Marge des ventes gratuites, trace des prix d'achat en lot — 29/10/2026

Contexte : profit = encaissé sur le compte de Nico (3 980,60 €) ; ses 202 ventes à `prix_achat = 0`. Nico : « C'est moi
qui ai cliqué « C'était gratuit (0 €) », tout est normal. » Demandes : (1) un prix d'achat à 0 € est gratuit, pas
manquant — la tuile Marge s'affiche normalement, « prix d'achat manquants » seulement pour l'inconnu ; (2) une trace
`usage_logs` quand ce bouton sert. Question posée (la règle du 16/10, « aucun % à 0 € » après « Meilleure marge : eBay
100 % », la contredisait) : réponse **« Compte partout »**.

## Changé
- **Règle b** (`src/utils/ventesStats.js`) : `margePctVente` dès que le prix d'achat est CONNU (0 € compris) ;
  `margeMoyenne` garde toutes les ventes au prix connu (gratuites comptées dans `aZero`, pour le dire), seul l'inconnu
  reste à part. Effet partout (Tableau, Stats, Ventes, IA, % par vente). Docs : `docs/regles/ventes-et-retraits.md`,
  `mails-paiements-comptabilite.md`, `tableau-et-statistiques.md`.
- **Textes** : tuiles Marge des Stats et détail d'une plateforme — « prix d'achat manquants » seulement s'il y a des
  ventes (plus jamais pour une période vide) ; détail Marge : « sur N ventes dont le prix d'achat est connu (dont X
  gratuites, à 0 €) ».
- **Trace** (`src/tabs/VentesTab.jsx`, `ecrireLotACompleter`) : tout prix d'achat écrit en lot (prix commun, gratuit,
  je ne sais plus) écrit `usage_logs` feature `ventes_prix_achat_lot`, metadata { mode, ventes réellement écrites,
  lignes, lignes_demandees, prix_achat (mode prix), interrompu }. Politique d'accès vérifiée (`auth.uid() = user_id`).
- Selftests `ventes-stats` et `tableau-stats` mis à la nouvelle règle (tout à 0 € → marge affichée ; que des inconnus
  → aucune moyenne, jamais 0,0 %).

## Vérifié
- Banc d'essai, copie des données de Nico toutes à 0 € : tuile Marge « — · prix d'achat manquants » → « 100,0 % · sur
  202 ventes » ; détail « dont 202 gratuites ». Ornella (222 gratuites) : 84,5 % sur 482 → 88,9 % sur 700 ventes.
- La trace n'a pas été déclenchée en vrai (ce serait réécrire les ventes d'un compte) : elle apparaîtra au prochain lot.

## Livraison (29/10, midi)
- Commits `4fa7196` (règle + trace) et `32cd97f` (version 2.9.131), un seul push ; web `32cd97f` (entrée 200 avec et
  sans `Origin`) ; **OTA 2.9.131** (canal relu 2.9.130 → 2.9.131), build `2026-10-29T11:52:42Z+32cd97f`.
- Production (session de Nico, lecture seule) : Marge « 100,0 % sur 202 ventes au prix d'achat connu » (depuis le
  début), « 100,0 % … sur 76 ventes » (12 mois), « — » sans texte en octobre (aucune vente) ; aucune erreur console ;
  préférences remises.
