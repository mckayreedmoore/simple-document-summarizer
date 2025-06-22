import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());

function startServer(port: number = Number(process.env.PORT) || 5000) { 
    app.listen(port, () => {
        console.log(`Server running on port: ${port}`);
    });
}

if (require.main === module) {
    startServer();
}
