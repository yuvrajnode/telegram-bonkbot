import { child } from '../lib/logger';
import { sweep } from './orders';
import { sweep as sweepCopies } from './copytrade';

const log = child('watcher');

/**
 * Order sweeps run on a fixed interval rather than a websocket subscription:
 * price feeds for long-tail mints are not push-based, and a 10 second poll is
 * well inside the tolerance of a trigger that a human set by hand.
 */
const DEFAULT_INTERVAL_MS = 10_000;

/**
 * Copy scanning is heavier than order pricing - it parses transactions - and
 * a followed wallet is not trading every ten seconds, so it runs slower.
 */
const COPY_INTERVAL_MS = 20_000;

export class OrderWatcher {
  private timer: NodeJS.Timeout | null = null;
  private copyTimer: NodeJS.Timeout | null = null;
  private running = false;
  private copying = false;

  constructor(private readonly intervalMs: number = DEFAULT_INTERVAL_MS) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.copyTimer = setInterval(() => void this.copyTick(), COPY_INTERVAL_MS);
    // Do not hold the process open just for the watcher.
    this.timer.unref?.();
    this.copyTimer.unref?.();
    log.info({ intervalMs: this.intervalMs, copyIntervalMs: COPY_INTERVAL_MS }, 'watchers started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.copyTimer) clearInterval(this.copyTimer);
    this.timer = null;
    this.copyTimer = null;
    log.info('watchers stopped');
  }

  /** Same overlap guard as the order sweep: a slow pass must not stack. */
  async copyTick(): Promise<void> {
    if (this.copying) return;

    this.copying = true;
    try {
      const result = await sweepCopies();
      if (result.mirrored > 0) log.info(result, 'copy sweep mirrored trades');
    } catch (error) {
      log.error({ err: error }, 'copy sweep failed');
    } finally {
      this.copying = false;
    }
  }

  /** Skips the tick if the previous one is still working through fills. */
  async tick(): Promise<void> {
    if (this.running) {
      log.debug('previous sweep still running, skipping tick');
      return;
    }

    this.running = true;
    try {
      const result = await sweep();
      if (result.triggered > 0 || result.expired > 0) {
        log.info(result, 'sweep completed');
      }
    } catch (error) {
      log.error({ err: error }, 'sweep failed');
    } finally {
      this.running = false;
    }
  }
}
