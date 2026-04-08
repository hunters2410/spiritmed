import { useRef } from 'react';
import {
    Printer, ArrowLeft, Download, Send, Edit3, Plus
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
}

export function ClinicalDocumentPrintView({
    type, data, branch,
    allAnaesthetists = [], allAssistants = [], allDiagnoses = [],
    onBack, onEdit, onAddNew, onSendEmail
}: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${type}_${data.patient.full_name}_${data.report_date}.pdf`);
    };

    const handlePrint = () => {
        window.print();
    };

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
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Diagnosis:</h3>
                            <p className="text-gray-800 font-semibold">{data.diagnosis?.label || data.diagnosis_text || 'N/A'}</p>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Medical History:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.medical_history || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Treatment Done:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.treatment_done || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Follow-up Plan:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.follow_up_plan || 'N/A'}</div>
                        </section>
                    </div>
                );
            case 'referral':
                return (
                    <div className="space-y-6">
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Reason for Referral:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.reason_for_referral || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Background History:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.background_history || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Treatment Done:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.treatment_done || 'N/A'}</div>
                        </section>
                    </div>
                );
            case 'certificate':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Date Attended:</h3>
                                <p className="text-gray-800">{data.date_attended ? new Date(data.date_attended).toLocaleDateString() : 'N/A'}</p>
                            </section>
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Date of Illness:</h3>
                                <p className="text-gray-800">{data.illness_date ? new Date(data.illness_date).toLocaleDateString() : 'N/A'}</p>
                            </section>
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Date of Resume:</h3>
                                <p className="text-gray-800 font-bold">{data.resume_date ? new Date(data.resume_date).toLocaleDateString() : 'N/A'}</p>
                            </section>
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Period:</h3>
                                <p className="text-gray-800">{data.period} {data.time_unit || 'Days'}</p>
                            </section>
                        </div>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Purpose / Remarks:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.purpose || 'N/A'}</div>
                        </section>
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
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
                            <div><span className="font-bold uppercase text-gray-500 w-24 inline-block">Hospital:</span> {data.hospital?.name || data.hospital || 'N/A'}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-24 inline-block">Anaesthetist:</span> {anaesthetistNames}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-24 inline-block">Assistant:</span> {assistantNames}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-24 inline-block">Anaesthesia:</span> {data.anaesthesia_type || 'N/A'}</div>
                        </div>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Surgical Procedure(s):</h3>
                            <p className="text-gray-800 font-semibold">{data.procedure?.name || data.procedure_text || 'N/A'}</p>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Operation Description:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap min-h-[50mm]">{data.description || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Post Operation Plan:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.post_op_plan || 'N/A'}</div>
                        </section>
                        <div className="grid grid-cols-2 gap-4">
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Follow-up Date:</h3>
                                <p className="text-gray-800">{data.follow_up_date || 'N/A'}</p>
                            </section>
                            {data.follow_up_time && (
                                <section>
                                    <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Follow-up Time:</h3>
                                    <p className="text-gray-800">{data.follow_up_time}</p>
                                </section>
                            )}
                        </div>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Remarks:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.remarks || 'N/A'}</div>
                        </section>
                    </div>
                );
            case 'admission':
                const diagnosisLabels = data.diagnosis_ids?.length
                    ? data.diagnosis_ids.map((id: string) => allDiagnoses.find(d => d.id === id)?.label).filter(Boolean).join(', ')
                    : (data.diagnosis?.label || 'N/A');

                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
                            <div><span className="font-bold uppercase text-gray-500 w-32 inline-block">Hospital:</span> {data.hospital?.name || data.hospital || 'N/A'}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-32 inline-block">Admission Date:</span> {data.admission_date ? new Date(data.admission_date).toLocaleString() : 'N/A'}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-32 inline-block">Clinical Diagnosis:</span> {diagnosisLabels}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-32 inline-block">Surgical Procedure:</span> {data.procedure?.name || data.procedure_text || 'N/A'}</div>
                            <div><span className="font-bold uppercase text-gray-500 w-32 inline-block">Date of Procedure:</span> {data.procedure_date || 'N/A'}</div>
                        </div>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1 underline">Admission Plan:</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-bold text-[10px] text-gray-500 uppercase mb-2 italic">Bloods:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {(data.plan_bloods || []).map((b: string) => (
                                            <span key={b} className="px-2 py-0.5 bg-gray-50 rounded border border-gray-200 text-gray-600">[x] {b}</span>
                                        ))}
                                        {(!data.plan_bloods || data.plan_bloods.length === 0) && <span className="text-gray-400">None</span>}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-[10px] text-gray-500 uppercase mb-2 italic">Imaging:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {(data.plan_imaging || []).map((i: string) => (
                                            <span key={i} className="px-2 py-0.5 bg-gray-50 rounded border border-gray-200 text-gray-600">[x] {i}</span>
                                        ))}
                                        {(!data.plan_imaging || data.plan_imaging.length === 0) && <span className="text-gray-400">None</span>}
                                    </div>
                                </div>
                            </div>
                            {data.plan_other && (
                                <div className="mt-4">
                                    <h4 className="font-bold text-[10px] text-gray-500 uppercase mb-1 italic">Other Tests:</h4>
                                    <div className="text-gray-700">{data.plan_other}</div>
                                </div>
                            )}
                        </section>
                        <div className="grid grid-cols-3 gap-4">
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Nil Per Oral:</h3>
                                <p className="text-gray-800 font-bold underline">{data.npo_oral || 'N/A'}</p>
                            </section>
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Date:</h3>
                                <p className="text-gray-800">{data.npo_date || 'N/A'}</p>
                            </section>
                            <section>
                                <h3 className="font-bold text-gray-700 uppercase mb-1 border-b border-gray-100 pb-1">Time:</h3>
                                <p className="text-gray-800">{data.npo_time || 'N/A'}</p>
                            </section>
                        </div>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">IV Fluids:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.iv_fluids || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Medication:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.medication || 'N/A'}</div>
                        </section>
                        <section>
                            <h3 className="font-bold text-gray-700 uppercase mb-2 border-b border-gray-100 pb-1">Other:</h3>
                            <div className="text-gray-700 whitespace-pre-wrap">{data.other || 'N/A'}</div>
                        </section>
                    </div>
                );
            default:
                return null;
        }
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
                                <h1 className="text-3xl font-bold text-gray-800 leading-none">{branch.name}</h1>
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
                        <h2 className="text-xl font-bold text-gray-600 tracking-[0.2em] uppercase border-y-2 border-gray-100 py-2">{getTitle()}</h2>
                    </div>

                    {/* Meta Section */}
                    <div className="flex justify-between mb-10 text-xs text-gray-600">
                        <div className="space-y-1">
                            <p className="flex gap-2"><span className="font-bold uppercase w-24">Date:</span> <span>{new Date(data.report_date).toLocaleDateString()}</span></p>
                            <p className="flex gap-2"><span className="font-bold uppercase w-24">TO:</span> <span className="uppercase font-semibold text-gray-800">{data.recipient || 'WHOM IT MAY CONCERN'}</span></p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="flex gap-2 justify-end"><span className="font-bold uppercase w-24">Patient:</span> <span className="uppercase font-semibold text-gray-800">{data.patient.full_name}</span></p>
                            <p className="flex gap-2 justify-end"><span className="font-bold uppercase w-24">Sex:</span> <span className="uppercase">{data.patient.gender}</span></p>
                            <p className="flex gap-2 justify-end"><span className="font-bold uppercase w-24">Ref No:</span> <span className="uppercase font-mono">{data.patient.patient_number}</span></p>
                        </div>
                    </div>

                    {/* Document Content */}
                    <div className="text-xs leading-relaxed min-h-[160mm]">
                        {renderContent()}
                    </div>

                    {/* Footer Signature */}
                    <div className="mt-12 flex flex-col items-end">
                        <div className="w-48 text-center flex flex-col items-center">
                            {data.doctor.signature_url ? (
                                <img src={data.doctor.signature_url} alt="Signature" className="h-16 w-auto mb-2" />
                            ) : branch.signature_url ? (
                                <img src={branch.signature_url} alt="Clinic Signature" className="h-16 w-auto mb-2" />
                            ) : (
                                <div className="h-16 w-38 border-b border-gray-300 mb-2" />
                            )}
                            <div className="text-[10px] text-gray-600">
                                <p className="font-bold uppercase">Dr. {data.doctor.full_name}</p>
                                <p className="italic">{data.doctor.qualifications}</p>
                                <p>{data.doctor.specialization}</p>
                                <p className="mt-2 border-t border-gray-200 pt-1">Medical Practitioner's Signature</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar Actions */}
            <div className="w-64 space-y-3 print:hidden">
                <button onClick={onBack} className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <ArrowLeft className="w-4 h-4 text-indigo-600" /> Back To List
                </button>
                <button onClick={handlePrint} className="w-full flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-md">
                    <Printer className="w-4 h-4" /> Print Document
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <Download className="w-4 h-4 text-indigo-600" /> Download PDF
                </button>
                <button onClick={onEdit} className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <Edit3 className="w-4 h-4 text-amber-600" /> Edit Document
                </button>
                <button onClick={onSendEmail} className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <Send className="w-4 h-4 text-indigo-600" /> Send via Email
                </button>
                <div className="pt-4 border-t border-gray-200 mt-4">
                    <button onClick={onAddNew} className="w-full flex items-center gap-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2.5 rounded-lg font-bold text-xs transition border border-indigo-100">
                        <Plus className="w-4 h-4" /> Create New
                    </button>
                </div>
            </div>
        </div>
    );
}
