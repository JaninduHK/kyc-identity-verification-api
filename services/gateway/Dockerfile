# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git for module resolution if needed.
RUN apk add --no-cache git

# Copy module manifests first to leverage layer caching.
COPY go.mod go.sum ./

# go.sum may be empty on first build; tidy populates it, then download caches
# the dependencies.
RUN go mod download || true

# Copy the rest of the source.
COPY . .

# Ensure go.sum is complete, then build a static binary.
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /gateway .

# ---- Runtime stage ----
FROM gcr.io/distroless/static-debian12

COPY --from=builder /gateway /gateway

EXPOSE 8080

ENTRYPOINT ["/gateway"]
