# REPRISE — lot « Synchronisation parfaite » (27/09 soir)

> Si la session s'arrête : relancer en disant « reprends REPRISE.md ».
> Base chargée : requêtes légères, LIMIT, une lourde à la fois, jamais deux sessions.
> Heures = Paris. Détail technique : `docs/agents/etat-2026-09-27.md` § 7.6.

## Ce qui reste à faire par Nico (gestes)
1. `! git push origin main` si le push a été refusé (vérifier `git status` : « ahead »).
2. `! npx @capgo/cli bundle upload --channel production --bundle 2.9.30` — dist déjà construit
   (`dist/build.json` = `2026-09-27T20:25:19Z+ac80ac6`) ; si dist a été reconstruit depuis,
   refaire : `SHA=$(git rev-parse HEAD); GIT_DIR=/c/nonexistent-git-dir VERCEL_GIT_COMMIT_SHA=$SHA npm run build`.
3. Téléverser `C:\Users\nicol\fill-and-sell\build\CWS-0.6.75-A-TELEVERSER\fillsell-extension-0.6.75-cws.zip`
   sur le CWS + « Envoyer pour examen ». (La 0.6.74 est archivée, ne pas la téléverser.)
4. GO / pas GO : `20260927233500` (4 retraits, ventes prouvées) et `20260927234500` (meminiandmove).

## État par point
| Point | État |
|---|---|
| A1 LBC 30/176 | FAIT : serveur (reprise auto) + extension 0.6.75 (adresse relue 3×, pagination sur le rendu) |
| A2 Pichet | FAIT : verdict venait du relevé COMPLET ; dépôt clos sans rouge, annonce en ligne nommée (231500) |
| A3 eBay Hub | FAIT : /fpa/upgrade = compte pas vendeur, « confirmer identité » = reauth (serveur + ext) |
| A4 Beebs sans_croissance | PROUVÉ complet (josephine 265 lus / index 268 après 3 dépôts ; louis 88 / 86) ; message clair en 0.6.75 |
| A5 eBay vues > annoncées | FAIT 0.6.75 (compte des annonces, plus des liens) |
| A6 66 dépôts Beebs sans lien | EXPLIQUÉ : aucun id capturé au dépôt ; xxewwer 48 absents de l'index public (modération, non jugée) ; meminiandmove réimporté en doublon (GO) |
| A7 Vinted | MESURÉ : actifs vus = en stock sauf 7 ; 1 126 fiches « actives » non revues (republications → doublons) — NON corrigé, à décider |
| B1 marque/taille | LBC depuis la liste (0.6.75) ; Beebs/eBay par capture de fiche (jamais-capturées d'abord) |
| B2 champ manquant | FAIT 0.6.75 (Opla : question marque/état/taille/catégorie aussi en republication) |
| C abandon | FAIT (223000) |
| D1 fiches vendues | FAIT (35/36 prouvées ; misscat801 débloqué 233000 ; 4 retraits → GO 233500) |
| D2 retraits sans lien | louis clos (rien en ligne) + règle 234000 ; meminiandmove → GO 234500 ; xxewwer : absent de l'index, borné à 7 j |
| E Beebs catégorie ×3 | règle existait ; message jamais écrit sur job annulé → ujs v92 + texte corrigé |
| F nouvel inscrit | NON FAIT (création de compte interdite à l'automatisation ; pas de login fillsell.app dans le Chrome de Nico) |
| G1 KID_SLEEPSACK | message + choix FR FAIT (ujs v91) ; genre neutre → garçon : NON corrigé (resolutionPublication) |
| G2 86 cm | FAIT (tailles.js, gpj v150, 0.6.75) |
| G3 stepper | NON FAIT : rayons non résolus au contrôle pour une fiche Lens (cause nommée) |
| G4 questions fermées | vérifié : NeedsUserModal = liste fermée si allowed_values, réponse → job pending |
| H photos | FAIT (230000 : 157 fiches ; 0.6.75) |
