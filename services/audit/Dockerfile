FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download || true

COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /audit .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /audit /audit
EXPOSE 8004
ENTRYPOINT ["/audit"]
