import { describe, it, expect } from 'vitest';
import { buildPositionPlanViewModel } from './PositionPlanViewModel.js';
import type { CurrentPlanDto } from './PositionPlanViewModel.js';

function makeBreachDirectionLower() {
  return { kind: 'lower-bound-breach' as const };
}

function makeBreachDirectionUpper() {
  return { kind: 'upper-bound-breach' as const };
}

describe('PositionPlanViewModel', () => {
  describe('renders hold as acknowledgement only', () => {
    it('shows advisory status with HOLD action and no execution controls', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('advisory');
      if (vm.status !== 'advisory') return;
      expect(vm.advisoryKind).toBe('HOLD');
      expect(vm.canAcknowledge).toBe(true);
      expect(vm.showBreachControls).toBe(true);
    });

    it('does not show preview or approve for HOLD plans', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('advisory');
      expect(vm.status).not.toBe('requesting-exit');
      expect(vm.status).not.toBe('preview-ready');
    });
  });

  describe('renders stand-down without hiding qualified breach exit', () => {
    it('shows advisory status with STAND_DOWN action', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'STAND_DOWN' },
          regimeResponse: { regime: 'CHOP', suitability: 'CAUTION' },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('advisory');
      if (vm.status !== 'advisory') return;
      expect(vm.advisoryKind).toBe('STAND_DOWN');
      expect(vm.showBreachControls).toBe(true);
    });

    it('preserves breach controls even during stand-down', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'STAND_DOWN' },
          regimeResponse: { regime: 'CHOP', suitability: 'CAUTION' },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionUpper());

      expect(vm.status).toBe('advisory');
      if (vm.status !== 'advisory') return;
      expect(vm.showBreachControls).toBe(true);
    });
  });

  describe('renders request-exit as preview then explicit approval', () => {
    it('shows requesting-exit status with preview capability', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
          regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('requesting-exit');
      if (vm.status !== 'requesting-exit') return;
      expect(vm.exitPosture).toBe('ExitToUSDC');
      expect(vm.canPreview).toBe(true);
      expect(vm.showBreachControls).toBe(true);
    });

    it('transitions to preview-ready after preview is created', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'exit-previewed',
          previewId: 'preview-123',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToSOL' } },
          preview: { freshness: { kind: 'fresh' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionUpper());

      expect(vm.status).toBe('preview-ready');
      if (vm.status !== 'preview-ready') return;
      expect(vm.previewId).toBe('preview-123');
      expect(vm.canApprove).toBe(true);
    });

    it('requires explicit approval after preview, not automatic submit', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'exit-previewed',
          previewId: 'preview-123',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
          preview: { freshness: { kind: 'fresh' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('preview-ready');
      if (vm.status !== 'preview-ready') return;
      expect(vm.canApprove).toBe(true);
    });
  });

  describe('disables stale expired superseded and conflicting plans', () => {
    it('marks conflict state as non-executable', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'conflict',
          priorPlanId: 'prior-plan-1',
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('conflict');
      expect(vm.status).not.toBe('requesting-exit');
      expect(vm.status).not.toBe('preview-ready');
    });

    it('marks superseded state as non-executable', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'superseded',
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('superseded');
      expect(vm.status).not.toBe('requesting-exit');
      expect(vm.status).not.toBe('preview-ready');
    });

    it('shows unavailable when plan is null', () => {
      const vm = buildPositionPlanViewModel(null, makeBreachDirectionLower());

      expect(vm.status).toBe('unavailable');
      expect(vm.status).not.toBe('requesting-exit');
      expect(vm.status).not.toBe('preview-ready');
    });

    it('shows unavailable for unknown state', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'requested',
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('unavailable');
    });

    it('marks a stale preview as non-executable instead of preview-ready', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'exit-previewed',
          previewId: 'preview-1',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
          preview: { freshness: { kind: 'stale' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('stale');
      expect(vm.status).not.toBe('preview-ready');
    });

    it('marks an expired preview as non-executable instead of preview-ready', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'exit-previewed',
          previewId: 'preview-1',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
          preview: { freshness: { kind: 'expired' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('stale');
      expect(vm.status).not.toBe('preview-ready');
    });
  });

  describe('keeps position and breach controls during plan outage', () => {
    it('shows breach controls when plan is unavailable but breach direction exists', () => {
      const vm = buildPositionPlanViewModel(null, makeBreachDirectionLower());

      expect(vm.status).toBe('unavailable');
      expect(vm.status).toBe('unavailable');
    });

    it('shows breach controls for in-flight states', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'submitted',
          attemptId: 'attempt-1',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionUpper());

      expect(vm.status).toBe('in-flight');
      if (vm.status !== 'in-flight') return;
      expect(vm.showBreachControls).toBe(true);
    });

    it('shows breach controls for awaiting-signature state', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'awaiting-signature',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToSOL' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('awaiting-signature');
      if (vm.status !== 'awaiting-signature') return;
      expect(vm.showBreachControls).toBe(true);
    });
  });

  describe('deduplicates repeated decision and preview taps', () => {
    it('in-flight state prevents duplicate preview requests', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'exit-previewed',
          previewId: 'preview-1',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
          preview: { freshness: { kind: 'fresh' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('preview-ready');
      if (vm.status !== 'preview-ready') return;
      expect(vm.previewId).toBe('preview-1');
    });

    it('awaiting-signature state indicates signature in progress', () => {
      const plan: CurrentPlanDto = {
        planId: 'plan-1',
        canonicalHash: 'hash-1',
        positionId: 'Position1111111111111111111111111111111111',
        state: {
          kind: 'awaiting-signature',
          attemptId: 'attempt-1',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM', exitIntent: { posture: 'ExitToUSDC' } },
        },
      };

      const vm = buildPositionPlanViewModel(plan, makeBreachDirectionLower());

      expect(vm.status).toBe('awaiting-signature');
    });
  });
});
