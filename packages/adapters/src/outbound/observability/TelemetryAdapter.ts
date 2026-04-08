import type { ObservabilityPort, DetectionTimingRecord, DeliveryTimingRecord } from '@clmm/application';

export class TelemetryAdapter implements ObservabilityPort {
  log(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  recordTiming(
    event: string,
    durationMs: number,
    tags?: Record<string, string>,
  ): void {
    this.log('info', `timing:${event}`, { durationMs, ...tags });
  }

  recordDetectionTiming(record: DetectionTimingRecord): void {
    this.log('info', 'timing:detection', {
      positionId: record.positionId,
      detectedAt: record.detectedAt,
      observedAt: record.observedAt,
      durationMs: record.durationMs,
    });
  }

  recordDeliveryTiming(record: DeliveryTimingRecord): void {
    this.log('info', 'timing:delivery', {
      triggerId: record.triggerId,
      dispatchedAt: record.dispatchedAt,
      deliveredAt: record.deliveredAt,
      durationMs: record.durationMs,
      channel: record.channel,
    });
  }
}
