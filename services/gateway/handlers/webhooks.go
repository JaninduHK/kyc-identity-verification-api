package handlers

import "net/http"

// ListWebhooks handles GET /v1/webhooks. It is currently a stub returning an
// empty collection.
func (h *Handler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"webhooks": []interface{}{},
	})
}

// CreateWebhook handles POST /v1/webhooks. It is currently a stub acknowledging
// the request.
func (h *Handler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "accepted",
		"message": "webhook registration is not yet implemented",
	})
}
