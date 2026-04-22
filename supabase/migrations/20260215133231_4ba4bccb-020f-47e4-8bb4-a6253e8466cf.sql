
CREATE OR REPLACE FUNCTION public.get_missing_condition_ids()
RETURNS TABLE(condition_id text) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT wa.condition_id
  FROM wallet_activity wa
  WHERE wa.condition_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM markets m WHERE m.condition_id = wa.condition_id
    )
  UNION
  SELECT DISTINCT wp.condition_id
  FROM wallet_positions wp
  WHERE wp.condition_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM markets m WHERE m.condition_id = wp.condition_id
    )
$$;
