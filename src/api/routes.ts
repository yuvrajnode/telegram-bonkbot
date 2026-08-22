import type { Express, Request, Response } from 'express';
import * as orderRepo from '../db/repositories/orders';
import * as tradeRepo from '../db/repositories/trades';
import * as userRepo from '../db/repositories/users';
import * as walletService from '../services/wallets';
import * as copyRepo from '../db/repositories/copy';
import { cachedReport } from '../services/safety';
import * as positionService from '../services/positions';
import { getSolBalance, isValidAddress, isValidMint } from '../services/solana';
import { getSolUsdPrice, getPriceInSol } from '../services/prices';
import { getTokenInfo } from '../services/tokens';

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Resolves :userRef, which accepts either the internal id or a telegram id. */
const resolveUser = (ref: string) => {
  const id = Number(ref);
  if (!Number.isFinite(id)) return undefined;
  return userRepo.findById(id) ?? userRepo.findByTelegramId(id);
};

export const registerRoutes = (app: Express): void => {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get('/api/overview', async (_req: Request, res: Response) => {
    const users = userRepo.listAll();
    const solUsd = await getSolUsdPrice().catch(() => 0);

    const perUser = await Promise.all(
      users.slice(0, 200).map(async (user) => {
        const stats = tradeRepo.statsForUser(user.id);
        return { user, stats };
      }),
    );

    const volumeSol = perUser.reduce((sum, entry) => sum + entry.stats.volumeSol, 0);
    const realizedSol = perUser.reduce((sum, entry) => sum + entry.stats.realizedPnlSol, 0);
    const trades = perUser.reduce((sum, entry) => sum + entry.stats.total, 0);

    res.json({
      solUsd,
      users: users.length,
      trades,
      volumeSol,
      realizedPnlSol: realizedSol,
      openOrders: orderRepo.listOpen().length,
      leaderboard: perUser
        .map((entry) => ({
          username: entry.user.username,
          telegramId: entry.user.telegram_id,
          trades: entry.stats.total,
          volumeSol: entry.stats.volumeSol,
          realizedPnlSol: entry.stats.realizedPnlSol,
        }))
        .sort((a, b) => b.realizedPnlSol - a.realizedPnlSol)
        .slice(0, 10),
    });
  });

  app.get('/api/users/:userRef/portfolio', async (req: Request, res: Response) => {
    const user = resolveUser(req.params.userRef ?? '');
    if (!user) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    const [summary, wallets, solUsd] = await Promise.all([
      positionService.summarize(user.id),
      walletService.overview(user.id),
      getSolUsdPrice().catch(() => 0),
    ]);

    res.json({
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        joinedAt: user.created_at,
      },
      solUsd,
      wallets: wallets.map((entry) => ({
        id: entry.wallet.id,
        label: entry.wallet.label,
        publicKey: entry.wallet.public_key,
        isActive: Boolean(entry.wallet.is_active),
        solBalance: entry.solBalance,
      })),
      totals: {
        valueSol: summary.valueSol,
        valueUsd: summary.valueUsd,
        unrealizedPnlSol: summary.unrealizedPnlSol,
        realizedPnlSol: summary.realizedPnlSol,
        trades: summary.totalTrades,
        winRate: summary.winRate,
      },
      positions: summary.positions.map((view) => ({
        mint: view.position.mint,
        symbol: view.position.symbol,
        amount: view.position.token_amount,
        entryPriceSol: view.entryPriceSol,
        priceSol: view.priceSol,
        valueSol: view.valueSol,
        valueUsd: view.valueUsd,
        unrealizedPnlSol: view.unrealizedPnlSol,
        unrealizedPnlPct: view.unrealizedPnlPct,
        realizedPnlSol: view.position.realized_pnl_sol,
      })),
    });
  });

  app.get('/api/users/:userRef/trades', (req: Request, res: Response) => {
    const user = resolveUser(req.params.userRef ?? '');
    if (!user) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    const limit = Math.min(asNumber(req.query.limit, 25), 100);
    const offset = Math.max(asNumber(req.query.offset, 0), 0);

    res.json({
      trades: tradeRepo.listByUser(user.id, limit, offset).map((trade) => ({
        id: trade.id,
        side: trade.side,
        symbol: trade.symbol,
        mint: trade.mint,
        solAmount: trade.sol_amount,
        tokenAmount: trade.token_amount,
        priceSol: trade.price_sol,
        priceUsd: trade.price_usd,
        status: trade.status,
        source: trade.source,
        signature: trade.signature,
        createdAt: trade.created_at,
      })),
    });
  });

  app.get('/api/users/:userRef/orders', (req: Request, res: Response) => {
    const user = resolveUser(req.params.userRef ?? '');
    if (!user) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    res.json({
      orders: orderRepo.listOpenByUser(user.id).map((order) => ({
        id: order.id,
        kind: order.kind,
        symbol: order.symbol,
        mint: order.mint,
        triggerPriceSol: order.trigger_price_sol,
        amountSol: order.amount_sol,
        amountPct: order.amount_pct,
        expiresAt: order.expires_at,
        createdAt: order.created_at,
      })),
    });
  });

  app.get('/api/users/:userRef/copy-targets', (req: Request, res: Response) => {
    const user = resolveUser(req.params.userRef ?? '');
    if (!user) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    res.json({
      targets: copyRepo.listByUser(user.id).map((target) => ({
        id: target.id,
        address: target.target_address,
        label: target.label,
        sizeSol: target.size_sol,
        mirrorSells: Boolean(target.mirror_sells),
        status: target.status,
        copiedCount: target.copied_count,
        createdAt: target.created_at,
      })),
    });
  });

  app.get('/api/tokens/:mint', async (req: Request, res: Response) => {
    const mint = req.params.mint ?? '';
    if (!isValidMint(mint)) {
      res.status(400).json({ error: 'invalid_mint' });
      return;
    }

    const [token, priceSol, solUsd] = await Promise.all([
      getTokenInfo(mint),
      getPriceInSol(mint).catch(() => 0),
      getSolUsdPrice().catch(() => 0),
    ]);

    res.json({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoUri: token.logo_uri,
      priceSol: priceSol ?? 0,
      priceUsd: (priceSol ?? 0) * solUsd,
      // Only the cached verdict: a fresh analysis costs two quotes and this
      // endpoint should not be a way to make the bot pay for someone's crawl.
      safety: cachedReport(mint) ?? null,
    });
  });

  app.get('/api/wallets/:publicKey/balance', async (req: Request, res: Response) => {
    const publicKey = req.params.publicKey ?? '';
    if (!isValidAddress(publicKey)) {
      res.status(400).json({ error: 'invalid_address' });
      return;
    }
    const balance = await getSolBalance(publicKey).catch(() => 0);
    res.json({ publicKey, solBalance: balance });
  });
};
