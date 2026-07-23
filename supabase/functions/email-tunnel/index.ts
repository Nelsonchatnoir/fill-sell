import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const LOGO_URL = "https://fillsell.app/logo.png";

// ── HTML Templates ─────────────────────────────────────────────────────────────

function emailHeader(): string {
  return `
  <div style="text-align:center;padding:32px 0 24px;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="${LOGO_URL}" width="40" height="40" alt="FillSell"
               style="display:block;border-radius:10px;">
        </td>
        <td style="vertical-align:middle;">
          <span class="brand-name"
                style="font-family:'Plus Jakarta Sans',sans-serif;font-style:italic;
                  font-weight:800;font-size:22px;color:#3EACA0;
                  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
                  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                  background-clip:text;">FillSell</span>
        </td>
      </tr>
    </table>
  </div>`;
}

function emailWrapper(content: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@1,800&display=swap');
body{margin:0;padding:0;background:#F2F2EE;}
.brand-name{
  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
a.cta:hover{background:#26b8a6!important;}
</style>
</head>
<body>
<div style="background:#F2F2EE;padding:16px 0 48px;">
  <div style="max-width:560px;margin:0 auto;padding:0 16px;">
    ${emailHeader()}
    <div style="background:#fff;border-radius:16px;padding:32px;
      box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      ${content}
    </div>
    <div style="text-align:center;padding:24px 0 0;
      font-size:12px;color:#9CA3AF;font-family:sans-serif;line-height:1.6;">
      FillSell ·
      <a href="https://fillsell.app" style="color:#9CA3AF;text-decoration:none;">
        fillsell.app
      </a>
    </div>
  </div>
</div>
</body>
</html>`;
}

function ctaButton(label: string): string {
  return `
  <a href="https://fillsell.app" class="cta"
     style="display:block;text-align:center;background:#2DD4BF;
       color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
       border-radius:12px;text-decoration:none;font-family:sans-serif;
       margin-top:4px;">
    ${label}
  </a>`;
}

// ── Mail « mise à jour extension » (mode extension_update, déclenché à la main) ─
function extensionUpdateHtml(lang: string, version: string): string {
  const isFr = lang !== "en";
  const steps = isFr
    ? [
        "Télécharge la nouvelle version depuis la page Extension de FillSell",
        "Dans Chrome, ouvre chrome://extensions et retire l'ancienne extension FillSell",
        "Charge le nouveau dossier dézippé (« Charger l'extension non empaquetée »)",
      ]
    : [
        "Download the new version from the FillSell Extension page",
        "In Chrome, open chrome://extensions and remove the old FillSell extension",
        "Load the new unzipped folder (\"Load unpacked\")",
      ];
  const content = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      ${isFr ? "Nouvelle version de l'extension 🧩" : "New extension version 🧩"}
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      ${isFr
        ? `La version <strong>${version}</strong> de l'extension FillSell est disponible. Elle corrige et fiabilise la publication automatique sur Vinted, Leboncoin, eBay et Beebs — les anciennes versions peuvent échouer à publier certaines annonces.`
        : `Version <strong>${version}</strong> of the FillSell extension is available. It fixes and improves automatic publishing on Vinted, Leboncoin, eBay and Beebs — older versions may fail to publish some listings.`}
    </p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      ${isFr
        ? "Chrome ne met pas à jour l'extension tout seul : la mise à jour prend 2 minutes."
        : "Chrome doesn't update the extension by itself: updating takes 2 minutes."}
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">${isFr ? "Pour mettre à jour :" : "To update:"}</p>
      <ol style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        ${steps.map((s) => `<li>${s}</li>`).join("")}
      </ol>
    </div>
    <a href="https://fillsell.app/extension" class="cta"
       style="display:block;text-align:center;background:#2DD4BF;
         color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
         border-radius:12px;text-decoration:none;font-family:sans-serif;">
      ${isFr ? "Mettre à jour l'extension" : "Update the extension"}
    </a>`;
  return emailWrapper(content, lang);
}

function extensionUpdateSubject(lang: string): string {
  return lang === "en"
    ? "Update your FillSell extension 🧩"
    : "Mets à jour ton extension FillSell 🧩";
}

function welcomeHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Bienvenue sur FillSell&nbsp;! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Votre compte est prêt. FillSell vous aide à gérer votre stock, analyser vos
      marges et publier automatiquement sur Vinted, Leboncoin, eBay et Beebs — le tout en quelques secondes.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">Pour démarrer :</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Ajoutez vos articles par commande vocale</li>
        <li>📸 Analysez les prix avec la photo IA (Lens)</li>
        <li>📊 Suivez vos marges en temps réel</li>
        <li>🚀 Publiez directement sur vos plateformes</li>
        <li><img src="https://fillsell.app/email/pepite.png" width="16" height="16" alt="Pépites" style="display:inline-block;vertical-align:-3px;"> Gagnez et dépensez des Pépites à chaque action</li>
      </ul>
    </div>
    <div style="border:1px solid #CFF0EA;border-radius:12px;padding:22px;margin:0 0 24px;background:#FBFFFE;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;letter-spacing:-0.01em;
        color:#111827;font-family:sans-serif;">
        🧩 L'extension Chrome : le cœur de FillSell
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        C'est elle qui fait le travail à votre place : une fois installée, dès que vous
        ajoutez un article, elle le publie automatiquement sur Vinted, Leboncoin, eBay et
        Beebs — sans que vous ayez à remplir un seul formulaire. Elle tourne en
        arrière-plan, sans jamais prendre le contrôle de votre navigateur.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation"
        style="background:#F0FDF9;border-radius:12px;margin:0 0 18px;">
        <tr><td align="center" style="padding:16px 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-vinted.png" width="54" height="54" alt="Vinted" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-leboncoin.png" width="54" height="54" alt="Leboncoin" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-ebay.png" width="54" height="54" alt="eBay" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-beebs.png" width="54" height="54" alt="Beebs" style="display:block;"></td>
          </tr></table>
        </td></tr>
      </table>
      <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
        <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
          ⚠️ Elle fonctionne uniquement sur ordinateur (pas sur mobile). Si vous lisez cet
          email sur votre téléphone, gardez-le de côté et revenez-y depuis votre ordinateur.
        </p>
      </div>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        Une fois installée, vous n'avez plus besoin d'y retoucher : ajoutez vos articles
        depuis votre téléphone quand vous voulez, l'extension publie automatiquement en
        arrière-plan — tant que votre ordinateur reste allumé avec Chrome ouvert.
      </p>
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">Comment l'installer aujourd'hui :</p>
      <ol style="margin:0 0 18px;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.8;font-family:sans-serif;">
        <li>Depuis votre ordinateur, ouvrez la <a href="https://fillsell.app/extension" style="color:#0F9488;font-weight:600;text-decoration:none;">page d'installation de l'extension</a></li>
        <li>Téléchargez le fichier d'installation et suivez le guide affiché dans l'app (2 minutes)</li>
        <li>Connectez-vous à vos comptes Vinted, Leboncoin, eBay et Beebs directement dans votre navigateur, comme vous le faites d'habitude — l'extension utilise ces sessions actives pour publier à votre place. Elle ne se connecte jamais elle-même à votre place, vous gardez la main sur vos comptes.</li>
      </ol>
      <a href="https://fillsell.app/extension" class="cta"
         style="display:block;text-align:center;background:#2DD4BF;color:#fff;
           font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;
           text-decoration:none;font-family:sans-serif;margin:0 0 14px;">
        Installer l'extension
      </a>
      <p style="margin:0;font-style:italic;font-size:12px;color:#9CA3AF;line-height:1.6;
        font-family:sans-serif;">
        Bientôt encore plus simple : l'extension arrive très prochainement directement sur
        le Chrome Web Store. Un seul clic pour l'installer, et elle se mettra à jour
        automatiquement à chaque nouvelle version — plus besoin de guide d'installation manuel.
      </p>
    </div>
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Exemples vocaux</p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">🗣️ Ajouter un article</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "J'ai un jean Levi's taille M, acheté 8€"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Marque, taille et prix d'achat détectés automatiquement</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📦 Ajouter un lot</p>
      <p style="margin:0 0 6px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "10 robes Zara pour 100€ le lot"
      </p>
      <p style="margin:0 0 6px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "5 Nike, 10€ chacune"
      </p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "Pour 30€ j'ai eu une robe Zara, un short Oakley rouge et des Adidas vertes taille 44"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Chaque article créé séparément, prix réparti automatiquement</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📍 Ranger un article</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "Le pull Zara rouge est dans le carton bleu sous le lit"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Emplacement enregistré dans ton stock</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">💸 Enregistrer une vente</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "J'ai vendu les Nike Air Max 90 taille 43 pour 65€ sur Vinted"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Vente enregistrée, statut mis à jour automatiquement</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📊 Consulter tes stats</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "Combien j'ai gagné ce mois-ci ?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Résumé de tes ventes et marges en temps réel</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">💰 Estimer un prix de revente</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "J'ai une paire de New Balance 9060 taille 44 un peu usées, je peux les revendre combien ?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Estimation du prix de revente par l'IA</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📊 Analyser ton business</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "Tu peux me parler de mon business ? Comment je peux améliorer mes ventes ?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Analyse complète de ton activité par l'IA</p>
    </div>
    ${ctaButton("Ouvrir FillSell")}` : `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Welcome to FillSell! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Your account is ready. FillSell helps you manage inventory, analyze margins
      and list automatically on Vinted, Leboncoin, eBay and Beebs — all in seconds.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">Get started:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Add items by voice command</li>
        <li>📸 Analyze prices with AI photo (Lens)</li>
        <li>📊 Track your margins in real time</li>
        <li>🚀 List directly on your platforms</li>
        <li><img src="https://fillsell.app/email/pepite.png" width="16" height="16" alt="Pépites" style="display:inline-block;vertical-align:-3px;"> Earn and spend Pépites with every action</li>
      </ul>
    </div>
    <div style="border:1px solid #CFF0EA;border-radius:12px;padding:22px;margin:0 0 24px;background:#FBFFFE;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;letter-spacing:-0.01em;
        color:#111827;font-family:sans-serif;">
        🧩 The Chrome extension: the heart of FillSell
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        It does the work for you: once installed, as soon as you add an item, it
        automatically lists it on Vinted, Leboncoin, eBay and Beebs — without you filling
        in a single form. It runs in the background, without ever taking control of your
        browser.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation"
        style="background:#F0FDF9;border-radius:12px;margin:0 0 18px;">
        <tr><td align="center" style="padding:16px 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-vinted.png" width="54" height="54" alt="Vinted" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-leboncoin.png" width="54" height="54" alt="Leboncoin" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-ebay.png" width="54" height="54" alt="eBay" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-beebs.png" width="54" height="54" alt="Beebs" style="display:block;"></td>
          </tr></table>
        </td></tr>
      </table>
      <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
        <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
          ⚠️ It only works on a computer (not on mobile). If you're reading this email on
          your phone, keep it aside and come back to it from your computer.
        </p>
      </div>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        Once installed, you never need to touch it again: add your items from your phone
        whenever you want, and the extension lists them automatically in the background —
        as long as your computer stays on with Chrome open.
      </p>
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">How to install it today:</p>
      <ol style="margin:0 0 18px;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.8;font-family:sans-serif;">
        <li>From your computer, open the <a href="https://fillsell.app/extension" style="color:#0F9488;font-weight:600;text-decoration:none;">extension install page</a></li>
        <li>Download the installer file and follow the guide shown in the app (2 minutes)</li>
        <li>Log in to your Vinted, Leboncoin, eBay and Beebs accounts directly in your browser, as you usually do — the extension uses these active sessions to list on your behalf. It never logs in for you; you stay in control of your accounts.</li>
      </ol>
      <a href="https://fillsell.app/extension" class="cta"
         style="display:block;text-align:center;background:#2DD4BF;color:#fff;
           font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;
           text-decoration:none;font-family:sans-serif;margin:0 0 14px;">
        Install the extension
      </a>
      <p style="margin:0;font-style:italic;font-size:12px;color:#9CA3AF;line-height:1.6;
        font-family:sans-serif;">
        Even simpler soon: the extension is coming very shortly directly to the Chrome Web
        Store. One click to install, and it will update automatically with each new version
        — no more manual install guide.
      </p>
    </div>
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Voice examples</p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">🗣️ Add an item</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "I have a Levi's jeans size M, bought for €8"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Brand, size and purchase price detected automatically</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📦 Add a batch</p>
      <p style="margin:0 0 6px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "10 Zara dresses for €100 the lot"
      </p>
      <p style="margin:0 0 6px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "5 Nikes, €10 each"
      </p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "For €30 I got a Zara dress, a red Oakley short and green Adidas size 44"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Each item created separately, price split automatically</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📍 Store an item</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "The red Zara jumper is in the blue box under the bed"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Location saved in your stock</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">💸 Record a sale</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "I sold the Nike Air Max 90 size 43 for €65 on Vinted"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Sale recorded, status updated automatically</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📊 Check your stats</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "How much have I earned this month?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Summary of your sales and margins in real time</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 10px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">💰 Estimate a resale price</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "I have a pair of New Balance 9060 size 44 slightly worn, how much can I resell them for?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ AI-powered resale price estimate</p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#111827;font-family:sans-serif;">📊 Analyse your business</p>
      <p style="margin:0 0 8px;font-style:italic;font-size:13px;color:#374151;font-family:sans-serif;background:#F9FAFB;padding:8px 12px;border-radius:8px;border-left:3px solid #2DD4BF;">
        "Can you talk to me about my business? How can I improve my sales?"
      </p>
      <p style="margin:0;font-size:12px;color:#059669;font-family:sans-serif;font-weight:600;">→ Complete AI analysis of your activity</p>
    </div>
    ${ctaButton("Open FillSell")}`;
  return emailWrapper(content, lang);
}

// Email J+3 : pitch Premium standard. Ex-founderHtml — le tier Founder est
// supprimé (2026-07), le checkout ne crée plus que standard/pro ; le type
// email_logs reste 'founder_plan' pour ne pas casser la déduplication.
function premiumPlanHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      FillSell Premium vous attend 🚀
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Débloquez la saisie vocale illimitée, l'analyse photo Lens et toutes les
      fonctionnalités pro.
    </p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium inclut</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Voix illimitée (cap 300/mois · vs 5/jour en gratuit)</li>
        <li>📸 Lens Pro · 10 scans/jour · 120/mois</li>
        <li>📊 Stats avancées &amp; export multi-plateformes</li>
        <li>🎁 7 jours gratuits · sans engagement</li>
      </ul>
    </div>
    ${ctaButton("Je passe Premium")}` : `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      FillSell Premium is waiting for you 🚀
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Unlock unlimited voice input, AI photo analysis and all pro features.
    </p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium includes</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Unlimited voice (300/month cap · vs 5/day on free)</li>
        <li>📸 Lens Pro · 10 scans/day · 120/month</li>
        <li>📊 Advanced stats &amp; multi-platform export</li>
        <li>🎁 7 days free · no commitment</li>
      </ul>
    </div>
    ${ctaButton("Go Premium")}`;
  return emailWrapper(content, lang);
}

function voiceConversionHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Vous maîtrisez la saisie vocale 🎙️
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Vous avez atteint votre limite quotidienne de 5 saisies vocales.
      Passez au Premium pour une utilisation illimitée.
    </p>
    <div style="background:#FEF3C7;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;color:#92400E;font-size:14px;font-family:sans-serif;line-height:1.6;">
        ⚡ Avec le plan Premium, la saisie vocale est <strong>illimitée (cap 300/mois)</strong> —
        ajoutez autant d'articles que vous voulez, quand vous voulez.
      </p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium débloque</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Voix illimitée (cap 300/mois · vs 5/jour en gratuit)</li>
        <li>📸 Lens Pro · 10 scans/jour · 120/mois</li>
        <li>📊 Stats avancées &amp; export</li>
      </ul>
    </div>
    ${ctaButton("Passer au Premium")}` : `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      You're mastering voice input 🎙️
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      You've reached your daily limit of 5 voice inputs.
      Upgrade to Premium for unlimited use.
    </p>
    <div style="background:#FEF3C7;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;color:#92400E;font-size:14px;font-family:sans-serif;line-height:1.6;">
        ⚡ With Premium, voice input is <strong>unlimited (300/month cap)</strong> —
        add as many items as you want, whenever you want.
      </p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium unlocks</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Unlimited voice (300/month cap · vs 5/day on free)</li>
        <li>📸 Lens Pro · 10 scans/day · 120/month</li>
        <li>📊 Advanced stats &amp; export</li>
      </ul>
    </div>
    ${ctaButton("Upgrade to Premium")}`;
  return emailWrapper(content, lang);
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const testEmail: string | null = body?.test_email ?? null;

  const sent: string[] = [];
  const errors: string[] = [];

  async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Immediate welcome (fired from handle_new_user DB trigger) ───────────
  const welcomeNow: boolean = body?.welcome_now === true;
  const welcomeUserId: string | null = body?.user_id ?? null;
  const welcomeUserEmail: string | null = body?.user_email ?? null;

  if (welcomeNow && welcomeUserId && welcomeUserEmail) {
    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("user_id", welcomeUserId)
      .eq("email_type", "welcome")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("lang")
      .eq("id", welcomeUserId)
      .maybeSingle();
    const lang = profile?.lang ?? "fr";

    const subject = lang === "en" ? "Welcome to FillSell 🎉" : "Bienvenue sur FillSell 🎉";
    const ok = await sendEmail(welcomeUserEmail, subject, welcomeHtml(lang));
    if (ok) {
      await supabase
        .from("email_logs")
        .insert({ user_id: welcomeUserId, email_type: "welcome" });
      return new Response(
        JSON.stringify({ success: true, sent: [`welcome:${welcomeUserEmail}`] }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: `Failed to send to ${welcomeUserEmail}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Test mode: send all 3 templates to the specified email ────────────────
  if (testEmail) {
    const r1 = await sendEmail(testEmail, "Bienvenue sur FillSell 🎉", welcomeHtml("fr"));
    if (r1) sent.push(`welcome:${testEmail}`); else errors.push(`welcome:${testEmail}`);
    const r2 = await sendEmail(testEmail, "FillSell Premium vous attend 🚀", premiumPlanHtml("fr"));
    if (r2) sent.push(`founder_plan:${testEmail}`); else errors.push(`founder_plan:${testEmail}`);
    const r3 = await sendEmail(testEmail, "Limite vocale atteinte — passez illimité 🎙️", voiceConversionHtml("fr"));
    if (r3) sent.push(`voice_conversion:${testEmail}`); else errors.push(`voice_conversion:${testEmail}`);
    return new Response(JSON.stringify({ test: true, sent, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Relance mode: send custom one-off emails using standard wrapper ────────
  const relanceEmails: Array<{to: string; subject: string; body_text: string}> = body?.relance_emails ?? [];
  if (relanceEmails.length > 0) {
    for (const item of relanceEmails) {
      const html = emailWrapper(`
        <p style="color:#6B7280;font-size:15px;line-height:1.75;margin:0 0 28px;
          font-family:sans-serif;white-space:pre-line;">${item.body_text.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
        <a href="https://fillsell.app"
           style="display:block;text-align:center;background:#2DD4BF;
             color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
             border-radius:12px;text-decoration:none;font-family:sans-serif;">
          Ouvrir FillSell
        </a>`, "fr");
      const ok = await sendEmail(item.to, item.subject, html);
      if (ok) sent.push(`relance:${item.to}`); else errors.push(`relance:${item.to}`);
    }
    return new Response(JSON.stringify({ relance: true, sent, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Extension update mode (2026-07-18) — DORMANT PAR DÉFAUT ───────────────
  // Mail « nouvelle version de l'extension », déclenché UNIQUEMENT à la main :
  // AUCUN cron ni trigger ne pose extension_update:true. Les appels existants
  // (cron tunnel avec body {}, trigger welcome_now) ne passent JAMAIS ici.
  //
  // Déclenchement (jour J, décision explicite de Nico) :
  //   1. Test sur soi (n'écrit pas email_logs) :
  //      curl -X POST https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel \
  //        -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" \
  //        -d '{"extension_update":true,"version":"0.4.0","audience":"test","test_email":"moi@exemple.fr"}'
  //   2. Envoi réel — users dont l'extension a été vue au moins une fois
  //      (profiles.extension_last_seen_at posé par get-pending-jobs) :
  //      ... -d '{"extension_update":true,"version":"0.4.0","audience":"extension"}'
  //   3. audience "all" = tous les inscrits (hors emails de test, via le RPC) —
  //      à réserver à une annonce majeure.
  // Dédup : email_logs type 'ext_update_<version>' → re-POST idempotent pour une
  // même version (relance sûre après coupure), nouvelle version = nouveau type.
  if (body?.extension_update === true) {
    const version = String(body?.version ?? "").trim();
    if (!version) {
      return new Response(
        JSON.stringify({ error: "extension_update: 'version' requis (ex. \"0.4.0\")" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const audience = ["extension", "all", "test"].includes(body?.audience) ? body.audience : "extension";
    const emailType = `ext_update_${version}`;

    if (audience === "test") {
      const to = String(body?.test_email ?? "").trim();
      if (!to) {
        return new Response(
          JSON.stringify({ error: "audience 'test' : 'test_email' requis" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const ok = await sendEmail(to, extensionUpdateSubject("fr"), extensionUpdateHtml("fr", version));
      return new Response(
        JSON.stringify({ extension_update: true, version, audience, sent: ok ? [to] : [], errors: ok ? [] : [to] }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Même source d'adresses que le tunnel (RPC : exclut déjà les emails de test).
    const { data: extCandidates, error: extCandErr } = await supabase.rpc("email_tunnel_candidates");
    if (extCandErr || !extCandidates) {
      return new Response(
        JSON.stringify({ error: extCandErr?.message ?? "email_tunnel_candidates a échoué" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    let targets = extCandidates as any[];
    if (audience === "extension") {
      const { data: extRows, error: extErr } = await supabase
        .from("profiles")
        .select("id")
        .not("extension_last_seen_at", "is", null);
      if (extErr) {
        return new Response(
          JSON.stringify({ error: `lecture extension_last_seen_at : ${extErr.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      const extSet = new Set((extRows ?? []).map((r: any) => r.id));
      targets = targets.filter((c) => extSet.has(c.user_id));
    }

    const { data: extLogs } = await supabase
      .from("email_logs")
      .select("user_id")
      .eq("email_type", emailType);
    const alreadyDone = new Set((extLogs ?? []).map((l: any) => l.user_id));

    let skipped = 0;
    for (const c of targets) {
      if (alreadyDone.has(c.user_id)) { skipped++; continue; }
      const lang = c.lang === "en" ? "en" : "fr";
      const ok = await sendEmail(c.user_email, extensionUpdateSubject(lang), extensionUpdateHtml(lang, version));
      if (ok) {
        await supabase.from("email_logs").insert({ user_id: c.user_id, email_type: emailType });
        sent.push(`${emailType}:${c.user_email}`);
      } else {
        errors.push(`${emailType}:${c.user_email}`);
      }
    }
    return new Response(
      JSON.stringify({ extension_update: true, version, audience, targeted: targets.length, skipped, sent, errors }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  async function logEmail(userId: string, emailType: string): Promise<void> {
    await supabase.from("email_logs").insert({ user_id: userId, email_type: emailType });
  }

  // ── Load candidates ────────────────────────────────────────────────────────
  const { data: candidates, error: candidatesErr } = await supabase.rpc(
    "email_tunnel_candidates"
  );
  if (candidatesErr || !candidates) {
    return new Response(
      JSON.stringify({ error: candidatesErr?.message ?? "Failed to fetch candidates" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Load existing logs to prevent duplicates ───────────────────────────────
  const userIds: string[] = candidates.map((c: any) => c.user_id);
  const { data: existingLogs } = userIds.length > 0
    ? await supabase
        .from("email_logs")
        .select("user_id, email_type")
        .in("user_id", userIds)
    : { data: [] as any[] };

  const sentSet = new Set<string>(
    (existingLogs ?? []).map((l: any) => `${l.user_id}:${l.email_type}`)
  );
  const alreadySent = (uid: string, type: string) => sentSet.has(`${uid}:${type}`);

  // ── Date windows (UTC) ────────────────────────────────────────────────────
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayMinus1 = new Date(todayUTC.getTime() - 1 * 86_400_000);
  const dayMinus3 = new Date(todayUTC.getTime() - 3 * 86_400_000);

  function registeredOn(createdAt: string, targetDay: Date): boolean {
    const d = new Date(createdAt);
    const dayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return dayUTC.getTime() === targetDay.getTime();
  }

  // ── Trigger 1: J+1 welcome ────────────────────────────────────────────────
  for (const user of candidates as any[]) {
    if (!registeredOn(user.created_at, dayMinus1)) continue;
    if (alreadySent(user.user_id, "welcome")) continue;
    const subject =
      user.lang === "en" ? "Welcome to FillSell 🎉" : "Bienvenue sur FillSell 🎉";
    const ok = await sendEmail(user.user_email, subject, welcomeHtml(user.lang));
    if (ok) {
      await logEmail(user.user_id, "welcome");
      sent.push(`welcome:${user.user_email}`);
    } else {
      errors.push(`welcome:${user.user_email}`);
    }
  }

  // ── Trigger 2: J+3 pitch Premium (non-premium) ────────────────────────────
  // email_type conservé à 'founder_plan' (nom legacy) : changer le type
  // renverrait l'email aux comptes qui ont déjà reçu la version Founder.
  for (const user of candidates as any[]) {
    if (user.is_premium) continue;
    if (!registeredOn(user.created_at, dayMinus3)) continue;
    if (alreadySent(user.user_id, "founder_plan")) continue;
    const subject =
      user.lang === "en"
        ? "FillSell Premium is waiting for you 🚀"
        : "FillSell Premium vous attend 🚀";
    const ok = await sendEmail(
      user.user_email,
      subject,
      premiumPlanHtml(user.lang)
    );
    if (ok) {
      await logEmail(user.user_id, "founder_plan");
      sent.push(`founder_plan:${user.user_email}`);
    } else {
      errors.push(`founder_plan:${user.user_email}`);
    }
  }

  // ── Trigger 3: voice quota hit yesterday (≥5 voice_intent) ───────────────
  const { data: voiceLogs } = await supabase
    .from("usage_logs")
    .select("user_id")
    .eq("feature", "voice_intent")
    .gte("created_at", dayMinus1.toISOString())
    .lt("created_at", todayUTC.toISOString());

  if (voiceLogs) {
    const voiceCounts: Record<string, number> = {};
    for (const log of voiceLogs) {
      voiceCounts[log.user_id] = (voiceCounts[log.user_id] ?? 0) + 1;
    }

    const candidateMap: Record<string, any> = {};
    for (const c of candidates as any[]) {
      candidateMap[c.user_id] = c;
    }

    for (const [uid, count] of Object.entries(voiceCounts)) {
      if (count < 5) continue;
      const user = candidateMap[uid];
      if (!user) continue; // excluded email
      if (user.is_premium) continue;
      if (alreadySent(uid, "voice_conversion")) continue;
      const subject =
        user.lang === "en"
          ? "You've hit your voice limit — go unlimited 🎙️"
          : "Limite vocale atteinte — passez illimité 🎙️";
      const ok = await sendEmail(
        user.user_email,
        subject,
        voiceConversionHtml(user.lang)
      );
      if (ok) {
        await logEmail(uid, "voice_conversion");
        sent.push(`voice_conversion:${user.user_email}`);
      } else {
        errors.push(`voice_conversion:${user.user_email}`);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, sent, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
