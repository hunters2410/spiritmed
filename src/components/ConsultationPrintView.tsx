import React, { useRef } from 'react';
import { Printer, Edit3, Plus, ArrowLeft, Download, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const renderHtmlOrText = (text?: string) => {
    if (!text) return 'N/A';
    if (/<[a-z][\s\S]*>/i.test(text)) {
        return <div dangerouslySetInnerHTML={{ __html: text }} className="rich-text-content text-xs text-gray-700 dark:text-gray-300" />;
    }
    return <div className="whitespace-pre-wrap">{text}</div>;
};

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

interface Consultation {
    id: string;
    consultation_date: string;
    created_at?: string;
    chief_complaint?: string;
    observations?: string;
    physical_examination?: string;
    diagnosis?: string;
    investigations?: string;
    treatment_plan?: string;
    notes?: string;
    patient: Patient;
    doctor: Doctor;
    referral_doctor?: { full_name: string };
}

interface Props {
    consultation: Consultation;
    branch: Branch;
    onBack: () => void;
    onEdit: () => void;
    onAddNew: () => void;
    onSendEmail: () => void;
}

export function ConsultationPrintView({ consultation, branch, onBack, onEdit, onAddNew, onSendEmail }: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { 
            scale: 2,
            useCORS: true,
            allowTaint: true
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`CONSULTATION_${consultation.patient.full_name}.pdf`);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-center">
            <style>{`
                .rich-text-content ul { list-style-type: disc !important; margin-left: 1.5rem !important; padding-left: 0.5rem !important; display: block !important; }
                .rich-text-content ol { list-style-type: decimal !important; margin-left: 1.5rem !important; padding-left: 0.5rem !important; display: block !important; }
                .rich-text-content li { margin-bottom: 0.25rem !important; display: list-item !important; }
                .rich-text-content p { margin-bottom: 0.5rem !important; }
            `}</style>
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

            {/* Document View */}
            <div className="flex-1 max-w-[210mm] order-1 md:order-2">
                <div ref={printRef} className="bg-white p-[20mm] shadow-lg print:shadow-none print:p-0 text-gray-900 border border-gray-200 print:border-none">
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
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest text-gray-600">Consultation Record</h2>
                    </div>

                    {/* Patient Info */}
                    <div className="grid grid-cols-2 gap-8 mb-8 text-[11px]">
                        <div>
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Patient Details:</p>
                            <p className="text-sm font-bold uppercase">{consultation.patient.full_name}</p>
                            <p>ID: {consultation.patient.patient_number}</p>
                            <p>Gender: {consultation.patient.gender}</p>
                            <p>DOB: {new Date(consultation.patient.date_of_birth).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold uppercase text-[9px] text-gray-400 mb-1">Visit Details:</p>
                            <p><b>Consultation ID:</b> {consultation.id.slice(0, 8)}</p>
                            <p><b>Visit Date:</b> {new Date(consultation.created_at || consultation.consultation_date || new Date()).toLocaleDateString()}</p>
                            {consultation.referral_doctor?.full_name && (
                                <p><b>Referred By:</b> {consultation.referral_doctor.full_name}</p>
                            )}
                        </div>
                    </div>

                    {/* Clinical Content */}
                    <div className="space-y-6 text-[11px]">
                        {consultation.diagnosis && (
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Diagnosis &amp; ICD 10 Code</p>
                                {renderHtmlOrText(consultation.diagnosis)}
                            </div>
                        )}
                        {consultation.chief_complaint && (
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Chief Complaint (Main Complaints)</p>
                                {renderHtmlOrText(consultation.chief_complaint)}
                            </div>
                        )}
                        {(consultation.physical_examination || consultation.observations) && (
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Observation / Objective</p>
                                {renderHtmlOrText(consultation.physical_examination || consultation.observations)}
                            </div>
                        )}
                        {consultation.investigations && (
                            <div className="border border-gray-100 rounded p-4">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Investigation</p>
                                {renderHtmlOrText(consultation.investigations)}
                            </div>
                        )}
                        {consultation.treatment_plan && (
                            <div className="border border-gray-100 rounded p-4 shadow-sm bg-gray-50/30">
                                <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1 italic">Treatment Plan / Assessment &amp; Plan</p>
                                <div className="font-medium">{renderHtmlOrText(consultation.treatment_plan)}</div>
                            </div>
                        )}
                        {consultation.notes && (
                            <div className={
                                (!consultation.diagnosis && 
                                 !consultation.chief_complaint && 
                                 !consultation.physical_examination && 
                                 !consultation.observations && 
                                 !consultation.investigations && 
                                 !consultation.treatment_plan)
                                    ? "" 
                                    : "border border-gray-100 rounded p-4 shadow-sm bg-gray-50/20"
                            }>
                                {(!consultation.diagnosis && 
                                  !consultation.chief_complaint && 
                                  !consultation.physical_examination && 
                                  !consultation.observations && 
                                  !consultation.investigations && 
                                  !consultation.treatment_plan)
                                    ? null 
                                    : <p className="font-bold uppercase text-[9px] text-gray-400 mb-2 border-b pb-1">Remarks &amp; Clinical Notes / Raw Transcript</p>
                                }
                                <div className="font-sans text-xs leading-relaxed text-gray-800 bg-gray-50/50 p-3 rounded border border-gray-100/50">
                                    {renderHtmlOrText(consultation.notes)}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Signature */}
                    <div className="mt-20 flex justify-end">
                        <div className="text-center w-56">
                            <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-16 w-auto mx-auto mb-2" />
                            </a>
                            <div className="text-[10px] space-y-0.5">
                                <p className="font-bold uppercase">{consultation.doctor.full_name}</p>
                                <p className="text-gray-500">{consultation.doctor.qualifications}</p>
                                <p className="text-gray-400 uppercase tracking-widest pt-2">Authorized Physician</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

