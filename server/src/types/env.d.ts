declare namespace NodeJS {
  interface ProcessEnv {
    PORT: string,
    FILE_CONCURRENCY_PROCESS_LIMIT: string;
    OPENAI_API_KEY: string,
    OPENAI_EMBEDDING_MODEL: string,
    OPENAI_CHAT_MODEL: string,
  }
}
