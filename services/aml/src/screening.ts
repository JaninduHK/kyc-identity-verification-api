import axios from 'axios';
import { config, logger } from './config';
import type {
  AMLMatch,
  AMLScreenRequest,
  AMLScreenResult,
  RiskLevel,
} from './models';
import { generateSTRReport } from './str-report';
import { alertComplianceOfficer } from './monitoring';

interface ComplyAdvantageDoc {
  name?: string;
  media?: Array<{ url?: string }>;
}

interface ComplyAdvantageHit {
  doc?: ComplyAdvantageDoc;
  match_types?: string[];
}

interface ComplyAdvantageResponse {
  content?: {
    data?: {
      id?: number | string;
      hits?: ComplyAdvantageHit[];
    };
  };
}

/**
 * Raised when the upstream screening provider (ComplyAdvantage) fails. It
 * carries an HTTP 502 so the service fails *closed*: a screening we could not
 * complete must never look like a clean pass on a compliance-critical path.
 */
export class AMLProviderError extends Error {
  readonly statusCode = 502;
  constructor(message: string) {
    super(message);
    this.name = 'AMLProviderError';
  }
}

function hasSanction(hits: AMLMatch[]): boolean {
  return hits.some((hit) =>
    hit.matchTypes.some((type) => type.toLowerCase() === 'sanction')
  );
}

function determineRiskLevel(hits: AMLMatch[]): RiskLevel {
  if (hits.length === 0) {
    return 'none';
  }

  const allTypes = new Set<string>();
  for (const hit of hits) {
    for (const type of hit.matchTypes) {
      allTypes.add(type.toLowerCase());
    }
  }

  if (allTypes.has('sanction')) {
    return 'high';
  }
  if (allTypes.has('pep') || allTypes.has('warning')) {
    return 'medium';
  }
  if (allTypes.has('adverse-media')) {
    return 'low';
  }
  return 'none';
}

function parseHits(response: ComplyAdvantageResponse): AMLMatch[] {
  const rawHits = response.content?.data?.hits ?? [];
  return rawHits.map((hit) => {
    const sourceUrl = hit.doc?.media?.find((m) => Boolean(m.url))?.url;
    const result: AMLMatch = {
      name: hit.doc?.name ?? 'Unknown',
      matchTypes: hit.match_types ?? [],
    };
    if (sourceUrl) {
      result.sourceUrl = sourceUrl;
    }
    return result;
  });
}

// ComplyAdvantage authenticates via the Authorization header. Sending the key
// as a query param (the previous behaviour) leaks it into URLs, proxy logs and
// error traces.
function authHeader(): Record<string, string> {
  return { Authorization: `Token ${config.COMPLY_ADVANTAGE_KEY}` };
}

export async function screenIndividual(
  params: AMLScreenRequest
): Promise<AMLScreenResult> {
  let data: ComplyAdvantageResponse;
  try {
    const response = await axios.post<ComplyAdvantageResponse>(
      `${config.COMPLY_ADVANTAGE_URL}/searches`,
      {
        search_term: params.name,
        fuzziness: 0.7,
        filters: {
          types: ['sanction', 'pep', 'warning', 'adverse-media'],
        },
        client_ref: params.sessionId,
        // Register the search for ComplyAdvantage's native ongoing monitoring
        // so flagged subjects are re-screened as watchlists change.
        is_monitored: true,
      },
      { headers: authHeader() }
    );
    data = response.data;
  } catch (err) {
    // Fail closed: never fabricate a clean pass when we could not screen.
    logger.error(
      { err, sessionId: params.sessionId },
      'AML provider call failed'
    );
    throw new AMLProviderError('ComplyAdvantage screening request failed');
  }

  const hits = parseHits(data);
  const riskLevel = determineRiskLevel(hits);
  const sanctioned = hasSanction(hits);
  const searchId = data.content?.data?.id;

  const result: AMLScreenResult = {
    status: 'completed',
    match: hits.length > 0,
    riskLevel,
    requiresSTR: sanctioned,
    hits,
  };
  if (searchId !== undefined) {
    result.searchId = String(searchId);
  }

  if (sanctioned) {
    // A sanction match is the compliance-critical signal and must survive even
    // if STR generation/alerting fails — surface the failure via strError
    // rather than discarding the match.
    try {
      const strData: {
        sessionId: string;
        subjectName: string;
        dob?: string;
        country: string;
        matches: AMLMatch[];
      } = {
        sessionId: params.sessionId,
        subjectName: params.name,
        country: params.country,
        matches: hits,
      };
      if (params.dob) {
        strData.dob = params.dob;
      }

      const s3Key = await generateSTRReport(strData);
      result.strS3Key = s3Key;

      await alertComplianceOfficer({
        sessionId: params.sessionId,
        subjectName: params.name,
        s3Key,
      });
    } catch (err) {
      logger.error(
        { err, sessionId: params.sessionId },
        'STR generation/alert failed after sanction match'
      );
      result.strError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
