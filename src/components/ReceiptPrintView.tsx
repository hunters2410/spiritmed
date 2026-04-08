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
    notes: string;
    invoice: {
        invoice_number: string;
        total_amount: number;
        paid_amount: number;
        balance: number;
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
        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a5'); // Standard receipt size
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`RECEIPT_${data.invoice.invoice_number}_${data.invoice.patient.full_name}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.invoice.patient.email) {
            alert('Patient email is missing.');
            return;
        }

        try {
            setIsSending(true);
            setSendSuccess(false);

            // 1. Generate PDF
            const canvas = await html2canvas(printRef.current, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a5');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            
            const pdfBlob = pdf.output('blob');
            const fileName = `RCPT_${data.invoice.invoice_number}_${Date.now()}.pdf`;
            const filePath = `receipts/${data.id}/${fileName}`;

            // 2. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('financial_documents')
                .upload(filePath, pdfBlob, {
                    contentType: 'application/pdf',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('financial_documents')
                .getPublicUrl(filePath);

            // 4. Send Email
            const result = await emailService.sendEmail({
                recipientEmail: data.invoice.patient.email,
                recipientName: data.invoice.patient.full_name,
                subject: `Payment Receipt for Invoice ${data.invoice.invoice_number}`,
                body: `Dear ${data.invoice.patient.full_name},\n\nThank you for your payment of $${data.amount.toLocaleString()} for Invoice ${data.invoice.invoice_number}.\n\nYou can view and download your official receipt here: ${publicUrl}\n\nThank you for choosing ${branch.name}.`,
                branchId: branch.id,
                referenceId: data.id,
                referenceType: 'receipt',
                fileUrl: publicUrl
            });

            if (result.success) {
                setSendSuccess(true);
                setTimeout(() => setSendSuccess(false), 3000);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error('Email error:', error);
            alert(`Failed to send email: ${error.message}`);
        } finally {
            setIsSending(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex flex-col md:flex-row gap-8 items-start justify-center">
            {/* Sidebar Actions */}
            <div className="w-full md:w-64 space-y-3 print:hidden order-2 md:order-2">
                <button onClick={onBack} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <ArrowLeft className="w-4 h-4 text-cyan-600" /> Back to Dashboard
                </button>
                <button onClick={handlePrint} className="w-full flex items-center justify-center gap-3 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-md">
                    <Printer className="w-4 h-4" /> Print Receipt
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <Download className="w-4 h-4 text-cyan-600" /> Download PDF
                </button>
                <button 
                    onClick={handleSendEmail} 
                    disabled={isSending}
                    className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm ${
                        sendSuccess ? 'bg-green-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
                    }`}
                >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin text-cyan-600" /> : sendSuccess ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4 text-cyan-600" />}
                    {isSending ? 'Sending...' : sendSuccess ? 'Email Sent!' : 'Send Via Email'}
                </button>
            </div>

            {/* Document View */}
            <div className="flex-1 flex justify-center order-1 md:order-1">
                <div
                    ref={printRef}
                    className="bg-white text-gray-900 w-full max-w-[148mm] min-h-[210mm] p-[10mm] shadow-xl font-sans border-t-8 border-cyan-600 print:shadow-none print:p-0"
                >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-4">
                            {branch.logo_url ? (
                                <img src={branch.logo_url} alt="Clinic Logo" className="h-12 w-auto object-contain" />
                            ) : (
                                <div className="w-12 h-12 bg-cyan-50 flex items-center justify-center rounded-lg text-cyan-600 font-black text-xl border-2 border-cyan-100 italic">SM</div>
                            )}
                            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Receipt</h2>
                        </div>
                        <div className="text-right text-[8px] space-y-0.5 text-gray-400 font-medium">
                            <p className="text-gray-900 font-bold">{branch.phone}</p>
                            <p>{branch.email}</p>
                            <p className="max-w-[120px] ml-auto uppercase">{branch.address}</p>
                        </div>
                    </div>

                    {/* Receipt Details */}
                    <div className="bg-gray-50 p-6 rounded-xl mb-8 space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Receipt Date</span>
                            <span className="text-sm font-bold text-gray-900">{new Date(data.payment_date).toLocaleString()}</span>
                        </div>
                        
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Received From</span>
                            <p className="text-lg font-black text-gray-900 uppercase leading-none">{data.invoice.patient.full_name}</p>
                            <p className="text-xs font-bold text-cyan-600 font-mono tracking-tighter">Patient Number: {data.invoice.patient.patient_number}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice Ref</span>
                                <p className="text-sm font-bold text-gray-900 font-mono">{data.invoice.invoice_number}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</span>
                                <p className="text-sm font-bold text-gray-900 uppercase">{data.payment_method}</p>
                            </div>
                        </div>
                    </div>

                    {/* Amount Block */}
                    <div className="text-center py-8 border-y-2 border-dashed border-gray-200 mb-8">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Amount Received</span>
                        <div className="text-5xl font-black text-gray-900 font-mono">
                            ${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    {data.notes && (
                        <div className="mb-6">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Notes / Reference</span>
                            <p className="text-xs text-gray-600 italic leading-relaxed">{data.notes}</p>
                        </div>
                    )}

                    {/* Financial Summary */}
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2 mb-8">
                        <div className="flex justify-between text-[8px] font-bold text-gray-400 uppercase">
                            <span>Statement Summary</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-600 font-medium uppercase">
                            <span>Total Bill Amount</span>
                            <span className="font-mono text-gray-900">${(data.invoice.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-green-600 font-medium uppercase">
                            <span>Total Paid To Date</span>
                            <span className="font-mono">${(data.invoice.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-xs text-amber-600 font-black uppercase pt-1 border-t border-gray-200 mt-1">
                            <span>Remaining Balance</span>
                            <span className="font-mono">${(data.invoice.balance ?? data.invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col items-center justify-end text-center space-y-1 mt-12 pb-8">
                        {branch.signature_url ? (
                            <img src={branch.signature_url} alt="Authorized Signature" className="h-12 w-auto mb-1" />
                        ) : (
                            <div className="w-40 h-10 border-b border-gray-200 mb-2"></div>
                        )}
                        <p className="font-black uppercase text-gray-900 leading-none text-[10px]">Administrative Office</p>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[8px]">Electronic Receipt - No Signature Required</p>
                        
                        <div className="mt-8 pt-4 border-t border-gray-50 w-full">
                            <p className="text-[7px] text-gray-400 uppercase font-bold tracking-widest text-center">
                                Thank you for your payment
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
