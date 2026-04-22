import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAutoSync } from "./useAutoSync";
import { useAuth } from "@/contexts/AuthContext";
import { retryEdgeFunction } from "@/lib/supabaseRetry";
import { withPolymarketDataLimit } from "@/lib/edgeFunctionLimiter";

/**
 * Auto-refreshes metrics for all watched wallets every 5 minutes.
 * Fetches fresh data from Polymarket API and updates the database.
 * Only runs when user is authenticated.
 */
export function useWatchlistAutoRefresh() {
  const { user } = useAuth();
  const didInitialDelayRef = useRef(false);

  const refreshWatchlist = useCallback(async () => {
    // Skip if not authenticated
    if (!user) {
      console.log("[WatchlistAutoRefresh] Skipping - no authenticated user");
      return;
    }

    // Stagger initial refresh slightly to avoid competing with other immediate syncs on page load
    if (!didInitialDelayRef.current) {
      didInitialDelayRef.current = true;
      await new Promise((r) => setTimeout(r, 12_000));
    }

    console.log("[WatchlistAutoRefresh] Starting periodic refresh...");
    
    // Fetch all watched wallets for current user
    const { data: watchedWallets, error: fetchError } = await supabase
      .from("wallets")
      .select("address")
      .eq("is_watched", true)
      .eq("user_id", user.id);
    
    if (fetchError) {
      console.error("[WatchlistAutoRefresh] Error fetching watchlist:", fetchError);
      return;
    }
    
    if (!watchedWallets || watchedWallets.length === 0) {
      console.log("[WatchlistAutoRefresh] No watched wallets to refresh");
      return;
    }
    
    console.log(`[WatchlistAutoRefresh] Refreshing ${watchedWallets.length} wallets...`);
    
    // Refresh metrics for each wallet in parallel (batch of 5 to avoid rate limits)
    const batchSize = 5;
    for (let i = 0; i < watchedWallets.length; i += batchSize) {
      const batch = watchedWallets.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (wallet) => {
          try {
            const { error } = await retryEdgeFunction(() =>
              withPolymarketDataLimit(() =>
                supabase.functions.invoke("polymarket-data", {
                  body: { action: "refresh_wallet_metrics", wallet_address: wallet.address },
                })
              )
            );
            
            if (error) {
              console.warn(`[WatchlistAutoRefresh] Failed to refresh ${wallet.address}:`, error);
            } else {
              console.log(`[WatchlistAutoRefresh] Refreshed ${wallet.address}`);
            }
          } catch (err) {
            console.warn(`[WatchlistAutoRefresh] Error refreshing ${wallet.address}:`, err);
          }
        })
      );
      
      // Small delay between batches to be gentle on the API
      if (i + batchSize < watchedWallets.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    console.log("[WatchlistAutoRefresh] Periodic refresh complete");
  }, [user]);

  // Run every 5 minutes, also on mount and when tab regains focus
  // This ensures data stays fresh even if user closes/reopens the app
  useAutoSync(refreshWatchlist, {
    intervalMs: 5 * 60 * 1000, // 5 minutes
    immediate: true, // Refresh on page load
    syncOnFocus: true, // Refresh when returning to tab
  });
}

