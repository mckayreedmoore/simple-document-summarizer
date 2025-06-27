const settingsSchema = {
  OPENAI_API_KEY: 'string',
  FILE_CONCURRENCY_PROCESS_LIMIT: 'number',
} as const;

export default function validateEnv() {
  for (const key of Object.keys(settingsSchema) as Array<keyof typeof settingsSchema>) {
    const value = process.env[key];
    if (typeof value === 'undefined') {
      throw new Error(`${key} is required in environment variables.`);
    }
    if (settingsSchema[key] === 'number' && isNaN(Number(value))) {
      throw new Error(`${key} must be a number.`);
    }
  }
}
