import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { pendingApprovalsRespond } from '@/generated/api/sdk.gen';
import { useTimelineStore } from '@/stores/timeline-store';
import type { UserInputRequest } from '@/types/approval';
import { UserInputCard } from './user-input-card';

vi.mock('@/socket', () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock('@/generated/api/sdk.gen', () => ({ pendingApprovalsRespond: vi.fn(), pendingApprovalsListPending: vi.fn() }));
const initial = useTimelineStore.getState();
const request: UserInputRequest = { kind: 'userInput', requestId: '7', instanceId: 'proposal', threadId: 't', turnId: 'turn', itemId: 'tool', status: 'pending', questions: [
  { id: 'route', header: 'Route', question: 'Which route?', isOther: true, isSecret: false, options: [
    { label: 'A', description: 'First route' }, { label: 'B', description: 'Second route' },
  ] },
] };
beforeEach(() => {
  vi.resetAllMocks(); useTimelineStore.setState(initial, true);
  vi.mocked(pendingApprovalsRespond).mockResolvedValue({ data: { status: 'submitted' } } as never);
});

it('treats isOther as a free-text alternative, never multi-select, and sends exact RPC answer keys', async () => {
  render(<UserInputCard request={request} />);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /First route/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Second route/ }));
  expect(screen.getByRole('radio', { name: /First route/ })).not.toBeChecked();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My own route' } });
  expect(screen.getByRole('radio', { name: /Second route/ })).not.toBeChecked();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit' })));
  expect(pendingApprovalsRespond).toHaveBeenCalledWith(expect.objectContaining({ path: { requestId: '7' }, body: {
    instanceId: 'proposal', result: { answers: { route: { answers: ['My own route'] } } },
  } }));
});

it('renders an answer field for empty options and masks secret input', () => {
  render(<UserInputCard request={{ ...request, questions: [{ ...request.questions[0], options: [], isOther: false, isSecret: true }] }} />);
  expect(screen.getByLabelText('Route: Answer')).toHaveAttribute('type', 'password');
  fireEvent.change(screen.getByLabelText('Route: Answer'), { target: { value: 'secret' } });
  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
});

it('disables resolved requests instead of allowing an obsolete answer', () => {
  render(<UserInputCard request={{ ...request, status: 'resolved' }} />);
  expect(screen.getByRole('radio', { name: /First route/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
});
