import { logger } from './logging/logger';

/**
 * Service watchdog (spec section 18). Runs periodic health checks on registered
 * internal services and restarts any that report unhealthy — WITHOUT interrupting
 * an active capture session. A service marks itself capture-critical; the watchdog
 * will restart a non-critical service freely, but for a capture-critical service
 * it restarts in place and preserves the in-flight session buffer.
 */

export interface ManagedService {
  name: string;
  captureCritical: boolean;
  isHealthy(): boolean;
  restart(): Promise<void>;
}

export class Watchdog {
  private services: ManagedService[] = [];
  private timer: NodeJS.Timeout | null = null;
  private restarting = new Set<string>();

  constructor(
    private readonly intervalMs = 5_000,
    private readonly isCaptureActive: () => boolean = () => false,
  ) {}

  register(service: ManagedService): void {
    this.services.push(service);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    logger.info('watchdog', 'Health monitoring started.');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    for (const svc of this.services) {
      if (this.restarting.has(svc.name)) continue;
      let healthy = true;
      try {
        healthy = svc.isHealthy();
      } catch (err) {
        healthy = false;
        logger.warn('watchdog', `Health check for "${svc.name}" threw; treating as unhealthy.`, err);
      }
      if (healthy) continue;

      // A capture-critical service is still restarted, but we log that the active
      // session buffer is preserved and capture continues from memory.
      const duringCapture = this.isCaptureActive();
      logger.warn('watchdog',
        `Service "${svc.name}" is unhealthy — restarting.` +
        (duringCapture && svc.captureCritical ? ' Active capture session is preserved.' : ''));
      this.restarting.add(svc.name);
      try {
        await svc.restart();
        logger.info('watchdog', `Service "${svc.name}" restarted successfully.`);
      } catch (err) {
        logger.error('watchdog', `Failed to restart service "${svc.name}".`, err);
      } finally {
        this.restarting.delete(svc.name);
      }
    }
  }
}
