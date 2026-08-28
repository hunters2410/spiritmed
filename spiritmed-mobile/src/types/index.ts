export interface Patient {
  id: string;
  title?: string;
  full_name: string;
  patient_number?: string;
  file_number?: string;
  national_id?: string;
  date_of_birth?: string;
  gender?: string;
  occupation?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_method?: string;
  medical_aid_id?: string;
  medical_aid_number?: string;
  medical_aid_suffix?: string;
  medical_aid_main_member?: string;
  medical_aid?: { name: string };
  doctor_id?: string;
  referral_doctor_id?: string;
  allergies?: string;
  chronic_conditions?: string;
  chronic_medications?: string;
  clinical_history?: string;
  smoke?: string;
  alcohol?: string;
  flags?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  next_of_kin_relation?: string;
  next_of_kin_email?: string;
  next_of_kin_address?: string;
  responsible_person_name?: string;
  responsible_person_phone?: string;
  responsible_person_email?: string;
  responsible_person_id_number?: string;
  responsible_person_address?: string;
  status?: string;
  branch_id?: string;
  created_at?: string;
}

export interface PatientFile {
  id: string;
  patient_id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
  upload_date?: string;
  title?: string;
  notes?: string;
}

export interface Doctor {
  id: string;
  full_name: string;
  specialization?: string;
  qualifications?: string;
  signature_url?: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_type: string;
  status: string;
  notes?: string;
  patients?: Patient;
  users?: Doctor;
}

export interface PrescriptionItem {
  id?: string;
  medicine_id?: string;
  medicine_name: string;
  dosage?: string;
  period: string;
  time_unit: string;
  instructions?: string;
  advice?: string;
}

export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id?: string;
  chief_complaint?: string;
  medical_history?: string;
  physical_examination?: string;
  investigations?: string;
  diagnosis?: string;
  treatment_plan?: string;
  notes?: string;
  status?: string;
  referred_by?: string;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_period?: string;
  created_at: string;
  updated_at?: string;
  branch_id?: string;
  patient?: Patient;
  doctor?: Doctor;
  referral_doctor?: { full_name: string };
  prescriptions?: PrescriptionItem[];
}

export interface Procedure {
  id: string;
  name: string;
  description?: string;
}

export interface Hospital {
  id: string;
  name: string;
  address?: string;
}

export interface OperationReport {
  id: string;
  patient_id: string;
  surgeon_id?: string;
  doctor_id?: string;
  hospital_id?: string;
  procedure_id?: string;
  operation_name?: string;
  procedure_text?: string;
  operation_date: string;
  anaesthesia_type?: string;
  anaesthetist_ids?: string[];
  assistant_ids?: string[];
  procedure_description?: string;
  description?: string;
  post_op_plan?: string;
  findings?: string;
  complications?: string;
  remarks?: string;
  follow_up_date?: string;
  follow_up_time?: string;
  branch_id?: string;
  created_at?: string;
  updated_at?: string;
  patient?: Patient;
  doctor?: Doctor;
  procedure?: Procedure;
  hospital?: Hospital;
}

export interface ModulePermission {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export interface Permissions {
  [module: string]: ModulePermission;
}

export interface UserRole {
  name: string;
  permissions?: Permissions;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  role_id?: string;
  specialization?: string;
  phone?: string;
  avatar_url?: string;
  branch_id?: string;
  is_active?: boolean;
  roles?: UserRole;
}

export interface StaffUser {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  role?: string;
  specialization?: string;
  avatar_url?: string;
  role_id?: string;
}

export interface ChatParticipant {
  user_id: string;
  last_read_at?: string | null;
  user?: StaffUser;
}

export interface ChatConversation {
  id: string;
  last_message: string | null;
  last_message_at: string | null;
  is_group: boolean;
  name: string | null;
  participants: ChatParticipant[];
  unread_count?: number;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: StaffUser;
}

export interface VitalSigns {
  id?: string;
  patient_id: string;
  blood_pressure_systolic?: number | string;
  blood_pressure_diastolic?: number | string;
  pulse_rate?: number | string;
  temperature?: number | string;
  respiratory_rate?: number | string;
  oxygen_saturation?: number | string;
  weight?: number | string;
  height?: number | string;
  bmi?: number | string;
  recorded_at?: string;
}

export interface Medicine {
  id: string;
  name: string;
  dosage?: string;
  route?: string;
  frequency?: any;
}

export interface Prescription {
  id: string;
  prescription_date: string;
  prescription_number?: string;
  status: string;
  notes?: string;
  patient_id: string;
  doctor_id: string;
  branch_id?: string;
  created_at?: string;
  patient?: Patient;
  doctor?: Doctor;
  prescription_items?: {
    id: string;
    medicine_id?: string;
    medicine?: Medicine;
    period: string;
    time_unit: string;
    advice: string;
  }[];
}

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  Home: undefined;
  Settings: undefined;
  AddPatient: undefined;
  UploadFile: { patientId?: string } | undefined;
  PatientDetails: { patientId?: string } | undefined;
  BookAppointment: { patientId?: string } | undefined;
  SmartScan: {
    onComplete?: (uris: string[], suggestedName: string | null) => void;
  } | undefined;
  RapidDigitize: undefined;
  Consultations: { patientId?: string } | undefined;
  OperationReports: { patientId?: string } | undefined;
  Prescriptions: { patientId?: string } | undefined;
  Chat: { conversationId?: string; targetUserId?: string } | undefined;
};
