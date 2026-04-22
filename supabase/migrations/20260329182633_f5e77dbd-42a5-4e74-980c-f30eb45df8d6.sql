-- Signal outcomes table for tracking RAG signal accuracy
CREATE TABLE public.signal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_signal_id uuid REFERENCES public.rag_signals(id) ON DELETE CASCADE NOT NULL,
  market_id text NOT NULL,
  signal_type text NOT NULL,
  confidence numeric,
  price_at_signal numeric,
  resolution_price numeric,
  was_correct boolean,
  pnl_if_traded numeric,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(rag_signal_id)
);

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signal outcomes are publicly readable" ON public.signal_outcomes FOR SELECT TO public USING (true);
CREATE POLICY "Service can insert signal outcomes" ON public.signal_outcomes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can update signal outcomes" ON public.signal_outcomes FOR UPDATE TO public USING (true);

-- RPC: evaluate closed markets against rag_signals
CREATE OR REPLACE FUNCTION public.evaluate_signal_accuracy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_evaluated int := 0;
  v_correct int := 0;
  v_total_pnl numeric := 0;
  r record;
BEGIN
  FOR r IN
    SELECT
      rs.id AS signal_id,
      rs.market_id,
      rs.signal_type,
      rs.confidence,
      rs.current_price AS price_at_signal,
      rs.created_at AS signal_created,
      -- Get resolution price: YES token price for resolved market (1.0 or 0.0)
      (SELECT t.price FROM tokens t WHERE t.market_id = rs.market_id AND t.outcome = 'Yes' LIMIT 1) AS resolution_price
    FROM rag_signals rs
    JOIN markets m ON m.id = rs.market_id AND m.closed = true
    WHERE NOT EXISTS (
      SELECT 1 FROM signal_outcomes so WHERE so.rag_signal_id = rs.id
    )
  LOOP
    DECLARE
      v_correct_flag boolean;
      v_pnl numeric;
      v_res_price numeric := COALESCE(r.resolution_price, 0);
      v_sig_price numeric := COALESCE(r.price_at_signal, 0.5);
    BEGIN
      -- Determine correctness
      v_correct_flag := CASE
        WHEN r.signal_type IN ('STRONG_YES', 'YES') AND v_res_price > 0.9 THEN true
        WHEN r.signal_type IN ('STRONG_NO', 'NO') AND v_res_price < 0.1 THEN true
        WHEN r.signal_type = 'UNCERTAIN' THEN NULL  -- neither correct nor incorrect
        WHEN r.signal_type IN ('STRONG_YES', 'YES') AND v_res_price < 0.1 THEN false
        WHEN r.signal_type IN ('STRONG_NO', 'NO') AND v_res_price > 0.9 THEN false
        ELSE NULL
      END;

      -- Simulated P&L (per $100 notional)
      IF v_correct_flag = true THEN
        v_pnl := (v_res_price - v_sig_price) * 100;
        -- For NO signals, invert: profit = (1 - res_price) - (1 - sig_price) = sig_price - res_price
        IF r.signal_type IN ('STRONG_NO', 'NO') THEN
          v_pnl := (v_sig_price - v_res_price) * 100;
        END IF;
      ELSIF v_correct_flag = false THEN
        IF r.signal_type IN ('STRONG_YES', 'YES') THEN
          v_pnl := (v_res_price - v_sig_price) * 100;  -- negative since res < sig
        ELSE
          v_pnl := (v_sig_price - v_res_price) * -100;
        END IF;
      ELSE
        v_pnl := 0;
      END IF;

      INSERT INTO signal_outcomes (rag_signal_id, market_id, signal_type, confidence, price_at_signal, resolution_price, was_correct, pnl_if_traded, resolved_at)
      VALUES (r.signal_id, r.market_id, r.signal_type, r.confidence, v_sig_price, v_res_price, v_correct_flag, v_pnl, now());

      v_evaluated := v_evaluated + 1;
      IF v_correct_flag = true THEN v_correct := v_correct + 1; END IF;
      v_total_pnl := v_total_pnl + COALESCE(v_pnl, 0);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated', v_evaluated,
    'correct', v_correct,
    'accuracy_pct', CASE WHEN v_evaluated > 0 THEN round((v_correct::numeric / v_evaluated) * 100, 1) ELSE 0 END,
    'total_pnl', round(v_total_pnl, 2)
  );
END;
$$;

-- Summary view
CREATE OR REPLACE VIEW public.signal_accuracy_summary AS
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