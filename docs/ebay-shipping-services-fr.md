# Services de livraison eBay FR (EBAY_FR, site 71) — relevé GeteBayDetails

Relevé le 06/09/2026 avec le compte relié de Nico (Trading API GeteBayDetails,
DetailName=ShippingServiceDetails, DetailVersion 283, UpdateTime 2026-08-20T05:31:00.000Z).
Source de vérité pour shippingServiceCode dans les politiques de livraison
(Account API). Le code FR_Colissimo N'EXISTE PAS : refus « Échec de la
validation LSAS. : FR_Colissimo » du 06/09.

## Domestiques, ValidForSellingFlow = true (36)

| code | libellé eBay | transporteur | catégorie | délai (j) |
|---|---|---|---|---|
| FR_Chronopost | Chronopost | Chronopost | EXPRESS | 1-1 |
| FR_EconomyDeliveryFromAbroad | Livraison économique à partir de l'étranger | — | OTHER | 10-22 |
| FR_Ecopli | Lettre Verte | LAPOSTE | ECONOMY | 2-4 |
| FR_StandardDeliveryFromAbroad | Livraison standard à partir de l'étranger | — | OTHER | 4-10 |
| FR_PostOfficeLetterFollowed | Lettre Suivie | LAPOSTE | STANDARD | 1-3 |
| FR_Chrono13 | Autre livraison en 24 h | Other | EXPRESS | 1-1 |
| FR_ExpressDeliveryFromAbroad | Livraison express à partir de l'étranger | — | OTHER | 1-3 |
| FR_PostOfficeLetterRecommended | Lettre recommandée | LAPOSTE | STANDARD | 1-3 |
| FR_TrackedDeliveryFromAbroad | Livraison à partir de l'étranger avec suivi de commande | — | OTHER | 2-5 |
| FR_UPSStandardAgainstRefund | Contre remboursement | — | OTHER | 2-5 |
| FR_ColiposteColissimo | Colissimo | — | STANDARD | 1-2 |
| FR_LivraisonDansLesDomTom | Livraison dans les DOM-TOM | — | OTHER | — |
| FR_ColiposteColissimoRecommended | Colissimo Recommandé | ColiposteDomestic | STANDARD | 1-2 |
| FR_GLSStandard | GLS Standard | — | STANDARD | 1-2 |
| FR_ChronopostChronoRelais | Chronopost - Chrono Relais | Chronopost | POINT_TO_POINT | 1-1 |
| FR_Shop2Shop | Shop2Shop by Chronopost : livraison de relais à relais | Chronopost | POINT_TO_POINT | 1-2 |
| FR_DpdRelais | DPD Relais | Exapaq | POINT_TO_POINT | 1-3 |
| FR_Autre | Autre mode d'envoi | Other | ECONOMY | 2-4 |
| FR_EconomySppedPAK | eBay Livraison économique SpeedPAK | — | OTHER | 6-11 |
| FR_StandardSppedPAK | eBay Livraison standard SpeedPAK | — | OTHER | 5-9 |
| FR_ExpeditedSppedPAK | eBay Livraison prioritaire SpeedPAK | — | OTHER | 1-4 |
| FR_ExpressSpeedPAK | eBay Livraison express SpeedPAK | — | EXPRESS_SHIPPING_FROM_OUTSIDE | 1-3 |
| FR_SPEEDPAK_EU_DDU_SERVICE_DE_LIVRAISON_DOM | SpeedPAK DDU Service de livraison | — | OTHER | 8-15 |
| FR_EconomyShippingFromGC | Livraison économique de la Grande Chine vers le monde entier | — | OTHER | 11-35 |
| FR_StandardShippingFromGC | Livraison standard de la Grande Chine vers le monde entier | — | OTHER | 7-19 |
| FR_ExpeditedShippingFromGC | Livraison express de la Grande Chine vers le monde entier | — | OTHER | 2-7 |
| FR_AuteModeDenvoiDeColis | Autre livraison en 48 h | Other | STANDARD | 1-2 |
| FR_RemiseEnMainPropre | Remise en mains propres | — | PICKUP | — |
| FR_ConvelioGantsBlancs | Convelio transport gants blancs | — | OTHER | 5-15 |
| FR_ConvelioPasDePorte | Convelio transport pas-de-porte | — | OTHER | 5-15 |
| FR_HomeDelivery | Livraison à domicile | — | STANDARD | 3-7 |
| FR_DeliveryConnection | Livraison à domicile et installation | — | STANDARD | 3-7 |
| FR_DeliveryConnectionRecycling | Livraison à domicile, installation et recyclage | — | STANDARD | 3-7 |
| FR_DeliveryRecycling | Livraison à domicile et reprise des anciens produits | — | STANDARD | 3-7 |
| FR_LivraisonEnRelaisMondialRelay | Livraison en Relais Mondial Relay | MondialRelay | POINT_TO_POINT | 2-4 |
| FR_UPSStandard | UPS Standard | — | STANDARD | 1-2 |

## Internationaux, ValidForSellingFlow = true (22)

| code | libellé eBay | catégorie |
|---|---|---|
| FR_LaPosteInternationalPriorityCourier | La Poste - Lettre Internationale | STANDARD |
| FR_LaPosteLetterSuivieIntl | La Poste - Lettre Suivie Internationale | STANDARD |
| FR_LaPosteRecommandeeIntl | La Poste - Lettre Recommandée Internationale | STANDARD |
| FR_LaPosteColissimoInternational | Colissimo International | STANDARD |
| FR_ChronopostClassicInternational | Chronopost International | EXPRESS_SHIPPING_FROM_OUTSIDE |
| FR_DHLInternational | DHL | EXPRESS |
| FR_UPSStandardInternational | UPS | EXPRESS |
| FR_IntlEconomySppedPAK | eBay Livraison économique SpeedPAK | OTHER |
| FR_IntlStandardSppedPAK | eBay Livraison standard SpeedPAK | OTHER |
| FR_SPEEDPAK_EU_DDU_SERVICE_DE_LIVRAISON_INT | SpeedPAK DDU Service de livraison | OTHER |
| FR_IntlExpeditedSppedPAK | eBay Livraison prioritaire SpeedPAK | OTHER |
| FR_IntlEconomyShippingFromGC | Livraison économique de la Grande Chine vers le monde entier | ECONOMY |
| FR_IntlStandardShippingFromGC | Livraison standard de la Grande Chine vers le monde entier | STANDARD |
| FR_IntlExpeditedShippingFromGC | Livraison express de la Grande Chine vers le monde entier | EXPEDITED |
| FR_IntlExpressSpeedPAK | eBay Livraison express SpeedPAK | EXPRESS_SHIPPING_FROM_OUTSIDE |
| FR_StandardInternational | Autre livraison internationale standard | STANDARD |
| FR_OtherInternational | Autre livraison internationale économique | ECONOMY |
| FR_ExpeditedInternational | Autre livraison internationale express | EXPRESS |
| FR_ConvelioIntlGantsBlancs | Convelio transport international gants blancs | OTHER |
| FR_ConvelioIntlPasDePorte | Convelio transport international pas-de-porte | OTHER |
| FR_FedExIntlEconomy | FedEx International Economy | OTHER |
| FR_MondialRelayInternational | Livraison à domicile à l'international Mondial Relay | STANDARD |

## Non valides pour la vente (ValidForSellingFlow = false) (27)

- FR_LaPosteInternationalEconomyCourier — La Poste - Courrier International Economique (déprécié)
- FR_TntExpress — TNT Express
- FR_MirrorUPSExpress — Fedex (déprécié)
- FR_PostOfficeLetter — Lettre prioritaire (déprécié)
- FR_PickUpDropOff — Sélection du point de retrait lors du paiement
- FR_LaPosteColissimoEmballageInternational — La Poste - Colissimo Emballage International (déprécié)
- FR_LaPosteColisEconomiqueInternational — La Poste - Colis Economique International (déprécié)
- FR_Colieco — Coliéco
- FR_LaPosteLetterMax — Lettre Max (déprécié)
- FR_ChronopostExpressInternational — Chronopost Express International (déprécié)
- FR_MiniPakFromAbroad — Livraison MiniPak à partir de l'étranger (déprécié)
- FR_TrakPakFromAbroad — Livraison TrakPak à partir de l'étranger (déprécié)
- FR_MiniSpeedPAK_dom — Livraison SpeedPAK Mini (déprécié)
- FR_KIALA_DELIVERY — Livraison en Relais Kiala (déprécié)
- FR_ChronopostPremiumInternational — Chronopost Premium International
- FR_Chrono10 — Chrono 10 (déprécié)
- FR_MiniSpeedPAK_int — Livraison SpeedPAK Mini (déprécié)
- FR_UPSExpressInternational — UPS Express (déprécié)
- FR_Chrono18 — Chrono 18 (déprécié)
- FR_ColiposteColissimoDirect — Coliposte - Colissimo Direct
- FR_ChronoposteInternationalClassic — Chronoposte - Chrono Classic International
- FR_DHLExpressEuropack — DHL - Express Europack
- PromotionalShippingMethod — Promotion sur les frais de livraison
- FR_UPSExpress — UPS Express (déprécié)
- PromotionalShippingMethod — Promotion sur les frais de livraison
- FR_LivraisonEnLockerMondialRelay — Livraison en Locker Mondial Relay
- FR_INTERNAL_AGINTRAEU_DHL_RETOUREINTERNATIONAL_PACKAGE_DRPOFF — DHL Retoure International
