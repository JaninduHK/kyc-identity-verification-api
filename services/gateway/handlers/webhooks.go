package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/kestrel-tech/kyc/gateway/middleware"
)

// createWebhookRequest is the body for POST /v1/webhooks.
type createWebhookRequest struct {
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
}

// webhookResponse is the JSON representation of a registered webhook.
type webhookResponse struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Description *string   `json:"description,omitempty"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"createdAt"`
}

// validWebhookURL reports whether s is an absolute http(s) URL with a host.
func validWebhookURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// CreateWebhook handles POST /v1/webhooks, registering a client-scoped webhook.
func (h *Handler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	clientID, ok := middleware.ClientIDFromContext(r.Context())
	if !ok || clientID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing client identity")
		return
	}

	var req createWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must be valid JSON")
		return
	}
	if !validWebhookURL(req.URL) {
		writeError(w, http.StatusBadRequest, "invalid_request", "url must be an absolute http(s) URL")
		return
	}

	var resp webhookResponse
	err := h.Pool.QueryRow(r.Context(),
		`INSERT INTO webhooks (client_id, url, description)
		 VALUES ($1, $2, $3)
		 RETURNING id, url, description, active, created_at`,
		clientID, req.URL, nullable(req.Description),
	).Scan(&resp.ID, &resp.URL, &resp.Description, &resp.Active, &resp.CreatedAt)
	if err != nil {
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "insert webhook failed",
			slog.String("client_id", clientID),
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not register webhook")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

// ListWebhooks handles GET /v1/webhooks, returning the client's webhooks.
func (h *Handler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	clientID, ok := middleware.ClientIDFromContext(r.Context())
	if !ok || clientID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing client identity")
		return
	}

	rows, err := h.Pool.Query(r.Context(),
		`SELECT id, url, description, active, created_at
		 FROM webhooks
		 WHERE client_id = $1
		 ORDER BY created_at DESC`,
		clientID,
	)
	if err != nil {
		h.Logger.LogAttrs(r.Context(), slog.LevelError, "list webhooks failed",
			slog.String("client_id", clientID),
			slog.Any("error", err),
		)
		writeError(w, http.StatusInternalServerError, "internal_error", "could not list webhooks")
		return
	}
	defer rows.Close()

	webhooks := make([]webhookResponse, 0)
	for rows.Next() {
		var wh webhookResponse
		if err := rows.Scan(&wh.ID, &wh.URL, &wh.Description, &wh.Active, &wh.CreatedAt); err != nil {
			h.Logger.LogAttrs(r.Context(), slog.LevelError, "scan webhook row failed", slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, "internal_error", "could not read webhooks")
			return
		}
		webhooks = append(webhooks, wh)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "could not read webhooks")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"webhooks": webhooks})
}
