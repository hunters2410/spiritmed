import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Consultation, OperationReport } from '../types';
import { supabase } from '../lib/supabase';

// Safely shares or prints the generated PDF
async function safeSharePdf(tempUri: string, filename: string, html: string): Promise<string> {
  const cleanName = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  // ALWAYS use cacheDirectory so Android FileProvider grants read permission to WhatsApp, Drive, Gmail, etc.
  const cacheDir = FileSystem.cacheDirectory || '';
  const targetUri = `${cacheDir}${cleanName}_${Date.now()}.pdf`;

  let shareUri = tempUri;
  try {
    await FileSystem.copyAsync({
      from: tempUri,
      to: targetUri,
    });
    shareUri = targetUri;
  } catch (copyErr) {
    shareUri = tempUri;
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    try {
      await Sharing.shareAsync(shareUri, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Share PDF Report (WhatsApp, Email, Drive...)',
      });
      return shareUri;
    } catch (shareErr) {
      console.warn('Sharing.shareAsync failed with targetUri, attempting direct tempUri...', shareErr);
      try {
        await Sharing.shareAsync(tempUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share PDF Report',
        });
        return tempUri;
      } catch (fallbackErr) {
        console.warn('Sharing.shareAsync failed, falling back to Print.printAsync:', fallbackErr);
        await Print.printAsync({ html });
        return shareUri;
      }
    }
  } else {
    await Print.printAsync({ html });
    return shareUri;
  }
}

// Helper to strip HTML tags and decode entities
function cleanText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface BranchBranding {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_url?: string;
}

async function fetchBranchInfo(branchId?: string): Promise<BranchBranding> {
  const defaultBranding: BranchBranding = {
    name: 'UROCARE CLINIC',
    address: '27 Harvey Brown Av, Harare',
    phone: '+263772242308',
    email: 'urocare01@gmail.com',
    logo_url: '',
  };

  try {
    if (branchId) {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .maybeSingle();

      if (data) {
        return {
          name: data.name || defaultBranding.name,
          address: data.address || defaultBranding.address,
          phone: data.phone || defaultBranding.phone,
          email: data.email || defaultBranding.email,
          logo_url: data.logo_url || '',
        };
      }
    }
  } catch (e) {
    // fallback
  }

  return defaultBranding;
}

function formatDateDisplay(d?: string | null): string {
  if (!d) return 'N/A';
  try {
    const date = new Date(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return d;
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 1. DOWNLOAD / SHARE CONSULTATION PDF
 * Structure matches ConsultationPrintView (Screenshot 1, without signature)
 * ─────────────────────────────────────────────────────────────
 */
export async function downloadConsultationPDF(consultation: Consultation): Promise<string> {
  const branch = await fetchBranchInfo(consultation.branch_id);
  const patient = consultation.patient;

  const todayStr = formatDateDisplay(new Date().toISOString());
  const visitDateStr = formatDateDisplay(consultation.created_at || consultation.follow_up_date || new Date().toISOString());
  const consultationIdShort = consultation.id ? consultation.id.slice(0, 8) : 'N/A';

  const cleanDiag = cleanText(consultation.diagnosis);
  const cleanComplaint = cleanText(consultation.chief_complaint);
  const cleanExam = cleanText(consultation.physical_examination);
  const cleanHistory = cleanText(consultation.medical_history);
  const cleanInvest = cleanText(consultation.investigations);
  const cleanPlan = cleanText(consultation.treatment_plan);

  // Build Prescriptions sub-list if present
  let rxHtml = '';
  if (consultation.prescriptions && consultation.prescriptions.length > 0) {
    rxHtml = `
      <div style="margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 6px;">
        <div style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Medications Prescribed:</div>
        ${consultation.prescriptions
          .map(
            (rx, i) => `
          <div style="font-size: 10.5px; color: #1e293b; margin-bottom: 3px;">
            <b>${i + 1}. ${rx.medicine_name}</b> ${rx.dosage ? `(${rx.dosage})` : ''} - ${rx.period || ''} ${rx.time_unit ? `• ${rx.time_unit}` : ''} ${rx.advice ? `<span style="color: #64748b;">[${cleanText(rx.advice)}]</span>` : ''}
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CONSULTATION_${patient?.full_name || 'Patient'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1f2937;
      background-color: #ffffff;
      font-size: 11px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .logo-box {
      display: flex;
      flex-direction: column;
    }
    .brand-logo-text {
      font-size: 26px;
      font-weight: 800;
      color: #374151;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .brand-gold {
      color: #b45309;
    }
    .brand-tagline {
      font-size: 7.5px;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .header-right {
      text-align: right;
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.35;
    }
    .clinic-name {
      font-size: 12px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .doc-title-bar {
      text-align: center;
      margin: 16px 0 20px 0;
    }
    .doc-title {
      font-size: 13px;
      font-weight: 700;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
      padding: 5px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #4b5563;
      margin: 0;
    }
    .grid-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 18px;
      font-size: 10.5px;
    }
    .meta-col-left {
      flex: 1;
    }
    .meta-col-right {
      flex: 1;
      text-align: right;
    }
    .meta-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }
    .patient-name {
      font-size: 12.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #111827;
      margin-bottom: 1px;
    }
    .meta-line {
      color: #374151;
      margin-bottom: 1px;
    }
    .section-card {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background-color: #ffffff;
    }
    .section-tag {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .section-content {
      font-size: 10.5px;
      color: #374151;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .bottom-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background-color: #1f2937;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="logo-box">
      ${
        branch.logo_url
          ? `<img src="${branch.logo_url}" style="height: 48px; width: auto;" alt="Logo" />`
          : `
          <div class="brand-logo-text">
            <span>uro</span><span class="brand-gold">⬡</span><span class="brand-gold">care</span>
          </div>
          <div class="brand-tagline">UROLOGY & MEN'S HEALTH CLINIC</div>
          `
      }
    </div>
    <div class="header-right">
      <div class="clinic-name">${branch.name}</div>
      <div>${branch.address}</div>
      <div>Phone: ${branch.phone}</div>
      <div>Email: ${branch.email}</div>
      <div style="margin-top: 2px;">Date: ${todayStr}</div>
    </div>
  </div>

  <!-- Document Title Banner -->
  <div class="doc-title-bar">
    <h2 class="doc-title">CONSULTATION RECORD</h2>
  </div>

  <!-- Meta Section: Patient & Visit Details -->
  <div class="grid-meta">
    <div class="meta-col-left">
      <div class="meta-label">PATIENT DETAILS:</div>
      <div class="patient-name">${patient?.full_name || 'N/A'}</div>
      <div class="meta-line">ID: ${patient?.patient_number || 'N/A'}</div>
      <div class="meta-line">Gender: ${patient?.gender || 'N/A'}</div>
      <div class="meta-line">DOB: ${patient?.date_of_birth ? formatDateDisplay(patient.date_of_birth) : 'N/A'}</div>
    </div>
    <div class="meta-col-right">
      <div class="meta-label">VISIT DETAILS:</div>
      <div class="meta-line"><b>Consultation ID:</b> ${consultationIdShort}</div>
      <div class="meta-line"><b>Visit Date:</b> ${visitDateStr}</div>
      ${consultation.referral_doctor?.full_name ? `<div class="meta-line"><b>Referred By:</b> ${consultation.referral_doctor.full_name}</div>` : ''}
    </div>
  </div>

  <!-- 1. Diagnosis & ICD 10 Code -->
  <div class="section-card">
    <div class="section-tag">DIAGNOSIS & ICD 10 CODE</div>
    <div class="section-content">${cleanDiag || '-'}</div>
  </div>

  <!-- 2. Chief Complaint (Main Complaints) -->
  <div class="section-card">
    <div class="section-tag">CHIEF COMPLAINT (MAIN COMPLAINTS)</div>
    <div class="section-content">${cleanComplaint || '-'}</div>
  </div>

  <!-- 3. Observations / Physical Examination -->
  ${
    cleanExam
      ? `
  <div class="section-card">
    <div class="section-tag">OBSERVATIONS / PHYSICAL EXAMINATION</div>
    <div class="section-content">${cleanExam}</div>
  </div>`
      : ''
  }

  <!-- 4. Medical History -->
  ${
    cleanHistory
      ? `
  <div class="section-card">
    <div class="section-tag">MEDICAL / SURGICAL HISTORY</div>
    <div class="section-content">${cleanHistory}</div>
  </div>`
      : ''
  }

  <!-- 5. Investigation -->
  <div class="section-card">
    <div class="section-tag">INVESTIGATION</div>
    <div class="section-content">${cleanInvest || '-'}</div>
  </div>

  <!-- 6. Treatment Plan / Assessment & Plan -->
  <div class="section-card">
    <div class="section-tag">TREATMENT PLAN / ASSESSMENT & PLAN</div>
    <div class="section-content">${cleanPlan || '-'}</div>
    ${rxHtml}
  </div>

  <!-- Bottom Accent Bar -->
  <div class="bottom-bar"></div>
</body>
</html>
`;

  const { uri } = await Print.printToFileAsync({ html });
  return await safeSharePdf(uri, `CONSULTATION_${patient?.full_name || 'Patient'}`, html);
}

/**
 * ─────────────────────────────────────────────────────────────
 * 2. DOWNLOAD / SHARE OPERATION REPORT PDF
 * Structure matches ClinicalDocumentPrintView (Screenshot 2, without signature)
 * ─────────────────────────────────────────────────────────────
 */
export async function downloadOperationReportPDF(report: OperationReport): Promise<string> {
  const branch = await fetchBranchInfo(report.branch_id);
  const patient = report.patient;

  const todayStr = formatDateDisplay(new Date().toISOString());
  const reportDateStr = formatDateDisplay(report.operation_date || new Date().toISOString());
  const docIdShort = report.id ? report.id.slice(0, 8).toUpperCase() : 'DD355FC8';
  const procName = report.procedure?.name || report.operation_name || 'DIAGNOSTIC FLEXIBLE URETHROCYSTOSCOPY';

  const cleanDesc = cleanText(report.procedure_description || report.description);
  const cleanPostOp = cleanText(report.post_op_plan);
  const cleanFindings = cleanText(report.findings || report.remarks);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OPERATION_${patient?.full_name || 'Patient'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1f2937;
      background-color: #ffffff;
      font-size: 11px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .logo-box {
      display: flex;
      flex-direction: column;
    }
    .brand-logo-text {
      font-size: 26px;
      font-weight: 800;
      color: #374151;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .brand-gold {
      color: #b45309;
    }
    .brand-tagline {
      font-size: 7.5px;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .header-right {
      text-align: right;
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.35;
    }
    .clinic-name {
      font-size: 12px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .doc-title-bar {
      text-align: center;
      margin: 16px 0 20px 0;
    }
    .doc-title {
      font-size: 13px;
      font-weight: 700;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
      padding: 5px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #4b5563;
      margin: 0;
    }
    .grid-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      font-size: 10.5px;
    }
    .meta-col-left {
      flex: 1;
    }
    .meta-col-right {
      flex: 1;
      text-align: right;
    }
    .meta-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }
    .recipient-text {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: #111827;
    }
    .patient-name {
      font-size: 12.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #111827;
      margin-bottom: 1px;
    }
    .meta-line {
      color: #374151;
      margin-bottom: 1px;
    }
    .specs-card {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
    }
    .specs-col {
      flex: 1;
    }
    .section-card {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background-color: #ffffff;
    }
    .section-tag {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .procedure-heading {
      font-size: 12px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
    }
    .section-content {
      font-size: 10.5px;
      color: #374151;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .bottom-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background-color: #1f2937;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="logo-box">
      ${
        branch.logo_url
          ? `<img src="${branch.logo_url}" style="height: 48px; width: auto;" alt="Logo" />`
          : `
          <div class="brand-logo-text">
            <span>uro</span><span class="brand-gold">⬡</span><span class="brand-gold">care</span>
          </div>
          <div class="brand-tagline">UROLOGY & MEN'S HEALTH CLINIC</div>
          `
      }
    </div>
    <div class="header-right">
      <div class="clinic-name">${branch.name}</div>
      <div>${branch.address}</div>
      <div>Phone: ${branch.phone}</div>
      <div>Email: ${branch.email}</div>
      <div style="margin-top: 2px;">Date: ${todayStr}</div>
    </div>
  </div>

  <!-- Document Title Banner -->
  <div class="doc-title-bar">
    <h2 class="doc-title">OPERATION REPORT</h2>
  </div>

  <!-- Meta Section: Recipient, Patient, Reference -->
  <div class="grid-meta">
    <div class="meta-col-left">
      <div class="meta-label">RECIPIENT / ATTENTION:</div>
      <div class="recipient-text">WHOM IT MAY CONCERN</div>

      <div class="meta-label" style="margin-top: 10px;">PATIENT DETAILS:</div>
      <div class="patient-name">${patient?.full_name || 'N/A'}</div>
      <div class="meta-line">ID: ${patient?.patient_number || 'N/A'}</div>
    </div>
    <div class="meta-col-right">
      <div class="meta-label">DOCUMENT REFERENCE:</div>
      <div class="meta-line"><b>Doc ID:</b> ${docIdShort}</div>
      <div class="meta-line"><b>Issue Date:</b> ${reportDateStr}</div>
      <div class="meta-line"><b>Patient Gender:</b> ${(patient?.gender || 'N/A').toUpperCase()}</div>
    </div>
  </div>

  <!-- Surgical Specs Box -->
  <div class="specs-card">
    <div class="specs-col">
      <div style="margin-bottom: 3px;"><b>Hospital:</b> ${report.hospital?.name || 'Harvey Brown Urology'}</div>
      <div><b>Anaesthetist:</b> N/A</div>
    </div>
    <div class="specs-col" style="text-align: right;">
      <div style="margin-bottom: 3px;"><b>Anaesthetic:</b> ${report.anaesthesia_type || 'Local'}</div>
      <div><b>Assistant:</b> N/A</div>
    </div>
  </div>

  <!-- Surgical Procedure Box -->
  <div class="section-card">
    <div class="section-tag">SURGICAL PROCEDURE(S)</div>
    <div class="procedure-heading">${procName}</div>
  </div>

  <!-- Operation Description Box -->
  <div class="section-card">
    <div class="section-tag">OPERATION DESCRIPTION</div>
    <div class="section-content">${cleanDesc || 'Procedure completed according to standard surgical technique.'}</div>
  </div>

  <!-- Post Operation Plan Box -->
  <div class="section-card">
    <div class="section-tag">POST OPERATION PLAN</div>
    <div class="section-content">${cleanPostOp || 'Routine post-operative care and observation.'}</div>
  </div>

  <!-- Findings / Remarks (if present) -->
  ${
    cleanFindings
      ? `
  <div class="section-card">
    <div class="section-tag">FINDINGS / REMARKS</div>
    <div class="section-content">${cleanFindings}</div>
  </div>`
      : ''
  }

  <!-- Bottom Accent Bar -->
  <div class="bottom-bar"></div>
</body>
</html>
`;

  const { uri } = await Print.printToFileAsync({ html });
  return await safeSharePdf(uri, `OPERATION_${patient?.full_name || 'Patient'}`, html);
}

// ─────────────────────────────────────────────────────────────
// 3. PRESCRIPTION PDF GENERATOR
// ─────────────────────────────────────────────────────────────
export async function downloadPrescriptionPDF(prescription: any): Promise<string> {
  const patient = prescription.patient;
  const doctor = prescription.doctor;
  const branch = await fetchBranchInfo(prescription.branch_id);

  const todayStr = formatDateDisplay(new Date().toISOString());
  const rxDateStr = formatDateDisplay(prescription.prescription_date || prescription.created_at);
  const docIdShort = prescription.prescription_number || prescription.id ? `RX-${prescription.id.slice(0, 8).toUpperCase()}` : 'N/A';

  const isMeki = !doctor || doctor.full_name?.toLowerCase().includes('meki') || doctor.qualifications?.includes('229812');
  const docName = isMeki ? "DR S. C. MEKI" : `DR. ${(doctor?.full_name || 'S. C. MEKI').replace(/^dr\.?\s+/i, '').toUpperCase()}`;
  const docSpecialty = isMeki ? "Specialist Urologist" : (doctor?.specialization || "Consultant Urologist");
  const docQuals: string[] = isMeki
    ? ["MMED (UZ) Endourology (UCU)", "AFHOZ: 229812", "MDPCZ: SU700212"]
    : (doctor?.qualifications ? doctor.qualifications.split(/[\n,]+/).map((s: string) => s.trim()) : ["MMED (UZ) Endourology (UCU)", "AFHOZ: 229812", "MDPCZ: SU700212"]);

  const items = prescription.prescription_items || prescription.items || [];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Prescription - ${patient?.full_name || 'Patient'}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background-color: #ffffff;
      padding: 24px 28px;
      color: #1f2937;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .logo-box {
      display: flex;
      flex-direction: column;
    }
    .brand-logo-text {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #111827;
    }
    .brand-gold {
      color: #b45309;
    }
    .brand-tagline {
      font-size: 7.5px;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .header-right {
      text-align: right;
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.35;
    }
    .clinic-name {
      font-size: 12px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .doc-title-bar {
      text-align: center;
      margin: 12px 0 16px 0;
    }
    .doc-title {
      font-size: 14px;
      font-weight: 800;
      border-top: 1.5px solid #e5e7eb;
      border-bottom: 1.5px solid #e5e7eb;
      padding: 5px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #374151;
      margin: 0;
    }
    .grid-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    .meta-col-left {
      flex: 1;
    }
    .meta-col-right {
      flex: 1;
      text-align: right;
    }
    .meta-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }
    .patient-name {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      color: #111827;
      margin-bottom: 1px;
    }
    .meta-line {
      color: #374151;
      margin-bottom: 2px;
    }
    .table-container {
      margin-top: 14px;
      margin-bottom: 16px;
    }
    .table-title {
      font-size: 11px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background-color: #f9fafb;
      color: #4b5563;
      text-transform: uppercase;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 7px 8px;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }
    td {
      padding: 8px 8px;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
      color: #374151;
    }
    .med-name {
      font-weight: 700;
      color: #111827;
      font-size: 10.5px;
    }
    .notes-box {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 10px 12px;
      margin-top: 12px;
      margin-bottom: 20px;
      background-color: #f9fafb;
    }
    .notes-title {
      font-size: 8.5px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .notes-content {
      font-size: 10px;
      color: #374151;
      line-height: 1.4;
    }
    .signature-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 12px;
    }
    .sig-box {
      text-align: center;
      width: 160px;
    }
    .sig-img {
      height: 44px;
      width: auto;
      margin: 0 auto 4px auto;
      display: block;
    }
    .sig-line {
      border-top: 1px solid #9ca3af;
      padding-top: 3px;
      font-size: 8.5px;
      color: #6b7280;
      text-transform: uppercase;
    }
    .doctor-credentials {
      text-align: right;
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.35;
    }
    .doc-name {
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="logo-box">
      ${
        branch.logo_url
          ? `<img src="${branch.logo_url}" style="height: 44px; width: auto;" alt="Logo" />`
          : `
          <div class="brand-logo-text">
            <span>uro</span><span class="brand-gold">⬡</span><span class="brand-gold">care</span>
          </div>
          <div class="brand-tagline">UROLOGY & MEN'S HEALTH CLINIC</div>
          `
      }
    </div>
    <div class="header-right">
      <div class="clinic-name">${branch.name}</div>
      <div>${branch.address}</div>
      <div>Phone: ${branch.phone}</div>
      <div>Email: ${branch.email}</div>
      <div style="margin-top: 2px;">Date: ${todayStr}</div>
    </div>
  </div>

  <!-- Document Title Banner -->
  <div class="doc-title-bar">
    <h2 class="doc-title">PRESCRIPTION</h2>
  </div>

  <!-- Meta Section: Patient & Document Info -->
  <div class="grid-meta">
    <div class="meta-col-left">
      <div class="meta-label">PATIENT DETAILS:</div>
      <div class="patient-name">${patient?.full_name || 'N/A'}</div>
      <div class="meta-line"><b>ID:</b> ${patient?.patient_number || 'N/A'}</div>
      <div class="meta-line"><b>Gender:</b> ${(patient?.gender || 'N/A').toUpperCase()}</div>
      ${patient?.date_of_birth ? `<div class="meta-line"><b>D.O.B:</b> ${formatDateDisplay(patient.date_of_birth)}</div>` : ''}
    </div>
    <div class="meta-col-right">
      <div class="meta-label">PRESCRIPTION REFERENCE:</div>
      <div class="meta-line"><b>Prescription No:</b> ${docIdShort}</div>
      <div class="meta-line"><b>Date of Issue:</b> ${rxDateStr}</div>
      <div class="meta-line"><b>Status:</b> ${(prescription.status || 'ACTIVE').toUpperCase()}</div>
    </div>
  </div>

  <!-- Prescribed Medications Table -->
  <div class="table-container">
    <div class="table-title">DRUGS PRESCRIBED</div>
    <table>
      <thead>
        <tr>
          <th style="width: 25px;">#</th>
          <th>Medicine Name</th>
          <th>Dosage</th>
          <th>Route</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th>Instructions / Advice</th>
        </tr>
      </thead>
      <tbody>
        ${
          items.length === 0
            ? '<tr><td colspan="7" style="text-align: center; color: #9ca3af; padding: 12px;">No medications recorded</td></tr>'
            : items
                .map((item: any, idx: number) => {
                  const med = item.medicine || {};
                  const medName = item.medicine_name || med.name || 'Medication';
                  const dosage = item.dosage || med.dosage || '—';
                  const route = item.route || med.route || 'po';
                  const freq = typeof med.frequency === 'object' ? med.frequency?.name : med.frequency || item.frequency || 'OD';
                  const duration = item.period ? `${item.period} ${item.time_unit || 'Days'}` : item.duration || '—';
                  const advice = cleanText(item.advice || item.instructions || '—');

                  return `
            <tr>
              <td style="font-weight: 700; color: #6b7280;">${idx + 1}</td>
              <td class="med-name">${medName}</td>
              <td>${dosage}</td>
              <td>${route}</td>
              <td>${freq}</td>
              <td>${duration}</td>
              <td>${advice}</td>
            </tr>
          `;
                })
                .join('')
        }
      </tbody>
    </table>
  </div>

  <!-- General Notes if any -->
  ${
    prescription.notes
      ? `
  <div class="notes-box">
    <div class="notes-title">CLINICAL NOTES & INSTRUCTIONS</div>
    <div class="notes-content">${cleanText(prescription.notes)}</div>
  </div>
  `
      : ''
  }

  <!-- Signature Block -->
  <div class="signature-section">
    <div class="sig-box">
      <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" class="sig-img" />
      <div class="sig-line">Doctor's Signature</div>
    </div>
    <div class="doctor-credentials">
      <div class="doc-name">${docName}</div>
      <div style="color: #4b5563; font-weight: 600;">${docSpecialty}</div>
      ${docQuals.map((q) => `<div>${q}</div>`).join('')}
    </div>
  </div>
</body>
</html>
`;

  const { uri } = await Print.printToFileAsync({ html });
  return await safeSharePdf(uri, `PRESCRIPTION_${patient?.full_name || 'Patient'}`, html);
}

