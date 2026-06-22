package handlers

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kestrel-tech/kyc/gateway/config"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestResolveWorkflowType(t *testing.T) {
	if got := resolveWorkflowType(""); got != "cdd" {
		t.Fatalf("empty workflow type: got %q want \"cdd\" (must satisfy DB CHECK)", got)
	}
	if got := resolveWorkflowType("edd"); got != "edd" {
		t.Fatalf("explicit workflow type: got %q want \"edd\"", got)
	}
}

func TestResolveCountry(t *testing.T) {
	if got := resolveCountry(""); got != "LK" {
		t.Fatalf("empty country: got %q want \"LK\" (NOT NULL column default)", got)
	}
	if got := resolveCountry("IN"); got != "IN" {
		t.Fatalf("explicit country: got %q want \"IN\"", got)
	}
}

func TestVerifyIndividualRejectsInvalidJSON(t *testing.T) {
	h := &Handler{Logger: discardLogger()}
	req := httptest.NewRequest(http.MethodPost, "/v1/verify/individual", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()

	h.VerifyIndividual(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status: got %d want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestVerifyIndividualRequiresNIC(t *testing.T) {
	h := &Handler{Logger: discardLogger()}
	req := httptest.NewRequest(http.MethodPost, "/v1/verify/individual", strings.NewReader(`{"country":"LK"}`))
	rec := httptest.NewRecorder()

	h.VerifyIndividual(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status: got %d want %d", rec.Code, http.StatusBadRequest)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["error"] != "invalid_request" {
		t.Fatalf("error code: got %q want \"invalid_request\"", body["error"])
	}
}

// TestStartOrchestrationForwardsPayload guards the core routing contract: the
// orchestrator's /internal/verify/start requires nicImageBase64 and country, so
// the gateway must forward them. A regression here silently breaks every
// verification.
func TestStartOrchestrationForwardsPayload(t *testing.T) {
	received := make(chan orchestratorStartRequest, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/verify/start" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		var payload orchestratorStartRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode payload: %v", err)
		}
		received <- payload
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	h := &Handler{
		Config: &config.Config{OrchestratorURL: srv.URL},
		Logger: discardLogger(),
	}

	h.startOrchestration(orchestratorStartRequest{
		SessionID:      "sess-1",
		ClientID:       "client-1",
		NICImageBase64: "base64nic",
		SelfieBase64:   "base64selfie",
		WorkflowType:   "cdd",
		Country:        "LK",
	})

	select {
	case got := <-received:
		if got.NICImageBase64 != "base64nic" {
			t.Errorf("nicImageBase64 not forwarded: got %q", got.NICImageBase64)
		}
		if got.SelfieBase64 != "base64selfie" {
			t.Errorf("selfieBase64 not forwarded: got %q", got.SelfieBase64)
		}
		if got.Country != "LK" {
			t.Errorf("country not forwarded: got %q", got.Country)
		}
		if got.WorkflowType != "cdd" {
			t.Errorf("workflowType not forwarded: got %q", got.WorkflowType)
		}
		if got.SessionID != "sess-1" || got.ClientID != "client-1" {
			t.Errorf("identity fields wrong: session=%q client=%q", got.SessionID, got.ClientID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for orchestrator start request")
	}
}
