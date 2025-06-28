declare namespace NodeJS {
  interface ProcessEnv {
    LOG_LEVEL: string;
    PORT: string;
    FILE_CONCURRENCY_PROCESS_LIMIT: string;
    DB_PATH: string;
    RAG_RELEVANT_CHUNK_COUNT: string;
    FILE_SIZE_MAX_MB: string;
    CONVERSATION_SIZE_MAX_MB: string;

    OPENAI_API_KEY: string;
    OPENAI_EMBEDDING_MODEL: string;
    OPENAI_CHAT_MODEL: string;
  }
}
