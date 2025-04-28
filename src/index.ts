import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/db';
import routes from './routes'

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.use(routes)