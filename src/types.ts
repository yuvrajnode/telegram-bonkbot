export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  referred_by: number | null;
  referral_code: string;
  created_at: string;
  last_seen_at: string;
}

export interface Wallet {
  id: number;
  user_id: number;
  label: string;
  public_key: string;
  encrypted_key: string;
  is_active: number;
  created_at: string;
}

export interface Settings {
  user_id: number;
  slippage_bps: number;
  priority_fee_lamports: number;
  buy_presets_sol: string;
  sell_presets_pct: string;
  confirm_before_trade: number;
  mev_protection: number;
  updated_at: string;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_uri: string | null;
  refreshed_at?: string;
}

export type TradeSide = 'buy' | 'sell';
export type TradeStatus = 'pending' | 'confirmed' | 'failed';
export type TradeSource = 'manual' | 'limit_order' | 'stop_loss' | 'take_profit';

export interface Trade {
  id: number;
  user_id: number;
  wallet_id: number;
  side: TradeSide;
  mint: string;
  symbol: string;
  in_amount: string;
  out_amount: string;
  sol_amount: number;
  token_amount: number;
  price_sol: number;
  price_usd: number | null;
  slippage_bps: number;
  signature: string | null;
  status: TradeStatus;
  error: string | null;
  source: TradeSource;
  created_at: string;
}

export interface Position {
  id: number;
  user_id: number;
  wallet_id: number;
  mint: string;
  symbol: string;
  decimals: number;
  token_amount: number;
  cost_basis_sol: number;
  realized_pnl_sol: number;
  opened_at: string;
  updated_at: string;
}

export type OrderKind = 'limit_buy' | 'limit_sell' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired' | 'failed';

export interface Order {
  id: number;
  user_id: number;
  wallet_id: number;
  mint: string;
  symbol: string;
  kind: OrderKind;
  trigger_price_sol: number;
  amount_sol: number | null;
  amount_pct: number | null;
  status: OrderStatus;
  trade_id: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  kind: string;
  payload: string;
  delivered_at: string | null;
  created_at: string;
}
