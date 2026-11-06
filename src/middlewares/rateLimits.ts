import { rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Slows down password guessing. Only failed logins count, so someone who knows
// their password is never locked out by logging in often
export const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many failed logins. Try again in 15 minutes." },
});

// Stops one address from creating accounts in bulk
export const signupLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many signups from this address. Try again later." },
});

// Adding someone by email tells the owner whether that email has an account, so cap the
// failed tries (mostly "No account with that email"); real invites that work never count
export const inviteLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many failed invites. Try again later." },
});
