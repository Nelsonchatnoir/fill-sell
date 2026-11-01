# Cloud — la décision, sur une page (01/11/2026)

Base : rapport Cloud (`RAPPORT.md`, § 12 Shadow, § 13 Windows + carte NVIDIA, § 14 et 15 Steel) et rapport Mac mini
(`docs/enquetes/mac-mini-3110/RAPPORT.md`). Rien n'est acheté. Coûts **TTC par utilisateur et par mois**, sans
récupération de TVA (HT × 1,20 ; change 1 € = 1,1172 $), IP dédiée comprise (4,64 €, base des rapports), face aux
**20 €** de l'option Cloud (hors commission Stripe).

## 1. Ce que l'essai Steel du 01/11 a tranché
- Leboncoin : **formulaire**. Beebs : **glissière**. Aucun blocage. Profil neuf, IP 81.181.239.136, sans maquillage ni
  résolveur. Ton poste est resté muet, vérifié en base.
- Linux en centre de données n'est donc pas condamné : c'est **notre** Chrome Linux de Hetzner qui est repéré (brûleurs
  du 05/10 au 30/10, même empreinte). Ce n'est qu'un essai : la tenue dans la durée n'est pas prouvée.
- Le « Me connecter » de production a piloté le Chrome de Steel tel quel. La connexion et la glissière en direct depuis
  l'app marchent donc aussi avec Steel.

## 2. Toutes les pistes

| Voie | Prouvé | Pas prouvé | € TTC / utilisateur | Coût fixe / mois | Licence, droit |
|---|---|---|---|---|---|
| **(a) Steel, navigateur ouvert 24 h/24** | LBC formulaire, Beebs glissière (01/11) ; LBC connexion + publication (26/09) | durée | **69 à 83** | 0 | aucune licence de système à notre charge ; données aux États-Unis |
| **(a) Steel à la demande + ronde toutes les 10 min** | idem | durée d'une ronde, cookies gardés d'une session à l'autre, durée | **≈ 15,5** en moyenne, 18 pour 9 utilisateurs sur 10, 34 pour le plus gros | **0** | idem ; Steel enregistre les sessions (à couper) ; conditions de Steel à lire |
| (b) Mac mini Scaleway M4-M (Paris) | rien (aucun essai) | tout | 16,58 (machine pleine) ; Green Mini 14,72 | 238,80 | **BLOQUANT** : macOS § 3.A, 2.I, 2.J (seul Apple peut lever, par écrit) |
| (c) Hetzner enchère 3093130, RTX 4000 SFF Ada | Windows + vraie carte passe (Shadow, PC de Nico : glissières) | ce serveur, Windows Server, le pilote | 13,15 ; **24,07 avec RDS** | 340,44 (rentable dès 23 util. ; jamais avec RDS) | Windows SPLA sur ce serveur non acquis ; RDS 9,10 € HT par client à trancher par écrit |
| (c) centron RTX A4000 | idem | idem | 15,63 ; 24 à 26,6 avec RDS | 571,63 (dès 38 util.) | SaaS permis ; prorata Windows et prix RDS non lus |
| (c) Azure NV12ads spot, Paris | idem | rendu d'une fraction d'A10 ; éviction | 15,23 ; 26,15 avec RDS | 254,08 (dès 17 util.) | GRID fournie ; RDS non vendue ; machine reprise avec 30 s de préavis |
| (c) Hetzner AX42 + Windows Server | idem | pilote AMD non prévu pour Windows Server | 9,72 ; 20,64 avec RDS | 152,28 + 58,80 de mise en service | RDS à trancher |
| Shadow Neo Pro + Always On | LBC et Beebs glissière (30/10) | — | 29,86 | 252,17 | accord de Shadow requis — **écarté par toi** |
| (d) Cloud en pause | — | — | 0 | 0 | — |

Le « avec RDS » est la lecture prudente de la licence Microsoft (chaque client, chaque mois). Avec elle, **aucune
machine Windows ne passe sous 20 €**. Sans elle, Windows ne devient rentable qu'une fois la machine remplie (17 à 38
utilisateurs payants), parce qu'on paie la machine même vide. Steel ne coûte que ce qu'on utilise.

## 3. Ventes détectées 24 h/24 : Steel tient, sans navigateur allumé en permanence
- Navigateur Steel ouvert 24 h/24 : 69 à 83 € → exclu.
- **Ronde de 10 min** : une session Steel courte lit la liste des commandes Vinted et Leboncoin, puis se ferme. C'est la
  lecture et le rythme de la veille des commandes de l'extension (10 min ± 90 s), donc jamais plus vite que l'extension.
  - Beebs et Depop : relevés du jour, comme sur un PC. eBay : déjà 24 h/24 par l'API, côté serveur.
  - Coût ≈ 7,84 € par mois, si une ronde dure 1 min.
  - **Seuil** : une ronde doit durer moins d'environ 1 min 30 s ; au-delà, l'utilisateur moyen dépasse 20 €.
- Sans aucun navigateur :
  - la lecture des pages par le serveur est abandonnée depuis le 11/07 : les IP de Supabase sont bloquées par DataDome ;
  - piste plus tard, non prouvée : les mails de vente que l'utilisateur fait suivre à FillSell servent de signal, jamais
    de preuve, et ouvrent Steel pour confirmer par identifiant, puis retirer. Coût ≈ 8 €, mais un geste de chaque
    utilisateur (renvoi de ses mails) et du code neuf.
- **Steel n'est donc pas éliminé.**

## 4. Recommandation : (a) Steel, à la demande, avec une ronde toutes les 10 min
- C'est la seule voie qui passe sans mur de licence. Aucun coût fixe : idéal tant que l'option Cloud a peu d'abonnés.
- ≈ 15,5 € TTC par utilisateur, ventes détectées 24 h/24, connexion et glissière en direct depuis l'app.
- Risques :
  - **marge mince** : ≈ 4,5 € en moyenne ; les plus gros vendeurs (≈ 120 jobs par jour) coûtent plus de 20 € ;
  - **dépendance** : l'empreinte de Steel est partagée avec ses autres clients ; si DataDome la marque, tout s'arrête ;
  - **données aux États-Unis** : accord de traitement et clauses types ; enregistrement des sessions à couper ;
  - un seul essai à ce jour.
- Formule Launch : 0 $ par mois, 10 sessions simultanées, suffit jusqu'à ≈ 30 utilisateurs. La formule Scale (250 $ par
  mois) seulement au-delà, après un essai réussi et sur ton feu vert.
- Repli si l'essai suivant échoue : **(d) pause**. La voie (c) ne se rouvre que si Hetzner ou centron répondent par
  écrit sur la RDS (tickets prêts, § 13.5, gratuits).
- Hors liste, non recommandée sans ton avis : refaire notre propre image Linux. Avec la même empreinte, elle a été
  bloquée sur machine neuve et IP neuve ; en changer reviendrait à choisir une empreinte.

## 5. Le prochain essai : endurance Steel, 48 h, ton compte seul
1. **Préparation**, sans plateforme et sans coût :
   - petit outil local : un profil Steel persistant, le vrai écran « Me connecter » servi sur ton PC, et les rondes ;
   - enregistrement des sessions Steel coupé, conditions de Steel lues.
2. **Toi** : connexion Vinted, Leboncoin, Beebs, Depop, glissières comprises, dans cet écran.
3. **48 h de rondes** toutes les 10 min ± 90 s, chaque session fermée aussitôt. Mesures :
   - durée et coût de chaque ronde ;
   - glissières et blocages ;
   - cookies gardés d'une session à l'autre ;
   - ventes vues par Steel face à celles vues par ton PC.
   Ton poste reste en service : pendant 48 h, tes listes de commandes Vinted et Leboncoin sont lues 12 fois par heure au
   lieu de 6.
4. **Arrêt au premier « Accès restreint »**, sans insister.
5. **Coût exact** :
   - au plus 288 rondes plafonnées à 2 min + ≈ 15 min de connexions = 9,85 h × 0,10 $ = **0,99 $, soit 1,06 € TTC au
     plus** ;
   - attendu, avec des rondes d'1 min : ≈ 0,51 $, soit 0,54 € TTC ;
   - IP 81.181.239.136 déjà payée jusqu'au 29/11 : 0 € ;
   - aucun abonnement.
6. **Critère de réussite** : 0 blocage, ronde ≤ 1 min 30 s, cookies tenus 48 h. Alors seulement, le moteur Steel dans
   l'orchestrateur (développement à valider).
