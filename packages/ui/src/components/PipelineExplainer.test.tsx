import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PipelineExplainer } from './PipelineExplainer.js';

afterEach(() => cleanup());

describe('PipelineExplainer', () => {
  it('explains the five visible evidence-to-policy stages without provider or raw-payload claims', () => {
    render(<PipelineExplainer />);

    const card = screen.getByTestId('pipeline-explainer');
    const text = card.textContent ?? '';
    const expectedCopy = [
      'Collection',
      'Sources are observed and normalized into safe reference metadata.',
      'Features & claims',
      'Observations become deterministic features and contextual claims.',
      'Evidence bundle',
      'Those records are frozen into the evidence bundle shown below.',
      'Synthesis',
      'The policy engine selects the source references relevant to this insight.',
      'Policy insight',
      'The resulting recommendation is advisory and requires your signature to execute.',
    ];

    for (const copy of expectedCopy) {
      expect(screen.getByText(copy)).toBeDefined();
    }
    expect(expectedCopy.map((copy) => text.indexOf(copy))).toEqual(
      [...expectedCopy.map((copy) => text.indexOf(copy))].sort((a, b) => a - b),
    );
    expect(text.toLowerCase()).not.toContain('vendor');
    expect(text.toLowerCase()).not.toContain('provider identity');
    expect(text.toLowerCase()).not.toContain('raw payload');
    expect(text.toLowerCase()).not.toContain('all data collected');
  });
});
