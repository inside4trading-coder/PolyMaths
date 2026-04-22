CREATE OR REPLACE FUNCTION public.get_table_row_estimate(table_name text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(n_live_tup, 0)::bigint
  FROM pg_stat_user_tables
  WHERE relname = table_name
  LIMIT 1;
$$;