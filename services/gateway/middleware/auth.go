// Package middleware contains HTTP middleware for the gateway: panic recovery,
// request logging, API-key authentication, and rate limiting.
package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kestrel-tech/kyc/gateway/crypto"
)

// contextKey is an unexported type for context keys defined in this package to
// avoid collisions with keys defined in other packages.
type contextKey string

// clientIDKey is the context key under which the authenticated client ID is
// stored.
const clientIDKey contextKey = "client_id"

// apiKeyCacheTTL is how long a resolved API key result is cached in Redis.
const apiKeyCacheTTL = 5 * time.Minute

// ClientIDFromContext returns the authenticated client ID stored in ctx, if
// any.
func ClientIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(clientIDKey).(string)
	return id, ok
}

// WithClientID returns a copy of ctx carrying the provided client ID.
func WithClientID(ctx context.Context, clientID string) context.Context {
	return context.WithValue(ctx, clientIDKey, clientID)
}

// cachedKey is the JSON shape stored in Redis for a resolved API key.
type cachedKey struct {
	ClientID string `json:"client_id"`
	Revoked  bool   `json:"revoked"`
}

// APIKey returns middleware that authenticates requests using an API key. The
// key may be supplied via the X-API-Key header or an "Authorization: Bearer
// <key>" header. The key is SHA-256 hashed (hex) and looked up first in Redis
// (cache) and then in Postgres, caching the result for subsequent requests.
func APIKey(rdb *redis.Client, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawKey := extractAPIKey(r)
			if rawKey == "" {
				writeUnauthorized(w, "missing API key")
				return
			}

			hash := crypto.SHA256Hex(rawKey)
			ctx := r.Context()

			resolved, err := resolveAPIKey(ctx, rdb, pool, hash)
			if err != nil {
				writeUnauthorized(w, "invalid API key")
				return
			}
			if resolved.Revoked {
				writeUnauthorized(w, "API key has been revoked")
				return
			}

			ctx = WithClientID(ctx, resolved.ClientID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractAPIKey pulls the API key from the X-API-Key header or a Bearer token.
func extractAPIKey(r *http.Request) string {
	if k := strings.TrimSpace(r.Header.Get("X-API-Key")); k != "" {
		return k
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(auth) > len(prefix) && strings.EqualFold(auth[:len(prefix)], prefix) {
		return strings.TrimSpace(auth[len(prefix):])
	}
	return ""
}

// resolveAPIKey resolves an API key hash to its client ID and revocation
// status, consulting Redis first and falling back to Postgres on a cache miss.
func resolveAPIKey(ctx context.Context, rdb *redis.Client, pool *pgxpool.Pool, hash string) (cachedKey, error) {
	cacheKey := "apikey:" + hash

	if rdb != nil {
		if data, err := rdb.Get(ctx, cacheKey).Bytes(); err == nil {
			var ck cachedKey
			if json.Unmarshal(data, &ck) == nil {
				return ck, nil
			}
		}
	}

	var ck cachedKey
	err := pool.QueryRow(ctx,
		`SELECT client_id, revoked FROM api_keys WHERE key_hash=$1`,
		hash,
	).Scan(&ck.ClientID, &ck.Revoked)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return cachedKey{}, errors.New("api key not found")
		}
		return cachedKey{}, err
	}

	if rdb != nil {
		if data, mErr := json.Marshal(ck); mErr == nil {
			// Best-effort cache write; ignore failures.
			_ = rdb.Set(ctx, cacheKey, data, apiKeyCacheTTL).Err()
		}
	}

	return ck, nil
}

// writeUnauthorized writes a 401 JSON error response.
func writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "unauthorized",
		"message": message,
	})
}
