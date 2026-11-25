import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { Simulator } from './Simulator';
import { sampleRuleSets, sampleSimulateResponse } from '../test/api-mock';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Simulator screen', () => {
  it('runs the draft and shows published vs draft with deltas', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    apiMock.simulate.mockResolvedValue(sampleSimulateResponse());
    render(<Simulator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Run simulation' }));

    await waitFor(() =>
      expect(apiMock.simulate).toHaveBeenCalledWith({ rules: sampleRuleSets()[1].rules, days: 7 }),
    );
    expect(await screen.findByText('earn.welcome')).toBeInTheDocument();
    // +100 shows twice: the totals delta and the earn.share per-rule delta.
    expect(screen.getAllByText('+100').length).toBe(2);
    expect(screen.getAllByText('900').length).toBeGreaterThan(0);
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('validates the day range', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    render(<Simulator />);

    await screen.findByRole('button', { name: 'Run simulation' });
    fireEvent.change(screen.getByLabelText('Days to replay (1–28)'), {
      target: { value: '30' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Days must be between 1 and 28.');
    expect(screen.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
    expect(apiMock.simulate).not.toHaveBeenCalled();
  });

  it('explains when there is no draft to simulate', async () => {
    apiMock.listRuleSets.mockResolvedValue([sampleRuleSets()[0]]);
    render(<Simulator />);

    expect(
      await screen.findByText('No draft rule set. Create one in Rule sets to run a simulation.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
  });

  it('shows a callable error inline', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    apiMock.simulate.mockRejectedValue(new Error('simulation timed out'));
    render(<Simulator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Run simulation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('simulation timed out');
  });

  it('stays in the loading state while the rule sets load', () => {
    apiMock.listRuleSets.mockImplementation(() => new Promise(() => {}));
    render(<Simulator />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
