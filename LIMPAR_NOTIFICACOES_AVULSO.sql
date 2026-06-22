-- LIMPAR_NOTIFICACOES_AVULSO.sql
-- Rodar MANUALMENTE no Supabase SQL Editor (Project → SQL Editor → New query).
-- Remove notificações "Pacote vencendo" geradas anteriormente para pacotes avulso
-- (sess_total = 1). Após isso, o próximo ciclo do sino recriará apenas as notificações
-- válidas (pacotes com sess_total > 1 e ≤ 2 sessões restantes).

DELETE FROM notifications
WHERE title = 'Pacote vencendo'
  AND type = 'package_low'
  AND reference_id IN (
    SELECT n.reference_id
    FROM notifications n
    JOIN packages p ON p.id = n.reference_id::uuid
    WHERE n.title = 'Pacote vencendo'
      AND n.type  = 'package_low'
      AND p.sess_total <= 1
  );

-- Alternativa mais ampla (apaga TODAS as "Pacote vencendo" para recriar limpas):
-- DELETE FROM notifications WHERE title = 'Pacote vencendo' AND type = 'package_low';
