package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		xff        string
		remoteAddr string
		want       string
	}{
		{"xff first hop", "203.0.113.5, 10.0.0.1", "10.0.0.1:9999", "203.0.113.5"},
		{"remoteaddr with port", "", "192.0.2.7:1234", "192.0.2.7"},
		{"skips invalid xff entries", "garbage, 198.51.100.9", "10.0.0.1:1", "198.51.100.9"},
		{"invalid everything", "nope", "not-an-addr", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/verify/individual", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.xff != "" {
				req.Header.Set("X-Forwarded-For", tt.xff)
			}
			if got := clientIP(req); got != tt.want {
				t.Fatalf("clientIP = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidWebhookURL(t *testing.T) {
	valid := []string{"https://client.example/hook", "http://localhost:8080/cb"}
	invalid := []string{"", "ftp://x/y", "not a url", "http://", "/relative/only"}
	for _, u := range valid {
		if !validWebhookURL(u) {
			t.Errorf("expected %q to be valid", u)
		}
	}
	for _, u := range invalid {
		if validWebhookURL(u) {
			t.Errorf("expected %q to be invalid", u)
		}
	}
}

func TestNullable(t *testing.T) {
	if nullable("") != nil {
		t.Fatal("empty string should map to nil (SQL NULL)")
	}
	if nullable("x") != "x" {
		t.Fatal("non-empty string should pass through")
	}
}
