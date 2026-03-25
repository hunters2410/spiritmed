import React, { useRef } from 'react';
import {
    Printer, FileText, Mail, Edit3, Plus,
    ArrowLeft, Download, Send
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
    chief_complaint?: string;
    observations?: string;
    diagnosis?: string;
    investigations?: string;
    treatment_plan?: string;
    patient: Patient;
    doctor: Doctor;
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
        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Consultation_${consultation.patient.full_name}_${consultation.consultation_date}.pdf`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex gap-8">
            {/* Printable Area Container */}
            <div className="flex-1 flex justify-center">
                <div
                    ref={printRef}
                    className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[20mm] shadow-xl font-sans print:shadow-none print:p-0"
                >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-12">
                        <div className="flex items-center gap-4">
                            {branch.logo_url ? (
                                <img src={branch.logo_url} alt="Clinic Logo" className="h-16 w-auto object-contain" />
                            ) : (
                                <div className="w-16 h-16 bg-gray-200 flex items-center justify-center rounded text-gray-400">Logo</div>
                            )}
                            <div className="uppercase tracking-tighter">
                                <h1 className="text-3xl font-bold text-gray-800 leading-none">{branch.name || 'UROCARE'}</h1>
                                <p className="text-xs font-semibold text-gray-600 mt-1">UROLOGY & MEN'S HEALTH CLINIC</p>
                            </div>
                        </div>
                        <div className="text-right text-[10px] text-gray-500 flex flex-col items-end">
                            <p>{branch.phone || '+26324250305 | +263778229622'}</p>
                            <p>{branch.email || 'urocare01@gmail.com'}</p>
                            <p>{branch.website || 'www.urocare.co.zw'}</p>
                            <p className="max-w-[200px] text-right mt-1">
                                {branch.address || '27 Harvey Brown In Milton Park, Harare'}
                            </p>
                        </div>
                    </div>

                    {/* Document Title */}
                    <div className="text-center mb-10">
                        <h2 className="text-xl font-bold text-gray-600 dark:text-gray-400 tracking-[0.2em] uppercase">Consultation</h2>
                    </div>

                    {/* Patient Details */}
                    <div className="mb-10 text-xs text-gray-600 space-y-1">
                        <p className="flex gap-2"><span className="font-bold uppercase w-32">Patient:</span> <span className="uppercase">{consultation.patient.full_name}</span></p>
                        <p className="flex gap-2"><span className="font-bold uppercase w-32">Gender:</span> <span className="uppercase">{consultation.patient.gender}</span></p>
                        <p className="flex gap-2"><span className="font-bold uppercase w-32">DOB:</span> <span>{new Date(consultation.patient.date_of_birth).toLocaleDateString()}</span></p>
                    </div>

                    {/* Main Content Sections */}
                    <div className="space-y-8 text-xs">
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2">Diagnosis & ICD 10 Code:</h3>
                            <p className="text-gray-600 whitespace-pre-wrap">{consultation.diagnosis || 'Overactive Bladder / Early BPH - N32.81'}</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2">Main Complaints:</h3>
                            <p className="text-gray-600 whitespace-pre-wrap">{consultation.chief_complaint || 'Urine frequency and urgency'}</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2">Observation:</h3>
                            <p className="text-gray-600 whitespace-pre-wrap">{consultation.observations || 'DM\nHPT\nnocturia with frequency and urine urgency'}</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2">Investigation:</h3>
                            <p className="text-gray-600 whitespace-pre-wrap">{consultation.investigations || 'PSA'}</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2">Treatment Plan:</h3>
                            <p className="text-gray-600 whitespace-pre-wrap">{consultation.treatment_plan || 'Solifenacin and Tamsulosin'}</p>
                        </section>
                    </div>

                    {/* Footer Signature */}
                    <div className="mt-20 flex flex-col items-end">
                        <div className="w-48 text-center flex flex-col items-center">
                            {consultation.doctor.signature_url ? (
                                <img src={consultation.doctor.signature_url} alt="Doctor's Signature" className="h-16 w-auto mb-2" />
                            ) : branch.signature_url ? (
                                <img src={branch.signature_url} alt="Clinic Signature" className="h-16 w-auto mb-2" />
                            ) : (
                                <div className="h-16 w-32 border-b border-gray-300 mb-2 mb-4" />
                            )}
                            <div className="text-[10px] text-gray-600">
                                <p className="font-bold uppercase">{consultation.doctor.full_name || 'DR S. C. MEKI'}</p>
                                <p className="italic">{consultation.doctor.qualifications || 'MMED UROLOGY-UZ'}</p>
                                <p>{consultation.doctor.specialization || 'Specialist Urologist - SU700212'}</p>
                                <p className="mt-2 border-t border-gray-200 pt-1">Doctor's Signature</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Sidebar */}
            <div className="w-64 space-y-3 print:hidden">
                <button
                    onClick={onBack}
                    className="w-full flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back To Consultation Module
                </button>

                <button
                    onClick={handlePrint}
                    className="w-full flex items-center gap-3 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <Printer className="w-4 h-4" />
                    Print
                </button>

                <button
                    onClick={handleDownloadPdf}
                    className="w-full flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    Export To Pdf
                </button>

                <button
                    onClick={onEdit}
                    className="w-full flex items-center gap-3 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <Edit3 className="w-4 h-4" />
                    Edit Consultation
                </button>

                <button
                    onClick={onSendEmail}
                    className="w-full flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <Send className="w-4 h-4" />
                    Send Email
                </button>

                <button
                    onClick={onAddNew}
                    className="w-full flex items-center gap-3 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold text-sm transition shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add New Consultation
                </button>
            </div>
        </div>
    );
}
