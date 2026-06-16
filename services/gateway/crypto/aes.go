// Package crypto provides symmetric encryption and hashing helpers used to
// protect PII at rest and to derive lookup hashes for API keys.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// ErrInvalidKeyLength is returned when an encryption key is not 32 bytes
// (AES-256).
var ErrInvalidKeyLength = errors.New("crypto: key must be 32 bytes for AES-256")

// Encrypt encrypts plaintext using AES-256-GCM with a random nonce and returns
// a base64-encoded string containing nonce||ciphertext. The key must be 32
// bytes.
func Encrypt(plaintext, key []byte) (string, error) {
	if len(key) != 32 {
		return "", ErrInvalidKeyLength
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypto: new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("crypto: read nonce: %w", err)
	}

	// Seal appends the ciphertext to nonce, producing nonce||ciphertext.
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt reverses Encrypt: it base64-decodes the input, splits the nonce from
// the ciphertext, and returns the decrypted plaintext. The key must be 32
// bytes.
func Decrypt(encoded string, key []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, ErrInvalidKeyLength
	}

	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("crypto: base64 decode: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return nil, errors.New("crypto: ciphertext too short")
	}

	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("crypto: gcm open: %w", err)
	}

	return plaintext, nil
}
