-- Fix security definer view by recreating with security_invoker
DROP VIEW IF EXISTS public.signal_accuracy_summary;

CREATE VIEW public.signal_accuracy_summary WITH (security_invoker = true) AS
WITH base AS (
  SELECT * FROM signal_outcomes WHERE was_correct IS NOT NULL
),
by_type AS (
  SELECT
    signal_type,
    count(*) AS total,
    count(*) FILTER (WHERE was_correct) AS correct,
    round(avg(confidence) FILTER (WHERE was_correct), 1) AS avg_conf_correct,
    round(avg(confidence) FILTER (WHERE NOT was_correct), 1) AS avg_conf_incorrect,
    round(sum(pnl_if_traded), 2) AS pnl
  FROM base
  GROUP BY signal_type
)
SELECT
  (SELECT count(*) FROM base) AS total_signals,
  (SELECT count(*) FILTER (WHERE was_correct) FROM base) AS correct_signals,
  (SELECT round((count(*) FILTER (WHERE was_correct))::numeric / NULLIF(count(*), 0) * 100, 1) FROM base) AS overall_accuracy_pct,
  (SELECT round(avg(confidence) FILTER (WHERE was_correct), 1) FROM base) AS avg_confidence_correct,
  (SELECT round(avg(confidence) FILTER (WHERE NOT was_correct), 1) FROM base) AS avg_confidence_incorrect,
  (SELECT round(sum(pnl_if_traded), 2) FROM base) AS total_simulated_pnl,
  (SELECT jsonb_agg(jsonb_build_object(
    'signal_type', signal_type,
    'total', total,
    'correct', correct,
    'accuracy_pct', round(correct::numeric / NULLIF(total, 0) * 100, 1),
    'avg_conf_correct', avg_conf_correct,
    'avg_conf_incorrect', avg_conf_incorrect,
    'pnl', pnl
  ) ORDER BY signal_type) FROM by_type) AS by_signal_type;