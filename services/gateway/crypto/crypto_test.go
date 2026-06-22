package crypto

import (
	"bytes"
	"testing"
)

func testKey() []byte {
	// 32-byte AES-256 key.
	return []byte("0123456789abcdef0123456789abcdef")
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := testKey()
	plaintext := []byte("National Identity Card 200012345678V")

	encoded, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt: unexpected error: %v", err)
	}
	if encoded == "" {
		t.Fatal("Encrypt: empty ciphertext")
	}

	got, err := Decrypt(encoded, key)
	if err != nil {
		t.Fatalf("Decrypt: unexpected error: %v", err)
	}
	if !bytes.Equal(got, plaintext) {
		t.Fatalf("round trip mismatch: got %q want %q", got, plaintext)
	}
}

func TestEncryptNonceIsRandom(t *testing.T) {
	key := testKey()
	plaintext := []byte("same input")

	a, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt a: %v", err)
	}
	b, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt b: %v", err)
	}
	if a == b {
		t.Fatal("expected distinct ciphertexts for identical plaintext (random nonce)")
	}
}

func TestEncryptRejectsBadKeyLength(t *testing.T) {
	if _, err := Encrypt([]byte("x"), []byte("too short")); err != ErrInvalidKeyLength {
		t.Fatalf("Encrypt: got %v want ErrInvalidKeyLength", err)
	}
	if _, err := Decrypt("AAAA", []byte("too short")); err != ErrInvalidKeyLength {
		t.Fatalf("Decrypt: got %v want ErrInvalidKeyLength", err)
	}
}

func TestDecryptDetectsTamper(t *testing.T) {
	key := testKey()
	encoded, err := Encrypt([]byte("authentic"), key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	// Flip a byte near the end (within the ciphertext/tag region).
	corrupted := []byte(encoded)
	corrupted[len(corrupted)-2] ^= 0x01
	if _, err := Decrypt(string(corrupted), key); err == nil {
		t.Fatal("Decrypt: expected error on tampered ciphertext, got nil")
	}
}

func TestDecryptRejectsWrongKey(t *testing.T) {
	encoded, err := Encrypt([]byte("secret"), testKey())
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	wrong := []byte("ffffffffffffffffffffffffffffffff")
	if _, err := Decrypt(encoded, wrong); err == nil {
		t.Fatal("Decrypt: expected error with wrong key, got nil")
	}
}
