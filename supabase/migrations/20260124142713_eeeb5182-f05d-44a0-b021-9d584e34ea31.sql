-- Add user_id column to bot_configs
ALTER TABLE public.bot_configs 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to bot_positions
ALTER TABLE public.bot_positions 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to bot_orders
ALTER TABLE public.bot_orders 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to bot_events
ALTER TABLE public.bot_events 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Bot configs are publicly accessible" ON public.bot_configs;
DROP POLICY IF EXISTS "Bot positions are publicly accessible" ON public.bot_positions;
DROP POLICY IF EXISTS "Bot orders are publicly accessible" ON public.bot_orders;
DROP POLICY IF EXISTS "Bot events are publicly accessible" ON public.bot_events;

-- Create user-isolated RLS policies for bot_configs
CREATE POLICY "Users can view their own bot configs"
ON public.bot_configs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot configs"
ON public.bot_configs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot configs"
ON public.bot_configs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot configs"
ON public.bot_configs FOR DELETE
USING (auth.uid() = user_id);

-- Service role policy for edge functions
CREATE POLICY "Service can manage all bot configs"
ON public.bot_configs FOR ALL
USING (true);

-- Create user-isolated RLS policies for bot_positions
CREATE POLICY "Users can view their own bot positions"
ON public.bot_positions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot positions"
ON public.bot_positions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot positions"
ON public.bot_positions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot positions"
ON public.bot_positions FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all bot positions"
ON public.bot_positions FOR ALL
USING (true);

-- Create user-isolated RLS policies for bot_orders
CREATE POLICY "Users can view their own bot orders"
ON public.bot_orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot orders"
ON public.bot_orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot orders"
ON public.bot_orders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot orders"
ON public.bot_orders FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all bot orders"
ON public.bot_orders FOR ALL
USING (true);

-- Create user-isolated RLS policies for bot_events
CREATE POLICY "Users can view their own bot events"
ON public.bot_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot events"
ON public.bot_events FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot events"
ON public.bot_events FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot events"
ON public.bot_events FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all bot events"
ON public.bot_events FOR ALL
USING (true);