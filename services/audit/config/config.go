// Package config loads and validates runtime configuration for the audit
// service. It fails fast when required values are missing.
package config

import (
	"fmt"
	"os"
)

// Config holds runtime configuration for the audit service.
type Config struct {
	AuditPort   string
	DatabaseURL string
	LogLevel    string
}

// Load reads configuration from the environment. It returns an error if a
// required value (DATABASE_URL) is missing so the caller can fail fast.
func Load() (*Config, error) {
	cfg := &Config{
		AuditPort:   getEnv("AUDIT_PORT", "8004"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
