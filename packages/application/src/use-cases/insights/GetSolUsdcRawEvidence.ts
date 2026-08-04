import type { EvidenceReadPort, RawEvidenceReadResult } from '../../ports/index.js';

export async function getSolUsdcRawEvidence(params: {
  runId: string;
  evidenceReadPort: EvidenceReadPort;
}): Promise<RawEvidenceReadResult> {
  return params.evidenceReadPort.getRawEvidence(params.runId);
}
