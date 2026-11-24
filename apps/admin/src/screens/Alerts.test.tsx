import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { Alerts } from './Alerts';
import { sampleAlerts } from '../test/api-mock';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Alerts screen', () => {
  it('lists gamification alerts', async () => {
    apiMock.listAlerts.mockResolvedValue(sampleAlerts());
    render(<Alerts />);

    expect(await screen.findByText('velocity')).toBeInTheDocument();
    expect(screen.getByText('undo-rate')).toBeInTheDocument();
    expect(screen.getByText('subtasksIn10Minutes: 14')).toBeInTheDocument();
    expect(screen.getByText('undoRatePercent: 42')).toBeInTheDocument();
  });

  it('says so when there are no alerts', async () => {
    apiMock.listAlerts.mockResolvedValue([]);
    render(<Alerts />);
    expect(await screen.findByText('No alerts.')).toBeInTheDocument();
  });

  it('shows a callable error inline', async () => {
    apiMock.listAlerts.mockRejectedValue(new Error('alerts feed broken'));
    render(<Alerts />);
    expect(await screen.findByRole('alert')).toHaveTextContent('alerts feed broken');
  });

  it('stays in the loading state while the callable runs', () => {
    apiMock.listAlerts.mockImplementation(() => new Promise(() => {}));
    render(<Alerts />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
