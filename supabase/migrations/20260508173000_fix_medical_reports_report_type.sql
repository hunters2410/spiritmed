-- Migration: Make report_type nullable and default to 'medical_report' in medical_reports
ALTER TABLE medical_reports ALTER COLUMN report_type DROP NOT NULL;
ALTER TABLE medical_reports ALTER COLUMN report_type SET DEFAULT 'medical_report';
