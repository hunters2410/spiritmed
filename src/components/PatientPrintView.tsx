import { useRef, useState } from 'react';
import { Printer, ArrowLeft, Download, Send, Loader2, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { emailService } from '../utils/emailService';
import { exportElementToPdf } from '../utils/exportUtils';

interface Branch {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    logo_url?: string;
    website?: string;
    signature_url?: string;
}

interface Patient {
    id: string;
    patient_number: string;
    full_name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
    email: string;
    blood_group: string;
    address: string;
    medical_aid_provider?: string;
    medical_aid_number?: string;
    medical_aid_scheme?: string;
    allergies?: string;
    chronic_conditions?: string;
    clinical_history?: string;
    chronic_medications?: string;
    smoke?: string;
    alcohol?: string;
    social_lifestyle?: string;
    insurance_provider?: string;
    insurance_policy_number?: string;
    id_passport_number?: string;
    next_of_kin_name?: string;
    next_of_kin_phone?: string;
    next_of_kin_relationship?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
    initial_consultation_date?: string;
    responsible_person_name?: string;
    responsible_person_address?: string;
    responsible_person_phone?: string;
    responsible_person_id_number?: string;
    responsible_person_email?: string;
    payment_method?: string;
    medical_aid_main_member?: string;
    medical_aid?: { name: string };
    status: string;
    created_at: string;
    total_due?: number;
    total_shortfall_due?: number;
    total_medical_aid_due?: number;
}

interface Props {
    patient: Patient;
    branch: Branch;
    onBack: () => void;
}

export function PatientPrintView({ patient, branch, onBack }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        await exportElementToPdf(printRef.current, `PATIENT_RECORD_${patient.patient_number}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !patient.email) {
            alert('Patient email is missing.');
            return;
        }

        try {
            setIsSending(true);
            const pdfBlob = (await exportElementToPdf(printRef.current, '', true)) as Blob;
            const fileName = `RECORD_${patient.patient_number}_${Date.now()}.pdf`;
            const filePath = `patient_records/${patient.id}/${fileName}`;

            await supabase.storage.from('clinical_documents').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

            const { data: { publicUrl } } = supabase.storage.from('clinical_documents').getPublicUrl(filePath);

            await emailService.sendEmail({
                recipientEmail: patient.email,
                recipientName: patient.full_name,
                subject: `Medical Record - ${patient.full_name}`,
                body: `Attached is your medical record from ${branch.name}.`,
                branchId: branch.id,
                referenceId: patient.id,
                referenceType: 'patient',
                fileUrl: publicUrl
            });

            setSendSuccess(true);
            setTimeout(() => setSendSuccess(false), 3000);
        } catch (error: any) {
            alert(`Failed: ${error.message}`);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-center">
            {/* Sidebar Actions */}
            <div className="w-full md:w-64 space-y-2 print:hidden">
                <button onClick={onBack} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded shadow-sm text-sm">
                    <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Download className="w-4 h-4" /> PDF
                </button>
                <button onClick={handleSendEmail} disabled={isSending} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin text-green-600" /> : sendSuccess ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {isSending ? 'Sending...' : sendSuccess ? 'Sent!' : 'Email'}
                </button>
            </div>

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 10mm; }
                    body { background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
            {/* Document View */}
            <div className="flex-1 w-full overflow-x-auto flex justify-center print:block print:w-full">
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

                    <div className="text-center mb-6">
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest">Patient Information Sheet</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-[11px]">
                        {/* 1. Profile */}
                        <div className="col-span-2 bg-gray-100 p-1 px-3 mt-2 font-bold uppercase">1. Personal Information</div>
                        <div>
                            <p><span className="text-gray-500">Full Name:</span> <b>{patient.full_name}</b></p>
                            <p><span className="text-gray-500">Patient ID:</span> <b>{patient.patient_number}</b></p>
                            <p><span className="text-gray-500">ID/Passport:</span> <b>{patient.id_passport_number || '-'}</b></p>
                        </div>
                        <div>
                            <p><span className="text-gray-500">Birth Date:</span> <b>{patient.date_of_birth || '-'}</b></p>
                            <p><span className="text-gray-500">Gender:</span> <b>{patient.gender}</b></p>
                            <p><span className="text-gray-500">Blood Group:</span> <b>{patient.blood_group || '-'}</b></p>
                        </div>
                        <div className="col-span-2">
                             <p><span className="text-gray-500">Address:</span> <b>{patient.address || '-'}</b></p>
                             <p><span className="text-gray-500">Phone/Email:</span> <b>{patient.phone} {patient.email ? `/ ${patient.email}` : ''}</b></p>
                        </div>

                        {/* 2. Medical */}
                        <div className="col-span-2 bg-gray-100 p-1 px-3 mt-4 font-bold uppercase">2. Medical Summary</div>
                        <div className="col-span-2">
                            <p><span className="text-gray-500">Allergies:</span> <b>{patient.allergies || 'None'}</b></p>
                            <p><span className="text-gray-500">Chronic Conditions:</span> <b>{patient.chronic_conditions || 'None'}</b></p>
                            <p><span className="text-gray-500">Medications:</span> <b>{patient.chronic_medications || 'None'}</b></p>
                        </div>

                        {/* 3. Responsibility */}
                        <div className="col-span-2 bg-gray-100 p-1 px-3 mt-4 font-bold uppercase">3. Financial Responsibility</div>
                        <div>
                            <p><span className="text-gray-500">Responsible Person:</span> <b>{patient.responsible_person_name || patient.full_name}</b></p>
                            <p><span className="text-gray-500">Responsible ID:</span> <b>{patient.responsible_person_id_number || '-'}</b></p>
                        </div>
                        <div>
                            <p><span className="text-gray-500">Payment Method:</span> <b>{patient.payment_method?.toUpperCase()}</b></p>
                            <p><span className="text-gray-500">Billing Phone:</span> <b>{patient.responsible_person_phone || '-'}</b></p>
                        </div>

                        {/* 4. Medical Aid */}
                        <div className="col-span-2 bg-gray-100 p-1 px-3 mt-4 font-bold uppercase">4. Medical Aid Details</div>
                        <div>
                            <p><span className="text-gray-500">Provider:</span> <b>{(patient.payment_method === 'medical_aid' || patient.medical_aid_provider) ? (patient.medical_aid?.name || patient.medical_aid_provider || '-') : 'N/A'}</b></p>
                            <p><span className="text-gray-500">Scheme:</span> <b>{patient.medical_aid_scheme || '-'}</b></p>
                        </div>
                        <div>
                            <p><span className="text-gray-500">Member Number:</span> <b>{patient.medical_aid_number || '-'}</b></p>
                            <p><span className="text-gray-500">Main Member:</span> <b>{patient.medical_aid_main_member || '-'}</b></p>
                        </div>

                        {/* 5. Emergency */}
                        <div className="col-span-2 bg-gray-100 p-1 px-3 mt-4 font-bold uppercase">5. Emergency Contact</div>
                        <div>
                            <p><span className="text-gray-500">Next of Kin:</span> <b>{patient.next_of_kin_name || '-'}</b> ({patient.next_of_kin_relationship})</p>
                            <p><span className="text-gray-500">Phone:</span> <b>{patient.next_of_kin_phone || '-'}</b></p>
                        </div>
                        <div>
                            <p><span className="text-gray-500">Emergency Contact:</span> <b>{patient.emergency_contact_name || '-'}</b></p>
                            <p><span className="text-gray-500">Phone:</span> <b>{patient.emergency_contact_phone || '-'}</b></p>
                        </div>

                        {/* 6. Outstanding Balance */}
                        {((patient.total_due || 0) > 0 || (patient.total_shortfall_due || 0) > 0 || (patient.total_medical_aid_due || 0) > 0) && (
                            <>
                                <div className="col-span-2 bg-amber-100 border border-amber-300 p-1 px-3 mt-4 font-bold uppercase text-amber-800">6. Outstanding Balance</div>
                                <div>
                                    <p><span className="text-gray-500">Total Due:</span> <b className="text-amber-700">${(patient.total_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                                    {(patient.total_shortfall_due || 0) > 0 && (
                                        <p><span className="text-gray-500">Patient Shortfall:</span> <b>${(patient.total_shortfall_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                                    )}
                                </div>
                                <div>
                                    {(patient.total_medical_aid_due || 0) > 0 && (
                                        <p><span className="text-gray-500">Medical Aid Due:</span> <b>${(patient.total_medical_aid_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                                    )}
                                    <p><span className="text-gray-500">Status:</span> <b className="text-amber-700">Balance Outstanding</b></p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Signatures */}
                    <div className="mt-16 flex justify-between px-4">
                        <div className="text-center pt-2 border-t w-56 text-[10px]">
                            <p>PATIENT SIGNATURE</p>
                        </div>
                        <div className="text-center pt-2 border-t w-56 text-[10px]">
                            <p>AUTHORISED OFFICER</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

