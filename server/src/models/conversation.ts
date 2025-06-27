export interface Conversation {
  conversationId: number;
  messages: { role: string; content: string }[];
  createdAt: string;
}
