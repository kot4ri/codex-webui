import { beforeEach, expect, it, vi } from 'vitest';
import { threadsStartTurn, threadsSteerTurn } from '@/generated/api/sdk.gen';
import { useTimelineStore } from '@/stores/timeline-store';
import { useThreadPolicyStore } from '@/stores/thread-policy-store';
import { questionReplyKey, useQuestionReplyStore } from '@/stores/question-reply-store';
import { submitQuestionReply } from './question-reply';

vi.mock('@/socket', () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock('@/generated/api/sdk.gen', () => ({ threadsStartTurn: vi.fn(), threadsSteerTurn: vi.fn() }));
const initial = useTimelineStore.getState();
const key = questionReplyKey('t', 'question');
const start = vi.mocked(threadsStartTurn);
const steer = vi.mocked(threadsSteerTurn);

beforeEach(() => {
  vi.resetAllMocks();
  useTimelineStore.setState(initial, true);
  useQuestionReplyStore.setState({ replies: {} });
  useThreadPolicyStore.setState({ pendingByThread: {} });
  useTimelineStore.getState().selectThread('t');
  useTimelineStore.getState().hydrateTimelineForThread('t', []);
  useTimelineStore.getState().setOpenStateForThread('t', { openState: 'ready' });
  start.mockResolvedValue({ data: { turn: { id: 'new', status: 'inProgress', items: [], itemsView: 'notLoaded', error: null, startedAt: null, completedAt: null, durationMs: null } } } as never);
  steer.mockResolvedValue({ data: { turnId: 'running' } } as never);
});

it('starts the next turn when idle, preserving the question and answer as a user message', async () => {
  expect(await submitQuestionReply('t', 'question', 'Which route?\nB')).toBe(true);
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ path: { threadId: 't' }, body: expect.objectContaining({ input: [{ type: 'text', text: 'Which route?\nB', text_elements: [] }] }) }));
  expect(steer).not.toHaveBeenCalled();
  expect(useTimelineStore.getState().getThreadRuntime('t')?.activeTurnId).toBe('new');
  expect(useQuestionReplyStore.getState().replies[key].status).toBe('sent');
});

it('steers only the originating active turn and never also starts a turn', async () => {
  useTimelineStore.getState().setActiveTurnIdForThread('t', 'running');
  await submitQuestionReply('t', 'question', 'Choose B');
  expect(steer).toHaveBeenCalledWith(expect.objectContaining({ path: { threadId: 't', turnId: 'running' } }));
  expect(start).not.toHaveBeenCalled();
});

it('deduplicates double clicks and keeps a sent answer across remounts', async () => {
  useTimelineStore.getState().setActiveTurnIdForThread('t', 'running');
  await Promise.all([submitQuestionReply('t', 'question', 'B'), submitQuestionReply('t', 'question', 'B')]);
  await submitQuestionReply('t', 'question', 'B');
  expect(steer).toHaveBeenCalledTimes(1);
});

it('rejects a stale callback after navigation', async () => {
  useTimelineStore.getState().selectThread('other');
  expect(await submitQuestionReply('t', 'question', 'B')).toBe(false);
  expect(start).not.toHaveBeenCalled();
  expect(steer).not.toHaveBeenCalled();
});

it('rechecks pending policy changes at dispatch time', async () => {
  useThreadPolicyStore.setState({ pendingByThread: { t: { requested: {}, deadline: Date.now() + 5000, outcome: 'pending' } } });
  expect(await submitQuestionReply('t', 'question', 'B')).toBe(false);
  expect(start).not.toHaveBeenCalled();
});

it('does not mutate the new selected thread when the old response arrives', async () => {
  let finish!: (value: never) => void;
  start.mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as never);
  const pending = submitQuestionReply('t', 'question', 'B');
  useTimelineStore.getState().selectThread('other');
  finish({ data: { turn: { id: 'new', status: 'inProgress' } } } as never);
  await pending;
  expect(useTimelineStore.getState().threadId).toBe('other');
  expect(useTimelineStore.getState().activeTurnId).toBeNull();
  expect(useTimelineStore.getState().getThreadRuntime('t')?.activeTurnId).toBe('new');
});

it('retains a definitively rejected answer for explicit retry', async () => {
  useTimelineStore.getState().setActiveTurnIdForThread('t', 'running');
  steer.mockRejectedValueOnce({ statusCode: 409, message: 'Turn ended' });
  expect(await submitQuestionReply('t', 'question', 'B')).toBe(false);
  expect(useQuestionReplyStore.getState().replies[key].status).toBe('draft');
  expect(start).not.toHaveBeenCalled();
  await submitQuestionReply('t', 'question', 'B');
  expect(steer).toHaveBeenCalledTimes(2);
});

it('does not resend an answer after an ambiguous network failure', async () => {
  useTimelineStore.getState().setActiveTurnIdForThread('t', 'running');
  steer.mockRejectedValue(new TypeError('Network lost'));
  await submitQuestionReply('t', 'question', 'B');
  await submitQuestionReply('t', 'question', 'B');
  expect(useQuestionReplyStore.getState().replies[key].status).toBe('uncertain');
  expect(steer).toHaveBeenCalledTimes(1);
});

it.each([{ threadMode: 'readOnly' as const }, { deletedRemotely: true }, { readOnlyReason: 'owned elsewhere' }, { openState: 'opening' as const }, { hydrated: false }, { turnStartPending: true }])('blocks an unwritable runtime: %j', async (patch) => {
  useTimelineStore.setState(patch);
  expect(await submitQuestionReply('t', 'question', 'B')).toBe(false);
  expect(start).not.toHaveBeenCalled();
});
