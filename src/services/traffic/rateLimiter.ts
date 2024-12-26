interface RateLimit {
    count: number;
    firstRequest: number;
    lastRequest: number;
}

export class RateLimiter {
    private static instance: RateLimiter;
    private limits: Map<string, RateLimit>;
    private readonly windowMs: number;
    private readonly maxRequests: number;

    private constructor() {
        this.limits = new Map();
        this.windowMs = 60 * 1000; // 1 minute window
        this.maxRequests = 1000;   // Max 1000 requests per minute

        // Cleanup old entries every minute
        setInterval(() => this.cleanup(), 60 * 1000);
    }

    public static getInstance(): RateLimiter {
        if (!RateLimiter.instance) {
            RateLimiter.instance = new RateLimiter();
        }
        return RateLimiter.instance;
    }

    isRateLimited(key: string): boolean {
        const now = Date.now();
        const limit = this.limits.get(key);

        if (!limit) {
            this.limits.set(key, {
                count: 1,
                firstRequest: now,
                lastRequest: now
            });
            return false;
        }

        // Reset if window has passed
        if (now - limit.firstRequest > this.windowMs) {
            this.limits.set(key, {
                count: 1,
                firstRequest: now,
                lastRequest: now
            });
            return false;
        }

        // Update count and check limit
        limit.count++;
        limit.lastRequest = now;
        return limit.count > this.maxRequests;
    }

    getRateMetrics(key: string): RateMetrics {
        const limit = this.limits.get(key);
        if (!limit) {
            return {
                requestCount: 0,
                windowStart: Date.now(),
                requestsRemaining: this.maxRequests,
                isLimited: false
            };
        }

        return {
            requestCount: limit.count,
            windowStart: limit.firstRequest,
            requestsRemaining: Math.max(0, this.maxRequests - limit.count),
            isLimited: limit.count > this.maxRequests
        };
    }

    private cleanup() {
        const now = Date.now();
        for (const [key, limit] of this.limits.entries()) {
            if (now - limit.lastRequest > this.windowMs) {
                this.limits.delete(key);
            }
        }
    }
}

interface RateMetrics {
    requestCount: number;
    windowStart: number;
    requestsRemaining: number;
    isLimited: boolean;
}
