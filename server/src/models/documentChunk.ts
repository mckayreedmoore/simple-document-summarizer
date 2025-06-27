export interface DocumentChunk {
  id: number;
  docId: number;
  content: string;
  embedding?: number[];
}
