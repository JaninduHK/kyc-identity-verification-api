# Third-Party Providers

Kestrel KYC integrates with several commercial APIs for document verification,
biometric checking, and AML screening. These providers are **not open
source** and require separate paid accounts. The table below summarises what
you need and approximately what it costs.

## Required Providers

| Provider          | Purpose                                       | Required For                        | Signup URL              | Approximate Cost                                   | Free Tier / Sandbox                          |
|-------------------|------------------------------------------------|--------------------------------------|--------------------------|-----------------------------------------------------|-----------------------------------------------|
| Onfido            | Document OCR + liveness + face match          | Document service + Biometric service | onfido.com               | ~$1.50–$3 per verification                          | Yes — sandbox available instantly             |
| ComplyAdvantage   | PEP + sanctions + adverse media screening     | AML service                          | complyadvantage.com      | From $500/month                                     | Yes — sandbox available within 24hrs          |
| AWS (S3 + KMS + Rekognition) | STR report storage + optional encryption + optional biometric fallback | AML service + Biometric service | aws.amazon.com | Pay per use (S3 ~$0.02/GB, KMS ~$1/10k requests)   | Yes — AWS free tier                           |
| MaxMind GeoIP2    | IP risk scoring + VPN detection               | Risk service                         | maxmind.com              | From $20/month                                      | Yes — GeoLite2 database is free               |
| Twilio            | SMS OTP verification                          | Notification service                 | twilio.com               | $0.05 per SMS                                       | Yes — trial account                           |
| SendGrid          | Transactional email (STR alerts etc.)         | Notification service                 | sendgrid.com             | Free up to 100 emails/day                           | Yes — free tier                               |

## Optional / Future Providers

| Provider                                                | Purpose                          | Required For           | Signup URL                                          | Approximate Cost         | Free Tier / Sandbox |
|----------------------------------------------------------|-----------------------------------|--------------------------|------------------------------------------------------|----------------------------|-----------------------|
| Sayari Analytics                                          | Business entity data for KYB     | Not yet implemented    | sayari.com                                            | Contact for pricing       | No                    |
| DRP (Sri Lanka Dept. of Registration of Persons)          | Live NIC database lookup         | Not yet implemented    | Requires institutional agreement with FIU             | Requires institutional agreement | No             |

## Running Without All Providers

Not every provider is a hard requirement for local development. Here's what
actually happens today if a given provider is left unconfigured, based on
the current code (not just the `.env.example` template):

- **Onfido** — required for real verification. The `document` and
  `biometric` services call Onfido directly using whatever token is in
  `ONFIDO_API_TOKEN`; there's no separate on/off flag. Get a free sandbox
  token instantly at onfido.com/signup and use it as-is (Onfido's own
  `api_sandbox.*` tokens keep you in test mode — there's no code-level
  toggle to set).
- **ComplyAdvantage** — required for AML. The `aml` service calls
  ComplyAdvantage directly via `COMPLY_ADVANTAGE_KEY`; without a valid
  (sandbox is fine) key, screening calls will fail. Sandbox access is free.
- **AWS** — used more narrowly than you might expect. Today, AWS is only
  touched by (1) the `aml` service, which uploads generated STR report PDFs
  to S3 (SSE-KMS encrypted if `AWS_KMS_KEY_ID` is set, otherwise plain
  AES256), and (2) the `biometric` service's *optional* Rekognition
  fallback, which is off by default (`REKOGNITION_ENABLED=false`) and only
  runs if you turn it on. Document and biometric verification through
  Onfido does **not** require AWS at all. If you do need the S3 path
  locally, see the LocalStack note below — it currently requires a small
  code change, since the S3 client doesn't yet read a custom endpoint.
- **MaxMind** — not actually wired into the code yet. The `risk` service's
  IP risk check currently uses a small built-in heuristic (datacenter/VPN IP
  ranges) rather than a real MaxMind lookup, so there's nothing to configure
  or skip today — treat the MaxMind row above as "where this would plug in,"
  not a working integration. Contributions welcome.
- **Twilio** — optional. If `TWILIO_SID`/`TWILIO_TOKEN` aren't set, the
  `notification` service logs a warning and skips sending the SMS rather
  than failing the request.
- **SendGrid** — required for STR/compliance email alerts. If
  `SENDGRID_API_KEY` isn't set, the `notification` service logs a warning
  and silently skips the email (the request itself won't error) — so
  compliance emails will quietly not go out. Get a free account to avoid
  this in any environment where those alerts matter.

## LocalStack for Local Development

AWS S3 can be pointed at [LocalStack](https://localstack.cloud/) instead of
real AWS for local development, avoiding AWS costs entirely for the STR
report upload path:

```bash
localstack start
```

Then set in `.env.local`:

```
AWS_ENDPOINT_URL=http://localhost:4566
```

Note: as of now, `services/aml/src/str-report.ts` constructs its `S3Client`
with only a `region`, so this variable isn't read yet — wiring it in is a
one-line change (`new S3Client({ region, endpoint: process.env.AWS_ENDPOINT_URL })`).
Until that lands, treat this as the intended pattern rather than a
currently-working toggle.
