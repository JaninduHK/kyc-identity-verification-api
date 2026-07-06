package crypto

import "testing"

func TestSHA256Hex_KnownVector(t *testing.T) {
	// Well-known SHA-256 of the empty string.
	const emptyDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	if got := SHA256Hex(""); got != emptyDigest {
		t.Fatalf("SHA256Hex(\"\") = %q, want %q", got, emptyDigest)
	}

	// SHA-256("abc").
	const abcDigest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	if got := SHA256Hex("abc"); got != abcDigest {
		t.Fatalf("SHA256Hex(\"abc\") = %q, want %q", got, abcDigest)
	}
}

func TestSHA256Hex_Deterministic(t *testing.T) {
	if SHA256Hex("kestrel") != SHA256Hex("kestrel") {
		t.Fatal("SHA256Hex is not deterministic")
	}
	if SHA256Hex("a") == SHA256Hex("b") {
		t.Fatal("SHA256Hex produced a collision for distinct inputs")
	}
}
