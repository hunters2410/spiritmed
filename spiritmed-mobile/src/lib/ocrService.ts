/**
 * ocrService.ts
 * On-device OCR using @react-native-ml-kit/text-recognition.
 * Falls back gracefully if ML Kit is not available (e.g., running in Expo Go).
 *
 * Features:
 * - extractTextFromImage: reads visible text from a photo URI
 * - suggestFileNameFromOCR: parses common medical document keywords from text
 *   and returns a descriptive suggested filename (e.g., "Lab_Report_2026.pdf")
 */

// ML Kit text recognition — only available in a development/native build
// Wrapped in try-catch so the module gracefully degrades in Expo Go
let TextRecognition: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TextRecognition = require('@react-native-ml-kit/text-recognition').default;
} catch (_) {
  // Not available in Expo Go — OCR will be skipped
}

export interface OcrResult {
  text: string;
  available: boolean;  // false when ML Kit is not available
}

/**
 * Extracts text from an image URI using on-device ML Kit OCR.
 * Returns an empty string (with available=false) if ML Kit is not installed.
 */
export async function extractTextFromImage(uri: string): Promise<OcrResult> {
  if (!TextRecognition) {
    return { text: '', available: false };
  }

  try {
    const result = await TextRecognition.recognize(uri);
    return { text: result.text || '', available: true };
  } catch (e) {
    console.warn('[ocrService] OCR failed:', e);
    return { text: '', available: true };
  }
}

/** Medical document keyword → filename pattern mappings */
const MEDICAL_KEYWORDS: Array<{ patterns: RegExp[]; name: string }> = [
  { patterns: [/x[\s-]?ray/i, /radiograph/i, /radiology/i], name: 'X-Ray_Report' },
  { patterns: [/lab\s*report/i, /laboratory/i, /blood\s*test/i, /haematology/i, /haemoglobin/i], name: 'Lab_Report' },
  { patterns: [/prescription/i, /prescribed/i, /rx\b/i], name: 'Prescription' },
  { patterns: [/discharge\s*summ/i, /discharge\s*note/i], name: 'Discharge_Summary' },
  { patterns: [/referral/i, /refer\s*to/i], name: 'Referral_Letter' },
  { patterns: [/consent/i, /informed\s*consent/i], name: 'Consent_Form' },
  { patterns: [/diagnosis/i, /diagnostic/i, /impression:/i], name: 'Diagnosis_Report' },
  { patterns: [/invoice/i, /receipt/i, /bill\s*to/i, /total\s*amount/i], name: 'Invoice' },
  { patterns: [/ecg/i, /electrocardiogram/i, /echocardiogram/i], name: 'ECG_Report' },
  { patterns: [/scan/i, /ultrasound/i, /mri/i, /ct\s*scan/i, /computed\s*tomography/i], name: 'Scan_Report' },
  { patterns: [/vaccination/i, /immunisation/i, /vaccine/i], name: 'Vaccination_Record' },
  { patterns: [/operation\s*note/i, /surgical/i, /operative\s*report/i], name: 'Surgical_Report' },
];

/**
 * Parses OCR text and suggests a smart medical document filename.
 * Example: "Lab Report" found → "Lab_Report_2026.pdf"
 */
export function suggestFileNameFromOCR(ocrText: string): string | null {
  if (!ocrText || ocrText.trim().length < 5) return null;

  for (const { patterns, name } of MEDICAL_KEYWORDS) {
    for (const pattern of patterns) {
      if (pattern.test(ocrText)) {
        const year = new Date().getFullYear();
        return `${name}_${year}.pdf`;
      }
    }
  }

  return null;
}

/**
 * Extracts a patient name hint from OCR text.
 * Looks for "Patient:" or "Name:" prefix lines.
 */
export function extractPatientNameHint(ocrText: string): string | null {
  const lines = ocrText.split('\n');
  for (const line of lines) {
    const match = line.match(/(?:patient|name)\s*[:\-]\s*(.+)/i);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim().replace(/[^a-zA-Z\s]/g, '').trim();
    }
  }
  return null;
}
