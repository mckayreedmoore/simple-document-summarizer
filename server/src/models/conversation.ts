export interface Conversation {
  id: number;
  messages: { role: string; content: string }[];
  createdAt: string;
}
