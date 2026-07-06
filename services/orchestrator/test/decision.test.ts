import { baseDecision, eddDecision, shouldRunBiometric } from '../src/workflows/decision';
import type { AMLResult, BiometricResult } from '../src/types';

const cleanAml: AMLResult = {
  checkType: 'aml',
  provider: 'internal',
  status: 'completed',
  match: false,
  riskLevel: 'none',
  requiresSTR: false,
  hits: [],
};

const cleanBiometric: BiometricResult = {
  checkType: 'biometric',
  provider: 'onfido',
  status: 'completed',
  result: 'clear',
  faceMatch: true,
  similarityScore: 0.95,
  livenessPassed: true,
};

describe('baseDecision (CDD)', () => {
  it('approves low scores', () => {
    expect(baseDecision(0)).toBe('approved');
    expect(baseDecision(29)).toBe('approved');
  });
  it('sends mid scores to manual review', () => {
    expect(baseDecision(30)).toBe('manual_review');
    expect(baseDecision(70)).toBe('manual_review');
  });
  it('rejects high scores', () => {
    expect(baseDecision(71)).toBe('rejected');
    expect(baseDecision(100)).toBe('rejected');
  });
});

describe('eddDecision (EDD, stricter)', () => {
  it('approves only very low risk with clean AML + live biometric', () => {
    expect(eddDecision(10, { aml: cleanAml, biometric: cleanBiometric })).toBe('approved');
  });

  it('applies a stricter approval bar than CDD (15..29 → manual_review)', () => {
    // CDD would approve a score of 20; EDD escalates it.
    expect(baseDecision(20)).toBe('approved');
    expect(eddDecision(20, { aml: cleanAml, biometric: cleanBiometric })).toBe('manual_review');
  });

  it('rejects on a high AML risk / STR requirement even at low score', () => {
    expect(
      eddDecision(5, { aml: { ...cleanAml, match: true, riskLevel: 'high', requiresSTR: true }, biometric: cleanBiometric }),
    ).toBe('rejected');
  });

  it('escalates any AML match to manual review', () => {
    expect(
      eddDecision(5, { aml: { ...cleanAml, match: true, riskLevel: 'low' }, biometric: cleanBiometric }),
    ).toBe('manual_review');
  });

  it('escalates a non-clear or non-live biometric', () => {
    expect(
      eddDecision(5, { aml: cleanAml, biometric: { ...cleanBiometric, result: 'consider' } }),
    ).toBe('manual_review');
    expect(
      eddDecision(5, { aml: cleanAml, biometric: { ...cleanBiometric, livenessPassed: false } }),
    ).toBe('manual_review');
  });

  it('still rejects outright on very high score', () => {
    expect(eddDecision(90, { aml: cleanAml, biometric: cleanBiometric })).toBe('rejected');
  });
});

describe('shouldRunBiometric', () => {
  it('runs only with a selfie and both Onfido IDs', () => {
    expect(shouldRunBiometric({ selfieBase64: 'x' }, { applicantId: 'a', documentId: 'd' })).toBe(true);
  });
  it('skips without a selfie', () => {
    expect(shouldRunBiometric({}, { applicantId: 'a', documentId: 'd' })).toBe(false);
  });
  it('skips when the document produced no IDs', () => {
    expect(shouldRunBiometric({ selfieBase64: 'x' }, {})).toBe(false);
    expect(shouldRunBiometric({ selfieBase64: 'x' }, { applicantId: 'a' })).toBe(false);
  });
});
