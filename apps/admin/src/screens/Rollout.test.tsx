import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { Rollout } from './Rollout';
import { sampleConfig } from '../test/api-mock';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Rollout screen', () => {
  it('loads and shows the config with the cohortSalt read-only', async () => {
    apiMock.getConfig.mockResolvedValue(sampleConfig());
    render(<Rollout />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByLabelText('Mode')).toHaveValue('shadow');
    expect(screen.getByLabelText('livePercent (households shown the program)')).toHaveValue(10);
    expect(screen.getByLabelText('controlPercent (explicit control group)')).toHaveValue(5);
    expect(screen.getByLabelText('cohortSalt (read-only)')).toHaveValue('salt-123');
    expect(screen.getByLabelText('cohortSalt (read-only)')).toHaveAttribute('readonly');
  });

  it('saves a valid change after confirmation', async () => {
    apiMock.getConfig.mockResolvedValue(sampleConfig());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiMock.setConfig.mockResolvedValue({ ...sampleConfig(), livePercent: 60 });
    render(<Rollout />);

    await screen.findByLabelText('livePercent (households shown the program)');
    fireEvent.change(screen.getByLabelText('livePercent (households shown the program)'), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save rollout' }));

    await waitFor(() =>
      expect(apiMock.setConfig).toHaveBeenCalledWith({
        mode: 'shadow',
        livePercent: 60,
        controlPercent: 5,
      }),
    );
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  });

  it('rejects percents over 100 together and disables save', async () => {
    apiMock.getConfig.mockResolvedValue(sampleConfig());
    render(<Rollout />);
    await screen.findByLabelText('livePercent (households shown the program)');

    fireEvent.change(screen.getByLabelText('livePercent (households shown the program)'), {
      target: { value: '90' },
    });
    fireEvent.change(screen.getByLabelText('controlPercent (explicit control group)'), {
      target: { value: '20' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'livePercent + controlPercent must be at most 100.',
    );
    expect(screen.getByRole('button', { name: 'Save rollout' })).toBeDisabled();
    expect(apiMock.setConfig).not.toHaveBeenCalled();
  });

  it('shows a callable error inline', async () => {
    apiMock.getConfig.mockRejectedValue(new Error('admin config exploded'));
    render(<Rollout />);
    expect(await screen.findByRole('alert')).toHaveTextContent('admin config exploded');
  });

  it('stays in the loading state while the callable runs', () => {
    apiMock.getConfig.mockImplementation(() => new Promise(() => {}));
    render(<Rollout />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
