export interface File {
  fileId: number;
  fileName: string;
}

export interface FileChunk {
  fileChunkId: number;
  fkFileId: number;
  chunkIndex: number;
  content: string;
}

export interface FileVector {
  fileVectorId: number;
  embedding: string;
  fkChunkId: number;
}
