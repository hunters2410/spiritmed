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

interface BillItem {
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface BillData {
    id: string;
    bill_number: string;
    bill_date: string;
    payment_method: string;
    total_amount: number;
    patient: {
        full_name: string;
        patient_number: string;
        email?: string;
    };
    patient_bill_items: BillItem[];
}

interface Props {
    data: BillData;
    branch: Branch;
    doctorSignature?: string;
    onBack: () => void;
}

export function BillPrintView({ data, branch, doctorSignature, onBack }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`BILL_${data.bill_number}_${data.patient.full_name}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.patient.email) {
            alert('Patient email is missing.');
            return;
        }

        try {
            setIsSending(true);
            setSendSuccess(false);

            // 1. Generate PDF
            const canvas = await html2canvas(printRef.current, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            
            const pdfBlob = pdf.output('blob');
            const fileName = `BILL_${data.bill_number}_${Date.now()}.pdf`;
            const filePath = `bills/${data.id}/${fileName}`;

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
                recipientEmail: data.patient.email,
                recipientName: data.patient.full_name,
                subject: `Pro-Forma Bill ${data.bill_number} from ${branch.name}`,
                body: `Dear ${data.patient.full_name},\n\nPlease find attached your pro-forma bill ${data.bill_number} for services rendered at ${branch.name}.\n\nTotal Amount: $${data.total_amount.toLocaleString()}\n\nYou can view and download your bill here: ${publicUrl}\n\nPlease note: This is a pro-forma bill for informational purposes.\n\nThank you for choosing ${branch.name}.`,
                branchId: branch.id,
                referenceId: data.id,
                referenceType: 'bill',
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
            <div className="w-full md:w-64 space-y-3 print:hidden order-2 md:order-1">
                <button onClick={onBack} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <ArrowLeft className="w-4 h-4 text-blue-600" /> Back to Dashboard
                </button>
                <button onClick={handlePrint} className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-md">
                    <Printer className="w-4 h-4" /> Print Pro-Forma Bill
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm">
                    <Download className="w-4 h-4 text-blue-600" /> Download PDF
                </button>
                <button 
                    onClick={handleSendEmail} 
                    disabled={isSending}
                    className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg font-bold text-xs transition shadow-sm ${
                        sendSuccess ? 'bg-green-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
                    }`}
                >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : sendSuccess ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4 text-blue-600" />}
                    {isSending ? 'Sending...' : sendSuccess ? 'Email Sent!' : 'Send Via Email'}
                </button>
            </div>

            {/* Document View */}
            <div className="flex-1 flex justify-center order-1 md:order-2">
                <div
                    ref={printRef}
                    className="bg-white text-gray-900 w-full max-w-[210mm] min-h-[297mm] p-[15mm] md:p-[20mm] shadow-xl font-sans print:shadow-none print:p-0"
                >
                    {/* Letterhead */}
                    <div className="flex justify-between items-start mb-12 border-b-2 border-blue-600 pb-8">
                        <div className="flex items-center gap-6">
                            {branch.logo_url ? (
                                <img src={branch.logo_url} alt="Clinic Logo" className="h-20 w-auto object-contain" />
                            ) : (
                                <div className="w-16 h-16 bg-blue-50 flex items-center justify-center rounded-xl text-blue-600 font-black text-2xl border-2 border-blue-100 italic">SM</div>
                            )}
                            <div>
                                {/* Clinic name removed as requested */}
                            </div>
                        </div>
                        <div className="text-right text-[10px] space-y-1 font-medium text-gray-500">
                            <p className="text-gray-900 font-bold uppercase">{branch.phone}</p>
                            <p>{branch.email}</p>
                            <p>{branch.website}</p>
                            <p className="max-w-[180px] ml-auto mt-2 leading-relaxed uppercase">{branch.address}</p>
                        </div>
                    </div>

                    {/* Bill Header */}
                    <div className="flex justify-between items-end mb-12 bg-gray-50 p-6 rounded-2xl">
                        <div>
                            <h2 className="text-4xl font-black text-gray-900 uppercase mb-1">Bill</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pro-Forma Invoice</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Bill Number</div>
                            <div className="text-2xl font-black text-blue-600 font-mono tracking-tighter">{data.bill_number}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-12 mb-12 px-2">
                        <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Bill To</h3>
                            <div className="space-y-1">
                                <p className="text-lg font-black text-gray-900 uppercase leading-none">{data.patient.full_name}</p>
                                <p className="text-xs font-bold text-blue-600 font-mono tracking-tighter">ID: {data.patient.patient_number}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Details</h3>
                            <div className="space-y-1 text-xs">
                                <p className="flex justify-end gap-3 text-gray-500"><span className="font-bold uppercase opacity-50">Date:</span> <span className="text-gray-900 font-bold">{new Date(data.bill_date).toLocaleDateString()}</span></p>
                                <p className="flex justify-end gap-3 text-gray-500"><span className="font-bold uppercase opacity-50">Method:</span> <span className="text-gray-900 font-bold uppercase">{data.payment_method.replace('_', ' ')}</span></p>
                                <p className="flex justify-end gap-3 text-gray-500"><span className="font-bold uppercase opacity-50">Status:</span> <span className="text-amber-600 font-black uppercase">Pending Payment</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="mb-12">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-100 text-gray-500 font-black uppercase tracking-widest">
                                    <th className="px-4 py-3 text-left w-12 rounded-l-lg border-b-2 border-gray-200">#</th>
                                    <th className="px-4 py-3 text-left border-b-2 border-gray-200">Description</th>
                                    <th className="px-4 py-3 text-center w-20 border-b-2 border-gray-200">Qty</th>
                                    <th className="px-4 py-3 text-right w-32 border-b-2 border-gray-200">Unit Price</th>
                                    <th className="px-4 py-3 text-right w-32 rounded-r-lg border-b-2 border-gray-200">Total Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.patient_bill_items.map((item, idx) => (
                                    <tr key={idx} className="group">
                                        <td className="px-4 py-4 text-gray-400 font-mono">{idx + 1}</td>
                                        <td className="px-4 py-4 font-bold text-gray-800 uppercase">{item.description}</td>
                                        <td className="px-4 py-4 text-center font-bold">{item.quantity}</td>
                                        <td className="px-4 py-4 text-right font-mono">${item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-4 text-right font-black text-gray-900">${item.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals Section */}
                    <div className="flex justify-end mb-20">
                        <div className="w-full max-w-xs space-y-3 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <div className="flex justify-between text-xs text-gray-500 font-bold uppercase">
                                <span>Subtotal</span>
                                <span className="text-gray-900 font-mono">${data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 font-bold uppercase">
                                <span>Tax (0%)</span>
                                <span className="text-gray-900 font-mono">$0.00</span>
                            </div>
                            <div className="pt-3 border-t-2 border-gray-200 flex justify-between items-center">
                                <span className="text-sm font-black text-gray-900 uppercase">Grand Total</span>
                                <span className="text-2xl font-black text-blue-600 font-mono">${data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Terms & Footer */}
                    <div className="grid grid-cols-2 gap-8 text-[10px]">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-black uppercase text-gray-400 mb-1">Notes</h4>
                                <p className="text-gray-500 italic">This is a pro-forma bill generated for information purposes. It is not a tax invoice until finalized and payment is confirmed.</p>
                            </div>
                            <div>
                                <h4 className="font-black uppercase text-gray-400 mb-1">Terms</h4>
                                <ul className="text-gray-500 list-disc list-inside space-y-0.5">
                                    <li>Payment is due within 7 days of this bill date</li>
                                    <li>Please reference the bill number for all payments</li>
                                    <li>This amount is subject to medical aid approval</li>
                                </ul>
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-end text-center space-y-2">
                            {doctorSignature ? (
                                <img src={doctorSignature} alt="Authorized Signature" className="h-16 w-auto mb-2" />
                            ) : branch.signature_url ? (
                                <img src={branch.signature_url} alt="Authorized Signature" className="h-16 w-auto mb-2" />
                            ) : (
                                <div className="w-48 h-16 border-b border-gray-300 mb-2"></div>
                            )}
                            <p className="font-black uppercase text-gray-900 leading-none">Accounts Office</p>
                            <p className="text-gray-400 font-bold uppercase tracking-widest">Authorized Signature</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
