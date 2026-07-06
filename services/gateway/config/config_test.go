package config

import "testing"

func TestLoadDerives32ByteEncryptKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("DATABASE_ENCRYPT_KEY", "any-secret-value-regardless-of-encoding")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(cfg.EncryptKey) != 32 {
		t.Fatalf("EncryptKey length: got %d want 32", len(cfg.EncryptKey))
	}
}

func TestLoadDeterministicKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("DATABASE_ENCRYPT_KEY", "stable-secret")

	a, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	b, _ := Load()
	if string(a.EncryptKey) != string(b.EncryptKey) {
		t.Fatal("key derivation is not deterministic")
	}
}

func TestLoadMissingRequired(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("DATABASE_ENCRYPT_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when required vars are missing")
	}
}
