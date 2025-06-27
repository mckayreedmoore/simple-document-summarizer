declare namespace NodeJS {
  interface ProcessEnv {
    PORT: string,
    FILE_CONCURRENCY_PROCESS_LIMIT: string;
    DB_PATH: string,

    OPENAI_API_KEY: string,
    OPENAI_EMBEDDING_MODEL: string,
    OPENAI_CHAT_MODEL: string,
  }
}
