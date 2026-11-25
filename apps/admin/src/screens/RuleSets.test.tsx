import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { RuleSets } from './RuleSets';
import { sampleRuleSets } from '../test/api-mock';

const apiMock = vi.mocked(api);

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Rule sets screen', () => {
  it('lists versions, opens the draft and shows the JSON diff vs published', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    render(<RuleSets />);

    expect(await screen.findByRole('button', { name: 'v2' })).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('Bump share, add turbo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'v2' }));

    expect(await screen.findByText('Selected: v2 (draft)')).toBeInTheDocument();
    // One changed path between the sample published v1 and draft v2.
    expect(await screen.findByText('earnRules[1].award.amount')).toBeInTheDocument();
    expect(screen.getByText('changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish v2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll back to previous' })).toBeInTheDocument();
  });

  it('publishes the selected draft after confirmation', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    apiMock.publish.mockResolvedValue({
      activeVersion: 2,
      previousVersion: 1,
      publishedAt: '2026-11-24T12:00:00.000Z',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RuleSets />);

    fireEvent.click(await screen.findByRole('button', { name: 'v2' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish v2' }));

    await waitFor(() => expect(apiMock.publish).toHaveBeenCalledWith({ version: 2 }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Published. Active version: v2.');
  });

  it('rolls back after confirmation', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    apiMock.rollback.mockResolvedValue({ activeVersion: 1, previousVersion: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RuleSets />);

    fireEvent.click(await screen.findByRole('button', { name: 'Roll back to previous' }));

    await waitFor(() => expect(apiMock.rollback).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('Rolled back.');
  });

  it('creates a draft from the published version', async () => {
    apiMock.listRuleSets.mockResolvedValue(sampleRuleSets());
    apiMock.saveDraft.mockResolvedValue({
      version: 3,
      status: 'draft',
      createdAt: '2026-11-24T12:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RuleSets />);

    fireEvent.click(await screen.findByRole('button', { name: 'New draft from published' }));

    await waitFor(() =>
      expect(apiMock.saveDraft).toHaveBeenCalledWith({
        notes: 'Draft from v1',
        rules: sampleRuleSets()[0].rules,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Draft v3 created.');
  });

  it('shows a callable error inline', async () => {
    apiMock.listRuleSets.mockRejectedValue(new Error('rule sets unavailable'));
    render(<RuleSets />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rule sets unavailable');
  });

  it('stays in the loading state while the callable runs', () => {
    apiMock.listRuleSets.mockImplementation(() => new Promise(() => {}));
    render(<RuleSets />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
