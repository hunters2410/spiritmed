import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export interface BranchBranding {
    name?: string;
    logo_url?: string;
    phone?: string;
    email?: string;
    address?: string;
}

export interface AppointmentExportItem {
    date: string;
    time: string;
    fileNo: string;
    patientName: string;
    contact: string;
    doctor: string;
    type: string;
    remarks: string;
    status: string;
}

export interface LoadedImageData {
    dataUrl: string;
    width: number;
    height: number;
    aspectRatio: number;
}

/**
 * Safely converts an image URL to a Base64 string and retrieves its aspect ratio for jsPDF rendering
 */
export const getBase64ImageFromUrl = async (url: string): Promise<LoadedImageData | null> => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                const img = new Image();
                img.onload = () => {
                    const width = img.naturalWidth || img.width || 100;
                    const height = img.naturalHeight || img.height || 100;
                    resolve({
                        dataUrl,
                        width,
                        height,
                        aspectRatio: width / height
                    });
                };
                img.onerror = () => resolve({ dataUrl, width: 100, height: 100, aspectRatio: 1 });
                img.src = dataUrl;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Failed to convert image to base64:', error);
        return null;
    }
};

/**
 * Exports data to a native Excel (.xlsx) file
 * @param data Array of objects (JSON)
 * @param fileName Name of the file (without extension)
 */
export const exportToExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    
    // Generate buffer and trigger download
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Exports data to a professional PDF table
 * @param headers Array of column headers
 * @param data Array of arrays (rows)
 * @param title Title to display at the top of the PDF
 * @param fileName Name of the file (without extension)
 */
export const exportToPDF = (headers: string[], data: any[][], title: string, fileName: string) => {
    const doc = new jsPDF();

    // Add Title
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    // Add date
    const dateStr = `Generated on: ${new Date().toLocaleString()}`;
    doc.text(dateStr, 14, 30);

    autoTable(doc, {
        head: [headers],
        body: data,
        startY: 35,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 }, // emerald-500
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { top: 35 }
    });

    doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Exports appointments to a branded PDF report with hospital logo and details
 */
export const exportAppointmentsPDF = async (
    appointments: AppointmentExportItem[],
    fileName: string,
    branchInfo?: BranchBranding,
    dateFilterSummary?: string
) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    const startY = 14;
    let logoAdded = false;
    let logoWidth = 0;
    let logoHeight = 0;

    if (branchInfo?.logo_url) {
        const logoData = await getBase64ImageFromUrl(branchInfo.logo_url);
        if (logoData) {
            try {
                const maxLogoHeight = 18; // mm
                const maxLogoWidth = 50;  // mm
                const ratio = logoData.aspectRatio || 1;

                if (ratio > maxLogoWidth / maxLogoHeight) {
                    logoWidth = maxLogoWidth;
                    logoHeight = maxLogoWidth / ratio;
                } else {
                    logoHeight = maxLogoHeight;
                    logoWidth = maxLogoHeight * ratio;
                }

                const logoY = 9 + (maxLogoHeight - logoHeight) / 2;

                doc.addImage(logoData.dataUrl, 'PNG', 14, logoY, logoWidth, logoHeight);
                logoAdded = true;
            } catch (e) {
                console.warn('Could not render logo image in PDF export', e);
            }
        }
    }

    const textX = logoAdded ? 14 + logoWidth + 5 : 14;

    // Hospital / Branch Name
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(branchInfo?.name || 'SPIRITMED MEDICAL CENTER', textX, startY + 2);

    // Address & Contact Info
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500

    let contactLine = '';
    if (branchInfo?.address) contactLine += branchInfo.address;
    if (branchInfo?.phone) contactLine += (contactLine ? ' | Tel: ' : 'Tel: ') + branchInfo.phone;
    if (branchInfo?.email) contactLine += (contactLine ? ' | Email: ' : 'Email: ') + branchInfo.email;
    if (!contactLine) contactLine = 'Hospital Management System • Appointment Records';

    doc.text(contactLine, textX, startY + 7);

    // Report Title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('APPOINTMENT SCHEDULE REPORT', textX, startY + 13);

    // Right-aligned Metadata
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, startY + 2, { align: 'right' });
    if (dateFilterSummary) {
        doc.text(`Period: ${dateFilterSummary}`, pageWidth - 14, startY + 7, { align: 'right' });
    }
    doc.text(`Total Records: ${appointments.length}`, pageWidth - 14, startY + 12, { align: 'right' });

    // Horizontal Rule
    const tableStartY = Math.max(startY + 17, logoAdded ? 36 : 32);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, tableStartY - 2, pageWidth - 14, tableStartY - 2);

    const headers = ['#', 'Date', 'Time', 'File No.', 'Patient Name', 'Contact', 'Doctor', 'Type', 'Remarks / Notes', 'Status'];
    const body = appointments.map((item, idx) => [
        idx + 1,
        item.date,
        item.time,
        item.fileNo || 'N/A',
        item.patientName,
        item.contact || 'N/A',
        item.doctor,
        item.type,
        item.remarks || '-',
        item.status
    ]);

    autoTable(doc, {
        head: [headers],
        body: body,
        startY: tableStartY,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 24 },
            2: { cellWidth: 22 },
            3: { cellWidth: 28, fontStyle: 'bold' },
            4: { cellWidth: 42 },
            5: { cellWidth: 30 },
            6: { cellWidth: 36 },
            7: { cellWidth: 26 },
            8: { cellWidth: 34 },
            9: { cellWidth: 22 }
        },
        margin: { top: 15, left: 14, right: 14, bottom: 15 }
    });

    doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Exports appointments to a branded Excel spreadsheet
 */
export const exportAppointmentsExcel = (
    appointments: AppointmentExportItem[],
    fileName: string,
    branchInfo?: BranchBranding,
    dateFilterSummary?: string
) => {
    const hospitalName = branchInfo?.name || 'SPIRITMED MEDICAL CENTER';
    const periodStr = dateFilterSummary ? `Period: ${dateFilterSummary}` : 'All Periods';
    const metadataStr = `${periodStr} | Generated on: ${new Date().toLocaleString()} | Total: ${appointments.length} record(s)`;

    const headerRows = [
        [hospitalName],
        ['APPOINTMENT SCHEDULE REPORT'],
        [metadataStr],
        []
    ];

    const tableHeaders = ['Date', 'Time', 'File No.', 'Patient Name', 'Contact Phone', 'Doctor', 'Appointment Type', 'Remarks / Notes', 'Status'];

    const dataRows = appointments.map(item => [
        item.date,
        item.time,
        item.fileNo || 'N/A',
        item.patientName,
        item.contact || 'N/A',
        item.doctor,
        item.type,
        item.remarks || '',
        item.status
    ]);

    const aoaData = [...headerRows, tableHeaders, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

    worksheet['!cols'] = [
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
        { wch: 28 },
        { wch: 16 },
        { wch: 24 },
        { wch: 18 },
        { wch: 32 },
        { wch: 14 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Appointments");

    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Universal multi-page PDF exporter for DOM elements.
 * Captures 100% of the element height across multiple A4 pages without truncation.
 */
export const exportElementToPdf = async (
    element: HTMLElement, 
    fileName: string, 
    returnBlob: boolean = false
): Promise<Blob | void> => {
    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        windowWidth: 1024,
        windowHeight: element.scrollHeight,
        height: element.scrollHeight,
        scrollX: 0,
        scrollY: 0
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210; // A4 width mm
    const pageHeight = 297; // A4 height mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
    }

    if (returnBlob) {
        return pdf.output('blob');
    } else {
        pdf.save(fileName);
    }
};

