import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useTimelineStore } from '@/stores/timeline-store';
import { useQuestionReplyStore } from '@/stores/question-reply-store';
import { useThreadPolicyStore } from '@/stores/thread-policy-store';
import { threadsStartTurn, threadsSteerTurn } from '@/generated/api/sdk.gen';
import type { AgentMessageTurnItem } from '@/types/timeline';
import { AsyncQuestionCard } from './async-question-card';

vi.mock('@/socket', () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock('@/generated/api/sdk.gen', () => ({ threadsStartTurn: vi.fn(), threadsSteerTurn: vi.fn() }));
const initial = useTimelineStore.getState();
const item: AgentMessageTurnItem = { type: 'agentMessage', itemId: 'q', content: '', completed: true, questions: [
  { title: 'Choose the implementation', options: ['Simple (Recommended)', 'Custom'] },
  { title: 'Additional requirements', options: null },
] };
function show() {
  return render(<QueryClientProvider client={new QueryClient()}><AsyncQuestionCard threadId="t" item={item} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  useQuestionReplyStore.setState({ replies: {} });
  useThreadPolicyStore.setState({ pendingByThread: {} });
  useTimelineStore.setState(initial, true);
  const store = useTimelineStore.getState();
  store.selectThread('t'); store.hydrateTimelineForThread('t', []);
  store.setOpenStateForThread('t', { openState: 'ready' });
  store.setActiveTurnIdForThread('t', 'running');
  vi.mocked(threadsSteerTurn).mockResolvedValue({ data: { turnId: 'running' } } as never);
});

it('requires explicit submit, supports one selection per question, and sends all answers together', async () => {
  show();
  expect(screen.getByRole('radio', { name: 'Simple (Recommended)' })).toBeChecked();
  expect(threadsSteerTurn).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
  expect(screen.getByRole('radio', { name: 'Simple (Recommended)' })).not.toBeChecked();
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'Keep it accessible' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answer' })));
  expect(threadsSteerTurn).toHaveBeenCalledWith(expect.objectContaining({ body: { input: [{ type: 'text', text: 'Choose the implementation\nCustom\n\nAdditional requirements\nKeep it accessible', text_elements: [] }] } }));
  expect(screen.getByRole('status')).toHaveTextContent('Answer sent');
  expect(threadsStartTurn).not.toHaveBeenCalled();
});

it('allows a free-text alternative and preserves the draft across virtualization', () => {
  const view = show();
  fireEvent.change(screen.getByRole('textbox', { name: 'Other answer' }), { target: { value: 'A different approach' } });
  expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  view.unmount(); show();
  expect(screen.getByRole('textbox', { name: 'Other answer' })).toHaveValue('A different approach');
});

it('keeps a sent answer disabled when the card remounts', async () => {
  const view = show();
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'None' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answer' })));
  view.unmount(); show();
  expect(screen.getByRole('status')).toHaveTextContent('Answer sent');
  expect(screen.getByRole('textbox', { name: 'Answer' })).toBeDisabled();
});

it('unblocks after a policy change settles without requiring a timeline event', () => {
  useThreadPolicyStore.setState({ pendingByThread: { t: { requested: {}, deadline: Date.now() + 5000, outcome: 'pending' } } });
  show();
  expect(screen.getByRole('textbox', { name: 'Answer' })).toBeDisabled();
  act(() => useThreadPolicyStore.setState({ pendingByThread: {} }));
  expect(screen.getByRole('textbox', { name: 'Answer' })).toBeEnabled();
});
