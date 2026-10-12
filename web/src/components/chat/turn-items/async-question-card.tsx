/** Answer non-blocking Codex questions without replacing the composer's unfinished draft. */
import { useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTimelineStore } from '@/stores/timeline-store';
import { useThreadPolicyStore } from '@/stores/thread-policy-store';
import { questionReplyKey, useQuestionReplyStore } from '@/stores/question-reply-store';
import { canReplyToQuestion, submitQuestionReply } from '@/lib/question-reply';
import { threadsListBranchTreesQueryKey, threadsReadBranchTreeQueryKey } from '@/generated/api/@tanstack/react-query.gen';
import type { AgentMessageTurnItem } from '@/types/timeline';
import { cn } from '@/lib/utils';

export function AsyncQuestionCard({ threadId, item }: { threadId: string; item: AgentMessageTurnItem }) {
  const { t } = useTranslation();
  const formId = useId();
  const client = useQueryClient();
  const key = questionReplyKey(threadId, item.itemId);
  const reply = useQuestionReplyStore((s) => s.replies[key]);
  const writable = useTimelineStore(() => canReplyToQuestion(threadId));
  const policyPending = useThreadPolicyStore((s) => s.pendingByThread[threadId]?.outcome === 'pending');
  const status = reply?.status ?? 'draft';
  const disabled = status !== 'draft' || !writable || policyPending;
  const answers = item.questions.map((q, index) => reply?.answers[index] ?? q.options?.[0] ?? '');
  const setAnswer = (index: number, value: string) => {
    useQuestionReplyStore.getState().update(key, { answers: { ...reply?.answers, [index]: value } });
  };
  const submit = async () => {
    if (disabled || answers.some((answer) => !answer.trim())) return;
    const text = item.questions.map((q, index) => `${q.title}\n${answers[index].trim()}`).join('\n\n');
    if (await submitQuestionReply(threadId, item.itemId, text)) {
      void client.invalidateQueries({ queryKey: threadsReadBranchTreeQueryKey({ path: { threadId } }) });
      void client.invalidateQueries({ queryKey: threadsListBranchTreesQueryKey() });
    }
  };
  return <form className="mt-3 flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-3 text-sm"
    onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div className="flex items-center gap-2 font-medium"><MessageCircleQuestion className="size-4" />{t('Choose the next step')}</div>
    {item.questions.map((question, index) => <fieldset key={index} disabled={disabled} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 font-medium break-words">{question.title}</legend>
      {(question.options ?? []).map((option, optionIndex) => <label key={optionIndex}
        className={cn('flex min-w-0 cursor-pointer items-start gap-2 rounded-md border p-2', answers[index] === option && 'border-primary bg-accent')}>
        <input type="radio" name={`${formId}-${index}`} className="mt-1 shrink-0 accent-primary"
          checked={answers[index] === option} onChange={() => setAnswer(index, option)} />
        <span className="min-w-0 break-words">{option}</span>
      </label>)}
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t(question.options?.length ? 'Other answer' : 'Answer')}</span>
        <Input value={question.options?.includes(answers[index]) ? '' : answers[index]}
          placeholder={t('Type your answer')} onChange={(event) => setAnswer(index, event.target.value)} />
      </label>
    </fieldset>)}
    {reply?.error && <p role="alert" className="break-words text-destructive">{reply.error}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === 'sent' ? <span role="status">{t('Answer sent')}</span> : status === 'uncertain'
        ? <span role="status">{t('Delivery unconfirmed. Check the conversation before sending again.')}</span>
        : <Button type="submit" size="sm" disabled={disabled || answers.some((answer) => !answer.trim())}>
          {status === 'sending' && <Loader2 data-icon="inline-start" className="animate-spin" />}{t('Send answer')}
        </Button>}
    </div>
  </form>;
}
