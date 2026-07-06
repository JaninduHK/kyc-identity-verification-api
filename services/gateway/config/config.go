// Package config loads and validates the gateway service configuration from
// environment variables, failing fast when required values are missing.
package config

import (
	"crypto/sha256"
	"fmt"
	"os"
	"strings"
)

// Config holds all runtime configuration for the gateway service.
type Config struct {
	GatewayPort        string
	DatabaseURL        string
	RedisURL           string
	DatabaseEncryptKey string
	// EncryptKey is the 32-byte AES-256 key derived from DatabaseEncryptKey.
	EncryptKey      []byte
	OrchestratorURL string
	LogLevel        string
}

// Load reads configuration from environment variables, applying defaults and
// validating that required variables are present. It returns an error if any
// required variable is missing so the service can fail fast at startup.
func Load() (*Config, error) {
	cfg := &Config{
		GatewayPort:        getEnv("GATEWAY_PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		RedisURL:           os.Getenv("REDIS_URL"),
		DatabaseEncryptKey: os.Getenv("DATABASE_ENCRYPT_KEY"),
		OrchestratorURL:    getEnv("ORCHESTRATOR_URL", "http://orchestrator:3001"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.RedisURL == "" {
		missing = append(missing, "REDIS_URL")
	}
	if cfg.DatabaseEncryptKey == "" {
		missing = append(missing, "DATABASE_ENCRYPT_KEY")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}

	// Derive a fixed 32-byte AES-256 key from the configured secret via
	// SHA-256. This guarantees a valid key length regardless of how the secret
	// is encoded, so PII encryption can never fail at runtime on a
	// wrong-length key (the previous config validated nothing).
	sum := sha256.Sum256([]byte(cfg.DatabaseEncryptKey))
	cfg.EncryptKey = sum[:]

	return cfg, nil
}

// getEnv returns the value of the environment variable named by key, or the
// provided fallback if the variable is unset or empty.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
