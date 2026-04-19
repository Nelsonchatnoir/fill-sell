import { useNavigate } from "react-router-dom";
import { useState } from "react";

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#0F172A", sub: "#475569", label: "#94A3B8", border: "rgba(0,0,0,0.06)" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #F1F5F9; }
  .legal-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
    padding: 32px 36px;
    margin-bottom: 16px;
  }
  .legal-h2 {
    font-size: 15px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.3px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .legal-p {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.75;
    margin-bottom: 10px;
  }
  .legal-p:last-child { margin-bottom: 0; }
  .legal-ul {
    list-style: none;
    padding: 0;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legal-ul li {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.6;
    padding-left: 14px;
    position: relative;
  }
  .legal-ul li::before {
    content: "–";
    position: absolute;
    left: 0;
    color: #94A3B8;
  }
  .legal-strong { font-weight: 700; color: #0F172A; }
  a.legal-link { color: #3EACA0; text-decoration: none; font-weight: 600; }
  a.legal-link:hover { text-decoration: underline; }
  @media(max-width: 640px) {
    .legal-card { padding: 22px 18px; }
  }
`;

const Section = ({ icon, title, children }) => (
  <div className="legal-card">
    <div className="legal-h2">
      <span>{icon}</span>
      {title}
    </div>
    {children}
  </div>
);

const privacyTexts = {
  fr: {
    title: "🔐 Politique de confidentialité (App Store)",
    intro: "Fill & Sell collecte et traite les données utilisateur pour fournir ses fonctionnalités principales.",
    collectedTitle: "Données collectées :",
    collected: [
      "Adresse email (création de compte et authentification)",
      "Contenu utilisateur (inventaire, ventes, descriptions)",
      "Statut d'abonnement (accès premium)",
      "Données techniques (logs de sécurité)",
    ],
    usageTitle: "Ces données sont :",
    usage: [
      "Utilisées exclusivement pour faire fonctionner le service",
      "Jamais vendues à des tiers",
      "Jamais utilisées pour du tracking publicitaire",
    ],
    storage: "Les données sont stockées de manière sécurisée via Supabase (infrastructure EU) et protégées par des mesures de sécurité standard.",
    rights: "Les utilisateurs peuvent demander l'accès, la modification ou la suppression de leurs données en contactant :",
    noTrack: "Fill & Sell ne contient aucun SDK de tracking ou de publicité.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
  en: {
    title: "🔐 Privacy Policy (App Store)",
    intro: "Fill & Sell collects and processes user data to provide its core features.",
    collectedTitle: "Data collected:",
    collected: [
      "Email address (account creation and authentication)",
      "User content (inventory, sales, descriptions)",
      "Subscription status (premium access)",
      "Technical data (security logs)",
    ],
    usageTitle: "This data is:",
    usage: [
      "Used exclusively to operate the service",
      "Never sold to third parties",
      "Never used for advertising tracking",
    ],
    storage: "Data is stored securely via Supabase (EU infrastructure) and protected by standard security measures.",
    rights: "Users may request access, modification, or deletion of their data by contacting:",
    noTrack: "Fill & Sell contains no tracking or advertising SDKs.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
};

export default function Legal() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem('fs_lang') || 'fr');
  const p = privacyTexts[lang] || privacyTexts.fr;
  const en = lang === 'en';

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{css}</style>

      {/* Header — paddingTop pushes content below notch/Dynamic Island */}
      <div style={{ background: "linear-gradient(135deg,#3EACA0ee 0%,#E8956Ddd 100%)", boxShadow: "0 6px 24px rgba(0,0,0,0.12)", paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 68, gap: 14 }}>
          <button onClick={() => nav(-1)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >{en ? '← Back' : '← Retour'}</button>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            {en ? 'Legal Notice & T&C' : 'Mentions légales & CGU'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Intro */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
            {en ? 'Legal documents' : 'Documents légaux'}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: "-0.8px", marginBottom: 8 }}>
            {en ? 'Legal Notice & T&C' : 'Mentions légales & CGU'}
          </h1>
          <p style={{ fontSize: 13, color: C.label }}>
            {en ? 'Last updated: April 2026' : 'Dernière mise à jour : avril 2026'}
          </p>
        </div>

        {/* 1. Éditeur / Publisher */}
        <Section icon="🏢" title={en ? '1. Publisher' : '1. Éditeur du site'}>
          <p className="legal-p">
            {en
              ? <>The website <span className="legal-strong">Fill & Sell</span> (accessible at <span className="legal-strong">fillsell.app</span>) is published by:</>
              : <>Le site <span className="legal-strong">Fill & Sell</span> (accessible à l'adresse <span className="legal-strong">fillsell.app</span>) est édité par :</>}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Status:' : 'Statut :'}</span> {en ? 'Self-employed' : 'Auto-entrepreneur'}</li>
            <li><span className="legal-strong">{en ? 'Trade name:' : 'Nom commercial :'}</span> Fill & Sell</li>
            <li><span className="legal-strong">{en ? 'Publication manager:' : 'Responsable de publication :'}</span> {en ? 'The manager of Fill & Sell' : 'Le gérant de Fill & Sell'}</li>
            <li><span className="legal-strong">Contact :</span> <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></li>
          </ul>
        </Section>

        {/* 2. Hébergement / Hosting */}
        <Section icon="🌐" title={en ? '2. Hosting' : '2. Hébergement'}>
          <p className="legal-p">{en ? 'The website is hosted by:' : 'Le site est hébergé par :'}</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Company:' : 'Société :'}</span> Vercel Inc.</li>
            <li><span className="legal-strong">{en ? 'Address:' : 'Adresse :'}</span> 340 Pine Street, Suite 701, San Francisco, CA 94104, {en ? 'United States' : 'États-Unis'}</li>
            <li><span className="legal-strong">{en ? 'Website:' : 'Site web :'}</span> <a href="https://vercel.com" className="legal-link" target="_blank" rel="noreferrer">vercel.com</a></li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>
            {en
              ? <>Data is stored via <span className="legal-strong">Supabase</span> (Supabase Inc., AWS eu-west-1 infrastructure — Europe).</>
              : <>Les données sont stockées via <span className="legal-strong">Supabase</span> (Supabase Inc., infrastructure AWS eu-west-1 — Europe).</>}
          </p>
        </Section>

        {/* 3. CGU / T&C */}
        <Section icon="📋" title={en ? '3. Terms and Conditions (T&C)' : '3. Conditions générales d\'utilisation (CGU)'}>
          <p className="legal-p">
            <span className="legal-strong">{en ? '3.1 Purpose' : '3.1 Objet'}</span><br />
            {en
              ? 'Fill & Sell is a SaaS buy-and-resell tracking tool that allows users to manage their inventory, calculate their margins, and analyze their profits. Access to the service implies full acceptance of these Terms and Conditions.'
              : "Fill & Sell est un outil SaaS de suivi d'achat-revente permettant aux utilisateurs de gérer leur inventaire, calculer leurs marges et analyser leurs profits. L'accès au service implique l'acceptation pleine et entière des présentes CGU."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.2 Registration' : '3.2 Inscription'}</span><br />
            {en
              ? 'Registration is free. The user agrees to provide accurate information and to maintain the confidentiality of their credentials. Any account may be cancelled by the user at any time.'
              : "L'inscription est gratuite. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants. Tout compte peut être résilié par l'utilisateur à tout moment."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.3 Free Plan' : '3.3 Plan gratuit'}</span><br />
            {en
              ? <>The free plan allows managing up to <span className="legal-strong">20 items</span> in inventory. Access to the dashboard, margin calculation, and sales history is included without time limit.</>
              : <>Le plan gratuit permet de gérer jusqu'à <span className="legal-strong">20 articles</span> en stock. L'accès au dashboard, au calcul des marges et à l'historique des ventes est inclus sans limite de durée.</>}
          </p>

          {en ? (
            <p className="legal-p"><span className="legal-strong">3.4 Premium Subscription</span><br />
              The Premium plan is offered at <span className="legal-strong">€4.99 per month</span>, no commitment required. It gives access to unlimited items and advanced analytics.<br /><br />
              <span className="legal-strong">On web:</span> payment is securely processed by <span className="legal-strong">Stripe</span>.<br /><br />
              <span className="legal-strong">On iOS:</span> payment is managed via the Apple App Store (In-App Purchase). The subscription automatically renews unless cancelled at least 24 hours before the end of the current period. You can manage or cancel your subscription in your Apple account settings.
            </p>
          ) : (
            <p className="legal-p"><span className="legal-strong">3.4 Abonnement Premium</span><br />
              Le plan Premium est proposé au tarif de <span className="legal-strong">4,99 € TTC par mois</span>, sans engagement de durée. Il donne accès à des articles illimités et aux statistiques avancées.<br /><br />
              <span className="legal-strong">Sur le web :</span> le paiement est traité de manière sécurisée par <span className="legal-strong">Stripe</span>.<br /><br />
              <span className="legal-strong">Sur iOS :</span> le paiement est géré via l'App Store Apple (In-App Purchase). L'abonnement se renouvelle automatiquement sauf résiliation au moins 24h avant la fin de la période en cours. Vous pouvez gérer ou annuler votre abonnement dans les réglages de votre compte Apple.
            </p>
          )}

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.5 Cancellation' : '3.5 Résiliation'}</span><br />
            {en
              ? 'The user may cancel their subscription at any time from their account. Cancellation takes effect at the end of the current billing period. No pro-rata refund is made for the remaining days.'
              : "L'utilisateur peut résilier son abonnement à tout moment depuis son espace client. La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement au prorata n'est effectué pour les jours restants."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.6 Refunds' : '3.6 Remboursement'}</span><br />
            {en
              ? <>In accordance with applicable consumer protection regulations, the 14-day withdrawal right does not apply to digital services whose execution has begun with the user's express consent. However, in the event of a manifest error or service defect, a refund request may be submitted to <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a> within 7 days of the charge.</>
              : <>Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas aux services numériques dont l'exécution a commencé avec l'accord exprès de l'utilisateur. Toutefois, en cas d'erreur manifeste ou de défaut du service, une demande de remboursement peut être adressée à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a> dans un délai de 7 jours suivant le débit.</>}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.7 Service Availability' : '3.7 Disponibilité du service'}</span><br />
            {en
              ? 'Fill & Sell strives to ensure service availability 24/7. Temporary interruptions may occur for maintenance. Fill & Sell cannot be held responsible for any temporary unavailability.'
              : "Fill & Sell s'efforce d'assurer la disponibilité du service 24h/24 et 7j/7. Des interruptions temporaires peuvent survenir pour maintenance. Fill & Sell ne saurait être tenu responsable en cas d'indisponibilité temporaire."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.8 Intellectual Property' : '3.8 Propriété intellectuelle'}</span><br />
            {en
              ? 'All elements of the website (logo, design, code, content) are the exclusive property of Fill & Sell. Any reproduction, even partial, without prior written authorization is prohibited.'
              : "L'ensemble des éléments du site (logo, design, code, contenus) sont la propriété exclusive de Fill & Sell. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite."}
          </p>
        </Section>

        {/* 4. RGPD / GDPR */}
        <Section icon="🔒" title={en ? '4. Personal Data Protection (GDPR)' : '4. Protection des données personnelles (RGPD)'}>
          <p className="legal-p">
            <span className="legal-strong">{en ? '4.1 Data Controller' : '4.1 Responsable du traitement'}</span><br />
            {en
              ? 'Fill & Sell is the controller of personal data collected through the service, in accordance with the General Data Protection Regulation (GDPR — EU 2016/679).'
              : 'Fill & Sell est responsable du traitement des données personnelles collectées via le service, conformément au Règlement Général sur la Protection des Données (RGPD — UE 2016/679).'}
          </p>

          <p className="legal-p"><span className="legal-strong">{en ? '4.2 Data Collected' : '4.2 Données collectées'}</span></p>
          <ul className="legal-ul">
            <li>{en ? 'Email address (account creation and authentication)' : 'Adresse email (création de compte et authentification)'}</li>
            <li>{en ? 'Sales and inventory data entered by the user' : "Données de ventes et d'inventaire saisies par l'utilisateur"}</li>
            <li>{en ? 'Payment data (managed exclusively by Stripe — not stored on our servers)' : 'Données de paiement (gérées exclusivement par Stripe — non stockées sur nos serveurs)'}</li>
            <li>{en ? 'Navigation data (technical logs, IP address)' : 'Données de navigation (logs techniques, adresse IP)'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '4.3 Purposes of Processing' : '4.3 Finalités du traitement'}</span></p>
          <ul className="legal-ul">
            <li>{en ? 'Provision and improvement of the service' : 'Fourniture et amélioration du service'}</li>
            <li>{en ? 'Subscription and billing management' : 'Gestion des abonnements et de la facturation'}</li>
            <li>{en ? 'User support' : 'Support utilisateur'}</li>
            <li>{en ? 'Security and fraud prevention' : 'Sécurité et prévention des fraudes'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>
            <span className="legal-strong">{en ? '4.4 Your Rights' : '4.4 Vos droits'}</span><br />
            {en
              ? 'In accordance with the GDPR, you have the following rights regarding your data:'
              : 'Conformément au RGPD, vous disposez des droits suivants sur vos données :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Right of access:' : 'Droit d\'accès :'}</span> {en ? 'obtain a copy of your personal data' : 'obtenir une copie de vos données personnelles'}</li>
            <li><span className="legal-strong">{en ? 'Right of rectification:' : 'Droit de rectification :'}</span> {en ? 'correct inaccurate data' : 'corriger des données inexactes'}</li>
            <li><span className="legal-strong">{en ? 'Right to erasure:' : 'Droit à l\'effacement :'}</span> {en ? 'delete your data ("right to be forgotten")' : 'supprimer vos données (« droit à l\'oubli »)'}</li>
            <li><span className="legal-strong">{en ? 'Right to data portability:' : 'Droit à la portabilité :'}</span> {en ? 'receive your data in a structured format' : 'recevoir vos données dans un format structuré'}</li>
            <li><span className="legal-strong">{en ? 'Right to object:' : 'Droit d\'opposition :'}</span> {en ? 'object to certain processing' : 'vous opposer à certains traitements'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>
            {en
              ? <>To exercise these rights, contact us at: <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. We will respond within a maximum of 30 days.</>
              : <>Pour exercer ces droits, contactez-nous à : <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. Nous répondrons dans un délai maximum de 30 jours.</>}
          </p>
          <p className="legal-p">
            {en
              ? <>You may also lodge a complaint with the relevant data protection authority in your country.</>
              : <>Vous pouvez également introduire une réclamation auprès de la <span className="legal-strong">CNIL</span> (<a href="https://www.cnil.fr" className="legal-link" target="_blank" rel="noreferrer">cnil.fr</a>).</>}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '4.5 Data Retention' : '4.5 Conservation des données'}</span><br />
            {en
              ? 'Data is retained for the duration of the subscription, then deleted within 90 days of account closure, unless otherwise required by law.'
              : "Les données sont conservées pendant toute la durée de l'abonnement, puis supprimées dans un délai de 90 jours suivant la clôture du compte, sauf obligation légale contraire."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '4.6 Sub-processors' : '4.6 Sous-traitants'}</span><br />
            {en
              ? 'Fill & Sell uses the following sub-processors, all GDPR-compliant:'
              : 'Fill & Sell fait appel aux sous-traitants suivants, tous conformes au RGPD :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Supabase</span> — {en ? 'data storage (EU infrastructure)' : 'stockage des données (infrastructure EU)'}</li>
            <li><span className="legal-strong">Vercel</span> — {en ? 'application hosting' : "hébergement de l'application"}</li>
            <li><span className="legal-strong">Stripe</span> — {en ? 'payment processing (PCI-DSS certified)' : 'traitement des paiements (certifié PCI-DSS)'}</li>
          </ul>
        </Section>

        {/* 5. Cookies */}
        <Section icon="🍪" title={en ? '5. Cookie Policy' : '5. Politique de cookies'}>
          <p className="legal-p">
            {en
              ? 'Fill & Sell uses a minimal number of cookies, strictly necessary for the operation of the service:'
              : 'Fill & Sell utilise un nombre minimal de cookies, strictement nécessaires au fonctionnement du service :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Session cookie:' : 'Cookie de session :'}</span> {en ? 'maintaining user connection (Supabase Auth)' : 'maintien de la connexion utilisateur (Supabase Auth)'}</li>
            <li><span className="legal-strong">{en ? 'Local preferences:' : 'Préférences locales :'}</span> {en ? 'active tab, display settings (localStorage — not shared with third parties)' : 'onglet actif, paramètres d\'affichage (localStorage — non transmis à des tiers)'}</li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>
            {en
              ? <>Fill & Sell uses <span className="legal-strong">no advertising cookies</span> or third-party trackers for targeting purposes. No explicit consent is required for strictly necessary cookies, in accordance with the ePrivacy Directive.</>
              : <>Fill & Sell n'utilise <span className="legal-strong">aucun cookie publicitaire</span> ni tracker tiers à des fins de ciblage. Aucun consentement explicite n'est requis pour les cookies strictement nécessaires, conformément à la directive ePrivacy.</>}
          </p>
        </Section>

        {/* 6. Droit applicable / Applicable Law */}
        <Section icon="⚖️" title={en ? '6. Applicable Law and Disputes' : '6. Droit applicable et litiges'}>
          <p className="legal-p">
            {en
              ? 'These Terms and Conditions and legal notices are governed by French law. In the event of a dispute, an amicable resolution will be sought first. Failing that, the competent courts will be those of Fill & Sell\'s registered office.'
              : <>Les présentes CGU et mentions légales sont régies par le <span className="legal-strong">droit français</span>. En cas de litige, une solution amiable sera recherchée en priorité. À défaut, les tribunaux compétents seront ceux du ressort du siège de Fill & Sell.</>}
          </p>
          <p className="legal-p">
            {en
              ? <>In accordance with applicable consumer law, the user may use a free consumer mediator. For any dispute related to an online payment, the European Commission's online dispute resolution platform is available at: <a href="https://ec.europa.eu/consumers/odr" className="legal-link" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</>
              : <>Conformément à l'article L.612-1 du Code de la consommation, l'utilisateur peut recourir gratuitement à un médiateur de la consommation. Pour tout litige lié à un paiement en ligne, la plateforme de règlement en ligne des litiges de la Commission européenne est accessible à : <a href="https://ec.europa.eu/consumers/odr" className="legal-link" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</>}
          </p>
        </Section>

        {/* 7. App Store Privacy */}
        <Section icon="🔐" title={p.title}>
          <p className="legal-p">{p.intro}</p>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.collectedTitle}</span></p>
          <ul className="legal-ul">
            {p.collected.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.usageTitle}</span></p>
          <ul className="legal-ul">
            {p.usage.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>{p.storage}</p>
          <p className="legal-p">{p.rights} <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></p>
          <p className="legal-p">{p.noTrack}</p>
          <p className="legal-p" style={{ fontStyle: "italic", color: "#94A3B8", fontSize: 12.5 }}>{p.compliance}</p>
        </Section>

        {/* Contact */}
        <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
          <p style={{ fontSize: 13, color: C.label }}>
            {en ? 'Questions?' : 'Des questions ?'}{' '}
            {en ? 'Contact us at' : 'Contactez-nous à'}{' '}
            <a href="mailto:support@fillsell.app" style={{ color: C.teal, fontWeight: 600, textDecoration: "none" }}>support@fillsell.app</a>
          </p>
        </div>

      </div>
    </div>
  );
}
