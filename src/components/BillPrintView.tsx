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
    website_config?: {
        bank_name?: string;
        account_number?: string;
        swift_code?: string;
    };
}

interface BillItem {
    code?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface BillData {
    id: string;
    bill_number: string;
    bill_date: string;
    due_date: string;
    total_amount: number;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    paid_amount: number;
    balance: number;
    status: string;
    medical_aid_amount?: number;
    shortfall_amount?: number;
    medical_aid_balance?: number;
    shortfall_balance?: number;
    payment_method: string;
    patient: {
        full_name: string;
        patient_number: string;
        email?: string;
    };
    bill_items: BillItem[];
}

interface Props {
    data: BillData;
    branch: Branch;
    doctorSignature?: string;
    onBack: () => void;
}

export function BillPrintView({ data, branch, onBack }: Props) {
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
        pdf.save(`INV_${data.bill_number}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.patient.email) {
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
            const fileName = `INV_${data.bill_number}_${Date.now()}.pdf`;
            const filePath = `bills/${data.id}/${fileName}`;

            await supabase.storage.from('financial_documents').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

            const { data: { publicUrl } } = supabase.storage.from('financial_documents').getPublicUrl(filePath);

            await emailService.sendEmail({
                recipientEmail: data.patient.email,
                recipientName: data.patient.full_name,
                subject: `Invoice - ${data.bill_number}`,
                body: `Dear ${data.patient.full_name},\n\nPlease find attached your invoice from ${branch.name}.`,
                branchId: branch.id,
                referenceId: data.id,
                referenceType: 'bill',
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
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest">Patient Invoice</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-10 text-[11px]">
                        <div>
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Bill To:</p>
                            <p className="text-sm font-bold uppercase">{data.patient.full_name}</p>
                            <p>ID: {data.patient.patient_number}</p>
                            <p>{data.patient.email}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Invoice Details:</p>
                            <p><b>Invoice #:</b> {data.bill_number}</p>
                            <p><b>Invoice Date:</b> {new Date(data.bill_date).toLocaleDateString()}</p>
                            <p><b>Due Date:</b> {new Date(data.due_date).toLocaleDateString()}</p>
                            <p><b>Status:</b> <span className="font-bold capitalize">{data.status.replace(/_/g, ' ')}</span></p>
                        </div>
                    </div>

                    <table className="w-full text-[11px] mb-10">
                        <thead>
                            <tr className="border-y bg-gray-50 uppercase text-[9px] font-bold">
                                <th className="px-4 py-2 text-left w-24">Code</th>
                                <th className="px-4 py-2 text-left">Description</th>
                                <th className="px-4 py-2 text-center w-20">Qty</th>
                                <th className="px-4 py-2 text-right w-32">Unit Price</th>
                                <th className="px-4 py-2 text-right w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.bill_items.map((item, idx) => (
                                <tr key={idx} className="border-b">
                                    <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{item.code || '---'}</td>
                                    <td className="px-4 py-3 uppercase">{item.description}</td>
                                    <td className="px-4 py-3 text-center">{item.quantity}</td>
                                    <td className="px-4 py-3 text-right">${item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-3 text-right font-bold">${item.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={3} className="px-4 py-2 text-right text-gray-500 uppercase font-bold">Subtotal:</td>
                                <td className="px-4 py-2 text-right font-bold">${(data.subtotal || data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            {data.tax_amount > 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-2 text-right text-gray-500 uppercase font-bold">Tax:</td>
                                    <td className="px-4 py-2 text-right font-bold">${data.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            )}
                            {data.discount_amount > 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-2 text-right text-red-500 uppercase font-bold">Discount:</td>
                                    <td className="px-4 py-2 text-right font-bold">-${data.discount_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            )}
                            <tr className="border-t-2">
                                <td colSpan={3} className="px-4 py-3 text-right text-lg font-bold uppercase">Total Amount:</td>
                                <td className="px-4 py-3 text-right text-lg font-bold">${data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="bg-gray-50 font-bold border-b-2">
                                <td colSpan={3} className="px-4 py-2 text-right uppercase">Paid:</td>
                                <td className="px-4 py-2 text-right">${(data.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="font-bold border-b-2">
                                <td colSpan={3} className="px-4 py-2 text-right uppercase">Balance:</td>
                                <td className="px-4 py-2 text-right text-red-600">${(data.balance ?? data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {data.payment_method === 'medical_aid' && (
                        <div className="mb-10 text-[10px]">
                            <p className="font-black uppercase text-indigo-600 mb-2 tracking-widest border-b border-indigo-100 pb-1">Medical Aid Split Summary</p>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-indigo-50/50 text-indigo-700 uppercase text-[8px] font-black border-b border-indigo-100">
                                        <th className="px-4 py-2 text-left">Description</th>
                                        <th className="px-4 py-2 text-right">Allocated Amount</th>
                                        <th className="px-4 py-2 text-right">Pending Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-indigo-50/30">
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-600">Medical Aid Portion (Insurer)</td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-900">${(data.medical_aid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-right font-black text-red-600">${(data.medical_aid_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-600">Patient Shortfall (Personal)</td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-900">${(data.shortfall_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-right font-black text-red-600">${(data.shortfall_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-between items-end mt-20 px-4">
                        <div className="text-[10px] space-y-4">
                            <div>
                                <p className="font-bold uppercase mb-1">Banking Details:</p>
                                {branch.website_config?.banking_details && branch.website_config.banking_details.length > 0 ? (
                                    <div className="space-y-3 mt-1">
                                        {branch.website_config.banking_details.map((acc, idx) => (
                                            <div key={idx} className="border-l-2 border-indigo-100 pl-2">
                                                <p className="font-semibold text-gray-700">{acc.bank_name}</p>
                                                <p>Account #: {acc.account_number}</p>
                                                {acc.swift_code && <p>Swift Code: {acc.swift_code}</p>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <p>Bank Name: {branch.website_config?.bank_name || '[HOSPITAL BANK]'}</p>
                                        <p>Account #: {branch.website_config?.account_number || '[ACCOUNT NUMBER]'}</p>
                                        <p>Swift Code: {branch.website_config?.swift_code || '[SWIFT]'}</p>
                                    </>
                                )}
                            </div>
                            <p className="text-gray-400 italic">Thank you for your business.</p>
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

