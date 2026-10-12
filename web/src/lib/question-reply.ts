/** Async questions are answered with ordinary user messages, not approval RPC responses. */
import { threadsStartTurn, threadsSteerTurn } from '@/generated/api/sdk.gen';
import { useTimelineStore } from '@/stores/timeline-store';
import { hasPendingApproval } from '@/stores/timeline-runtime';
import { useThreadPolicyStore } from '@/stores/thread-policy-store';
import { useModelStore } from '@/stores/model-store';
import { questionReplyKey, useQuestionReplyStore } from '@/stores/question-reply-store';
import { acceptTurnSubmission, captureTurnSubmission, rejectTurnSubmission } from './turn-submission';
import { getApiErrorMessage } from './api-error';

/** Checks conversation ownership and lifecycle; policy is observed separately by the form. */
export function canReplyToQuestion(threadId: string): boolean {
  const store = useTimelineStore.getState();
  const runtime = store.getThreadRuntime(threadId);
  return Boolean(store.threadId === threadId && runtime && runtime.hydrated &&
    runtime.openState === 'ready' && runtime.threadMode !== 'readOnly' &&
    !runtime.readOnlyReason && !runtime.deletedRemotely && !runtime.turnStartPending &&
    !hasPendingApproval(runtime) &&
    !Object.values(runtime.userInputRequests).some((request) => request.status === 'pending') &&
    (runtime.activeTurnId || !store.isThreadBusy(threadId)));
}

/** A lost acknowledgement must never silently retry or switch from steer to a new turn. */
export async function submitQuestionReply(threadId: string, itemId: string, text: string): Promise<boolean> {
  const key = questionReplyKey(threadId, itemId);
  const replies = useQuestionReplyStore.getState();
  if (!text.trim() || !canReplyToQuestion(threadId) ||
    useThreadPolicyStore.getState().pendingByThread[threadId]?.outcome === 'pending' ||
    (replies.replies[key] && replies.replies[key].status !== 'draft')) return false;
  const store = useTimelineStore.getState();
  const turnId = store.getThreadRuntime(threadId)?.activeTurnId;
  const input = [{ type: 'text' as const, text, text_elements: [] }];
  replies.update(key, { status: 'sending', error: undefined });
  let submission: ReturnType<typeof captureTurnSubmission> | undefined;
  try {
    if (turnId) {
      await threadsSteerTurn({ path: { threadId, turnId }, body: { input }, throwOnError: true, meta: { silent: true } });
    } else {
      store.addUserMessage(text);
      submission = captureTurnSubmission(threadId);
      const { modelOverride, effortOverride, serviceTierOverride } = useModelStore.getState();
      const { data } = await threadsStartTurn({
        path: { threadId },
        body: { input,
          ...(modelOverride && { model: modelOverride }),
          ...(effortOverride && { effort: effortOverride }),
          ...(serviceTierOverride !== undefined && { serviceTier: serviceTierOverride }),
        }, throwOnError: true, meta: { silent: true },
      });
      acceptTurnSubmission(submission, data);
    }
    replies.update(key, { status: 'sent' });
    return true;
  } catch (error) {
    if (submission) rejectTurnSubmission(submission, error);
    const status = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode) : 0;
    replies.update(key, {
      status: status >= 400 && status < 500 ? 'draft' : 'uncertain',
      error: getApiErrorMessage(error),
    });
    return false;
  }
}
