import type { ExecutionLifecycleState } from './index.js';

type LifecycleEvent =
  | 'request-signature'
  | 'submit'
  | 'decline'
  | 'expire'
  | 'confirm'
  | 'fail'
  | 'partial-completion'
  | 'reset-to-preview';

export function applyLifecycleTransition(
  current: ExecutionLifecycleState,
  event: LifecycleEvent,
): ExecutionLifecycleState {
  switch (current.kind) {
    case 'previewed':
      if (event === 'request-signature') return { kind: 'awaiting-signature' };
      break;

    case 'awaiting-signature':
      if (event === 'submit') return { kind: 'submitted' };
      if (event === 'decline') return { kind: 'abandoned' };
      if (event === 'expire') return { kind: 'expired' };
      break;

    case 'submitted':
      if (event === 'confirm') return { kind: 'confirmed' };
      if (event === 'fail') return { kind: 'failed' };
      if (event === 'partial-completion') return { kind: 'partial' };
      break;

    case 'failed':
      if (event === 'reset-to-preview') return { kind: 'previewed' };
      break;

    case 'expired':
      if (event === 'reset-to-preview') return { kind: 'previewed' };
      break;

    case 'partial':
      throw new Error(
        `FORBIDDEN: partial state cannot transition; event=${event}. ` +
        'Partial completion requires explicit recovery guidance, not replay.',
      );

    case 'confirmed':
      throw new Error(
        `FORBIDDEN: confirmed is terminal; event=${event}`,
      );

    case 'abandoned':
      throw new Error(
        `FORBIDDEN: abandoned is terminal; event=${event}`,
      );
  }

  throw new Error(
    `Invalid transition: ${current.kind} + ${event}`,
  );
}
