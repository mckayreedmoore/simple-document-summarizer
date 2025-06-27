import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import validateEnv from './utilities/validateEnv';
import { logger } from './utilities/logger';
dotenv.config();
validateEnv();

import router from './api';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', router);

// Global error handler 
app.use(errorHandler);

function startServer(port: number = Number(process.env.PORT)) {
  app.listen(port, () => {
    logger.info(`Server running on port: ${port}`);
  });
}

if (require.main === module) {
  startServer();
}
