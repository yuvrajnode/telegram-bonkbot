import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const csv = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  TELEGRAM_BOT_TOKEN: z.string().min(20, 'TELEGRAM_BOT_TOKEN looks wrong, check @BotFather'),
  ADMIN_USER_IDS: z.string().optional(),

  SOLANA_RPC_URL: z.string().url(),
  SOLANA_WS_URL: z.string().url().optional().or(z.literal('')),
  SOLANA_RPC_FALLBACKS: z.string().optional(),
  JITO_BLOCK_ENGINE_URL: z.string().url().default('https://mainnet.block-engine.jito.wtf/api/v1'),
  JITO_TIP_LAMPORTS: z.coerce.number().int().min(0).default(150_000),
  JUPITER_API_URL: z.string().url().default('https://quote-api.jup.ag/v6'),
  PRICE_API_URL: z.string().url().default('https://api.jup.ag/price/v2'),

  WALLET_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'WALLET_ENCRYPTION_KEY must be 32 bytes of hex'),

  DEFAULT_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5000).default(150),
  DEFAULT_PRIORITY_FEE_LAMPORTS: z.coerce.number().int().min(0).default(200_000),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(500).default(0),
  PLATFORM_FEE_WALLET: z.string().optional(),

  DATABASE_PATH: z.string().default('./data/bonkbot.db'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  API_CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // Env problems happen before the logger exists, so this one goes to stderr raw.
  process.stderr.write(`Invalid environment configuration:\n${issues}\n\nSee .env.example\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  logLevel: raw.LOG_LEVEL,

  telegram: {
    token: raw.TELEGRAM_BOT_TOKEN,
    adminIds: csv(raw.ADMIN_USER_IDS).map(Number).filter(Number.isFinite),
  },

  solana: {
    rpcUrl: raw.SOLANA_RPC_URL,
    rpcFallbacks: csv(raw.SOLANA_RPC_FALLBACKS),
    wsUrl: raw.SOLANA_WS_URL || undefined,
    jupiterApiUrl: raw.JUPITER_API_URL.replace(/\/$/, ''),
    priceApiUrl: raw.PRICE_API_URL.replace(/\/$/, ''),
  },

  jito: {
    blockEngineUrl: raw.JITO_BLOCK_ENGINE_URL.replace(/\/$/, ''),
    tipLamports: raw.JITO_TIP_LAMPORTS,
  },

  wallet: {
    encryptionKey: Buffer.from(raw.WALLET_ENCRYPTION_KEY, 'hex'),
  },

  trading: {
    defaultSlippageBps: raw.DEFAULT_SLIPPAGE_BPS,
    defaultPriorityFeeLamports: raw.DEFAULT_PRIORITY_FEE_LAMPORTS,
    platformFeeBps: raw.PLATFORM_FEE_BPS,
    platformFeeWallet: raw.PLATFORM_FEE_WALLET || undefined,
  },

  db: {
    path: path.resolve(process.cwd(), raw.DATABASE_PATH),
  },

  api: {
    port: raw.API_PORT,
    corsOrigins: csv(raw.API_CORS_ORIGINS),
  },
} as const;

export type Env = typeof env;
