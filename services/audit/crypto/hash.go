// Package crypto provides hashing helpers for the audit hash chain.
package crypto

import (
	"crypto/sha256"
	"encoding/hex"
)

// SHA256Hex returns the lowercase hex-encoded SHA-256 digest of input.
func SHA256Hex(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}
