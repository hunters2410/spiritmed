import os
import re

src_dir = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\src"

files_with_patients_dropdown = [
    "pages/Appointments.tsx",
    "pages/Consultations.tsx",
    "pages/Prescriptions.tsx",
    "pages/ActualBills.tsx",
    "pages/EstimateBills.tsx",
    "pages/AdmissionForms.tsx",
    "pages/DischargeSummaries.tsx",
    "pages/MedicalCertificates.tsx",
    "pages/MedicalReports.tsx",
    "pages/OperationReports.tsx",
    "pages/ReferralForms.tsx",
    "pages/LabResults.tsx",
    "pages/Vitals.tsx",
    "pages/PatientFiles.tsx",
    "pages/Payments.tsx",
    "components/ReusableCalendar.tsx"
]

for rel_path in files_with_patients_dropdown:
    full_path = os.path.join(src_dir, rel_path.replace('/', '\\'))
    if not os.path.exists(full_path):
        print(f"[NOT FOUND] {rel_path}")
        continue
    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    uses_fetch_all = "fetchAllPatients" in content
    has_limit_1000 = ".limit(1000)" in content or ".limit(500)" in content or ".limit(100)" in content
    print(f"{rel_path:35s} | fetchAllPatients: {str(uses_fetch_all):5s} | has limit: {str(has_limit_1000):5s}")
