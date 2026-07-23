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

// Email J+1 « comment ça marche » — pédagogie post-première-publication.
// Chiffres VÉRIFIÉS dans le code de l'extension (chrome-extension/config.js +
// background.js, 2026-07-23) : publication en tâche de fond (quelques minutes/
// plateforme), vérification de vente throttlée à 2 h par annonce
// (SALE_CHECK_MIN_INTERVAL_MS), délai de grâce avant retrait UNIFORME 2 h sur
// les 4 plateformes (PUBLISH_GRACE_MS, plus « selon la plateforme » depuis le
// 2026-07-13). Ne pas réintroduire de chiffre non vérifié ici.
function howItWorksHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Comment FillSell travaille pour vous 🔍
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Vous avez commencé à publier — voici ce qui se passe en coulisses, pour ne jamais
      avoir à vous demander si ça fonctionne.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">⏱️ La publication</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        Une fois un article ajouté, l'extension le publie sur chaque plateforme sélectionnée
        en arrière-plan — comptez quelques minutes par plateforme. Pas besoin de garder l'app
        ouverte ni de surveiller : tant que votre ordinateur reste allumé avec Chrome ouvert,
        ça avance tout seul.
      </p>
    </div>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">🔄 La vérification automatique</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        FillSell vérifie régulièrement (toutes les 2 heures par annonce, en arrière-plan) que
        vos annonces sont toujours en ligne et si l'une d'elles a été vendue. Vous n'avez
        jamais besoin de vérifier vous-même.
      </p>
    </div>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">🗑️ La suppression automatique</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        Dès qu'un article se vend sur une plateforme, FillSell retire automatiquement
        l'annonce sur les autres — plus besoin de repasser partout pour éviter une double
        vente. Par sécurité, un court délai de confirmation (environ 2 heures, identique sur
        les 4 plateformes) est observé avant la suppression, pour être sûr que la vente est
        bien réelle.
      </p>
    </div>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      <strong>En résumé :</strong> une fois l'article ajouté, il n'y a plus rien à faire.
      FillSell s'occupe de tout, même loin de votre ordinateur.
    </p>
    ${ctaButton("Voir mon stock")}` : `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      How FillSell works for you 🔍
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      You've started listing — here's what happens behind the scenes, so you never have to
      wonder whether it's working.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">⏱️ Listing</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        Once you add an item, the extension lists it on each selected platform in the
        background — count a few minutes per platform. No need to keep the app open or watch
        over it: as long as your computer stays on with Chrome open, it moves along on its own.
      </p>
    </div>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">🔄 Automatic checking</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        FillSell regularly checks (every 2 hours per listing, in the background) that your
        listings are still online and whether one of them has sold. You never need to check
        yourself.
      </p>
    </div>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">🗑️ Automatic removal</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        As soon as an item sells on one platform, FillSell automatically removes the listing
        from the others — no more going everywhere to avoid a double sale. For safety, a short
        confirmation delay (about 2 hours, the same across all 4 platforms) is observed before
        removal, to be sure the sale is real.
      </p>
    </div>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      <strong>In short:</strong> once the item is added, there's nothing left to do. FillSell
      handles everything, even away from your computer.
    </p>
    ${ctaButton("View my stock")}`;
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

  // ── Test mode: send the 2 tunnel templates to the specified email ─────────
  // N'écrit PAS email_logs — sert aux previews (welcome + comment ça marche).
  if (testEmail) {
    const r1 = await sendEmail(testEmail, "Bienvenue sur FillSell 🎉", welcomeHtml("fr"));
    if (r1) sent.push(`welcome:${testEmail}`); else errors.push(`welcome:${testEmail}`);
    const r2 = await sendEmail(testEmail, "Comment FillSell travaille pour vous 🔍", howItWorksHtml("fr"));
    if (r2) sent.push(`how_it_works:${testEmail}`); else errors.push(`how_it_works:${testEmail}`);
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

  // ── Trigger 2: J+1 « comment ça marche » (tous, même fenêtre que le welcome) ─
  // Dédup type 'how_it_works', distinct de 'welcome' : les deux coexistent le
  // même jour sans conflit. Aucune condition premium/non-premium.
  for (const user of candidates as any[]) {
    if (!registeredOn(user.created_at, dayMinus1)) continue;
    if (alreadySent(user.user_id, "how_it_works")) continue;
    const subject =
      user.lang === "en"
        ? "How FillSell works for you 🔍"
        : "Comment FillSell travaille pour vous 🔍";
    const ok = await sendEmail(user.user_email, subject, howItWorksHtml(user.lang));
    if (ok) {
      await logEmail(user.user_id, "how_it_works");
      sent.push(`how_it_works:${user.user_email}`);
    } else {
      errors.push(`how_it_works:${user.user_email}`);
    }
  }

  return new Response(JSON.stringify({ success: true, sent, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
