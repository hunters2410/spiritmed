import { useRef, useEffect } from 'react';
import { Printer, ArrowLeft, Download, Send, Edit3, Plus, MessageSquare } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportElementToPdf } from '../utils/exportUtils';

const renderHtmlOrText = (text?: string) => {
    if (!text) return 'N/A';
    // Always render as HTML — the rich text editor stores HTML tags.
    // dangerouslySetInnerHTML is safe here: content is doctor-authored, not user-submitted.
    let cleaned = text.replace(/\\r\\n|\\r|\\n/g, '');
    if (cleaned.trim().toLowerCase() === 'nil') cleaned = 'NIL';
    return <div dangerouslySetInnerHTML={{ __html: cleaned }} className="rich-text-content text-xs text-gray-700 dark:text-gray-300" />;
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
};

export type ClinicalDocType = 'discharge' | 'admission' | 'operation' | 'referral' | 'certificate';

interface Branch {
    name: string;
    email: string;
    phone: string;
    address: string;
    city?: string;
    country?: string;
    logo_url?: string;
    website?: string;
    signature_url?: string;
}

interface Patient {
    full_name: string;
    patient_number: string;
    gender: string;
    date_of_birth: string;
}

interface Doctor {
    full_name: string;
    specialization?: string;
    qualifications?: string;
    signature_url?: string;
}

interface ClinicalDoc {
    id: string;
    report_date: string;
    patient: Patient;
    doctor: Doctor;
    [key: string]: any;
}

interface Props {
    type: ClinicalDocType;
    data: ClinicalDoc;
    branch: Branch;
    allAnaesthetists?: any[];
    allAssistants?: any[];
    allDiagnoses?: any[];
    onBack: () => void;
    onEdit: () => void;
    onAddNew: () => void;
    onSendEmail: () => void;
    onSendSms?: () => void;
    autoPrint?: boolean;
    autoDownload?: boolean;
}

export function ClinicalDocumentPrintView({
    type, data, branch,
    allAnaesthetists = [], allAssistants = [], allDiagnoses = [],
    onBack, onEdit, onAddNew, onSendEmail, onSendSms,
    autoPrint = false, autoDownload = false
}: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        await exportElementToPdf(printRef.current, `${type.toUpperCase()}_${data.patient.full_name}.pdf`);
    };

    useEffect(() => {
        if (autoPrint) {
            const timer = setTimeout(() => {
                window.print();
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [autoPrint]);

    useEffect(() => {
        if (autoDownload) {
            const timer = setTimeout(() => {
                handleDownloadPdf();
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [autoDownload]);

    const getTitle = () => {
        switch (type) {
            case 'discharge': return 'Discharge Summary';
            case 'admission': return 'Admission Form';
            case 'operation': return 'Operation Report';
            case 'referral': return 'Referral Form';
            case 'certificate': return 'Medical Certificate';
            default: return 'Clinical Document';
        }
    };

    const renderContent = () => {
        switch (type) {
            case 'discharge':
                return (
                    <div className="space-y-6">
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Diagnosis</p>
                            <p className="font-bold">{data.diagnosis?.name || data.diagnosis?.label || data.diagnosis_text || 'N/A'}</p>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Medical History</p>
                            {renderHtmlOrText(data.medical_history)}
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Treatment Done</p>
                            {renderHtmlOrText(data.treatment_done)}
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Follow-up Plan</p>
                            {renderHtmlOrText(data.follow_up_plan)}
                        </div>
                    </div>
                );
            case 'referral':
                return (
                    <div className="space-y-6">
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Reason for Referral</p>
                            {renderHtmlOrText(data.reason_for_referral)}
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Background History</p>
                            {renderHtmlOrText(data.background_history)}
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Treatment Done</p>
                            {renderHtmlOrText(data.treatment_done)}
                        </div>
                    </div>
                );
            case 'certificate':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1 border-b pb-1">Date Attended</p>
                                <p>{data.date_attended ? new Date(data.date_attended).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1 border-b pb-1">Date of Illness</p>
                                <p>{data.illness_date ? new Date(data.illness_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1 border-b pb-1">Date of Resume</p>
                                <p className="font-bold text-lg">{data.resume_date ? new Date(data.resume_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1 border-b pb-1">Period</p>
                                <p>{data.period} {data.time_unit || 'Days'}</p>
                            </div>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Purpose / Remarks</p>
                            {renderHtmlOrText(data.purpose)}
                        </div>
                    </div>
                );
            case 'operation':
                const anaesthetistNames = data.anaesthetist_ids?.length
                    ? data.anaesthetist_ids.map((id: string) => allAnaesthetists.find(a => a.id === id)?.full_name).filter(Boolean).join(', ')
                    : (data.anaesthetist?.full_name || data.anaesthetist || 'N/A');

                const assistantNames = data.assistant_ids?.length
                    ? data.assistant_ids.map((id: string) => allAssistants.find(a => a.id === id)?.full_name).filter(Boolean).join(', ')
                    : (data.assistant?.full_name || data.assistant || 'N/A');

                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 text-[11px] bg-gray-50 border p-4 rounded">
                            <p><b>Hospital:</b> {data.hospital?.name || data.hospital || 'N/A'}</p>
                            <p><b>Anaesthesia:</b> {data.anaesthesia_type || 'N/A'}</p>
                            <p><b>Anaesthetist:</b> {anaesthetistNames}</p>
                            <p><b>Assistant:</b> {assistantNames}</p>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Surgical Procedure(s)</p>
                            <p className="font-bold text-sm uppercase">{data.procedure?.name || data.procedure_text || 'N/A'}</p>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Operation Description</p>
                            <div className="min-h-[50mm]">{renderHtmlOrText(data.description)}</div>
                        </div>
                        <div className="border border-gray-100 rounded p-4 bg-gray-50/30">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Post Operation Plan</p>
                            {renderHtmlOrText(data.post_op_plan)}
                        </div>
                    </div>
                );
            case 'admission':

                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 text-[11px] bg-gray-50 border p-4 rounded uppercase">
                            <p><b>Hospital:</b> {data.hospital?.name || data.hospital || 'N/A'}</p>
                            <p><b>Adm Date:</b> {data.admission_date ? new Date(data.admission_date).toLocaleString() : 'N/A'}</p>
                            <p className="col-span-2"><b>Clinical Diagnosis:</b> {diagnosisLabels}</p>
                            <p className="col-span-2 font-bold text-red-600"><b>Procedure:</b> {data.procedure?.name || data.procedure_text || 'N/A'}</p>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-4 border-b pb-1">Admission Plan</p>
                            <div className="grid grid-cols-2 gap-8 mb-4">
                                <div>
                                    <p className="font-bold text-[8px] uppercase text-gray-400 mb-2 underline">Bloods Required:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(data.plan_bloods || []).map((b: string) => (
                                            <span key={b} className="text-[10px] font-bold">[X] {b}</span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="font-bold text-[8px] uppercase text-gray-400 mb-2 underline">Imaging Required:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(data.plan_imaging || []).map((i: string) => (
                                            <span key={i} className="text-[10px] font-bold">[X] {i}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 border-t pt-4">
                                <div><b>NPO From:</b> {data.npo_oral || 'N/A'}</div>
                                <div><b>Date:</b> {data.npo_date || 'N/A'}</div>
                                <div><b>Time:</b> {data.npo_time || 'N/A'}</div>
                            </div>
                        </div>
                        <div className="border border-gray-100 rounded p-4">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Medication / Fluids</p>
                            <p><b>IV Fluids:</b> {data.iv_fluids || 'N/A'}</p>
                            <p className="mt-2 text-red-600"><b>Medication:</b> {data.medication || 'N/A'}</p>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    const isReferral = type === 'referral';
    const isCertificate = type === 'certificate';
    const isAdmission = type === 'admission';
    const isMeki = data.doctor.full_name.toLowerCase().includes('meki') || data.doctor.qualifications?.includes('229812');
    const docName = isMeki ? "DR S. C. MEKI" : `DR. ${data.doctor.full_name.replace(/^dr\.?\s+/i, '').toUpperCase()}`;
    const docSpecialty = isMeki ? "Specialist Urologist" : data.doctor.specialization;
    const docQuals = isMeki 
        ? ["MMED (UZ) Endourology (UCU)", "AFHOZ: 229812", "MDPCZ: SU700212"]
        : (data.doctor.qualifications ? data.doctor.qualifications.split(/[\n,]+/).map(s => s.trim()) : []);

    const certDocQuals = isMeki ? ["MMED UROLOGY UZ"] : docQuals;
    const certDocSpecialty = isMeki ? "Specialist Urologist - SU700212" : docSpecialty;

    const getAge = (dobString?: string) => {
        if (!dobString) return 'N/A';
        const today = new Date();
        const birthDate = new Date(dobString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return `${age} Year(s)`;
    };

    const formatArrayField = (arr?: string[]) => {
        if (!arr || arr.length === 0 || (arr.length === 1 && arr[0] === 'NONE')) return 'NONE';
        return arr.join(', ');
    };

    const diagnosisLabels = data.diagnosis_ids?.length
        ? data.diagnosis_ids.map((id: string) => {
            const d = allDiagnoses.find(diag => diag.id === id);
            return d?.name || d?.label;
        }).filter(Boolean).join(', ')
        : (data.diagnosis?.name || data.diagnosis?.label || 'N/A');

    const getPurposeTemplateLabel = (templateId?: string) => {
        if (!templateId) return 'SICK LEAVE / OFF DUTY';
        const templates: Record<string, string> = {
            'sick_leave': 'SICK LEAVE / OFF DUTY',
            'medical_cert': 'MEDICAL CERTIFICATE',
            'fitness_cert': 'FITNESS TO WORK CERTIFICATE'
        };
        return templates[templateId] || templateId.toUpperCase().replace(/_/g, ' ');
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-center">
            <style>{`
                .rich-text-content ul { list-style-type: disc !important; margin-left: 1.5rem !important; padding-left: 0.5rem !important; display: block !important; }
                .rich-text-content ol { list-style-type: decimal !important; margin-left: 1.5rem !important; padding-left: 0.5rem !important; display: block !important; }
                .rich-text-content li { margin-bottom: 0.25rem !important; display: list-item !important; }
                .rich-text-content p { margin-bottom: 0.5rem !important; }
                
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    body {
                        background: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-no-padding {
                        padding: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: 100% !important;
                    }
                    .print-referral-box {
                        border: 1.5px solid black !important;
                        padding: 20px !important;
                        box-sizing: border-box !important;
                    }
                }
            `}</style>
            {/* Sidebar Actions */}
            <div className="w-full md:w-64 space-y-2 print:hidden order-2 md:order-1">
                <button onClick={onBack} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded shadow-sm text-sm">
                    <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Download className="w-4 h-4" /> PDF
                </button>
                <button onClick={onEdit} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Edit3 className="w-4 h-4" /> Edit
                </button>
                <button onClick={onSendEmail} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm hover:bg-gray-50">
                    <Send className="w-4 h-4 text-blue-600" /> Email
                </button>
                {onSendSms && (
                    <button onClick={onSendSms} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm hover:bg-gray-50">
                        <MessageSquare className="w-4 h-4 text-purple-600" /> SMS
                    </button>
                )}
                <button onClick={onAddNew} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Plus className="w-4 h-4" /> Add New
                </button>
            </div>

            {/* Document View */}
            <div className="flex-1 w-full overflow-x-auto order-1 md:order-2 flex justify-center print:block print:w-full">
                <div ref={printRef} className="bg-white p-[20mm] shadow-lg print:shadow-none print:p-0 text-gray-900 border border-gray-200 print:border-none print-no-padding w-[210mm] min-w-[210mm] print:w-full print:min-w-0 print:max-w-full">
                    {isReferral ? (
                        /* Referral Form Specific Layout */
                        <div className="print-referral-box border border-black p-8 flex flex-col justify-between min-h-[258mm] text-xs text-gray-800 leading-relaxed">
                            {/* Top part of document */}
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex justify-between items-start border-b pb-6">
                                    <div>
                                        {branch.logo_url || branch.signature_url ? (
                                            <img src={branch.logo_url || branch.signature_url} alt="Logo" className="h-16 w-auto" />
                                        ) : (
                                            <div className="text-xl font-extrabold tracking-wider text-gray-800">
                                                <span className="text-gray-900">uro</span>
                                                <span className="text-amber-700">care</span>
                                                <div className="text-[8px] font-normal uppercase tracking-widest text-gray-500 mt-1">Urology & Men's Health Clinic</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right text-[10px] text-gray-600 space-y-0.5">
                                        {branch.phone && <p>{branch.phone}</p>}
                                        {branch.email && <p>{branch.email}</p>}
                                        {branch.website && <p>{branch.website}</p>}
                                        {branch.address && <p>{branch.address}</p>}
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="text-center">
                                    <h2 className="text-lg font-bold uppercase tracking-widest text-gray-600">REFERRAL FORM</h2>
                                </div>

                                {/* Metadata */}
                                <div className="space-y-4">
                                    <p><b>Date:</b> {formatDate(data.report_date)}</p>
                                    <p className="mt-2"><b>To:</b> {data.recipient || 'Dr Tsikai'}</p>
                                    <p className="mt-4">Dear Colleague</p>
                                    <div className="mt-4 space-y-1">
                                        <p><b>REF:</b> {data.patient.full_name}</p>
                                        <p><b>Gender:</b> {data.patient.gender}</p>
                                        <p><b>DOB:</b> {formatDate(data.patient.date_of_birth)}</p>
                                    </div>
                                </div>

                                {/* REASON FOR REFERRAL */}
                                <div className="pt-2">
                                    <p className="font-bold text-gray-900 uppercase mb-2">REASON FOR REFERRAL:</p>
                                    <div className="pl-0">{renderHtmlOrText(data.reason_for_referral)}</div>
                                </div>

                                {/* BACKGROUND HISTORY */}
                                <div className="pt-2">
                                    <p className="font-bold text-gray-900 uppercase mb-2">BACKGROUND HISTORY:</p>
                                    <div className="pl-0">{renderHtmlOrText(data.background_history)}</div>
                                </div>

                                {/* TREATMENT DONE */}
                                <div className="pt-2">
                                    <p className="font-bold text-gray-900 uppercase mb-2">TREATMENT DONE:</p>
                                    <div className="pl-0">{renderHtmlOrText(data.treatment_done)}</div>
                                </div>
                            </div>

                            {/* Bottom / Signature Block */}
                            <div className="pt-8 text-xs text-gray-800 space-y-4">
                                <p>Yours Sincerely</p>
                                
                                <div className="flex justify-between items-end pt-4">
                                    {/* Signature on Left */}
                                    <div className="text-center w-48">
                                        <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                            <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-12 w-auto mx-auto mb-1" />
                                        </a>
                                        <div className="border-t border-gray-300 pt-1 text-[9px] text-gray-500 uppercase tracking-wider">
                                            Doctor's Signature
                                        </div>
                                    </div>
                                    
                                    {/* Doctor Credentials on Right */}
                                    <div className="text-right text-[10px] space-y-0.5">
                                        <p className="font-bold uppercase">{docName}</p>
                                        {docSpecialty && <p className="text-gray-600">{docSpecialty}</p>}
                                        {docQuals.map((qual, idx) => (
                                            <p key={idx} className="text-gray-500">{qual}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : isCertificate ? (
                        /* Medical Certificate Specific Layout */
                        <div className="print-referral-box border border-black p-8 flex flex-col justify-between min-h-[258mm] text-xs text-gray-800 leading-relaxed relative pb-16">
                            {/* Top part of document */}
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex justify-between items-start border-b pb-6">
                                    <div>
                                        {branch.logo_url || branch.signature_url ? (
                                            <img src={branch.logo_url || branch.signature_url} alt="Logo" className="h-16 w-auto" />
                                        ) : (
                                            <div className="text-xl font-extrabold tracking-wider text-gray-800">
                                                <span className="text-gray-900">uro</span>
                                                <span className="text-amber-700">care</span>
                                                <div className="text-[8px] font-normal uppercase tracking-widest text-gray-500 mt-1">Urology & Men's Health Clinic</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right text-[10px] text-gray-600 space-y-0.5">
                                        {branch.phone && <p>{branch.phone}</p>}
                                        {branch.email && <p>{branch.email}</p>}
                                        {branch.website && <p>{branch.website}</p>}
                                        {branch.address && <p>{branch.address}</p>}
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="text-center space-y-1">
                                    <h2 className="text-lg font-bold uppercase tracking-widest text-gray-600">MEDICAL CERTIFICATE</h2>
                                    <p className="text-[10px] text-gray-500 font-mono">
                                        {/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) ? data.id.slice(0, 8).toUpperCase() : data.id}
                                    </p>
                                </div>

                                {/* Date & sick leave title */}
                                <div className="space-y-4 pt-4">
                                    <p><b>Date:</b> {formatDate(data.report_date)}</p>
                                    <p className="font-bold text-gray-900 tracking-wider uppercase">{getPurposeTemplateLabel(data.purpose_template)}</p>
                                    <p className="pt-2"><b>REF:</b> {data.patient.full_name}</p>
                                </div>

                                {/* Certificate content */}
                                <div className="pt-4 space-y-4 text-justify">
                                    <p className="leading-relaxed">
                                        I the undersigned, registered medical practitioner certifies that the above named patient attended on the <b>{formatDate(data.date_attended)}</b> is under my care. The above is unable to attend to his/her normal duties due to illness from <b>{formatDate(data.illness_date)}</b> for a period of <b>{data.period} {data.time_unit || 'Days'}</b>, for the purpose of:
                                    </p>
                                    <div className="pl-0 py-2 border-y border-dashed border-gray-200">
                                        {renderHtmlOrText(data.purpose)}
                                    </div>
                                    <p className="leading-relaxed pt-2">
                                        The above is able to resume his/her normal duties from <b>{formatDate(data.resume_date)}</b>.
                                    </p>
                                </div>
                            </div>

                            {/* Bottom / Signature Block */}
                            <div className="pt-8 text-xs text-gray-800 space-y-4">
                                <p>Yours Sincerely</p>
                                
                                <div className="flex justify-between items-end pt-4">
                                    {/* Signature on Left */}
                                    <div className="text-center w-48">
                                        <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                            <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-12 w-auto mx-auto mb-1" />
                                        </a>
                                        <div className="border-t border-gray-300 pt-1 text-[9px] text-gray-500 uppercase tracking-wider">
                                            Doctor's Signature
                                        </div>
                                    </div>
                                    
                                    {/* Doctor Credentials on Right */}
                                    <div className="text-right text-[10px] space-y-0.5 font-sans">
                                        <p className="font-bold uppercase text-gray-900">{docName}</p>
                                        {certDocQuals.map((qual, idx) => (
                                            <p key={idx} className="text-gray-700">{qual}</p>
                                        ))}
                                        {certDocSpecialty && <p className="text-gray-700">{certDocSpecialty}</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Absolute footer centered at bottom of certificate */}
                            <div className="absolute bottom-4 left-0 right-0 text-center text-[9px] text-gray-500 border-t pt-2 mx-8">
                                {[branch.address, branch.phone, branch.email].filter(Boolean).join(' | ')}
                            </div>
                        </div>
                    ) : isAdmission ? (
                        /* Admission Letter Specific Layout */
                        <div className="print-referral-box border border-black p-8 flex flex-col justify-between min-h-[258mm] text-xs text-gray-800 leading-relaxed relative pb-16">
                            {/* Top part of document */}
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex justify-between items-start border-b pb-6">
                                    <div>
                                        {branch.logo_url || branch.signature_url ? (
                                            <img src={branch.logo_url || branch.signature_url} alt="Logo" className="h-16 w-auto" />
                                        ) : (
                                            <div className="text-xl font-extrabold tracking-wider text-gray-800">
                                                <span className="text-gray-900">uro</span>
                                                <span className="text-amber-700">care</span>
                                                <div className="text-[8px] font-normal uppercase tracking-widest text-gray-500 mt-1">Urology & Men's Health Clinic</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right text-[10px] text-gray-600 space-y-0.5">
                                        {branch.phone && <p>{branch.phone}</p>}
                                        {branch.email && <p>{branch.email}</p>}
                                        {branch.website && <p>{branch.website}</p>}
                                        {branch.address && <p>{branch.address}</p>}
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="text-center">
                                    <h2 className="text-md font-bold uppercase tracking-widest text-gray-700">ADMISSION LETTER</h2>
                                </div>

                                {/* Content Details */}
                                <div className="space-y-4 pt-2 text-[11px] leading-relaxed">
                                    <p>
                                        <b>Dear:</b> {data.hospital?.name || data.hospital || 'Hospital/Clinic'} Hospital / Clinic, Please kindly admit the following on: <b>{formatDate(data.admission_date)}</b>
                                    </p>
                                    
                                    <p>
                                        <b>Surname:</b> {data.patient.full_name} &nbsp;&nbsp;&nbsp;<b>Age:</b> {getAge(data.patient.date_of_birth)} &nbsp;&nbsp;&nbsp;<b>Sex:</b> {data.patient.gender}
                                    </p>

                                    <p>
                                        <b>Clinical diagnosis:</b> <span className="italic">{diagnosisLabels}</span>
                                    </p>

                                    <p>
                                        <b>Surgical procedure:</b> <span className="uppercase">{data.procedure?.name || data.procedure_text || 'N/A'}</span>
                                    </p>

                                    <p>
                                        <b>Date of procedure:</b> {formatDate(data.procedure_date) || formatDate(data.admission_date)} &nbsp;&nbsp;&nbsp;<b>Hospital:</b> {data.hospital?.name || data.hospital || 'N/A'}
                                    </p>

                                    <div className="pt-2 space-y-1">
                                        <p className="font-bold">Admission Plan (Please do the following marked investigations)</p>
                                        <p className="pl-4"><b>Bloods:</b> {formatArrayField(data.plan_bloods)}</p>
                                        <p className="pl-4"><b>Imaging:</b> {formatArrayField(data.plan_imaging)}</p>
                                        <p className="pl-4"><b>Other Tests:</b> {data.plan_other || 'NONE'}</p>
                                    </div>

                                    <p className="pt-1">
                                        <b>NIL PER ORAL:</b> {data.npo_oral || 'N/A'}
                                        {data.npo_oral?.toUpperCase() === 'YES' && (
                                            <>
                                                {data.npo_date ? ` Date: ${formatDate(data.npo_date)}` : ''}
                                                {data.npo_time ? ` Time: ${data.npo_time}` : ''}
                                            </>
                                        )}
                                    </p>

                                    <div className="space-y-1 pt-1">
                                        <p className="font-bold">IV fluids:</p>
                                        <div className="pl-4">{renderHtmlOrText(data.iv_fluids)}</div>
                                    </div>

                                    <div className="space-y-1 pt-1">
                                        <p className="font-bold">Medication:</p>
                                        <div className="pl-4">{renderHtmlOrText(data.medication)}</div>
                                    </div>

                                    <div className="space-y-1 pt-1">
                                        <p className="font-bold">Other:</p>
                                        <div className="pl-4">{renderHtmlOrText(data.other)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom / Signature Block */}
                            <div className="pt-8 text-xs text-gray-800 space-y-4">
                                <p>Yours Sincerely</p>
                                
                                <div className="flex justify-between items-end pt-4">
                                    {/* Signature on Left */}
                                    <div className="text-center w-48">
                                        <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                            <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-12 w-auto mx-auto mb-1" />
                                        </a>
                                        <div className="border-t border-gray-300 pt-1 text-[9px] text-gray-500 uppercase tracking-wider">
                                            Doctor's Signature
                                        </div>
                                    </div>
                                    
                                    {/* Doctor Credentials on Right */}
                                    <div className="text-right text-[10px] space-y-0.5">
                                        <p className="font-bold uppercase text-gray-900">{docName}</p>
                                        {docSpecialty && <p className="text-gray-700">{docSpecialty}</p>}
                                        {docQuals.map((qual, idx) => (
                                            <p key={idx} className="text-gray-500">{qual}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Absolute footer centered at bottom */}
                            <div className="absolute bottom-4 left-0 right-0 text-center text-[9px] text-gray-500 border-t pt-2 mx-8">
                                {[branch.address, branch.phone, branch.email].filter(Boolean).join(' | ')}
                            </div>
                        </div>
                    ) : (
                        /* Standard Layout for other forms */
                        <>
                            {/* Header */}
                            <div className="flex justify-between items-start border-b pb-6 mb-6">
                                <div>
                                    {branch.logo_url || branch.signature_url ? (
                                        <img src={branch.logo_url || branch.signature_url} alt="Logo" className="h-20 w-auto" />
                                    ) : (
                                        <div className="w-16 h-16 bg-gray-100 border flex items-center justify-center text-xs font-bold text-gray-400">LOGO</div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <h1 className="text-2xl font-bold uppercase mb-1">{branch.name}</h1>
                                    <div className="text-[10px] text-gray-600 space-y-0.5">
                                        <p>{branch.address}</p>
                                        <p><b>Phone:</b> {branch.phone}</p>
                                        <p><b>Email:</b> {branch.email}</p>
                                        <p className="pt-2"><b>Date:</b> {new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center mb-8">
                                <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest text-gray-600">{getTitle()}</h2>
                            </div>

                            {/* Meta Section */}
                            <div className="grid grid-cols-2 gap-8 mb-8 text-[11px]">
                                <div>
                                    <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Recipient / Attention:</p>
                                    <p className="text-sm font-bold uppercase">{data.recipient || 'WHOM IT MAY CONCERN'}</p>
                                    <p className="mt-4 font-bold uppercase text-[9px] text-gray-400 mb-1">Patient Details:</p>
                                    <p className="text-sm font-bold uppercase">{data.patient.full_name}</p>
                                    <p>ID: {data.patient.patient_number}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Document Reference:</p>
                                    <p><b>Doc ID:</b> {data.id.slice(0, 8).toUpperCase()}</p>
                                    <p><b>Issue Date:</b> {new Date(data.report_date).toLocaleDateString()}</p>
                                    <p><b>Patient Gender:</b> {data.patient.gender.toUpperCase()}</p>
                                </div>
                            </div>

                            {/* Document Content */}
                            <div className="text-[11px] leading-relaxed min-h-[160mm] border-t pt-8">
                                {renderContent()}
                            </div>

                            {/* Footer Signature */}
                            <div className="mt-12 flex justify-end">
                                <div className="text-center w-64 border-t pt-4">
                                    <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                        <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-16 w-auto mx-auto mb-2" />
                                    </a>
                                    <div className="text-[10px] space-y-0.5">
                                        <p className="font-bold uppercase">Dr. {data.doctor.full_name}</p>
                                        <p className="text-gray-500">{data.doctor.qualifications}</p>
                                        <p className="text-gray-500">{data.doctor.specialization}</p>
                                        <p className="text-gray-400 uppercase tracking-widest pt-4 font-bold border-t mt-4 border-gray-100">Authorized Physician's Signature</p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

