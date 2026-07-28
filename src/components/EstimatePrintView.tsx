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
    code?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface BillData {
    id: string;
    estimate_number: string;
    estimate_date: string;
    payment_method: string;
    total_amount: number;
    patient?: {
        full_name: string;
        patient_number: string;
        email?: string;
    };
    estimate_bill_items: BillItem[];
}

interface Props {
    data: BillData;
    branch: Branch;
    onBack: () => void;
}

export function EstimatePrintView({ data, branch, onBack }: Props) {
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
        pdf.save(`ESTIMATE_${data.estimate_number}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!printRef.current || !data.patient?.email) {
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
            const fileName = `ESTIMATE_${data.estimate_number}_${Date.now()}.pdf`;
            const filePath = `estimates/${data.id}/${fileName}`;

            await supabase.storage.from('financial_documents').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

            const { data: { publicUrl } } = supabase.storage.from('financial_documents').getPublicUrl(filePath);

            if (data.patient?.email) {
                await emailService.sendEmail({
                    recipientEmail: data.patient.email,
                    recipientName: data.patient.full_name,
                    subject: `Estimate - ${data.estimate_number}`,
                    body: `Dear ${data.patient.full_name},\n\nPlease find attached your estimate from ${branch.name}.`,
                    branchId: branch.id,
                    referenceId: data.id,
                    referenceType: 'estimate',
                    fileUrl: publicUrl
                });
                setSendSuccess(true);
            } else {
                alert('No patient email found for this estimate.');
            }

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
                <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded shadow-sm text-sm">
                    <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={handleDownloadPdf} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    <Download className="w-4 h-4" /> PDF
                </button>
                <button onClick={handleSendEmail} disabled={isSending} className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded shadow-sm text-sm">
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : sendSuccess ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
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
                        <h2 className="text-lg font-bold border-y py-1 uppercase tracking-widest">Estimate Bill</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-10 text-[11px]">
                        <div>
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Estimate To:</p>
                            <p className="text-sm font-bold uppercase">{data.patient?.full_name || 'Walk-in Patient'}</p>
                            <p>ID: {data.patient?.patient_number || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-gray-500 uppercase text-[9px] mb-1">Document Details:</p>
                            <p><b>Estimate #:</b> {data.estimate_number}</p>
                            <p><b>Date:</b> {new Date(data.estimate_date).toLocaleDateString()}</p>
                            <p><b>Preferred Method:</b> <span className="uppercase font-bold">{data.payment_method}</span></p>
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
                            {data.estimate_bill_items.map((item, idx) => (
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
                            <tr className="border-t-2">
                                <td colSpan={3} className="px-4 py-3 text-right text-lg font-bold uppercase">Estimated Total:</td>
                                <td className="px-4 py-3 text-right text-lg font-bold">${data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="mb-10 text-[10px] space-y-2">
                        <p className="font-bold uppercase border-b pb-1">Terms & Conditions:</p>
                        <p>1. This estimate is valid for 30 days from the date of issue.</p>
                        <p>2. Final billing may vary based on exact services rendered and clinical requirements.</p>
                        <p>3. Hospital fees and doctor fees are subject to medical aid rates where applicable.</p>
                    </div>

                    <div className="flex justify-between items-end mt-20 px-4">
                        <div className="text-[10px]">
                            <p className="text-gray-400 italic">This is not a Tax Invoice.</p>
                        </div>
                        <div className="text-center space-y-2">
                            <a href="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img src="https://cpyyclrhnyeibxlouwep.supabase.co/storage/v1/object/public/branding/signatures/697a3863-1de7-4615-819c-45b0d7066d67/12a67a17-cd7e-47b1-b1f3-3d678d826965_1783948399207.jpg" alt="Signature" className="h-12 w-auto mx-auto mb-2" />
                            </a>
                            <p className="text-[10px] font-bold uppercase">Authorized Officer</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

