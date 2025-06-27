declare namespace NodeJS {
  interface ProcessEnv {
    OPENAI_API_KEY: string;
    FILE_CONCURRENCY_PROCESS_LIMIT: string;
  }
}
