import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RawTelemetryAccordion } from './RawTelemetryAccordion.js';

afterEach(() => {
  cleanup();
});

describe('RawTelemetryAccordion', () => {
  it('renders only the accessible Raw Telemetry toggle while collapsed', () => {
    render(
      <RawTelemetryAccordion
        isExpanded={false}
        onToggle={vi.fn()}
        isLoading={false}
        isError={false}
        data={{ slot: 7 }}
      />,
    );

    const toggle = screen.getByTestId('raw-telemetry-toggle');
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute('role')).toBe('button');
    expect(toggle.getAttribute('aria-label')).toBe('Expand Raw Telemetry');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    expect(screen.queryByTestId('raw-telemetry-content')).toBeNull();
  });

  it('calls onToggle once when the Raw Telemetry toggle is pressed', () => {
    const onToggle = vi.fn();
    render(
      <RawTelemetryAccordion
        isExpanded={false}
        onToggle={onToggle}
        isLoading={false}
        isError={false}
        data={null}
      />,
    );

    const toggle = screen.getByTestId('raw-telemetry-toggle');
    fireEvent.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders loading before all other expanded states', () => {
    render(
      <RawTelemetryAccordion
        isExpanded={true}
        onToggle={vi.fn()}
        isLoading={true}
        isError={true}
        data={{ slot: 7 }}
      />,
    );

    expect(screen.getByTestId('raw-telemetry-loading')).toBeDefined();
    expect(screen.getByText('Loading raw telemetry…')).toBeDefined();
    expect(screen.queryByTestId('raw-telemetry-error')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-empty')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-json')).toBeNull();
  });

  it('renders an error without rendering stale telemetry when the request fails', () => {
    render(
      <RawTelemetryAccordion
        isExpanded={true}
        onToggle={vi.fn()}
        isLoading={false}
        isError={true}
        data={{ slot: 7 }}
      />,
    );

    expect(screen.getByTestId('raw-telemetry-error')).toBeDefined();
    expect(screen.getByText('Raw telemetry could not be loaded.')).toBeDefined();
    expect(screen.queryByTestId('raw-telemetry-loading')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-empty')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-json')).toBeNull();
  });

  it('renders the empty state for a null payload', () => {
    render(
      <RawTelemetryAccordion
        isExpanded={true}
        onToggle={vi.fn()}
        isLoading={false}
        isError={false}
        data={null}
      />,
    );

    expect(screen.getByTestId('raw-telemetry-empty')).toBeDefined();
    expect(screen.getByText('No raw telemetry is available for this run.')).toBeDefined();
    expect(screen.queryByTestId('raw-telemetry-loading')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-error')).toBeNull();
    expect(screen.queryByTestId('raw-telemetry-json')).toBeNull();
  });

  it('renders two-space-indented JSON inside the expanded telemetry region', () => {
    const data = { slot: 7, nested: { ok: true } };
    render(
      <RawTelemetryAccordion
        isExpanded={true}
        onToggle={vi.fn()}
        isLoading={false}
        isError={false}
        data={data}
      />,
    );

    const toggle = screen.getByTestId('raw-telemetry-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse Raw Telemetry');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const content = screen.getByTestId('raw-telemetry-content');
    expect(content.textContent).toContain(JSON.stringify(data, null, 2));
    expect(screen.getByTestId('raw-telemetry-json').textContent).toBe(
      JSON.stringify(data, null, 2),
    );
  });
});
