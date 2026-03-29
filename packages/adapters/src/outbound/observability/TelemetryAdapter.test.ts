import { describe, it, expect } from 'vitest';
import { FakeObservabilityPort } from '@clmm/testing';
import type { DetectionTimingRecord, DeliveryTimingRecord } from '@clmm/application';

describe('ObservabilityPort structural timing separation', () => {
  it('recordDetectionTiming records a distinct detection entry', () => {
    const port = new FakeObservabilityPort();
    const record: DetectionTimingRecord = {
      positionId: 'pos-1',
      detectedAt: 1000,
      observedAt: 900,
      durationMs: 100,
    };
    port.recordDetectionTiming(record);
    expect(port.detectionTimings).toHaveLength(1);
    expect(port.detectionTimings[0]).toEqual(record);
  });

  it('recordDeliveryTiming records a distinct delivery entry', () => {
    const port = new FakeObservabilityPort();
    const record: DeliveryTimingRecord = {
      triggerId: 'trigger-1',
      dispatchedAt: 2000,
      deliveredAt: 2500,
      durationMs: 500,
      channel: 'push',
    };
    port.recordDeliveryTiming(record);
    expect(port.deliveryTimings).toHaveLength(1);
    expect(port.deliveryTimings[0]).toEqual(record);
  });

  it('detection and delivery are structurally separate', () => {
    const port = new FakeObservabilityPort();
    const detection: DetectionTimingRecord = {
      positionId: 'pos-2',
      detectedAt: 1100,
      observedAt: 1000,
      durationMs: 100,
    };
    const delivery: DeliveryTimingRecord = {
      triggerId: 'trigger-2',
      dispatchedAt: 3000,
      deliveredAt: null,
      durationMs: 0,
      channel: 'web-push',
    };

    port.recordDetectionTiming(detection);
    expect(port.detectionTimings).toHaveLength(1);
    expect(port.deliveryTimings).toHaveLength(0);

    port.recordDeliveryTiming(delivery);
    expect(port.detectionTimings).toHaveLength(1);
    expect(port.deliveryTimings).toHaveLength(1);

    // Each array contains only its own type
    expect(port.detectionTimings[0]?.positionId).toBe('pos-2');
    expect(port.deliveryTimings[0]?.triggerId).toBe('trigger-2');
  });
});
