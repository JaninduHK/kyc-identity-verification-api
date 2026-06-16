// Command gateway is the public API edge for the Kestrel KYC platform. It
// handles authentication, rate limiting, and routing to the orchestrator.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kestrel-tech/kyc/gateway/config"
	"github.com/kestrel-tech/kyc/gateway/handlers"
	"github.com/kestrel-tech/kyc/gateway/middleware"
	"github.com/kestrel-tech/kyc/gateway/store"
)

func main() {
	if err := run(); err != nil {
		// Use a basic logger here since structured logging may not be set up
		// yet if configuration failed.
		slog.Error("gateway exited with error", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	startupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := store.NewPostgres(startupCtx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	rdb, err := store.NewRedis(cfg.RedisURL)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	h := handlers.New(pool, rdb, cfg, logger)

	router := chi.NewRouter()

	// Global middleware: recovery first (outermost) so it wraps everything,
	// then request logging.
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.Logging(logger))

	// Health and readiness probes are unauthenticated.
	router.Get("/health", h.Health)
	router.Get("/ready", h.Ready)

	// Authenticated and rate-limited API surface.
	router.Route("/v1", func(r chi.Router) {
		r.Use(middleware.APIKey(rdb, pool))
		r.Use(middleware.RateLimit(rdb))

		r.Post("/verify/individual", h.VerifyIndividual)
		r.Get("/sessions/{id}", h.GetSession)
		r.Get("/sessions", h.ListSessions)
		r.Get("/webhooks", h.ListWebhooks)
		r.Post("/webhooks", h.CreateWebhook)
	})

	srv := &http.Server{
		Addr:              ":" + cfg.GatewayPort,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Channel to surface ListenAndServe errors to the main goroutine.
	serverErr := make(chan error, 1)
	go func() {
		logger.Info("gateway listening", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Wait for a termination signal or a server error.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		return err
	case sig := <-stop:
		logger.Info("shutdown signal received", slog.String("signal", sig.String()))
	}

	// Graceful shutdown with a bounded timeout.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", slog.Any("error", err))
		return err
	}

	logger.Info("gateway stopped cleanly")
	return nil
}

// newLogger builds a JSON slog.Logger at the level named by the level string.
func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler).With(slog.String("service", "gateway"))
}
