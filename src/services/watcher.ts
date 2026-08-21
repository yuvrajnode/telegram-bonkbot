import { child } from '../lib/logger';
import { sweep } from './orders';

const log = child('watcher');

/**
 * Order sweeps run on a fixed interval rather than a websocket subscription:
 * price feeds for long-tail mints are not push-based, and a 10 second poll is
 * well inside the tolerance of a trigger that a human set by hand.
 */
const DEFAULT_INTERVAL_MS = 10_000;

export class OrderWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly intervalMs: number = DEFAULT_INTERVAL_MS) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Do not hold the process open just for the watcher.
    this.timer.unref?.();
    log.info({ intervalMs: this.intervalMs }, 'order watcher started');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    log.info('order watcher stopped');
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
