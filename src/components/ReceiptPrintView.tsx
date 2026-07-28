import { useRef, useState } from 'react';
import { Printer, ArrowLeft, Download, Send, Loader2, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { emailService } from '../utils/emailService';

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

interface PaymentData {
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    discount_amount?: number;
    target_portion?: string;
    notes: string;
    bill: {
        bill_number: string;
        total_amount: number;
        paid_amount: number;
        balance: number;
        medical_aid_amount?: number;
        shortfall_amount?: number;
        medical_aid_balance?: number;
        shortfall_balance?: number;
        patient: {
            full_name: string;
            patient_number: string;
            email?: string;
        };
    };
}

interface Props {
    data: PaymentData;
    branch: Branch;
    onBack: () => void;
}

export function ReceiptPrintView({ data, branch, onBack }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

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
        pdf.save(`RECEIPT_${data.bill.bill_number}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.bill.patient.email) {
            alert('Patient email is missing.');
            return;
        }

        try {
            setIsSending(true);
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
            
            const pdfBlob = pdf.output('blob');
            const fileName = `RCPT_${data.bill.bill_number}_${Date.now()}.pdf`;
            const filePath = `receipts/${data.id}/${fileName}`;

            await supabase.storage.from('financial_documents').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

            const { data: { publicUrl } } = supabase.storage.from('financial_documents').getPublicUrl(filePath);

            await emailService.sendEmail({
                recipientEmail: data.bill.patient.email,
                recipientName: data.bill.patient.full_name,
                subject: `Payment Receipt - ${data.bill.bill_number}`,
                body: `Dear ${data.bill.patient.full_name},\n\nThank you for your payment. Please find your official receipt attached.`,
                branchId: branch.id,
                referenceId: data.id,
                referenceType: 'receipt',
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
                <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded shadow-sm text-sm">
                    <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Download className="w-4 h-4" /> PDF
                </button>
                <button onClick={handleSendEmail} disabled={isSending} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin text-cyan-600" /> : sendSuccess ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {isSending ? 'Sending...' : sendSuccess ? 'Sent!' : 'Email'}
                </button>
            </div>

            {/* Document View */}
            <div className="flex-1 max-w-[210mm]">
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

                    <div className="text-center mb-10">
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest">Official Payment Receipt</h2>
                    </div>

                    <div className="bg-gray-50 border p-6 mb-10 text-[11px] grid grid-cols-2 gap-8">
                        <div>
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Received From:</p>
                            <p className="text-sm font-bold uppercase">{data.bill.patient.full_name}</p>
                            <p>ID: {data.bill.patient.patient_number}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Receipt Details:</p>
                            <p><b>Invoice #:</b> {data.bill.bill_number}</p>
                            <p><b>Payment Date:</b> {new Date(data.payment_date).toLocaleString()}</p>
                            <p><b>Method:</b> <span className="uppercase font-bold">{data.payment_method.toUpperCase()}</span></p>
                        </div>
                    </div>

                    <div className="py-12 border-y-2 border-double border-gray-200 mb-10 text-center">
                        <p className="uppercase text-[10px] font-bold text-gray-400 tracking-widest mb-2">Total Amount Received</p>
                        <p className="text-5xl font-bold">${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>

                    {data.notes && (
                        <div className="mb-10 text-[11px]">
                            <p className="font-bold uppercase text-gray-500 text-[9px] mb-1">Notes / Reference:</p>
                            <p className="italic text-gray-700">{data.notes}</p>
                        </div>
                    )}

                    {/* Split Financial Summary */}
                    {(data.bill.medical_aid_amount || 0) > 0 && (
                        <div className="mb-10 overflow-hidden border border-gray-200 rounded-lg">
                            <table className="w-full text-[10px] text-left border-collapse">
                                <thead className="bg-gray-100 uppercase font-black text-gray-500 tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2 border-r">Billing Split</th>
                                        <th className="px-4 py-2 border-r text-right">Total Amount</th>
                                        <th className="px-4 py-2 border-r text-right">Running Bal.</th>
                                        <th className="px-4 py-2 text-right">Portion Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-gray-700">
                                    <tr>
                                        <td className="px-4 py-2 border-r font-bold">Medical Aid Portion</td>
                                        <td className="px-4 py-2 border-r text-right font-mono">${(data.bill.medical_aid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 border-r text-right font-mono text-red-600">${(data.bill.medical_aid_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${(data.bill.medical_aid_balance || 0) <= 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {(data.bill.medical_aid_balance || 0) <= 0 ? 'CLEARED' : 'PENDING'}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr className="bg-gray-50/50">
                                        <td className="px-4 py-2 border-r font-bold">Patient Shortfall</td>
                                        <td className="px-4 py-2 border-r text-right font-mono">${(data.bill.shortfall_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 border-r text-right font-mono text-red-600">${(data.bill.shortfall_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${(data.bill.shortfall_balance || 0) <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {(data.bill.shortfall_balance || 0) <= 0 ? 'CLEARED' : 'DUE'}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="border border-gray-100 bg-gray-50 p-4 mb-10 text-[11px] space-y-2">
                        <p className="font-bold uppercase text-[9px] text-gray-400 border-b pb-1">Comprehensive Statement Summary:</p>
                        <div className="flex justify-between">
                            <span>Total Combined Bill Amount:</span>
                            <span className="font-black">${(data.bill.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        {data.discount_amount && data.discount_amount > 0 ? (
                            <div className="flex justify-between text-amber-600 font-bold">
                                <span>Total Discount Applied:</span>
                                <span>-${data.discount_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between font-black text-sm pt-1 bg-yellow-100/50 px-2 rounded">
                            <span className="uppercase tracking-widest text-[10px]">Net Remaining Balance:</span>
                            <span className="text-red-600">${(data.bill.balance ?? data.bill.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mt-20 px-4">
                        <div className="text-[10px]">
                            <p className="text-gray-400 italic uppercase tracking-widest">Official Electronic Receipt</p>
                            <p className="text-gray-400 italic">No signature required.</p>
                        </div>
                        <div className="text-center space-y-2">
                            <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-12 w-auto mx-auto mb-2" />
                            </a>
                            <p className="text-[10px] font-bold uppercase">Accounts Office</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

