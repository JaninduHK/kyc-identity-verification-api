# @kestrel/sdk

Official Kestrel KYC JavaScript/TypeScript SDK.

## Install

```bash
npm install @kestrel/sdk
```

Requires Node.js 18+ (uses the built-in `fetch` and `AbortController`).

## Quick start

```ts
import { Kestrel } from '@kestrel/sdk';

const k = new Kestrel({ apiKey: '...' });

const r = await k.verify.individual({ nicImageBase64: '...' });
console.log(r.sessionId, r.status);
```

## More examples

```ts
// Business verification
const biz = await k.verify.business({
  registrationNumber: 'PV-12345',
  companyName: 'Acme (Pvt) Ltd',
  country: 'LK',
});

// Fetch a session
const session = await k.sessions.get(r.sessionId);

// List sessions
const list = await k.sessions.list({ limit: 20, offset: 0 });

// AML screening
const aml = await k.aml.screen({ name: 'John Doe', country: 'LK' });
if (aml.requiresSTR) {
  console.log('Suspicious Transaction Report required');
}
```

## Configuration

```ts
const k = new Kestrel({
  apiKey: '...',
  baseUrl: 'https://api.kestrel.lk', // optional, this is the default
  timeout: 30000, // optional, milliseconds, default 30000
});
```

## Error handling

All non-2xx responses and network failures throw a `KestrelError` carrying a
machine-readable `code` and the HTTP `status` (0 for network errors).

```ts
import { Kestrel, KestrelError } from '@kestrel/sdk';

const k = new Kestrel({ apiKey: '...' });

try {
  await k.verify.individual({ nicImageBase64: '...' });
} catch (err) {
  if (err instanceof KestrelError) {
    console.error(`[${err.code}] (${err.status}): ${err.message}`);
  } else {
    throw err;
  }
}
```

## License

MIT
