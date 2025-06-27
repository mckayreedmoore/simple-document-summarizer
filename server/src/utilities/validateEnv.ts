const settingsSchema = {
  PORT: 'number',
  FILE_CONCURRENCY_PROCESS_LIMIT: 'number',
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
