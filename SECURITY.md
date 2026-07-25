# Security Policy

Kestrel is a KYC platform that processes identity documents, biometric data, and
other personally identifiable information (PII). We take the security of this
platform seriously and appreciate the efforts of security researchers who help
us keep it safe.

## Supported Versions

Kestrel is early-stage and does not yet maintain multiple release branches.
Only the latest commit on `main` is supported with security updates.

| Version         | Supported          |
| --------------- | ------------------- |
| `main` (latest) | :white_check_mark:  |
| Older commits   | :x:                  |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Public issues are visible to everyone, and for a platform handling identity
documents and biometric data, premature disclosure can put real users at risk.

Instead, report vulnerabilities privately by emailing:

**security@kestrel.io**

Please include as much detail as possible: affected component, steps to
reproduce, potential impact, and any proof-of-concept code.

- **Acknowledgement:** we will acknowledge receipt of your report within
  **48 hours**.
- **Resolution:** we aim to resolve confirmed vulnerabilities within
  **30 days** of acknowledgement, and will keep you updated on progress.
- **Responsible disclosure:** we follow a responsible disclosure process and
  will not pursue legal action against security researchers who report
  vulnerabilities in good faith, avoid privacy violations and data
  destruction, and give us a reasonable opportunity to fix the issue before
  any public disclosure.

## What We Consider a Security Issue

We are especially interested in reports involving:

- **Authentication bypass** — circumventing or forging API key validation
- **PII data exposure** — unencrypted NIC numbers, names, or biometric data
  at rest, in transit, or in logs
- **Audit log tampering** — any way to bypass or break the immutability of
  the hash-chained audit log
- **Injection attacks** — SQL injection, command injection, and similar
- **Insecure direct object references (IDOR)** — accessing another client's
  sessions, documents, or verification results
- **JWT vulnerabilities** — algorithm confusion attacks, weak or missing
  signature verification, insecure key handling
- **Rate limiting bypass**
- **Webhook signature bypass** — forging or replaying webhook payloads
  without a valid signature

## What Is Out Of Scope

- Attacks that require physical access to our servers or infrastructure
- Social engineering of Kestrel staff, contractors, or users
- Vulnerabilities in third-party providers we integrate with (e.g. Onfido,
  ComplyAdvantage) — please report those directly to the provider
- Issues in dependencies that have already been publicly disclosed (e.g. a
  known CVE in an npm or PyPI package) — please open a normal GitHub issue
  for these instead of a private report

## Bug Bounty

We do not currently run a formal bug bounty program or offer monetary
rewards. We do, however, gratefully credit researchers who report valid
vulnerabilities in good faith in our release notes and in a `CREDITS` file,
unless you prefer to remain anonymous.

## Encryption and Data Handling

- All PII (including NIC numbers, names, and other identity data) is
  encrypted at rest using **AES-256-GCM**.
- Audit logs are tamper-evident, using a **SHA-256 hash chain** so that any
  modification to a past entry is detectable.
- API keys are never stored in plaintext — only their **SHA-256 hashes**
  are persisted.

Thank you for helping keep Kestrel and the people whose data it processes
safe.
