import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * UNIFIED realtime hook - subscribes to ALL relevant tables in a single channel.
 * Replaces the old useRealtimeSubscription.ts to avoid duplicate WebSocket connections.
 */
export function useRealtimeData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[Realtime] Setting up unified subscriptions...');

    const channel = supabase
      .channel('unified-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tokens' },
        (payload) => {
          console.log('[Realtime] tokens changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['tokens'] });
          queryClient.invalidateQueries({ queryKey: ['marketsWithTokens'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload) => {
          console.log('[Realtime] markets changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['markets'] });
          queryClient.invalidateQueries({ queryKey: ['marketsWithTokens'] });
          queryClient.invalidateQueries({ queryKey: ['market'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        (payload) => {
          console.log('[Realtime] trades changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['trades'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_activity' },
        (payload) => {
          console.log('[Realtime] wallet_activity changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
          queryClient.invalidateQueries({ queryKey: ['walletActivity'] });
          queryClient.invalidateQueries({ queryKey: ['positionsStats'] });
          queryClient.invalidateQueries({ queryKey: ['unusualActivity'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_positions' },
        (payload) => {
          console.log('[Realtime] wallet_positions changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
          queryClient.invalidateQueries({ queryKey: ['positionsStats'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_events' },
        (payload) => {
          console.log('[Realtime] bot_events changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['botEvents'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_orders' },
        (payload) => {
          console.log('[Realtime] bot_orders changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['botOrders'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_positions' },
        (payload) => {
          console.log('[Realtime] bot_positions changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['botPositions'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload) => {
          console.log('[Realtime] alerts changed', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up subscriptions...');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

