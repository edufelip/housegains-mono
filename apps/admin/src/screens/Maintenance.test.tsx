import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { Maintenance } from './Maintenance';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Maintenance screen', () => {
  it('backfills level floors after confirmation and reports the count', async () => {
    apiMock.backfillLevelFloors.mockResolvedValue({ updatedMembers: 3 });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Maintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Backfill level floors' }));

    await waitFor(() => expect(apiMock.backfillLevelFloors).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Done. 3 member(s) got their levelFloor and xpPeak set.',
    );
  });

  it('does nothing when the confirm is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Maintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Backfill level floors' }));

    expect(apiMock.backfillLevelFloors).not.toHaveBeenCalled();
  });

  it('shows a callable error inline', async () => {
    apiMock.backfillLevelFloors.mockRejectedValue(new Error('backfill denied'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Maintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Backfill level floors' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('backfill denied');
  });
});
