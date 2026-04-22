
-- Add user_id to agent_configs
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to agent_predictions
ALTER TABLE public.agent_predictions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old permissive policies on agent_configs
DROP POLICY IF EXISTS "Allow all operations on agent_configs" ON public.agent_configs;

-- Create user-scoped RLS policies for agent_configs
CREATE POLICY "Users can view their own agent configs"
  ON public.agent_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent configs"
  ON public.agent_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent configs"
  ON public.agent_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent configs"
  ON public.agent_configs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all agent configs"
  ON public.agent_configs FOR ALL
  USING (true);

-- Drop old permissive policies on agent_predictions
DROP POLICY IF EXISTS "Allow all operations on agent_predictions" ON public.agent_predictions;

-- Create user-scoped RLS policies for agent_predictions
CREATE POLICY "Users can view their own agent predictions"
  ON public.agent_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent predictions"
  ON public.agent_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent predictions"
  ON public.agent_predictions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all agent predictions"
  ON public.agent_predictions FOR ALL
  USING (true);
