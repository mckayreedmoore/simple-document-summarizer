import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import validateEnv from './utilities/validateEnv';
dotenv.config();
validateEnv();

import router from './api';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', router);

function startServer(port: number = Number(process.env.PORT)) {
  app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
  });
}

if (require.main === module) {
  startServer();
}
