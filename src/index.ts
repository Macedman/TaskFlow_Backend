import { createServer } from 'http';
import app from './app';
import { attachRealtime } from './realtime/realtime';
import { checkEnv } from './config/checkEnv';

// .env is already loaded by the imports above (config/db.ts)
checkEnv(process.env);

const port = process.env.PORT || 3000;

// One HTTP server for both the REST API (Express) and the realtime socket (Socket.IO)
const server = createServer(app);
attachRealtime(server);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
