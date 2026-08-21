import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The config module validates env at import time and exits if it cannot,
    // so the suite supplies a complete, throwaway environment up front.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
      TELEGRAM_BOT_TOKEN: '1234567890:AAtest-token-for-the-suite-only',
      SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
      WALLET_ENCRYPTION_KEY: '4f3c2b1a09876543210fedcba9876543210abcdef0123456789abcdef0123456',
      DATABASE_PATH: './data/test.db',
    },
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
