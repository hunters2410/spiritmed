import React, { useRef } from 'react';
import {
    Printer, ArrowLeft, Download, Send, Plus, Edit3
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

interface PrescriptionItem {
    id: string;
    medicine_name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
}

interface Prescription {
    id: string;
    created_at: string;
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
}

export function PrescriptionPrintView({ prescription, branch, onBack, onEdit, onAddNew, onSendEmail }: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Prescription_${prescription.patient.full_name}_${new Date(prescription.created_at).toLocaleDateString()}.pdf`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex gap-8">
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
                                <h1 className="text-3xl font-bold text-gray-800 leading-none">{branch.name || 'Clinic Name'}</h1>
                                <p className="text-xs font-semibold text-gray-600 mt-1 uppercase">Professional Healthcare Services</p>
                            </div>
                        </div>
                        <div className="text-right text-[10px] text-gray-500 flex flex-col items-end">
                            <p>{branch.phone}</p>
                            <p>{branch.email}</p>
                            <p>{branch.website}</p>
                            <p className="max-w-[200px] text-right mt-1">{branch.address}</p>
                        </div>
                    </div>

                    {/* Document Title */}
                    <div className="text-center mb-10">
                        <h2 className="text-xl font-bold text-gray-600 tracking-[0.2em] uppercase">Prescription</h2>
                    </div>

                    {/* Patient Details */}
                    <div className="mb-10 text-xs text-gray-600 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="flex gap-2"><span className="font-bold uppercase w-24">Patient:</span> <span className="uppercase">{prescription.patient.full_name}</span></p>
                            <p className="flex gap-2"><span className="font-bold uppercase w-24">Patient No:</span> <span>{prescription.patient.patient_number}</span></p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="flex justify-end gap-2"><span className="font-bold uppercase">Date:</span> <span>{new Date(prescription.created_at).toLocaleDateString()}</span></p>
                            <p className="flex justify-end gap-2"><span className="font-bold uppercase">Gender:</span> <span className="uppercase">{prescription.patient.gender}</span></p>
                        </div>
                    </div>

                    {/* Rx Symbol */}
                    <div className="mb-6">
                        <span className="text-4xl font-serif italic text-gray-800">Rx</span>
                    </div>

                    {/* Medicines Table */}
                    <table className="w-full text-xs text-left mb-12 border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-800">
                                <th className="py-2 font-bold uppercase w-1/3">Medicine</th>
                                <th className="py-2 font-bold uppercase">Dosage</th>
                                <th className="py-2 font-bold uppercase">Frequency</th>
                                <th className="py-2 font-bold uppercase">Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prescription.items.map((item, idx) => (
                                <React.Fragment key={item.id}>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-3 font-semibold text-gray-800">{item.medicine_name}</td>
                                        <td className="py-3 text-gray-600">{item.dosage}</td>
                                        <td className="py-3 text-gray-600">{item.frequency}</td>
                                        <td className="py-3 text-gray-600">{item.duration}</td>
                                    </tr>
                                    {item.instructions && (
                                        <tr className="border-b border-gray-100 italic text-[10px] text-gray-500 bg-gray-50/50">
                                            <td colSpan={4} className="py-1 px-2">Instructions: {item.instructions}</td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>

                    <div className="text-[10px] text-gray-500 italic mb-20">
                        <p>* Please follow specified dosage and finish the course as instructed.</p>
                    </div>

                    {/* Footer Signature */}
                    <div className="mt-auto flex flex-col items-end">
                        <div className="w-56 text-center flex flex-col items-center">
                            {prescription.doctor.signature_url ? (
                                <img src={prescription.doctor.signature_url} alt="Doctor's Signature" className="h-16 w-auto mb-2" />
                            ) : branch.signature_url ? (
                                <img src={branch.signature_url} alt="Clinic Signature" className="h-16 w-auto mb-2" />
                            ) : (
                                <div className="h-16 w-32 border-b border-gray-300 mb-4" />
                            )}
                            <div className="text-[10px] text-gray-600">
                                <p className="font-bold uppercase">{prescription.doctor.full_name}</p>
                                <p className="italic">{prescription.doctor.qualifications}</p>
                                <p>{prescription.doctor.specialization}</p>
                                <p className="mt-2 border-t border-gray-200 pt-1">Authorized Signature</p>
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
                    Back To Prescriptions
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
                    Edit Prescription
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
                    Add New Prescription
                </button>
            </div>
        </div>
    );
}
