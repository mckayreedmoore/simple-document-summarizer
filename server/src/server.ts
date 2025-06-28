import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import validateEnv from './utilities/validateEnv';

dotenv.config();
validateEnv();

import { logger } from './utilities/logger';
import { setupDatabase } from './utilities/db';
import router from './api';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', router);

// Global error handler
app.use(errorHandler);

async function startServer(port: number = Number(process.env.PORT)) {
  try {
    await setupDatabase();
    app.listen(port, () => {
      logger.info(`Server running on port: ${port}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
