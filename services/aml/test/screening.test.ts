jest.mock('axios');
jest.mock('../src/str-report');
jest.mock('../src/monitoring');

import axios from 'axios';
import { screenIndividual, AMLProviderError } from '../src/screening';
import { generateSTRReport } from '../src/str-report';
import { alertComplianceOfficer } from '../src/monitoring';
import type { AMLScreenRequest } from '../src/models';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGenerate = generateSTRReport as jest.MockedFunction<
  typeof generateSTRReport
>;
const mockedAlert = alertComplianceOfficer as jest.MockedFunction<
  typeof alertComplianceOfficer
>;

const baseReq: AMLScreenRequest = {
  name: 'John Doe',
  country: 'LK',
  sessionId: 'sess-1',
};

function caResponse(hits: unknown[], id: number | string = 42): { data: unknown } {
  return { data: { content: { data: { id, hits } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGenerate.mockResolvedValue('str-reports/sess-1/STR.pdf');
  mockedAlert.mockResolvedValue(undefined);
});

describe('screenIndividual', () => {
  it('returns a clean completed result when there are no hits', async () => {
    mockedAxios.post.mockResolvedValue(caResponse([]));

    const result = await screenIndividual(baseReq);

    expect(result.status).toBe('completed');
    expect(result.match).toBe(false);
    expect(result.riskLevel).toBe('none');
    expect(result.requiresSTR).toBe(false);
    expect(result.searchId).toBe('42');
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('sends the key via Authorization header and enables monitoring', async () => {
    mockedAxios.post.mockResolvedValue(caResponse([]));

    await screenIndividual(baseReq);

    const [url, body, opts] = mockedAxios.post.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ];
    expect(url).not.toContain('api_key=');
    expect(opts.headers.Authorization).toBe('Token test-key');
    expect(body.is_monitored).toBe(true);
  });

  it('classifies a PEP hit as medium risk without requiring an STR', async () => {
    mockedAxios.post.mockResolvedValue(
      caResponse([{ doc: { name: 'Jane PEP' }, match_types: ['pep'] }])
    );

    const result = await screenIndividual(baseReq);

    expect(result.match).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.requiresSTR).toBe(false);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('generates an STR and alerts on a sanction match', async () => {
    mockedAxios.post.mockResolvedValue(
      caResponse([{ doc: { name: 'Bad Actor' }, match_types: ['sanction'] }])
    );

    const result = await screenIndividual(baseReq);

    expect(result.riskLevel).toBe('high');
    expect(result.requiresSTR).toBe(true);
    expect(result.strS3Key).toBe('str-reports/sess-1/STR.pdf');
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(mockedAlert).toHaveBeenCalledTimes(1);
    expect(result.strError).toBeUndefined();
  });

  it('keeps the match but flags strError when STR generation fails', async () => {
    mockedAxios.post.mockResolvedValue(
      caResponse([{ doc: { name: 'Bad Actor' }, match_types: ['sanction'] }])
    );
    mockedGenerate.mockRejectedValue(new Error('s3 down'));

    const result = await screenIndividual(baseReq);

    expect(result.requiresSTR).toBe(true);
    expect(result.match).toBe(true);
    expect(result.strS3Key).toBeUndefined();
    expect(result.strError).toBe('s3 down');
  });

  it('fails closed (throws) when the provider call fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('network'));

    await expect(screenIndividual(baseReq)).rejects.toBeInstanceOf(
      AMLProviderError
    );
  });
});
