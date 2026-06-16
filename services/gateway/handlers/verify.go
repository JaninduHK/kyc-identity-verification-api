// Package handlers contains the HTTP handlers for the gateway's public API.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kestrel-tech/kyc/gateway/config"
	"github.com/kestrel-tech/kyc/gateway/middleware"
)

// Handler bundles the dependencies shared by the gateway's HTTP handlers.
type Handler struct {
	Pool   *pgxpool.Pool
	Redis  *redis.Client
	Config *config.Config
	Logger *slog.Logger
}

// New constructs a Handler with the provided dependencies.
func New(pool *pgxpool.Pool, rdb *redis.Client, cfg *config.Config, logger *slog.Logger) *Handler {
	return &Handler{Pool: pool, Redis: rdb, Config: cfg, Logger: logger}
}

// verifyIndividualRequest is the request body for POST /v1/verify/individual.
type verifyIndividualRequest struct {
	NICImageBase64 string `json:"nicImageBase64"`
	SelfieBase64   string `json:"selfieBase64,omitempty"`
	WebhookURL     string `json:"webhookUrl,omitempty"`
	WorkflowType   string `json:"workflowType,omitempty"`
	Country        string `json:"country,omitempty"`
}

// orchestratorStartRequest is the payload sent to the orchestrator to kick off
// verification.
type orchestratorStartRequest struct {
	SessionID    string `json:"sessionId"`
	ClientID     string `json:"clientId"`
	WorkflowType string `json:"workflowType,omitempty"`
	Country      string `json:"country,omitempty"`
	WebhookURL   string `json:"webhookUrl,omitempty"`
}

// VerifyIndividual handles POST /v1/verify/individual. It validates the
// request, creates a verification session row, fires a fire-and-forget request
// to the orchestrator, and returns 202 with the new session ID.
func (h *Handler) VerifyIndividual(w http.ResponseWriter, r *http.Request) {
	var req verifyIndividualRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must be valid JSON")
		return
	}

	if req.NICImageBase64 == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "nicImageBase64 is required")
		return
	}

	clientID, ok := middleware.ClientIDFromContext(r.Context())
	if !ok || clientID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing client identity")
		return
	}

	sessionID := uuid.NewString()
	workflowType := req.WorkflowType
	if workflowType == "" {
		workflowType = "individual"
	}

	var country interface{}
	if req.Country != "" {
		country = req.Country
	}

	_, err := h.Pool.Exec(r.Context(),
		`INSERT INTO verification_sessions (id, client_id, status, workflow_type, country)
		 VALUES ($1, $2, $3, $4, $5)`,
		sessionID, clientID, "processing", workflowType, country,
	)
	if err != nil {
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "insert verification session failed",
			slog.String("session_id", sessionID),
			slog.String("client_id", clientID),
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not create verification session")
		return
	}

	// Fire-and-forget the orchestrator start request so the handler returns
	// quickly even if the orchestrator is slow or unavailable.
	h.startOrchestration(orchestratorStartRequest{
		SessionID:    sessionID,
		ClientID:     clientID,
		WorkflowType: workflowType,
		Country:      req.Country,
		WebhookURL:   req.WebhookURL,
	})

	writeJSON(w, http.StatusAccepted, map[string]string{
		"sessionId": sessionID,
		"status":    "processing",
	})
}

// startOrchestration POSTs the start request to the orchestrator in a
// background goroutine with a short timeout, logging but not surfacing errors.
func (h *Handler) startOrchestration(payload orchestratorStartRequest) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		body, err := json.Marshal(payload)
		if err != nil {
			h.Logger.LogAttrs(ctx, slog.LevelError, "marshal orchestrator payload failed",
				slog.String("session_id", payload.SessionID),
				slog.Any("error", err),
			)
			return
		}

		url := h.Config.OrchestratorURL + "/internal/verify/start"
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			h.Logger.LogAttrs(ctx, slog.LevelError, "build orchestrator request failed",
				slog.String("session_id", payload.SessionID),
				slog.Any("error", err),
			)
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Do(httpReq)
		if err != nil {
			h.Logger.LogAttrs(ctx, slog.LevelWarn, "orchestrator start request failed",
				slog.String("session_id", payload.SessionID),
				slog.Any("error", err),
			)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 300 {
			h.Logger.LogAttrs(ctx, slog.LevelWarn, "orchestrator start returned non-2xx",
				slog.String("session_id", payload.SessionID),
				slog.Int("status", resp.StatusCode),
			)
		}
	}()
}
