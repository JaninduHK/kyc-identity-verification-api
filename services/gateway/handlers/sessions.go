package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/kestrel-tech/kyc/gateway/middleware"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// sessionResponse is the JSON representation of a verification session,
// deliberately omitting any encrypted PII columns.
type sessionResponse struct {
	ID           string     `json:"id"`
	ClientID     string     `json:"clientId"`
	Status       string     `json:"status"`
	WorkflowType *string    `json:"workflowType,omitempty"`
	Country      *string    `json:"country,omitempty"`
	RiskScore    *float64   `json:"riskScore,omitempty"`
	Decision     *string    `json:"decision,omitempty"`
	CreatedAt    *time.Time `json:"createdAt,omitempty"`
}

// GetSession handles GET /v1/sessions/{id}, returning a single verification
// session scoped to the authenticated client.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "session id is required")
		return
	}

	clientID, ok := middleware.ClientIDFromContext(r.Context())
	if !ok || clientID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing client identity")
		return
	}

	var s sessionResponse
	err := h.Pool.QueryRow(r.Context(),
		`SELECT id, client_id, status, workflow_type, country, risk_score, decision, created_at
		 FROM verification_sessions
		 WHERE id=$1 AND client_id=$2`,
		id, clientID,
	).Scan(&s.ID, &s.ClientID, &s.Status, &s.WorkflowType, &s.Country, &s.RiskScore, &s.Decision, &s.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "verification session not found")
			return
		}
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "query session failed",
			slog.String("session_id", id),
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not load verification session")
		return
	}

	writeJSON(w, http.StatusOK, s)
}

// ListSessions handles GET /v1/sessions with ?limit and ?offset pagination,
// scoped to the authenticated client.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	clientID, ok := middleware.ClientIDFromContext(r.Context())
	if !ok || clientID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing client identity")
		return
	}

	limit := parseIntParam(r, "limit", defaultListLimit)
	if limit <= 0 || limit > maxListLimit {
		limit = defaultListLimit
	}
	offset := parseIntParam(r, "offset", 0)
	if offset < 0 {
		offset = 0
	}

	rows, err := h.Pool.Query(r.Context(),
		`SELECT id, client_id, status, workflow_type, country, risk_score, decision, created_at
		 FROM verification_sessions
		 WHERE client_id=$1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		clientID, limit, offset,
	)
	if err != nil {
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "list sessions failed",
			slog.String("client_id", clientID),
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not list verification sessions")
		return
	}
	defer rows.Close()

	sessions := make([]sessionResponse, 0, limit)
	for rows.Next() {
		var s sessionResponse
		if err := rows.Scan(&s.ID, &s.ClientID, &s.Status, &s.WorkflowType, &s.Country, &s.RiskScore, &s.Decision, &s.CreatedAt); err != nil {
			h.Logger.LogAttrs(r.Context(), slog.LevelError, "scan session row failed",
				slog.Any("error", err),
			)
			writeError(w, http.StatusInternalServerError, "internal_error", "could not read verification sessions")
			return
		}
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "iterate session rows failed",
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not read verification sessions")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
		"limit":    limit,
		"offset":   offset,
	})
}

// parseIntParam parses a query-string integer parameter, returning fallback on
// absence or parse error.
func parseIntParam(r *http.Request, name string, fallback int) int {
	v := r.URL.Query().Get(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
