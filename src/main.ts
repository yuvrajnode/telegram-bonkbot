import { env } from './config/env';
import { closeDb } from './db';
import { runMigrations } from './db/migrate';
import { logger } from './lib/logger';
import { createBot } from './bot';
import { Notifier } from './bot/notifier';
import { OrderWatcher } from './services/watcher';
import { startApiServer } from './api/server';

const main = async (): Promise<void> => {
  runMigrations();

  const bot = createBot();
  const watcher = new OrderWatcher();
  const notifier = new Notifier(bot);
  const api = startApiServer();

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Main menu' },
    { command: 'buy', description: 'Buy a token by mint address' },
    { command: 'positions', description: 'Open positions and PnL' },
    { command: 'orders', description: 'Resting limit orders' },
    { command: 'wallet', description: 'Wallets and deposits' },
    { command: 'withdraw', description: 'Send SOL or tokens out' },
    { command: 'history', description: 'Recent fills' },
    { command: 'copy', description: 'Copy another wallet' },
    { command: 'settings', description: 'Slippage and fees' },
    { command: 'invite', description: 'Referral link' },
  ]);

  watcher.start();
  notifier.start();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    watcher.stop();
    notifier.stop();
    bot.stop(signal);
    api.close();
    closeDb();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  const me = await bot.telegram.getMe();
  logger.info({ bot: me.username, env: env.nodeEnv }, 'bonkbot is live');

  // launch() only resolves on stop, so nothing after it runs until shutdown.
  await bot.launch();
};

main().catch((error) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
