import type { BreachDirection } from '@clmm/domain';
import type { ExternalBreachDirection } from '../../dto/index.js';

// Projects domain BreachDirection.kind to ExternalBreachDirection.
// The directional mapping is authoritative only in DirectionalExitPolicyService —
// this function does not re-derive exit direction or target posture.
export function toExternalBreachDirection(d: BreachDirection): ExternalBreachDirection {
  return d.kind;
}