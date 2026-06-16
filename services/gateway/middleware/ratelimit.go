package middleware

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	// rateLimitWindow is the sliding window over which requests are counted.
	rateLimitWindow = 60 * time.Second
	// defaultRateLimit is the maximum number of requests allowed per window.
	defaultRateLimit = 100
)

// RateLimit returns middleware enforcing a per-client sliding-window rate limit
// backed by a Redis sorted set. The window is 60s and the default limit is 100
// requests per window. The client is identified by the client ID stored in the
// request context by the APIKey middleware.
func RateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clientID, ok := ClientIDFromContext(r.Context())
			if !ok || clientID == "" {
				// No client identity; let auth middleware handle rejection.
				next.ServeHTTP(w, r)
				return
			}

			ctx := r.Context()
			now := time.Now()
			key := "ratelimit:" + clientID
			windowStart := now.Add(-rateLimitWindow).UnixNano()
			member := strconv.FormatInt(now.UnixNano(), 10) + ":" + uuid.NewString()

			pipe := rdb.TxPipeline()
			// Drop entries older than the window.
			pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStart, 10))
			// Record this request.
			pipe.ZAdd(ctx, key, redis.Z{Score: float64(now.UnixNano()), Member: member})
			// Count requests within the window.
			countCmd := pipe.ZCard(ctx, key)
			// Ensure the key expires so it does not linger for idle clients.
			pipe.Expire(ctx, key, rateLimitWindow+time.Second)

			if _, err := pipe.Exec(ctx); err != nil {
				// On Redis failure, fail open so a degraded limiter does not
				// take down the API edge.
				next.ServeHTTP(w, r)
				return
			}

			count := countCmd.Val()
			remaining := defaultRateLimit - count
			if remaining < 0 {
				remaining = 0
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(defaultRateLimit))
			w.Header().Set("X-RateLimit-Remaining", strconv.FormatInt(remaining, 10))
			w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(now.Add(rateLimitWindow).Unix(), 10))

			if count > defaultRateLimit {
				writeRateLimited(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// writeRateLimited writes a 429 JSON error response.
func writeRateLimited(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "rate_limited",
		"message": "rate limit exceeded, try again later",
	})
}
