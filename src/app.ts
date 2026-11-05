import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes'
import { allowedOrigins } from './config/cors';

dotenv.config();

const app = express();

// Behind a hosting proxy (Render), the client's address is in X-Forwarded-For. Only trust it there:
// locally anyone could send that header and pretend to be a new address to dodge the rate limits
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Middlewares
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());


// Routes
// Health check (the host can poll this); the old GET /db debug route is gone
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use(routes)

export default app;
