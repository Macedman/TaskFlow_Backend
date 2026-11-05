import dotenv from 'dotenv';

dotenv.config();

// Only our frontend's browser pages may call the API; CORS_ORIGIN can list several, comma-separated.
// Shared by Express and the realtime socket server so the two can't drift apart
export const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4300').split(',').map(o => o.trim());
