/** Session-only drafts survive transcript virtualization without persisting private answers. */
import { create } from 'zustand';

export interface QuestionReply {
  answers: Record<number, string>;
  status: 'draft' | 'sending' | 'sent' | 'uncertain';
  error?: string;
}

interface QuestionReplyState {
  replies: Record<string, QuestionReply>;
  update: (key: string, patch: Partial<QuestionReply>) => void;
}

export const questionReplyKey = (threadId: string, itemId: string) =>
  JSON.stringify([threadId, itemId]);

export const useQuestionReplyStore = create<QuestionReplyState>((set) => ({
  replies: {},
  update: (key, patch) => set((state) => ({
    replies: {
      ...state.replies,
      [key]: { ...(state.replies[key] ?? { answers: {}, status: 'draft' }), ...patch },
    },
  })),
}));
