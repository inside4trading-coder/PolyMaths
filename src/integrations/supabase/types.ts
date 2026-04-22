export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          analysis_depth: string | null
          auto_analyze: boolean | null
          categories: string[] | null
          created_at: string
          id: string
          is_active: boolean | null
          model: string
          name: string
          risk_tolerance: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          analysis_depth?: string | null
          auto_analyze?: boolean | null
          categories?: string[] | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          model?: string
          name?: string
          risk_tolerance?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          analysis_depth?: string | null
          auto_analyze?: boolean | null
          categories?: string[] | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          model?: string
          name?: string
          risk_tolerance?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agent_predictions: {
        Row: {
          agent_config_id: string | null
          analysis: string
          confidence: number | null
          created_at: string
          id: string
          market_id: string | null
          market_question: string | null
          model_used: string | null
          prediction: string | null
          reasoning: string | null
          recommendation: string | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          agent_config_id?: string | null
          analysis: string
          confidence?: number | null
          created_at?: string
          id?: string
          market_id?: string | null
          market_question?: string | null
          model_used?: string | null
          prediction?: string | null
          reasoning?: string | null
          recommendation?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          agent_config_id?: string | null
          analysis?: string
          confidence?: number | null
          created_at?: string
          id?: string
          market_id?: string | null
          market_question?: string | null
          model_used?: string | null
          prediction?: string | null
          reasoning?: string | null
          recommendation?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_predictions_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_type: string
          condition: string | null
          created_at: string
          id: string
          is_active: boolean | null
          market_id: string | null
          threshold: number | null
          triggered: boolean | null
          triggered_at: string | null
          wallet_address: string | null
        }
        Insert: {
          alert_type: string
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          market_id?: string | null
          threshold?: number | null
          triggered?: boolean | null
          triggered_at?: string | null
          wallet_address?: string | null
        }
        Update: {
          alert_type?: string
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          market_id?: string | null
          threshold?: number | null
          triggered?: boolean | null
          triggered_at?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_configs: {
        Row: {
          categories: string[] | null
          created_at: string
          exec_entry_slices: number | null
          exec_max_slippage: number | null
          exec_only_limit_orders: boolean | null
          exec_reprice_if_mid_moves: number | null
          id: string
          last_signal_scan_at: string | null
          mode: string
          name: string
          risk_blocklist: string[] | null
          risk_cooldown_minutes: number | null
          risk_daily_loss_limit: number | null
          risk_max_position_per_market: number | null
          risk_max_total_exposure: number | null
          risk_no_trade_near_resolution: boolean | null
          risk_resolution_buffer_hours: number | null
          signal_cluster_min_trades: number | null
          signal_cluster_trigger: boolean | null
          signal_cluster_window_minutes: number | null
          signal_max_spread: number | null
          signal_min_liquidity_score: number | null
          signal_min_trade_size: number | null
          status: string
          updated_at: string
          user_id: string | null
          wallets: string[] | null
        }
        Insert: {
          categories?: string[] | null
          created_at?: string
          exec_entry_slices?: number | null
          exec_max_slippage?: number | null
          exec_only_limit_orders?: boolean | null
          exec_reprice_if_mid_moves?: number | null
          id?: string
          last_signal_scan_at?: string | null
          mode?: string
          name?: string
          risk_blocklist?: string[] | null
          risk_cooldown_minutes?: number | null
          risk_daily_loss_limit?: number | null
          risk_max_position_per_market?: number | null
          risk_max_total_exposure?: number | null
          risk_no_trade_near_resolution?: boolean | null
          risk_resolution_buffer_hours?: number | null
          signal_cluster_min_trades?: number | null
          signal_cluster_trigger?: boolean | null
          signal_cluster_window_minutes?: number | null
          signal_max_spread?: number | null
          signal_min_liquidity_score?: number | null
          signal_min_trade_size?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          wallets?: string[] | null
        }
        Update: {
          categories?: string[] | null
          created_at?: string
          exec_entry_slices?: number | null
          exec_max_slippage?: number | null
          exec_only_limit_orders?: boolean | null
          exec_reprice_if_mid_moves?: number | null
          id?: string
          last_signal_scan_at?: string | null
          mode?: string
          name?: string
          risk_blocklist?: string[] | null
          risk_cooldown_minutes?: number | null
          risk_daily_loss_limit?: number | null
          risk_max_position_per_market?: number | null
          risk_max_total_exposure?: number | null
          risk_no_trade_near_resolution?: boolean | null
          risk_resolution_buffer_hours?: number | null
          signal_cluster_min_trades?: number | null
          signal_cluster_trigger?: boolean | null
          signal_cluster_window_minutes?: number | null
          signal_max_spread?: number | null
          signal_min_liquidity_score?: number | null
          signal_min_trade_size?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          wallets?: string[] | null
        }
        Relationships: []
      }
      bot_events: {
        Row: {
          bot_config_id: string | null
          created_at: string
          details: Json | null
          event_type: string
          id: string
          message: string
          reasons: string[] | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          bot_config_id?: string | null
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          message: string
          reasons?: string[] | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          bot_config_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          message?: string
          reasons?: string[] | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_events_bot_config_id_fkey"
            columns: ["bot_config_id"]
            isOneToOne: false
            referencedRelation: "bot_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_orders: {
        Row: {
          bot_config_id: string | null
          created_at: string
          filled_price: number | null
          filled_size: number | null
          id: string
          market_id: string | null
          outcome: string | null
          price: number
          reasons: string[] | null
          side: string
          simulated_slippage: number | null
          size: number
          source_activity_id: string | null
          status: string
          token_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bot_config_id?: string | null
          created_at?: string
          filled_price?: number | null
          filled_size?: number | null
          id?: string
          market_id?: string | null
          outcome?: string | null
          price: number
          reasons?: string[] | null
          side: string
          simulated_slippage?: number | null
          size: number
          source_activity_id?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bot_config_id?: string | null
          created_at?: string
          filled_price?: number | null
          filled_size?: number | null
          id?: string
          market_id?: string | null
          outcome?: string | null
          price?: number
          reasons?: string[] | null
          side?: string
          simulated_slippage?: number | null
          size?: number
          source_activity_id?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_orders_bot_config_id_fkey"
            columns: ["bot_config_id"]
            isOneToOne: false
            referencedRelation: "bot_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_positions: {
        Row: {
          bot_config_id: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          current_price: number | null
          entry_price: number
          id: string
          market_id: string | null
          market_question: string | null
          opened_at: string
          outcome: string
          pnl: number | null
          pnl_percent: number | null
          reasons: string[] | null
          side: string
          size: number
          source_activity_id: string | null
          token_id: string | null
          triggered_by: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bot_config_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price: number
          id?: string
          market_id?: string | null
          market_question?: string | null
          opened_at?: string
          outcome: string
          pnl?: number | null
          pnl_percent?: number | null
          reasons?: string[] | null
          side: string
          size: number
          source_activity_id?: string | null
          token_id?: string | null
          triggered_by?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bot_config_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price?: number
          id?: string
          market_id?: string | null
          market_question?: string | null
          opened_at?: string
          outcome?: string
          pnl?: number | null
          pnl_percent?: number | null
          reasons?: string[] | null
          side?: string
          size?: number
          source_activity_id?: string | null
          token_id?: string | null
          triggered_by?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_positions_bot_config_id_fkey"
            columns: ["bot_config_id"]
            isOneToOne: false
            referencedRelation: "bot_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_signals_queue: {
        Row: {
          activity_id: string
          bot_config_id: string | null
          created_at: string | null
          id: string
          market_id: string | null
          market_question: string | null
          outcome: string | null
          price: number | null
          processed_at: string | null
          score: number | null
          side: string | null
          size: number | null
          status: string | null
          usdc_size: number | null
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          activity_id: string
          bot_config_id?: string | null
          created_at?: string | null
          id?: string
          market_id?: string | null
          market_question?: string | null
          outcome?: string | null
          price?: number | null
          processed_at?: string | null
          score?: number | null
          side?: string | null
          size?: number | null
          status?: string | null
          usdc_size?: number | null
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          activity_id?: string
          bot_config_id?: string | null
          created_at?: string | null
          id?: string
          market_id?: string | null
          market_question?: string | null
          outcome?: string | null
          price?: number | null
          processed_at?: string | null
          score?: number | null
          side?: string | null
          size?: number | null
          status?: string | null
          usdc_size?: number | null
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_signals_queue_bot_config_id_fkey"
            columns: ["bot_config_id"]
            isOneToOne: false
            referencedRelation: "bot_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_metrics: {
        Row: {
          id: string
          liquidity_score: number | null
          market_id: string
          net_flow_1h: number | null
          net_flow_24h: number | null
          open_interest: number | null
          price: number | null
          spread: number | null
          timestamp: string
          trades_1h: number | null
          trades_24h: number | null
          volume_1h: number | null
          volume_24h: number | null
        }
        Insert: {
          id?: string
          liquidity_score?: number | null
          market_id: string
          net_flow_1h?: number | null
          net_flow_24h?: number | null
          open_interest?: number | null
          price?: number | null
          spread?: number | null
          timestamp?: string
          trades_1h?: number | null
          trades_24h?: number | null
          volume_1h?: number | null
          volume_24h?: number | null
        }
        Update: {
          id?: string
          liquidity_score?: number | null
          market_id?: string
          net_flow_1h?: number | null
          net_flow_24h?: number | null
          open_interest?: number | null
          price?: number | null
          spread?: number | null
          timestamp?: string
          trades_1h?: number | null
          trades_24h?: number | null
          volume_1h?: number | null
          volume_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_metrics_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_sentiment: {
        Row: {
          analyzed_at: string
          correlation_score: number | null
          created_at: string
          id: string
          market_id: string
          market_question: string | null
          news_summary: string | null
          price_at_analysis: number | null
          price_change_after: number | null
          sentiment_label: string | null
          sentiment_score: number | null
          sources: string[] | null
        }
        Insert: {
          analyzed_at?: string
          correlation_score?: number | null
          created_at?: string
          id?: string
          market_id: string
          market_question?: string | null
          news_summary?: string | null
          price_at_analysis?: number | null
          price_change_after?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          sources?: string[] | null
        }
        Update: {
          analyzed_at?: string
          correlation_score?: number | null
          created_at?: string
          id?: string
          market_id?: string
          market_question?: string | null
          news_summary?: string | null
          price_at_analysis?: number | null
          price_change_after?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          sources?: string[] | null
        }
        Relationships: []
      }
      markets: {
        Row: {
          category: string | null
          closed: boolean | null
          condition_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          liquidity: number | null
          liquidity_score: number | null
          open_interest: number | null
          outcomes: string[]
          question: string
          slug: string
          tags: string[] | null
          updated_at: string
          volume: number | null
          volume_24h: number | null
        }
        Insert: {
          category?: string | null
          closed?: boolean | null
          condition_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id: string
          liquidity?: number | null
          liquidity_score?: number | null
          open_interest?: number | null
          outcomes?: string[]
          question: string
          slug: string
          tags?: string[] | null
          updated_at?: string
          volume?: number | null
          volume_24h?: number | null
        }
        Update: {
          category?: string | null
          closed?: boolean | null
          condition_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          liquidity?: number | null
          liquidity_score?: number | null
          open_interest?: number | null
          outcomes?: string[]
          question?: string
          slug?: string
          tags?: string[] | null
          updated_at?: string
          volume?: number | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      news: {
        Row: {
          created_at: string
          id: string
          published_at: string
          related_markets: string[] | null
          sentiment: string | null
          source: string
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          published_at: string
          related_markets?: string[] | null
          sentiment?: string | null
          source: string
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string
          related_markets?: string[] | null
          sentiment?: string | null
          source?: string
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      news_embeddings: {
        Row: {
          content: string | null
          created_at: string
          embedding: string | null
          id: string
          published_at: string
          relevance_markets: string[] | null
          sentiment_score: number | null
          source: string
          title: string
          url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          published_at?: string
          relevance_markets?: string[] | null
          sentiment_score?: number | null
          source: string
          title: string
          url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          published_at?: string
          relevance_markets?: string[] | null
          sentiment_score?: number | null
          source?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          id: string
          price: number
          recorded_at: string
          token_id: string
        }
        Insert: {
          id?: string
          price: number
          recorded_at?: string
          token_id: string
        }
        Update: {
          id?: string
          price?: number
          recorded_at?: string
          token_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rag_signals: {
        Row: {
          confidence: number | null
          created_at: string
          current_price: number | null
          id: string
          market_id: string
          market_question: string | null
          news_sources: string[] | null
          reasoning: string | null
          signal_type: string
          suggested_price: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          market_id: string
          market_question?: string | null
          news_sources?: string[] | null
          reasoning?: string | null
          signal_type: string
          suggested_price?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          market_id?: string
          market_question?: string | null
          news_sources?: string[] | null
          reasoning?: string | null
          signal_type?: string
          suggested_price?: number | null
        }
        Relationships: []
      }
      signal_outcomes: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          market_id: string
          pnl_if_traded: number | null
          price_at_signal: number | null
          rag_signal_id: string
          resolution_price: number | null
          resolved_at: string | null
          signal_type: string
          was_correct: boolean | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          market_id: string
          pnl_if_traded?: number | null
          price_at_signal?: number | null
          rag_signal_id: string
          resolution_price?: number | null
          resolved_at?: string | null
          signal_type: string
          was_correct?: boolean | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          market_id?: string
          pnl_if_traded?: number | null
          price_at_signal?: number | null
          rag_signal_id?: string
          resolution_price?: number | null
          resolved_at?: string | null
          signal_type?: string
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_rag_signal_id_fkey"
            columns: ["rag_signal_id"]
            isOneToOne: true
            referencedRelation: "rag_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          change_1h: number | null
          change_24h: number | null
          id: string
          market_id: string
          outcome: string
          price: number | null
          updated_at: string
        }
        Insert: {
          change_1h?: number | null
          change_24h?: number | null
          id: string
          market_id: string
          outcome: string
          price?: number | null
          updated_at?: string
        }
        Update: {
          change_1h?: number | null
          change_24h?: number | null
          id?: string
          market_id?: string
          outcome?: string
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tokens_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          id: string
          maker: string | null
          market_id: string
          outcome: string | null
          price: number
          side: string
          size: number
          taker: string | null
          timestamp: string
          token_id: string | null
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          id: string
          maker?: string | null
          market_id: string
          outcome?: string | null
          price: number
          side: string
          size: number
          taker?: string | null
          timestamp?: string
          token_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          maker?: string | null
          market_id?: string
          outcome?: string | null
          price?: number
          side?: string
          size?: number
          taker?: string | null
          timestamp?: string
          token_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_activity: {
        Row: {
          activity_type: string
          asset_id: string | null
          condition_id: string | null
          created_at: string
          id: string
          is_unusual: boolean | null
          market_id: string | null
          market_question: string | null
          outcome: string | null
          price: number | null
          side: string | null
          signature: string
          size: number
          source: string
          timestamp: string
          transaction_hash: string | null
          unusual_reason: string | null
          usdc_size: number | null
          wallet_address: string
        }
        Insert: {
          activity_type: string
          asset_id?: string | null
          condition_id?: string | null
          created_at?: string
          id?: string
          is_unusual?: boolean | null
          market_id?: string | null
          market_question?: string | null
          outcome?: string | null
          price?: number | null
          side?: string | null
          signature: string
          size: number
          source?: string
          timestamp?: string
          transaction_hash?: string | null
          unusual_reason?: string | null
          usdc_size?: number | null
          wallet_address: string
        }
        Update: {
          activity_type?: string
          asset_id?: string | null
          condition_id?: string | null
          created_at?: string
          id?: string
          is_unusual?: boolean | null
          market_id?: string | null
          market_question?: string | null
          outcome?: string | null
          price?: number | null
          side?: string | null
          signature?: string
          size?: number
          source?: string
          timestamp?: string
          transaction_hash?: string | null
          unusual_reason?: string | null
          usdc_size?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_onchain_activity: {
        Row: {
          activity_type: string
          amount: number | null
          block_number: number
          collateral_amount: number | null
          condition_id: string | null
          counterparty: string | null
          created_at: string | null
          fee_amount: number | null
          id: string
          is_maker: boolean | null
          outcome_index: number | null
          synced_at: string | null
          timestamp: string
          token_id: string | null
          transaction_hash: string
          wallet_address: string
        }
        Insert: {
          activity_type: string
          amount?: number | null
          block_number: number
          collateral_amount?: number | null
          condition_id?: string | null
          counterparty?: string | null
          created_at?: string | null
          fee_amount?: number | null
          id?: string
          is_maker?: boolean | null
          outcome_index?: number | null
          synced_at?: string | null
          timestamp: string
          token_id?: string | null
          transaction_hash: string
          wallet_address: string
        }
        Update: {
          activity_type?: string
          amount?: number | null
          block_number?: number
          collateral_amount?: number | null
          condition_id?: string | null
          counterparty?: string | null
          created_at?: string | null
          fee_amount?: number | null
          id?: string
          is_maker?: boolean | null
          outcome_index?: number | null
          synced_at?: string | null
          timestamp?: string
          token_id?: string | null
          transaction_hash?: string
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_positions: {
        Row: {
          asset_id: string | null
          avg_price: number | null
          cash_pnl: number | null
          condition_id: string
          created_at: string | null
          cur_price: number | null
          current_value: number | null
          end_date: string | null
          id: string
          initial_value: number | null
          mergeable: boolean | null
          outcome: string | null
          outcome_index: number | null
          percent_pnl: number | null
          realized_pnl: number | null
          redeemable: boolean | null
          size: number
          slug: string | null
          synced_at: string | null
          title: string | null
          total_bought: number | null
          wallet_address: string
        }
        Insert: {
          asset_id?: string | null
          avg_price?: number | null
          cash_pnl?: number | null
          condition_id: string
          created_at?: string | null
          cur_price?: number | null
          current_value?: number | null
          end_date?: string | null
          id?: string
          initial_value?: number | null
          mergeable?: boolean | null
          outcome?: string | null
          outcome_index?: number | null
          percent_pnl?: number | null
          realized_pnl?: number | null
          redeemable?: boolean | null
          size?: number
          slug?: string | null
          synced_at?: string | null
          title?: string | null
          total_bought?: number | null
          wallet_address: string
        }
        Update: {
          asset_id?: string | null
          avg_price?: number | null
          cash_pnl?: number | null
          condition_id?: string
          created_at?: string | null
          cur_price?: number | null
          current_value?: number | null
          end_date?: string | null
          id?: string
          initial_value?: number | null
          mergeable?: boolean | null
          outcome?: string | null
          outcome_index?: number | null
          percent_pnl?: number | null
          realized_pnl?: number | null
          redeemable?: boolean | null
          size?: number
          slug?: string | null
          synced_at?: string | null
          title?: string | null
          total_bought?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          activity_cursor: string | null
          activity_loaded_count: number | null
          address: string
          avg_trade_size: number | null
          biggest_win: number | null
          closed_positions_count: number | null
          created_at: string
          id: string
          is_watched: boolean | null
          label: string | null
          last_active: string | null
          liquidity_provided: number | null
          maker_ratio: number | null
          markets_traded: number | null
          merges_count: number | null
          onchain_synced_at: string | null
          onchain_verified: boolean | null
          pnl: number | null
          pnl_sync_completed_at: string | null
          pnl_sync_offset: number | null
          pnl_sync_started_at: string | null
          pnl_sync_status: string | null
          profile_image: string | null
          proxy_address: string | null
          realized_pnl: number | null
          splits_count: number | null
          total_buys_usd: number | null
          total_fees_paid: number | null
          total_pnl: number | null
          total_redeems_usd: number | null
          total_sells_usd: number | null
          total_volume: number | null
          unrealized_pnl: number | null
          unusual_score: number | null
          updated_at: string
          user_id: string | null
          volume_24h: number | null
          volume_7d: number | null
          win_rate: number | null
        }
        Insert: {
          activity_cursor?: string | null
          activity_loaded_count?: number | null
          address: string
          avg_trade_size?: number | null
          biggest_win?: number | null
          closed_positions_count?: number | null
          created_at?: string
          id?: string
          is_watched?: boolean | null
          label?: string | null
          last_active?: string | null
          liquidity_provided?: number | null
          maker_ratio?: number | null
          markets_traded?: number | null
          merges_count?: number | null
          onchain_synced_at?: string | null
          onchain_verified?: boolean | null
          pnl?: number | null
          pnl_sync_completed_at?: string | null
          pnl_sync_offset?: number | null
          pnl_sync_started_at?: string | null
          pnl_sync_status?: string | null
          profile_image?: string | null
          proxy_address?: string | null
          realized_pnl?: number | null
          splits_count?: number | null
          total_buys_usd?: number | null
          total_fees_paid?: number | null
          total_pnl?: number | null
          total_redeems_usd?: number | null
          total_sells_usd?: number | null
          total_volume?: number | null
          unrealized_pnl?: number | null
          unusual_score?: number | null
          updated_at?: string
          user_id?: string | null
          volume_24h?: number | null
          volume_7d?: number | null
          win_rate?: number | null
        }
        Update: {
          activity_cursor?: string | null
          activity_loaded_count?: number | null
          address?: string
          avg_trade_size?: number | null
          biggest_win?: number | null
          closed_positions_count?: number | null
          created_at?: string
          id?: string
          is_watched?: boolean | null
          label?: string | null
          last_active?: string | null
          liquidity_provided?: number | null
          maker_ratio?: number | null
          markets_traded?: number | null
          merges_count?: number | null
          onchain_synced_at?: string | null
          onchain_verified?: boolean | null
          pnl?: number | null
          pnl_sync_completed_at?: string | null
          pnl_sync_offset?: number | null
          pnl_sync_started_at?: string | null
          pnl_sync_status?: string | null
          profile_image?: string | null
          proxy_address?: string | null
          realized_pnl?: number | null
          splits_count?: number | null
          total_buys_usd?: number | null
          total_fees_paid?: number | null
          total_pnl?: number | null
          total_redeems_usd?: number | null
          total_sells_usd?: number | null
          total_volume?: number | null
          unrealized_pnl?: number | null
          unusual_score?: number | null
          updated_at?: string
          user_id?: string | null
          volume_24h?: number | null
          volume_7d?: number | null
          win_rate?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      signal_accuracy_summary: {
        Row: {
          avg_confidence_correct: number | null
          avg_confidence_incorrect: number | null
          by_signal_type: Json | null
          correct_signals: number | null
          overall_accuracy_pct: number | null
          total_signals: number | null
          total_simulated_pnl: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_records: {
        Args: {
          p_price_history_cutoff: string
          p_wallet_activity_cutoff: string
        }
        Returns: Json
      }
      evaluate_signal_accuracy: { Args: never; Returns: Json }
      get_missing_condition_ids: {
        Args: never
        Returns: {
          condition_id: string
        }[]
      }
      get_table_row_estimate: { Args: { table_name: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_news_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          source: string
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
