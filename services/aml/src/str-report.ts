import PDFDocument from 'pdfkit';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config, logger } from './config';
import type { AMLMatch } from './models';

export interface STRReportData {
  sessionId: string;
  subjectName: string;
  dob?: string;
  country: string;
  matches: AMLMatch[];
}

const s3Client = new S3Client({ region: config.AWS_REGION });

function buildPdf(data: STRReportData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err: Error) => {
        reject(err);
      });

      doc.fontSize(18).text('SUSPICIOUS TRANSACTION REPORT', { align: 'center' });
      doc.moveDown();

      doc.fontSize(14).text('Section A — Reporting Entity');
      doc.fontSize(11).text('Kestrel Technologies (Pvt) Ltd');
      doc.text('FIU-Sri Lanka');
      doc.moveDown();

      doc.fontSize(14).text('Section B — Subject');
      doc.fontSize(11).text(`Name: ${data.subjectName}`);
      doc.text(`Date of Birth: ${data.dob ?? 'N/A'}`);
      doc.text(`Country: ${data.country}`);
      doc.text(`Session ID: ${data.sessionId}`);
      doc.moveDown();

      doc.fontSize(14).text('Section C — Match Details');
      doc.fontSize(11);
      if (data.matches.length === 0) {
        doc.text('No matches recorded.');
      } else {
        data.matches.forEach((match, index) => {
          doc.text(`${index + 1}. ${match.name}`);
          doc.text(`   Match Types: ${match.matchTypes.join(', ')}`);
          if (match.sourceUrl) {
            doc.text(`   Source: ${match.sourceUrl}`);
          }
        });
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function generateSTRReport(data: STRReportData): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `str-reports/${data.sessionId}/STR-${timestamp}.pdf`;

  try {
    const pdfBuffer = await buildPdf(data);

    const command = new PutObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: config.AWS_KMS_KEY_ID ? 'aws:kms' : 'AES256',
      ...(config.AWS_KMS_KEY_ID ? { SSEKMSKeyId: config.AWS_KMS_KEY_ID } : {}),
    });

    await s3Client.send(command);
    logger.info({ s3Key, sessionId: data.sessionId }, 'STR report uploaded');
    return s3Key;
  } catch (err) {
    logger.error(
      { err, sessionId: data.sessionId, s3Key },
      'Failed to generate or upload STR report'
    );
    throw err instanceof Error ? err : new Error(String(err));
  }
}
