// Phase 8 — react-pdf wrapper. Returns a Blob ready for triggerDownload().
//
// Kept separate from SummaryPdf.tsx so the JSX module can be tree-shaken
// when only the workbook / CSV / PPT exports are needed.

import { pdf } from '@react-pdf/renderer';
import { SummaryPdf, type SummaryPdfProps } from './SummaryPdf';

export async function renderSummaryPdf(props: SummaryPdfProps): Promise<Blob> {
  const doc = pdf(<SummaryPdf {...props} />);
  return doc.toBlob();
}
