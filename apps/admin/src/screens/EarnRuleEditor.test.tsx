import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async () => {
  const { createApiMock } = await import('../test/api-mock');
  return { api: createApiMock() };
});

import { api } from '../api';
import { EarnRuleEditor } from './EarnRuleEditor';
import { sampleRuleSets } from '../test/api-mock';

const apiMock = vi.mocked(api);

const published = sampleRuleSets()[0];
const draft = sampleRuleSets()[1];
const subtaskRule = published.rules.earnRules[0];

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe('Earn rule editor', () => {
  it('shows the live toast preview and updates it while typing', async () => {
    render(<EarnRuleEditor ruleSet={published} rule={subtaskRule} onSaved={vi.fn()} />);

    // perXp rule with amount 1 and the default 20 XP sample.
    expect(await screen.findByText('Lavar a louça do jantar · +20 Ganhos')).toBeInTheDocument();
    expect(screen.getByText('gami.earn.chore')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '5' } });
    expect(await screen.findByText('Lavar a louça do jantar · +100 Ganhos')).toBeInTheDocument();
  });

  it('applies the Turbo campaign multiplier to the preview', async () => {
    // Draft v2 ships a ×2 campaign covering earn.subtask.
    render(<EarnRuleEditor ruleSet={draft} rule={draft.rules.earnRules[0]} onSaved={vi.fn()} />);

    expect(await screen.findByText('Lavar a louça do jantar · +40 Ganhos')).toBeInTheDocument();
    expect(screen.getByText(/Turbo ×2 campaign active/)).toBeInTheDocument();
  });

  it('validates the form and disables save', async () => {
    render(<EarnRuleEditor ruleSet={published} rule={subtaskRule} onSaved={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Rule id'), { target: { value: 'Bad Id!' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'id must start with a letter and use only a-z, 0-9, ".", "_" or "-".',
    );
    expect(screen.getByRole('button', { name: /Save into/ })).toBeDisabled();
  });

  it('saves the edited rule into the draft via adminSaveDraft', async () => {
    apiMock.saveDraft.mockResolvedValue({
      version: 2,
      status: 'draft',
      createdAt: '2026-11-24T12:00:00.000Z',
    });
    const onSaved = vi.fn();
    render(<EarnRuleEditor ruleSet={draft} rule={draft.rules.earnRules[0]} onSaved={onSaved} />);

    fireEvent.change(await screen.findByLabelText('amount'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save into draft v2' }));

    await waitFor(() => expect(apiMock.saveDraft).toHaveBeenCalledTimes(1));
    const request = apiMock.saveDraft.mock.calls[0]?.[0];
    expect(request?.version).toBe(2);
    const savedRule = request?.rules.earnRules.find((r) => r.id === 'earn.subtask');
    expect(savedRule?.award.amount).toBe(3);
    expect(savedRule?.award.perXp).toBe(true);
    expect(request?.rules.earnRules.map((r) => r.id)).toEqual(
      draft.rules.earnRules.map((r) => r.id),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(2));
  });

  it('creates a new draft when saving edits on a published version', async () => {
    apiMock.saveDraft.mockResolvedValue({
      version: 3,
      status: 'draft',
      createdAt: '2026-11-24T12:00:00.000Z',
    });
    render(<EarnRuleEditor ruleSet={published} rule={subtaskRule} onSaved={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Save into a new draft/ }));

    await waitFor(() => expect(apiMock.saveDraft).toHaveBeenCalled());
    expect(apiMock.saveDraft.mock.calls[0]?.[0]?.version).toBeUndefined();
  });

  it('shows a callable error inline', async () => {
    apiMock.saveDraft.mockRejectedValue(new Error('rule set failed validation'));
    render(<EarnRuleEditor ruleSet={draft} rule={subtaskRule} onSaved={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Save into/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rule set failed validation');
  });
});
