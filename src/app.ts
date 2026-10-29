import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/db';
import routes from './routes'

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());


// Routes
app.get('/', (req, res) => {
  res.send('Hello World!');
});

//Testing POSTGRES
app.get("/db", async (req, res) => {
  const result = await pool.query("SELECT current_database()");
  res.send(result.rows);
});

app.use(routes)

export default app;
