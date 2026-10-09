// Lancement des balises Google sous consentement (09/10/2026) : entrée du
// bundle IIFE mis EN LIGNE, en tête du <head>, dans chaque page vitrine et dans
// app-shell.html (build Vercel seulement — natif et OTA gardent index.html tel
// quel). La logique vit dans balises-consentement.js (testée) ; ici, seulement
// les identifiants remplacés au build (lus dans les blocs d'index.html) et
// l'état du consentement, lu par le MÊME module que les deux bandeaux.
import { brancherBalises } from './balises-consentement.js';
import { etatConsentement } from '../../src/utils/consentement.js';

brancherBalises(window, { gtm: __FS_GTM__, aw: __FS_AW__, etat: etatConsentement });
