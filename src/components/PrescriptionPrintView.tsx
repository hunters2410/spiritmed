import { useRef, useEffect } from 'react';
import { Printer, ArrowLeft, Download, Send, Plus, Edit3 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportElementToPdf } from '../utils/exportUtils';

/* ── Helpers ── */
const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
};

const renderHtmlOrText = (text?: string) => {
    if (!text) return '—';
    if (/<[a-z][\s\S]*>/i.test(text)) {
        return <div dangerouslySetInnerHTML={{ __html: text }} className="rich-text-content inline-block text-gray-800" />;
    }
    return text;
};

const parseAdvice = (adviceStr?: string) => {
    const r = { dosage: '', route: '', frequency: '', advice: '' };
    if (!adviceStr) return r;
    if (!adviceStr.includes(' | ')) { r.advice = adviceStr; return r; }
    for (const part of adviceStr.split(' | ')) {
        const ci = part.indexOf(':');
        if (ci === -1) { r.advice = r.advice ? `${r.advice}, ${part}` : part; continue; }
        const key = part.substring(0, ci).trim().toLowerCase();
        const val = part.substring(ci + 1).trim();
        if (key === 'dosage') r.dosage = val;
        else if (key === 'route') r.route = val;
        else if (key === 'frequency') r.frequency = val;
        else if (key === 'instruction') r.advice = r.advice ? `${r.advice} (${val})` : val;
        else r.advice = r.advice ? `${r.advice} | ${val}` : val;
    }
    return r;
};

/* ── Interfaces ── */
interface Branch {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
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

interface PrescriptionItem {
    id: string;
    medicine_name: string;
    dosage: string;
    route?: string;
    frequency: string;
    duration: string;
    instructions?: string;
}

interface Prescription {
    id: string;
    created_at?: string;
    prescription_date?: string;
    patient: Patient;
    doctor: {
        full_name: string;
        qualifications?: string;
        specialization?: string;
        signature_url?: string;
    };
    items: PrescriptionItem[];
}

interface Props {
    prescription: Prescription;
    branch: Branch;
    onBack: () => void;
    onEdit: () => void;
    onAddNew: () => void;
    onSendEmail: () => void;
    autoPrint?: boolean;
    autoDownload?: boolean;
}

/* ── Component ── */
export function PrescriptionPrintView({ prescription, branch, onBack, onEdit, onAddNew, onSendEmail, autoPrint, autoDownload }: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        await exportElementToPdf(printRef.current, `PRESCRIPTION_${prescription.patient?.full_name || 'RECORD'}.pdf`);
    };

    useEffect(() => {
        if (autoPrint) {
            const timer = setTimeout(() => window.print(), 400);
            return () => clearTimeout(timer);
        }
        if (autoDownload) {
            const timer = setTimeout(() => handleDownloadPdf(), 400);
            return () => clearTimeout(timer);
        }
    }, [autoPrint, autoDownload]);

    const isMeki = !prescription.doctor || prescription.doctor.full_name?.toLowerCase().includes('meki') || prescription.doctor.qualifications?.includes('229812');
    const docName = isMeki ? "DR S. C. MEKI" : `DR. ${(prescription.doctor?.full_name || 'S. C. MEKI').replace(/^dr\.?\s+/i, '').toUpperCase()}`;
    const docSpecialty = isMeki ? "Specialist Urologist" : (prescription.doctor?.specialization || "Consultant Urologist");
    const docQuals = isMeki
        ? ["MMED (UZ) Endourology (UCU)", "AFHOZ: 229812", "MDPCZ: SU700212"]
        : (prescription.doctor?.qualifications ? prescription.doctor.qualifications.split(/[\n,]+/).map((s: string) => s.trim()) : ["MMED (UZ) Endourology (UCU)", "AFHOZ: 229812", "MDPCZ: SU700212"]);

    const logoSrc = branch.logo_url || branch.signature_url;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-center">
            <style>{`
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

            {/* ── Sidebar — identical to ClinicalDocumentPrintView ── */}
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
                <button onClick={onSendEmail} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Send className="w-4 h-4" /> Email
                </button>
                <button onClick={onAddNew} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Plus className="w-4 h-4" /> Add New
                </button>
            </div>

            {/* ── Document View — identical outer shell to ClinicalDocumentPrintView ── */}
            <div className="flex-1 w-full overflow-x-auto order-1 md:order-2 flex justify-center print:block print:w-full">
                <div ref={printRef} className="bg-white p-[20mm] shadow-lg print:shadow-none print:p-0 text-gray-900 border border-gray-200 print:border-none print-no-padding w-[210mm] min-w-[210mm] print:w-full print:min-w-0 print:max-w-full">

                    {/* ── Inner bordered box — exact copy of referral form ── */}
                    <div className="print-referral-box border border-black p-8 flex flex-col justify-between min-h-[258mm] text-xs text-gray-800 leading-relaxed">

                        {/* Top section */}
                        <div className="space-y-6">

                            {/* Header — byte-for-byte copy of referral form header */}
                            <div className="flex justify-between items-start border-b pb-6">
                                <div>
                                    {logoSrc ? (
                                        <img src={logoSrc} alt="Logo" className="h-16 w-auto" />
                                    ) : (
                                        <div className="text-xl font-extrabold tracking-wider text-gray-800">
                                            <span className="text-gray-900">uro</span>
                                            <span className="text-amber-700">care</span>
                                            <div className="text-[8px] font-normal uppercase tracking-widest text-gray-500 mt-1">Urology &amp; Men's Health Clinic</div>
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
                                <h2 className="text-lg font-bold uppercase tracking-widest text-gray-600">PRESCRIPTION</h2>
                            </div>

                            {/* Patient info — same style as referral's metadata block */}
                            <div className="space-y-1">
                                <p><b>Date:</b> {formatDate(prescription.prescription_date || prescription.created_at)}</p>
                                <p className="mt-2"><b>Patient Name:</b> {prescription.patient?.full_name || 'N/A'}</p>
                                <p><b>Gender:</b> {prescription.patient?.gender || 'N/A'}</p>
                                <p><b>D.O.B:</b> {formatDate(prescription.patient?.date_of_birth)}</p>
                            </div>

                            {/* Drugs section heading */}
                            <div className="pt-2">
                                <p className="font-bold text-gray-900 uppercase mb-3">"DRUGS PRESCRIBED"</p>

                                {/* Medicines table */}
                                <table className="w-full border-collapse text-[11px]">
                                    <thead>
                                        <tr className="border-y bg-gray-50 text-[9px] font-bold uppercase text-gray-500">
                                            <th className="px-3 py-2 text-left">Medicine</th>
                                            <th className="px-3 py-2 text-left">Dosage</th>
                                            <th className="px-3 py-2 text-left">Route</th>
                                            <th className="px-3 py-2 text-left">Frequency</th>
                                            <th className="px-3 py-2 text-left">Duration</th>
                                            <th className="px-3 py-2 text-left">Advice</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(prescription.items || []).map((item) => {
                                            const p = parseAdvice(item.instructions || (item as any).advice);
                                            const dosage = item.dosage || p.dosage || '—';
                                            const route = item.route || p.route || '—';
                                            const freq = item.frequency || p.frequency || '—';
                                            return (
                                                <tr key={item.id} className="border-b">
                                                    <td className="px-3 py-2 font-semibold text-gray-900">{item.medicine_name}</td>
                                                    <td className="px-3 py-2">{dosage}</td>
                                                    <td className="px-3 py-2">{route}</td>
                                                    <td className="px-3 py-2">{freq}</td>
                                                    <td className="px-3 py-2">{item.duration}</td>
                                                    <td className="px-3 py-2 text-gray-500">{renderHtmlOrText(p.advice)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                        </div>

                        {/* ── Bottom / Signature Block — byte-for-byte copy of referral form ── */}
                        <div className="pt-8 text-xs text-gray-800 space-y-4">
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
                </div>
            </div>
        </div>
    );
}
