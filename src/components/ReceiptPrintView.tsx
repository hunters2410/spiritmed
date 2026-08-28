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
        payment_method?: string;
        medical_aid_amount?: number;
        shortfall_amount?: number;
        medical_aid_balance?: number;
        shortfall_balance?: number;
        bill_items?: {
            id?: string;
            code?: string;
            description: string;
            quantity: number;
            unit_price: number;
            total_price: number;
        }[];
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
        await exportElementToPdf(printRef.current, `RECEIPT_${data.bill.bill_number}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.bill.patient.email) {
            alert('Patient email is missing.');
            return;
        }

        try {
            setIsSending(true);
            const pdfBlob = (await exportElementToPdf(printRef.current, '', true)) as Blob;
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

                    {/* Services & Procedures Table */}
                    {data.bill.bill_items && data.bill.bill_items.length > 0 && (
                        <div className="mb-10">
                            <p className="uppercase text-[9px] font-bold text-gray-500 tracking-widest mb-2 border-b pb-1">Services &amp; Procedures</p>
                            <table className="w-full text-[10px] border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-600 uppercase text-[9px] font-black tracking-wider">
                                        <th className="px-3 py-2 text-left border border-gray-200">Description</th>
                                        <th className="px-3 py-2 text-center border border-gray-200 w-16">Qty</th>
                                        <th className="px-3 py-2 text-right border border-gray-200 w-24">Unit Price</th>
                                        <th className="px-3 py-2 text-right border border-gray-200 w-24">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.bill.bill_items.map((item, idx) => (
                                        <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">
                                                {item.code && <span className="text-gray-400 mr-1.5">[{item.code}]</span>}
                                                {item.description}
                                            </td>
                                            <td className="px-3 py-2 border border-gray-200 text-center">{item.quantity}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-right font-mono">${(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-right font-mono font-bold">${(item.total_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100">
                                        <td colSpan={3} className="px-3 py-2 text-right text-[9px] uppercase font-black text-gray-500 border border-gray-200">Invoice Total</td>
                                        <td className="px-3 py-2 text-right font-black border border-gray-200">${(data.bill.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

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

                    {/* Billing Split — only for medical aid patients */}
                    {data.bill.payment_method === 'medical_aid' && (data.bill.medical_aid_amount || 0) > 0 && (
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
                            <span className="text-red-600">${(
                                (() => {
                                    const stored = data.bill.balance ?? 0;
                                    const paid = data.bill.paid_amount ?? 0;
                                    return stored > 0 ? stored : Math.max(0, (data.bill.total_amount || 0) - paid);
                                })()
                            ).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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

