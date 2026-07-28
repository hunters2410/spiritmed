import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  User, 
  Heart,
  Users,
  AlertCircle,
  Stethoscope,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Clock,
  Briefcase,
  MapPin,
  Phone,
  Mail,
  Calendar,
  FileText
} from 'lucide-react';
import { SearchDropdown } from '../components/SearchDropdown';

interface MedicalAid {
  id: string;
  name: string;
}

export function PublicRegistration() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
  const [branchName, setBranchName] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    full_name: '',
    gender: 'male',
    email: '',
    address: '',
    phone: '',
    date_of_birth: '',
    id_passport_number: '',
    age: '',
    initial_consultation_date: new Date().toISOString().split('T')[0],
    clinical_history: '',
    chronic_medications: '',
    medication_allergies: '',
    referring_doctor: '',
    gp_practitioner: '',
    specialist_doctor: '',
    smoke: 'never',
    alcohol: 'never',
    flags: '',
    allergies: '',
    chronic_conditions: '',
    occupation: '',
    blood_group: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    emergency_contact_id: '',
    emergency_contact_address: '',
    emergency_contact_email: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_id: '',
    next_of_kin_relationship: '',
    next_of_kin_address: '',
    next_of_kin_email: '',
    responsible_person_name: '',
    responsible_person_address: '',
    responsible_person_phone: '',
    responsible_person_id_number: '',
    responsible_person_email: '',
    payment_method: 'cash',
    medical_aid_id: '',
    medical_aid_number: '',
    medical_aid_suffix: '',
    medical_aid_main_member: '',
    file_number: '',
    send_sms: true
  });

  useEffect(() => {
    const path = window.location.pathname;
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    if (id && id !== 'register') {
      setBranchId(id);
      loadReferenceData(id);
    }
  }, []);

  const loadReferenceData = async (branchId: string) => {
    try {
      // Fetch branch info
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', branchId)
        .single();
      
      if (branch) setBranchName(branch.name);

      const { data: aids } = await supabase
        .from('medical_aids')
        .select('id, name')
        .eq('is_active', true);

      setMedicalAids(aids || []);
    } catch (err) {
      console.error('Error loading reference data:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      setError('Invalid registration link. Please contact the hospital.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await supabase
        .from('patient_temporary_db')
        .insert([{
          ...formData,
          branch_id: branchId
        }]);

      if (submitError) throw submitError;
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err: any) {
      console.error('Registration Error:', err);
      setError(err.message || 'Failed to submit registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Registration Sent!</h1>
          <p className="text-gray-500 font-medium">
            Thank you, <span className="text-gray-900 font-bold">{formData.full_name}</span>. Your information sheet has been submitted for review.
          </p>
          <div className="p-4 bg-gray-50 rounded-2xl flex items-center gap-3 text-left border border-gray-100">
            <Clock className="w-5 h-5 text-emerald-600" />
            <p className="text-xs text-gray-500 font-bold">You can close this tab now. Hospital staff will contact you once your file is processed.</p>
          </div>
        </div>
      </div>
    );
  }

  const InputField = ({ label, name, type = "text", placeholder = "", required = false, icon: Icon }: any) => (
    <div className="space-y-1.5 flex-1">
      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input 
        type={type} name={name} required={required} value={(formData as any)[name]} onChange={handleChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-all font-bold text-gray-900 text-base md:text-sm outline-none"
      />
    </div>
  );

  const TextAreaField = ({ label, name, rows = 2, placeholder = "", icon: Icon }: any) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </label>
      <textarea 
        name={name} value={(formData as any)[name]} onChange={handleChange}
        rows={rows} placeholder={placeholder}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none font-bold text-gray-900 text-base md:text-sm"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-6 md:py-12 px-4 font-roboto">
      <div className="max-w-4xl mx-auto bg-white rounded-none md:rounded-xl shadow-2xl overflow-hidden border border-gray-200">
        
        {/* Header Banner */}
        <div className="bg-emerald-800 p-6 md:p-8 text-center border-b-4 border-emerald-900">
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-widest uppercase">SpiritMed Medical System</h1>
          <div className="mt-2 text-emerald-200 text-xs font-black uppercase tracking-[0.2em] md:tracking-[0.3em] py-1 border-t border-emerald-700/50 inline-block px-4 md:px-12">
            {branchName ? `${branchName} - Patient Information Sheet` : 'Patient Information Sheet'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-12">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-lg flex items-center gap-3 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          {/* SECTION 1: Patient Information */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-emerald-600 pb-2">
              <User className="w-5 h-5 text-emerald-600 fill-emerald-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-800">Patient Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="File Number" name="file_number" placeholder="Internal - Leave blank if new" icon={FileText} />
              <InputField label="Date of Initial Consultation" name="initial_consultation_date" type="date" required icon={Calendar} />
            </div>

            <InputField label="Surname and Name" name="full_name" placeholder="e.g. Collen Hunters" required />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="ID/Passport Number" name="id_passport_number" required icon={CreditCard} />
              <InputField label="Date of Birth" name="date_of_birth" type="date" required icon={Calendar} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputField label="Age" name="age" type="number" icon={Clock} />
              <div className="space-y-1.5 flex-1">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Sex *</label>
                <select 
                  name="gender" value={formData.gender} onChange={handleChange} required
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600 font-bold text-base md:text-sm outline-none"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Blood Group</label>
                <select 
                  name="blood_group" value={formData.blood_group} onChange={handleChange}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600 font-bold text-base md:text-sm outline-none"
                >
                  <option value="">Select...</option>
                  <option value="A+">A+</option><option value="A-">A-</option>
                  <option value="B+">B+</option><option value="B-">B-</option>
                  <option value="AB+">AB+</option><option value="AB-">AB-</option>
                  <option value="O+">O+</option><option value="O-">O-</option>
                </select>
              </div>
            </div>

            <TextAreaField label="Home Address" name="address" rows={2} placeholder="Your full residential address..." icon={MapPin} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Contact Number" name="phone" required icon={Phone} />
              <InputField label="Email Address" name="email" icon={Mail} />
            </div>
          </div>

          {/* SECTION 2: Medical Information */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-emerald-600 pb-2">
              <Heart className="w-5 h-5 text-emerald-600 fill-emerald-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-800">Medical Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Allergies" name="allergies" placeholder="e.g. Nuts, Shellfish" />
              <InputField label="Medication Allergies" name="medication_allergies" placeholder="e.g. Penicillin" />
            </div>

            <TextAreaField label="Chronic Conditions and Medications" name="chronic_conditions" placeholder="List any chronic issues and current management..." />
            <TextAreaField label="Current Medications" name="chronic_medications" rows={2} placeholder="List all current medicines..." />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Referring Doctor/Hospital" name="referring_doctor" icon={Stethoscope} />
              <InputField label="GP/Family Practitioner" name="gp_practitioner" icon={User} />
            </div>
            
            <InputField label="Physician/Paediatrician or other Specialists" name="specialist_doctor" icon={Briefcase} />
          </div>

          {/* SECTION 3: Next of Kin */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-orange-500 pb-2">
              <Users className="w-5 h-5 text-orange-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-orange-800">Next of Kin</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Full Name" name="next_of_kin_name" required />
              <InputField label="ID/Passport Number" name="next_of_kin_id" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Relationship" name="next_of_kin_relationship" placeholder="e.g. Spouse, Parent, Sibling" />
              <InputField label="Contact Number" name="next_of_kin_phone" required icon={Phone} />
            </div>

            <TextAreaField label="Address" name="next_of_kin_address" rows={2} icon={MapPin} />
            <InputField label="Email" name="next_of_kin_email" icon={Mail} />
          </div>

          {/* SECTION 4: Emergency Contact */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-rose-500 pb-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-rose-800">Emergency Contact</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Full Name" name="emergency_contact_name" required />
              <InputField label="ID/Passport Number" name="emergency_contact_id" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InputField label="Relationship" name="emergency_contact_relationship" />
              <InputField label="Contact Number" name="emergency_contact_phone" required icon={Phone} />
            </div>

            <TextAreaField label="Address" name="emergency_contact_address" rows={2} icon={MapPin} />
            <InputField label="Email" name="emergency_contact_email" icon={Mail} />
          </div>

          {/* SECTION 5: Payment Details */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-blue-500 pb-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-blue-800">Payment Details</h2>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider pl-1">Payment Method</label>
              <div className="flex gap-6 pl-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="payment_method" value="cash" checked={formData.payment_method === 'cash'} onChange={handleChange} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm font-bold text-gray-700">Cash</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="payment_method" value="medical_aid" checked={formData.payment_method === 'medical_aid'} onChange={handleChange} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm font-bold text-gray-700">Medical Aid</span>
                </label>
              </div>
            </div>

            {formData.payment_method === 'cash' && (
              <div className="space-y-6 animate-in slide-in-from-top-2">
                <InputField label="Name of Person Responsible for Payment" name="responsible_person_name" required />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <InputField label="ID/Passport Number" name="responsible_person_id_number" />
                  <InputField label="Contact Number" name="responsible_person_phone" required icon={Phone} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <InputField label="Email Address" name="responsible_person_email" icon={Mail} />
                  <InputField label="Address (if different from patient)" name="responsible_person_address" icon={MapPin} />
                </div>
              </div>
            )}

            {formData.payment_method === 'medical_aid' && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-blue-700">Medical Aid / Insurance</label>
                  <SearchDropdown 
                    items={medicalAids}
                    placeholder="Select Aid..."
                    selectedId={formData.medical_aid_id}
                    onSelect={(id) => setFormData(prev => ({ ...prev, medical_aid_id: id }))}
                    displayFn={(item) => item.name}
                  />
                </div>
                <InputField label="Policy / Member Number" name="medical_aid_number" />
              </div>
            )}
          </div>

          <div className="pt-10 flex justify-center">
            <button 
              type="submit" disabled={loading}
              className="w-full md:w-auto px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Patient Information'}
              <CheckCircle className="w-6 h-6" />
            </button>
          </div>
        </form>

        <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Powered by Global Hunterstech Technologies Pvt Ltd.</p>
        </div>
      </div>
    </div>
  );
}
