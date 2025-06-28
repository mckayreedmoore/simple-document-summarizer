const settingsSchema = {
  LOG_LEVEL: 'string',
  PORT: 'number',
  FILE_CONCURRENCY_PROCESS_LIMIT: 'number',
  DB_PATH: 'string',
  RAG_RELEVANT_CHUNK_COUNT: 'number',
  FILE_SIZE_MAX_MB: 'number',
  CONVERSATION_MAX_MB: 'number',

  OPENAI_API_KEY: 'string',
  OPENAI_EMBEDDING_MODEL: 'string',
  OPENAI_CHAT_MODEL: 'string',
} as const;

export default function validateEnv() {
  for (const key of Object.keys(settingsSchema) as Array<keyof typeof settingsSchema>) {
    const value = process.env[key];
    if (!value) {
      throw new Error(`${key} is required in environment variables.`);
    }
    if (settingsSchema[key] === 'number' && isNaN(Number(value))) {
      throw new Error(`${key} must be a number.`);
    }
  }
}
