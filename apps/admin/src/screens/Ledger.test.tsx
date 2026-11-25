import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ uid: 'admin-2' as string | null }));

vi.mock('../auth', () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  useAuth: () => ({
    state: 'authorized',
    uid: authState.uid,
    error: null,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}));

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { Ledger } from './Ledger';
import { sampleLookup } from '../test/api-mock';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
  authState.uid = 'admin-2';
});

async function lookUp(uid: string) {
  fireEvent.change(screen.getByLabelText('User uid'), { target: { value: uid } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await waitFor(() => expect(apiMock.lookupUser).toHaveBeenLastCalledWith({ uid }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Look up' })).toBeEnabled());
}

function fillAdjustment(amount: string) {
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('Reason code'), { target: { value: 'correction' } });
  fireEvent.change(screen.getByLabelText('Note (required)'), { target: { value: 'make-good' } });
}

describe('Ledger screen', () => {
  it('looks up a uid and shows the wallet, rows and pending adjustments', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(apiMock.lookupUser).toHaveBeenCalledWith({ uid: 'user-1' }));
    expect(await screen.findByText('earn.subtask:row-1:user-1')).toBeInTheDocument();
    expect(screen.getByText('↩ reversal')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('Washed the dinner dishes (+20 XP).')).toBeInTheDocument();
    expect(screen.getByText('Reversal of a deleted feed post.')).toBeInTheDocument();
    expect(screen.getByText('Missed double-credit fix')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve 600' })).toBeInTheDocument();
  });

  it('approves a pending adjustment requested by another admin', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.approveAdjustment.mockResolvedValue({
      id: 'adj-1',
      status: 'applied',
      approvedBy: 'admin-2',
      appliedAt: '2026-11-24T12:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve 600' }));

    await waitFor(() => expect(apiMock.approveAdjustment).toHaveBeenCalledWith({ id: 'adj-1' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Adjustment approved and applied.');
  });

  it('disables Approve for the requester', async () => {
    authState.uid = 'admin-1';
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('button', { name: 'Approve 600' })).toBeDisabled();
  });

  it('warns about the second-admin threshold and submits the adjustment', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.adjust.mockResolvedValue({ id: 'adj-2', status: 'pending' });
    render(<Ledger />);

    await lookUp('user-1');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('Reason code'), { target: { value: 'correction' } });
    fireEvent.change(screen.getByLabelText('Note (required)'), {
      target: { value: 'make-good for a broken week' },
    });

    expect(
      await screen.findByText(
        'Over ±500: this adjustment needs approval by a second admin before it applies.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() =>
      expect(apiMock.adjust).toHaveBeenCalledWith({
        uid: 'user-1',
        amount: 600,
        reasonCode: 'correction',
        note: 'make-good for a broken week',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pending: over ±500 needs approval by a second admin.',
    );
  });

  it('applies a small adjustment without the threshold notice', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.adjust.mockResolvedValue({ id: null, status: 'applied' });
    render(<Ledger />);

    await lookUp('user-1');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-25' } });
    fireEvent.change(screen.getByLabelText('Reason code'), { target: { value: 'abuse' } });
    fireEvent.change(screen.getByLabelText('Note (required)'), {
      target: { value: 'farmed share posts' },
    });

    expect(
      screen.queryByText(
        'Over ±500: this adjustment needs approval by a second admin before it applies.',
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply adjustment' }));
    await waitFor(() =>
      expect(apiMock.adjust).toHaveBeenCalledWith({
        uid: 'user-1',
        amount: -25,
        reasonCode: 'abuse',
        note: 'farmed share posts',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Adjustment applied.');
  });

  it('rejects an invalid adjustment form', () => {
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Apply adjustment' })).toBeDisabled();
    expect(screen.getByText('Amount must not be zero.')).toBeInTheDocument();
    expect(screen.getByText('Pick a reason code.')).toBeInTheDocument();
    expect(screen.getByText('A note is required.')).toBeInTheDocument();
  });

  it('rebuilds the wallet after confirmation', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.rebuildWallet.mockResolvedValue({ uid: 'user-1', rows: 2, balance: 118 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Ledger />);

    await lookUp('user-1');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild wallet' }));

    await waitFor(() => expect(apiMock.rebuildWallet).toHaveBeenCalledWith({ uid: 'user-1' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Wallet rebuilt from 2 rows; balance is now 118.',
    );
  });

  it('shows a lookup error inline', async () => {
    apiMock.lookupUser.mockRejectedValue(new Error('no such user'));
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('no such user')).toBeInTheDocument();
  });

  it('disables adjust and rebuild until a user has been looked up', () => {
    render(<Ledger />);

    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-1' } });
    fillAdjustment('25');

    expect(screen.getByRole('button', { name: 'Rebuild wallet' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply adjustment' })).toBeDisabled();
    expect(screen.getByText(/Look up a user before rebuilding/)).toBeInTheDocument();
  });

  it('never adjusts or rebuilds a uid typed after the lookup', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    render(<Ledger />);

    await lookUp('user-1');
    expect(screen.getByRole('button', { name: 'Rebuild wallet' })).toBeEnabled();

    // The wallet on screen is still user-1's; the input now names someone else.
    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-2' } });
    fillAdjustment('25');

    expect(screen.getByRole('button', { name: 'Apply adjustment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rebuild wallet' })).toBeDisabled();
    expect(screen.getByText(/The wallet below is user-1's/)).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('Amount').closest('form') as HTMLFormElement);
    expect(apiMock.adjust).not.toHaveBeenCalled();
    expect(apiMock.rebuildWallet).not.toHaveBeenCalled();

    // Typing the looked-up uid back re-enables them, targeting that uid.
    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: ' user-1 ' } });
    expect(screen.getByRole('button', { name: 'Apply adjustment' })).toBeEnabled();
  });

  it('refreshes the looked-up user, not the edited input, after approving', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.approveAdjustment.mockResolvedValue({
      id: 'adj-1',
      status: 'applied',
      approvedBy: 'admin-2',
      appliedAt: '2026-11-24T12:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Ledger />);

    await lookUp('user-1');
    fireEvent.change(screen.getByLabelText('User uid'), { target: { value: 'user-2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve 600' }));

    await waitFor(() => expect(apiMock.approveAdjustment).toHaveBeenCalledWith({ id: 'adj-1' }));
    await waitFor(() => expect(apiMock.lookupUser).toHaveBeenCalledTimes(2));
    expect(apiMock.lookupUser).toHaveBeenNthCalledWith(2, { uid: 'user-1' });
    expect(apiMock.lookupUser).not.toHaveBeenCalledWith({ uid: 'user-2' });
  });

  it('credits the looked-up user and refreshes that user after an adjustment', async () => {
    apiMock.lookupUser.mockResolvedValue(sampleLookup());
    apiMock.adjust.mockResolvedValue({ id: null, status: 'applied' });
    render(<Ledger />);

    await lookUp('user-1');
    fillAdjustment('25');
    fireEvent.click(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() =>
      expect(apiMock.adjust).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-1' })),
    );
    await waitFor(() => expect(apiMock.lookupUser).toHaveBeenCalledTimes(2));
    expect(apiMock.lookupUser).toHaveBeenNthCalledWith(2, { uid: 'user-1' });
  });
});
