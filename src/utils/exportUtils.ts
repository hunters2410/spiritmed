import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
