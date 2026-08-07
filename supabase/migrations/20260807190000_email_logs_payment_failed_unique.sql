-- ═══════════════════════════════════════════════════════════════════════════
-- DÉDUP DES MAILS « PAIEMENT ÉCHOUÉ » — UN MAIL PAR FACTURE (2026-08-07)
-- ⛔ NON APPLIQUÉE — à montrer à Nico avant exécution.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le mode payment_failed d'email-tunnel journalise chaque notification sous
-- email_type = 'payment_failed:<invoice_id Stripe>' : la facture EST l'échec.
-- Un client qui échoue en août puis en novembre = deux factures = deux mails ;
-- les retries Stripe de la MÊME facture (dunning) = un seul mail.
--
-- Ce type est RÉCURRENT par nature : il n'entre PAS dans
-- email_logs_one_shot_unique (liste FERMÉE des one-shot À VIE, règle
-- CLAUDE.md). Son unicité vit ici, dans un index partiel dédié — et c'est
-- l'INSERT qui arbitre (réservation AVANT envoi côté fonction : 23505 = déjà
-- notifié → pas d'envoi ; Resend en échec → la ligne est supprimée pour
-- rester re-notifiable). Jamais de dédup lue-puis-écrite.
--
-- Idempotente : DROP + CREATE sous le même nom.

drop index if exists public.email_logs_payment_failed_unique;
create unique index email_logs_payment_failed_unique
  on public.email_logs (user_id, email_type)
  where email_type like 'payment_failed:%';
