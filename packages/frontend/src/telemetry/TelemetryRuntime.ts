import { CloudWatchRequestIngestor } from "./CloudWatchRequestIngestor";
import { Scheduler } from "./Scheduler";
import type { TelemetryIngestor } from "./TelemetryIngestor";

export class TelemetryRuntime {
  private readonly scheduler = new Scheduler();
  private readonly ingestors: TelemetryIngestor[];
  private started = false;

  constructor(ingestors: TelemetryIngestor[] = [new CloudWatchRequestIngestor()]) {
    this.ingestors = ingestors;
  }

  start() {
    if (this.started) return;

    for (const ingestor of this.ingestors) {
      ingestor.start();
      this.scheduler.add({
        name: ingestor.name,
        intervalMs: ingestor.flushIntervalMs,
        run: () => ingestor.flush(),
      });
    }

    this.started = true;
  }

  stop() {
    if (!this.started) return;

    this.scheduler.stop();
    for (const ingestor of this.ingestors) {
      ingestor.stop();
    }
    this.started = false;
  }
}

export function createTelemetryRuntime() {
  return new TelemetryRuntime();
}
