jest.mock('axios');

import crypto from 'node:crypto';
import axios from 'axios';
import {
  signPayload,
  backoffSeconds,
  deliverWebhook,
  RETRY_DELAYS,
} from '../src/webhook';
import { sweepOnce } from '../src/retry-worker';
import { FakeStore } from './fake-store';
import type { WebhookDelivery } from '../src/models';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const delivery: WebhookDelivery = {
  sessionId: 'sess-1',
  url: 'https://client.example/hook',
  payload: { decision: 'approved', riskScore: 10 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signPayload', () => {
  it('produces an HMAC-SHA256 of the body using the configured secret', () => {
    const body = JSON.stringify(delivery.payload);
    const expected = crypto
      .createHmac('sha256', 'test-secret')
      .update(body)
      .digest('hex');
    expect(signPayload(body)).toBe(expected);
  });
});

describe('backoffSeconds', () => {
  it('walks the retry schedule then gives up at the max', () => {
    expect(backoffSeconds(1, 5)).toBe(RETRY_DELAYS[0]); // after 1st attempt
    expect(backoffSeconds(2, 5)).toBe(RETRY_DELAYS[1]);
    expect(backoffSeconds(4, 5)).toBe(RETRY_DELAYS[3]);
    expect(backoffSeconds(5, 5)).toBeNull(); // exhausted
    expect(backoffSeconds(9, 5)).toBeNull();
  });
});

describe('deliverWebhook', () => {
  it('signs the request and marks delivered on 2xx', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const store = new FakeStore();

    const result = await deliverWebhook(delivery, store);

    expect(result.delivered).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.nextRetry).toBeUndefined();

    // Signature header is present and correct.
    const [, body, opts] = mockedAxios.post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    const expectedSig = crypto
      .createHmac('sha256', 'test-secret')
      .update(body)
      .digest('hex');
    expect(opts.headers['X-Kestrel-Signature']).toBe(`sha256=${expectedSig}`);

    // Persisted as delivered with no further retry.
    expect(store.records).toHaveLength(1);
    expect(store.records[0].delivered).toBe(true);
    expect(store.records[0].nextRetrySec).toBeNull();
  });

  it('schedules a retry and persists on a failure status', async () => {
    mockedAxios.post.mockResolvedValue({ status: 503 });
    const store = new FakeStore();

    const result = await deliverWebhook(delivery, store);

    expect(result.delivered).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.nextRetry).toBe(RETRY_DELAYS[0]);
    expect(store.records[0].delivered).toBe(false);
    expect(store.records[0].attempt).toBe(1);
    expect(store.records[0].nextRetrySec).toBe(RETRY_DELAYS[0]);
  });

  it('still returns a result when there is no store', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const result = await deliverWebhook(delivery, null);
    expect(result.delivered).toBe(true);
  });
});

describe('sweepOnce', () => {
  it('re-delivers a due webhook and marks it delivered', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const store = new FakeStore();
    store.dueRows = [
      { id: 'w1', sessionId: 'sess-1', url: delivery.url, payload: {}, attempt: 1 },
    ];

    const processed = await sweepOnce(store);

    expect(processed).toBe(1);
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0].args.delivered).toBe(true);
    expect(store.updates[0].args.attempt).toBe(2);
    expect(store.updates[0].args.nextRetrySec).toBeNull();
  });

  it('gives up (nextRetry null) once the max attempts are reached', async () => {
    mockedAxios.post.mockResolvedValue({ status: 500 });
    const store = new FakeStore();
    store.dueRows = [
      { id: 'w1', sessionId: 'sess-1', url: delivery.url, payload: {}, attempt: 4 },
    ];

    await sweepOnce(store);

    expect(store.updates[0].args.delivered).toBe(false);
    expect(store.updates[0].args.attempt).toBe(5);
    expect(store.updates[0].args.nextRetrySec).toBeNull();
  });
});
