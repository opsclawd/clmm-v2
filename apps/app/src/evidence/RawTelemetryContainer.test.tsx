import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RawTelemetryContainer } from './RawTelemetryContainer';
import { fetchRawEvidence } from '../api/evidence';

vi.mock('../api/evidence', () => ({
  fetchRawEvidence: vi.fn(),
}));

vi.mock('@clmm/ui', () => ({
  RawTelemetryAccordion: ({
    isExpanded,
    onToggle,
    isLoading,
    isError,
    data,
  }: {
    isExpanded: boolean;
    onToggle: () => void;
    isLoading: boolean;
    isError: boolean;
    data: unknown;
  }) => (
    <div data-testid="raw-telemetry-accordion">
      <button data-testid="raw-telemetry-toggle" onClick={onToggle}>
        Toggle
      </button>
      {isExpanded ? (
        <div data-testid="raw-telemetry-content">
          {isLoading ? (
            <div data-testid="raw-telemetry-loading">Loading...</div>
          ) : isError ? (
            <div data-testid="raw-telemetry-error">Raw telemetry could not be loaded.</div>
          ) : data === null ? (
            <div data-testid="raw-telemetry-empty">No raw telemetry is available for this run.</div>
          ) : (
            <div data-testid="raw-telemetry-json">{JSON.stringify(data, null, 2)}</div>
          )}
        </div>
      ) : null}
    </div>
  ),
}));

describe('RawTelemetryContainer', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    cleanup();
    vi.clearAllMocks();
  });

  it('does not request raw telemetry while the container is collapsed', () => {
    const fetchRawEvidenceMock = vi.mocked(fetchRawEvidence);

    render(
      <QueryClientProvider client={queryClient}>
        <RawTelemetryContainer runId="run-123" />
      </QueryClientProvider>,
    );

    expect(fetchRawEvidenceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('raw-telemetry-content')).toBeNull();
  });

  it('expanding requests raw telemetry once for the supplied runId and renders the payload', async () => {
    const fetchRawEvidenceMock = vi.mocked(fetchRawEvidence);
    fetchRawEvidenceMock.mockResolvedValueOnce({ slot: 42, status: 'ok' });

    render(
      <QueryClientProvider client={queryClient}>
        <RawTelemetryContainer runId="run-123" />
      </QueryClientProvider>,
    );

    expect(fetchRawEvidenceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('raw-telemetry-toggle'));

    await waitFor(() => expect(fetchRawEvidenceMock).toHaveBeenCalledTimes(1));
    expect(fetchRawEvidenceMock).toHaveBeenCalledWith('run-123', expect.any(AbortSignal));

    await waitFor(() => expect(screen.getByTestId('raw-telemetry-json')).toBeDefined());
    expect(screen.getByTestId('raw-telemetry-json').textContent).toContain('"slot": 42');
  });

  it('collapsing hides fetched telemetry without affecting the parent evidence content', async () => {
    const fetchRawEvidenceMock = vi.mocked(fetchRawEvidence);
    fetchRawEvidenceMock.mockResolvedValueOnce({ slot: 42 });

    render(
      <QueryClientProvider client={queryClient}>
        <RawTelemetryContainer runId="run-123" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('raw-telemetry-toggle'));
    await waitFor(() => expect(screen.getByTestId('raw-telemetry-json')).toBeDefined());

    fireEvent.click(screen.getByTestId('raw-telemetry-toggle'));
    expect(screen.queryByTestId('raw-telemetry-content')).toBeNull();
    expect(fetchRawEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it('maps a missing raw payload to the accordion empty state', async () => {
    const fetchRawEvidenceMock = vi.mocked(fetchRawEvidence);
    fetchRawEvidenceMock.mockResolvedValueOnce(null);

    render(
      <QueryClientProvider client={queryClient}>
        <RawTelemetryContainer runId="run-123" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('raw-telemetry-toggle'));

    await waitFor(() => expect(screen.getByTestId('raw-telemetry-empty')).toBeDefined());
    expect(screen.getByText('No raw telemetry is available for this run.')).toBeDefined();
  });

  it('maps a rejected raw request to the accordion error state without retries', async () => {
    const fetchRawEvidenceMock = vi.mocked(fetchRawEvidence);
    fetchRawEvidenceMock.mockRejectedValueOnce(new Error('HTTP 500'));

    render(
      <QueryClientProvider client={queryClient}>
        <RawTelemetryContainer runId="run-123" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('raw-telemetry-toggle'));

    await waitFor(() => expect(screen.getByTestId('raw-telemetry-error')).toBeDefined());
    expect(screen.getByText('Raw telemetry could not be loaded.')).toBeDefined();
    expect(fetchRawEvidenceMock).toHaveBeenCalledTimes(1);
  });
});
