jest.mock('axios');

import axios from 'axios';
import { runOnfidoDocumentCheck } from '../src/activities/document.activity';
import { runOnfidoBiometric } from '../src/activities/biometric.activity';
import { runAMLScreening } from '../src/activities/aml.activity';
import { runRiskScoring } from '../src/activities/risk.activity';
import type { DocumentCheckResult, BiometricResult, AMLResult, IPResult } from '../src/types';

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => jest.clearAllMocks());

describe('runOnfidoDocumentCheck', () => {
  it('maps the camelCase document response including the Onfido IDs', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        status: 'completed',
        result: 'clear',
        subResult: 'clear',
        extractedName: 'Nimal Perera',
        applicantId: 'applicant-1',
        documentId: 'doc-1',
        confidence: 1,
      },
    });

    const result = await runOnfidoDocumentCheck({
      sessionId: 's1',
      clientId: 'c1',
      nicImageBase64: 'img',
      country: 'LK',
    });

    expect(result.applicantId).toBe('applicant-1');
    expect(result.documentId).toBe('doc-1');
    expect(result.extractedName).toBe('Nimal Perera');
    expect(result.result).toBe('clear');
  });

  it('rethrows on transport failure so Temporal can retry', async () => {
    mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      runOnfidoDocumentCheck({ sessionId: 's1', clientId: 'c1', nicImageBase64: 'img', country: 'LK' }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});

describe('runOnfidoBiometric', () => {
  it('forwards the applicant/document IDs and maps the response', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { result: 'clear', faceMatch: true, similarityScore: 0.9, livenessPassed: true },
    });

    const result = await runOnfidoBiometric({
      sessionId: 's1',
      clientId: 'c1',
      nicImageBase64: 'img',
      country: 'LK',
      selfieBase64: 'selfie',
      applicantId: 'applicant-1',
      documentId: 'doc-1',
    });

    const body = (mockedAxios.post.mock.calls[0][1] ?? {}) as Record<string, unknown>;
    expect(body.applicantId).toBe('applicant-1');
    expect(body.documentId).toBe('doc-1');
    expect(result.faceMatch).toBe(true);
    expect(result.livenessPassed).toBe(true);
  });
});

describe('runAMLScreening', () => {
  it('captures strS3Key from the AML response', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { status: 'completed', match: true, riskLevel: 'high', requiresSTR: true, hits: [], strS3Key: 'str/x.pdf' },
    });

    const result = await runAMLScreening({ name: 'A', country: 'LK', sessionId: 's1' });
    expect(result.strS3Key).toBe('str/x.pdf');
    expect(result.riskLevel).toBe('high');
  });

  it('rethrows when the AML service fails closed (502)', async () => {
    mockedAxios.post.mockRejectedValue(new Error('502'));
    await expect(runAMLScreening({ name: 'A', country: 'LK', sessionId: 's1' })).rejects.toThrow('502');
  });
});

describe('runRiskScoring', () => {
  const inputs = {
    sessionId: 's1',
    document: {} as DocumentCheckResult,
    biometric: {} as BiometricResult,
    aml: {} as AMLResult,
    ip: {} as IPResult,
  };

  it('returns score and factors', async () => {
    mockedAxios.post.mockResolvedValue({ data: { score: 60, factors: ['document_result_consider'] } });
    const result = await runRiskScoring(inputs);
    expect(result.score).toBe(60);
    expect(result.factors).toContain('document_result_consider');
  });

  it('rethrows on failure so Temporal retries', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    await expect(runRiskScoring(inputs)).rejects.toThrow('500');
  });
});
