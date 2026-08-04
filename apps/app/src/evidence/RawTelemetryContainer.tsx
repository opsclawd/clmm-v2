import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RawTelemetryAccordion } from '@clmm/ui';
import { fetchRawEvidence } from '../api/evidence';

export function RawTelemetryContainer({ runId }: { readonly runId: string }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const rawTelemetryQuery = useQuery({
    queryKey: ['raw-telemetry', runId],
    queryFn: ({ signal }) => fetchRawEvidence(runId, signal),
    enabled: isExpanded,
    retry: false,
  });

  return (
    <RawTelemetryAccordion
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded((current) => !current)}
      isLoading={isExpanded && rawTelemetryQuery.isFetching}
      isError={isExpanded && rawTelemetryQuery.isError}
      data={rawTelemetryQuery.data ?? null}
    />
  );
}
