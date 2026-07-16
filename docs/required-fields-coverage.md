# Registre — Champs obligatoires par plateforme/catégorie

> Chantier « zéro trou » 2026-07-16. Objectif : chaque champ obligatoire sur
> Vinted / Leboncoin / Beebs / eBay est soit rempli automatiquement (IA ou
> défaut déterministe), soit présenté en saisie manuelle obligatoire avec
> bouton Publier désactivé tant qu'un requis est vide. Aucun article ne doit
> partir avec un champ obligatoire vide en silence.

**Statuts** : `auto-fill` (rempli automatiquement) · `saisie-manuelle`
(présenté à l'utilisateur, Publier bloqué si vide) · `vérifié-réel` (testé sur
le vrai formulaire) · `filet-générique-seulement` (aucun mapping fin, seule la
découverte réactive + le filet couvre).

## Étape 0 — Prérequis (2026-07-16)

### Sessions Claude in Chrome (vérifiées en réel le 16/07)
| Plateforme | Compte | État |
|---|---|---|
| Vinted | `nelsonchatnoir` (hoosslocal@gmail.com, id 250623918) | ✅ authentifié — compte de test |
| Leboncoin | compte de test (1 annonce « Robe salopette enfant » en ligne) | ✅ authentifié |
| Beebs | access_token + refresh_token + JWT présents | ✅ authentifié |
| eBay | « Bonjour Nicolas ! » (ebay.fr) | ✅ authentifié |

Comptes prod (nico@fillsell.app, etc.) exclus de tout test, comme d'habitude.

### Photos de test
5 photos génériques 1200×1200 générées localement (dégradé + formes + bruit,
~60 Ko chacune) dans `test-assets/photos/test-photo-{1..5}.jpg`. Fonctionnelles
uniquement — servent à déclencher l'affichage des champs dynamiques des
formulaires, pas à être réalistes. Script générateur : System.Drawing
(reproductible, seed fixe).

### Flux validés bout-en-bout à NE JAMAIS CASSER
1. **Mode Vinted** : chaussures/t-shirt validés en réel (campagne 4×5 dry-runs
   + publications LIVE prouvées) — cascade marque/taille/état/couleurs/matière,
   prix via props.onChange (fibers, monde MAIN), colis « Petit » forcé sur la
   Mode, preuve de publication par sonde réseau + redirection.
2. **Mode eBay** : aspects Marque/Couleur/Taille/Matière + alias Mode
   (monture/extérieure/doublure), onglet peint pendant remplissage,
   setNativeValue en un appel + relectures 8 s, entrée par la home.
3. **Tailles enfant (15/07)** : conversion canonique → libellé exact plateforme
   à l'insert (childSizes.js) + garde anti-nombre-nu dans les 4 content scripts
   (jamais de fuzzy numérique sur un champ taille).
4. **High-Tech Vinted (13/07)** : modèle (après marque), stockage, simlockage
   (défaut « Non » = désimlocké, gaté sur présence DOM).
5. **Anti-bot** : frappe humaine (typeHuman), pauses aléatoires, timers Web
   Worker non clampés, onglet de travail unique réutilisé, fenêtre dédiée
   invisible (jamais de focus volé, pas de chrome.debugger).
6. **Preuves de publication** : jamais de « published » sans preuve (sonde
   réseau, redirection, verdict background eBay) ; needsUser borné
   (rearmBounded) ; jamais ressusciter un job annulé.
7. **Garde eBay au publish** : aspects obligatoires connus vides ou hors liste
   fermée → blocage AVANT débit/insert. Défauts déterministes
   (EBAY_ASPECT_DEFAULTS) + resolve_aspects + fallback UI Phase 3.
8. **lens-analysis** : GELÉE — ne pas déployer (attributs_visibles codé mais
   NON DÉPLOYÉ, Phase 2).

## État initial des filets (constat 16/07, avant chantier)

| Plateforme | Filet existant | Trou identifié |
|---|---|---|
| Vinted | `unfilledRequired` toujours `[]` (constat assumé dans vinted.js) ; erreurs de validation DOM lues APRÈS le clic Publier (live seulement) ; sonde réseau en place | Aucune détection de requis en dry-run ; les requis invisibles côté DOM (400 serveur : `internal_memory_capacity`…) ne sont pas parsés ; pas de canal de saisie manuelle générique |
| Leboncoin | `unfilledRequired` sur univers/produit/quantité ; needsUser borné avec message | Champs dynamiques par catégorie non énumérés ; le blocage n'aboutit pas à une saisie manuelle dans l'app avec libellé exact |
| Beebs | `unfilledRequired` par libellé sans « (facultatif) » (selectDropdownValue) | Couverture 100 % catégories non prouvée ; pas de canal de saisie manuelle |
| eBay | Référentiel `ebay_item_aspects` (234 cat.) + garde publish + preview chips + défauts MPN + resolve_aspects + fallback UI Phase 3 | Phase 3 non validée sur formulaires réels ; libellés/types par famille non vérifiés en réel (P4) |
| App (stepper) | Garde eBay = throw au clic ; encart champs partagés manquants | Bouton Publier PAS désactivé sur requis vide (throw seulement) ; aucun canal générique Vinted/LBC/Beebs |

## Registre par plateforme/catégorie

_(alimenté au fil du chantier — Étapes 1 et 2)_

### Vinted
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| Téléphones portables | modèle, stockage (`internal_memory_capacity`), simlockage (`sim_lock`), état | auto-fill (13/07, prouvé en réel) |
| Mode (vêtements/chaussures) | taille, état, marque* | auto-fill + saisie-manuelle (champs partagés), vérifié-réel |
| Autres électronique (P1) | — à relever | filet-générique-seulement |

### Leboncoin
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| (toutes) | univers, produit (catégorie), quantité, titre, description, prix, adresse | auto-fill, vérifié-réel (dry-runs 11/07) |
| Mode>Chaussures | pointure (`shoe_size`) | auto-fill + garde app |
| Catégories techniques (P2) | — à relever | filet-générique-seulement |

### Beebs
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| Mode enfant/adulte | catégorie, marque, taille/pointure, état, couleur | auto-fill, vérifié-réel (dry-runs) |
| Autres (jouets, puériculture…) | âge, matière (selon catégorie) | filet-générique (libellés sans « (facultatif) ») |

### eBay
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| 234 catégories feuilles | référentiel complet `ebay_item_aspects` (API Taxonomy) | auto-fill (connus) + défauts (MPN, 32 cat.) + resolve_aspects + saisie-manuelle Phase 3 — vérif réelle P4 en attente |
