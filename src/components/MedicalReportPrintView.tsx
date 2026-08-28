import React, { useRef, useEffect } from 'react';
import { Printer, ArrowLeft, Download, Send, Edit3, Plus } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportElementToPdf } from '../utils/exportUtils';

interface Branch {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
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

interface MedicalReport {
    id: string;
    report_date: string;
    recipient?: string;
    diagnosis?: { name: string; icd10_code?: string } | string;
    content: string;
    patient: Patient;
    doctor: Doctor;
}

interface Props {
    report: MedicalReport;
    branch: Branch;
    onBack: () => void;
    onEdit: () => void;
    onAddNew: () => void;
    onSendEmail: () => void;
    autoPrint?: boolean;
    autoDownload?: boolean;
}

export function MedicalReportPrintView({
    report, branch, onBack, onEdit, onAddNew, onSendEmail,
    autoPrint = false, autoDownload = false
}: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        await exportElementToPdf(printRef.current, `MEDICAL_REPORT_${report.patient.full_name}.pdf`);
    };

    useEffect(() => {
        if (autoPrint) {
            const timer = setTimeout(() => { window.print(); }, 400);
            return () => clearTimeout(timer);
        }
    }, [autoPrint]);

    useEffect(() => {
        if (autoDownload) {
            const timer = setTimeout(() => { handleDownloadPdf(); }, 400);
            return () => clearTimeout(timer);
        }
    }, [autoDownload]);

    const diagnosisLabel = (report.diagnosis && typeof report.diagnosis === 'object')
        ? `${report.diagnosis.name || ''}${report.diagnosis.icd10_code ? ` (${report.diagnosis.icd10_code})` : ''}`.trim()
        : report.diagnosis;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-center">
            {/* Action Sidebar */}
            <div className="w-full md:w-64 space-y-2 print:hidden order-2 md:order-1">
                <button onClick={onBack} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded shadow-sm text-sm">
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

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 10mm; }
                    body { background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
                .prose p { margin: 0 0 0.5em 0; }
                .prose br { display: block; margin: 0.25em 0; content: ''; }
                .prose strong, .prose b { font-weight: 700; }
                .prose ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
                .prose ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
                .prose li { margin: 0.25em 0; }
            `}</style>
            {/* Document View */}
            <div className="flex-1 w-full overflow-x-auto order-1 md:order-2 flex justify-center print:block print:w-full">
                <div ref={printRef} className="bg-white p-[20mm] shadow-lg print:shadow-none print:p-0 text-gray-900 border border-gray-200 print:border-none w-[210mm] min-w-[210mm] print:w-full print:min-w-0 print:max-w-full">
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
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest text-gray-600">Official Medical Report</h2>
                    </div>

                    {/* Meta Section */}
                    <div className="grid grid-cols-2 gap-8 mb-8 text-[11px]">
                        <div className="space-y-4">
                            <div>
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">To / Recipient:</p>
                                <p className="text-sm font-bold uppercase">{report.recipient || 'WHOM IT MAY CONCERN'}</p>
                            </div>
                            <div>
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Patient Details:</p>
                                <p className="text-sm font-bold uppercase">{report.patient.full_name}</p>
                                <p>ID: {report.patient.patient_number}</p>
                            </div>
                        </div>
                        <div className="text-right space-y-4">
                            <div>
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Report Details:</p>
                                <p><b>Report ID:</b> {report.id.slice(0, 8).toUpperCase()}</p>
                                <p><b>Date Issued:</b> {new Date(report.report_date).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="space-y-8 text-xs leading-relaxed border-t pt-8">
                        {diagnosisLabel && (
                            <section>
                                <h3 className="font-bold text-gray-900 uppercase mb-2">Final Diagnosis / ICD 10:</h3>
                                <p className="text-gray-800 bg-gray-50 p-3 border rounded font-semibold italic">{diagnosisLabel}</p>
                            </section>
                        )}

                        <section>
                            <h3 className="font-bold text-gray-900 uppercase mb-3">Clinical Findings & Detailed Report:</h3>
                            <div
                                className="text-gray-700 min-h-[140mm] text-justify leading-relaxed prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: report.content }}
                            />
                        </section>
                    </div>

                    {/* Signature */}
                    <div className="mt-20 flex justify-end">
                        <div className="text-center w-64 border-t pt-4">
                            <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img
                                    src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg"
                                    alt="Signature"
                                    className="h-16 w-auto mx-auto mb-2"
                                />
                            </a>
                            <div className="text-[10px] space-y-0.5">
                                <p className="font-bold uppercase">{report.doctor.full_name}</p>
                                <p className="text-gray-500">{report.doctor.qualifications}</p>
                                <p className="text-gray-500">{report.doctor.specialization}</p>
                                <p className="text-gray-400 uppercase tracking-widest pt-4 font-bold border-t mt-4 border-gray-100">Medical Practitioner's Signature</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

