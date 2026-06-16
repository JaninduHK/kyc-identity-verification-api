import type {
  KestrelConfig,
  VerifyIndividualParams,
  VerifyBusinessParams,
  VerifyResponse,
  SessionListParams,
  SessionListResponse,
  AMLScreenParams,
  AMLResult,
} from './types';

export class KestrelError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'KestrelError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, KestrelError.prototype);
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

type QueryValue = string | number | undefined;

export class Kestrel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  public readonly verify: {
    individual: (params: VerifyIndividualParams) => Promise<VerifyResponse>;
    business: (params: VerifyBusinessParams) => Promise<VerifyResponse>;
  };

  public readonly sessions: {
    get: (id: string) => Promise<VerifyResponse>;
    list: (params?: SessionListParams) => Promise<SessionListResponse>;
  };

  public readonly aml: {
    screen: (params: AMLScreenParams) => Promise<AMLResult>;
  };

  constructor(config: KestrelConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.kestrel.lk';
    this.timeout = config.timeout ?? 30000;

    this.verify = {
      individual: (params: VerifyIndividualParams): Promise<VerifyResponse> =>
        this.post<VerifyResponse>('/v1/verify/individual', params),
      business: (params: VerifyBusinessParams): Promise<VerifyResponse> =>
        this.post<VerifyResponse>('/v1/verify/business', params),
    };

    this.sessions = {
      get: (id: string): Promise<VerifyResponse> =>
        this.get<VerifyResponse>(`/v1/sessions/${encodeURIComponent(id)}`),
      list: (params?: SessionListParams): Promise<SessionListResponse> =>
        this.get<SessionListResponse>('/v1/sessions', {
          limit: params?.limit,
          offset: params?.offset,
        }),
    };

    this.aml = {
      screen: (params: AMLScreenParams): Promise<AMLResult> =>
        this.post<AMLResult>('/v1/aml/screen', params),
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeout);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new KestrelError('network_error', message, 0);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let body: ErrorBody = {};
      try {
        body = (await res.json()) as ErrorBody;
      } catch {
        body = {};
      }
      throw new KestrelError(
        body.error ?? 'http_error',
        body.message ?? res.statusText,
        res.status,
      );
    }

    return (await res.json()) as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    let url = path;
    if (query) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          search.append(key, String(value));
        }
      }
      const qs = search.toString();
      if (qs.length > 0) {
        url = `${path}?${qs}`;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }
}

export type {
  KestrelConfig,
  VerifyIndividualParams,
  VerifyBusinessParams,
  VerifyResponse,
  SessionListParams,
  SessionListResponse,
  AMLScreenParams,
  AMLResult,
} from './types';
export type { AMLHit } from './types';
