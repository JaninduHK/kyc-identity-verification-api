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
      hits?: ComplyAdvantageHit[];
    };
  };
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

export async function screenIndividual(
  params: AMLScreenRequest
): Promise<AMLScreenResult> {
  try {
    const url = `${config.COMPLY_ADVANTAGE_URL}/searches?api_key=${config.COMPLY_ADVANTAGE_KEY}`;
    const { data } = await axios.post<ComplyAdvantageResponse>(url, {
      search_term: params.name,
      fuzziness: 0.7,
      filters: {
        types: ['sanction', 'pep', 'warning', 'adverse-media'],
      },
      client_ref: params.sessionId,
    });

    const hits = parseHits(data);
    const riskLevel = determineRiskLevel(hits);
    const sanctioned = hasSanction(hits);

    const result: AMLScreenResult = {
      match: hits.length > 0,
      riskLevel,
      requiresSTR: sanctioned,
      hits,
    };

    if (sanctioned) {
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
    }

    return result;
  } catch (err) {
    logger.error(
      { err, sessionId: params.sessionId },
      'AML screening failed'
    );
    return {
      match: false,
      riskLevel: 'none',
      requiresSTR: false,
      hits: [],
    };
  }
}
