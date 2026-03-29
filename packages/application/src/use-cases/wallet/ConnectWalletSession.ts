import type {
  WalletSigningPort,
  ExecutionSessionRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId } from '@clmm/domain';

export type ConnectWalletSessionResult =
  | { kind: 'connected'; sessionId: string }
  | { kind: 'failed'; reason: string };

export async function connectWalletSession(params: {
  walletId: WalletId;
  positionId: PositionId;
  signingPort: WalletSigningPort;
  sessionRepo: ExecutionSessionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ConnectWalletSessionResult> {
  const { walletId, positionId, sessionRepo, clock, ids } = params;

  const sessionId = ids.generateId();
  const attemptId = ids.generateId();

  await sessionRepo.saveSession({
    sessionId,
    attemptId,
    walletId,
    positionId,
    createdAt: clock.now(),
  });

  return { kind: 'connected', sessionId };
}
