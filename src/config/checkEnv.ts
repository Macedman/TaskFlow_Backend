type Env = Record<string, string | undefined>;

// Signs and checks every login token; a short one could be guessed by trying values offline
const MIN_JWT_SECRET_LENGTH = 32;

// Run once at startup. A missing or weak setting stops the server with a clear message in the
// host's logs, instead of the server starting and every login failing with a 500.
// Messages name the setting, never its value.
export const checkEnv = (env: Env) => {
    if (!env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set");
    }
    if (env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
    }
}
