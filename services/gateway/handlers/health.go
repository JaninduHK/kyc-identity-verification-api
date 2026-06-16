package handlers

import (
	"context"
	"net/http"
	"time"
)

// version is the reported service version.
const version = "0.1.0"

// Health handles GET /health and returns 200 immediately without touching any
// backing services. It is suitable for liveness probes.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "gateway",
		"version": version,
	})
}

// Ready handles GET /ready and verifies connectivity to Postgres and Redis. It
// returns 200 when both are reachable and 503 otherwise. It is suitable for
// readiness probes.
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.Pool.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status":  "not_ready",
			"message": "postgres unavailable",
		})
		return
	}

	if err := h.Redis.Ping(ctx).Err(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status":  "not_ready",
			"message": "redis unavailable",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ready",
	})
}
