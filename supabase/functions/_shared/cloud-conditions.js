// (30/10, lot D) La version en vigueur des conditions d'utilisation de FillSell Cloud — MÊME valeur que
// src/cloud/conditionsCloud.js (selftest cloud-executant). Le paiement Cloud (create-checkout-session) exige
// profiles.cloud_cgu_version = cette version : l'acceptation (case obligatoire) passe AVANT toute carte.
export const CGU_CLOUD_VERSION = "2026-10-30";

/** La personne a-t-elle accepté la version en vigueur ? (pur) */
export const conditionsCloudAcceptees = (profil) => String(profil?.cloud_cgu_version ?? "") === CGU_CLOUD_VERSION;
