/** Real keyboard, layout, and submission checks for desktop and narrow screens. */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { page } from 'vitest/browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTimelineStore } from '@/stores/timeline-store';
import { useQuestionReplyStore } from '@/stores/question-reply-store';
import { threadsSteerTurn } from '@/generated/api/sdk.gen';
import { AsyncQuestionCard } from './async-question-card';
import '@/index.css';
import '@/i18n';

vi.mock('@/socket', () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock('@/generated/api/sdk.gen', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/generated/api/sdk.gen')>(),
  threadsStartTurn: vi.fn(), threadsSteerTurn: vi.fn(),
}));
const initial = useTimelineStore.getState();
beforeEach(() => {
  vi.resetAllMocks(); useTimelineStore.setState(initial, true);
  useQuestionReplyStore.setState({ replies: {} });
  const store = useTimelineStore.getState();
  store.selectThread('t'); store.hydrateTimelineForThread('t', []);
  store.setOpenStateForThread('t', { openState: 'ready' });
  store.setActiveTurnIdForThread('t', 'running');
  vi.mocked(threadsSteerTurn).mockResolvedValue({ data: { turnId: 'running' } } as never);
});
afterEach(cleanup);

test.each([1280, 390])('answers all questions without overflow at %i px', async (width) => {
  await page.viewport(width, 850);
  render(<QueryClientProvider client={new QueryClient()}>
    <main style={{ maxWidth: 720, margin: 'auto', padding: 16 }}>
      <h1>Codex WebUI</h1>
      <AsyncQuestionCard threadId="t" item={{ type: 'agentMessage', itemId: 'question', completed: true, content: '', questions: [
        { title: '选择下一步的实现方式', options: ['最小修改（推荐）', '完整实现，并保留已有的对话和未保存的草稿'] },
        { title: '还需要注意哪些要求？', options: null },
      ] }} />
    </main>
  </QueryClientProvider>);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  await page.getByRole('radio', { name: '完整实现，并保留已有的对话和未保存的草稿' }).click();
  await page.getByRole('textbox', { name: /^(Answer|回答)$/ }).fill('支持手机和键盘操作');
  expect(threadsSteerTurn).not.toHaveBeenCalled();
  await page.getByRole('button', { name: /Send answer|发送回答/ }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent(/Answer sent|回答已发送/);
  expect(threadsSteerTurn).toHaveBeenCalledTimes(1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
});
