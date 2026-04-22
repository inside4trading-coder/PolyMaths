CREATE OR REPLACE FUNCTION public.cleanup_old_records(
  p_price_history_cutoff timestamptz,
  p_wallet_activity_cutoff timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_ph_deleted int := 0;
  v_wa_deleted int := 0;
  v_batch int;
BEGIN
  -- Delete price_history in batches of 500
  LOOP
    DELETE FROM price_history
    WHERE id IN (
      SELECT id FROM price_history
      WHERE recorded_at < p_price_history_cutoff
      LIMIT 500
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_ph_deleted := v_ph_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  -- Delete wallet_activity in batches of 500
  LOOP
    DELETE FROM wallet_activity
    WHERE id IN (
      SELECT id FROM wallet_activity
      WHERE timestamp < p_wallet_activity_cutoff
      LIMIT 500
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_wa_deleted := v_wa_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'price_history_deleted', v_ph_deleted,
    'wallet_activity_deleted', v_wa_deleted
  );
END;
$$;