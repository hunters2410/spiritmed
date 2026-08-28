export interface AppointmentTypeConfig {
  value: string;
  label: string;
  badgeClass: string;
  dotColor: string;
  borderClass: string;
  bgLight: string;
  textClass: string;
}

export const APPOINTMENT_TYPES: Record<string, AppointmentTypeConfig> = {
  consultation: {
    value: 'consultation',
    label: 'New Consultation',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
    dotColor: '#2563eb', // Blue-600
    borderClass: 'border-blue-500',
    bgLight: 'bg-blue-50/50 dark:bg-blue-950/30',
    textClass: 'text-blue-700 dark:text-blue-300'
  },
  initial_new_old: {
    value: 'initial_new_old',
    label: 'Initial - New Old Patient',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
    dotColor: '#9333ea', // Purple-600
    borderClass: 'border-purple-500',
    bgLight: 'bg-purple-50/50 dark:bg-purple-950/30',
    textClass: 'text-purple-700 dark:text-purple-300'
  },
  follow_up: {
    value: 'follow_up',
    label: 'Review',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    dotColor: '#059669', // Emerald-600
    borderClass: 'border-emerald-500',
    bgLight: 'bg-emerald-50/50 dark:bg-emerald-950/30',
    textClass: 'text-emerald-700 dark:text-emerald-300'
  },
  emergency: {
    value: 'emergency',
    label: 'Emergency',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
    dotColor: '#e11d48', // Rose-600
    borderClass: 'border-rose-500',
    bgLight: 'bg-rose-50/50 dark:bg-rose-950/30',
    textClass: 'text-rose-700 dark:text-rose-300'
  },
  procedure: {
    value: 'procedure',
    label: 'Procedure',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    dotColor: '#d97706', // Amber-600
    borderClass: 'border-amber-500',
    bgLight: 'bg-amber-50/50 dark:bg-amber-950/30',
    textClass: 'text-amber-700 dark:text-amber-300'
  }
};

export function getAppointmentTypeConfig(type: string): AppointmentTypeConfig {
  const normalized = (type || '').toLowerCase().trim();
  
  if (APPOINTMENT_TYPES[normalized]) {
    return APPOINTMENT_TYPES[normalized];
  }
  
  if (normalized.includes('new consultation') || normalized.includes('initial consultation') || normalized === 'consultation') {
    return APPOINTMENT_TYPES.consultation;
  }
  if (normalized.includes('new old') || normalized === 'initial_new_old') {
    return APPOINTMENT_TYPES.initial_new_old;
  }
  if (normalized.includes('review') || normalized.includes('follow') || normalized === 'follow_up') {
    return APPOINTMENT_TYPES.follow_up;
  }
  if (normalized.includes('emergency')) {
    return APPOINTMENT_TYPES.emergency;
  }
  if (normalized.includes('procedure')) {
    return APPOINTMENT_TYPES.procedure;
  }

  // Fallback for custom or unknown types
  return {
    value: normalized,
    label: type ? type.replace(/_/g, ' ') : 'Standard',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
    dotColor: '#4f46e5',
    borderClass: 'border-indigo-500',
    bgLight: 'bg-indigo-50/50 dark:bg-indigo-950/30',
    textClass: 'text-indigo-700 dark:text-indigo-300'
  };
}

export function getAppointmentTypeBadge(type: string): string {
  return getAppointmentTypeConfig(type).badgeClass;
}

export function getAppointmentTypeLabel(type: string): string {
  return getAppointmentTypeConfig(type).label;
}

export interface AvailableSlotItem {
  id: string;
  doctor_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  appointment_id?: string | null;
}

/**
 * Loads available slots for a doctor on a given date.
 * If pre-generated slots in `appointment_slots` don't exist yet, it automatically checks `doctor_availability`
 * and dynamically generates, marks booked slots from existing appointments, and returns the slots.
 */
export async function fetchOrGenerateDoctorSlots(
  supabase: any,
  doctorId: string,
  dateStr: string,
  branchId?: string | null
): Promise<{ slots: AvailableSlotItem[]; message?: string }> {
  if (!doctorId || !dateStr) return { slots: [] };

  try {
    // 1. Check pre-generated slots in appointment_slots
    const { data: existingSlots, error: fetchErr } = await supabase
      .from('appointment_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('slot_date', dateStr)
      .order('start_time', { ascending: true });

    if (!fetchErr && existingSlots && existingSlots.length > 0) {
      return { slots: existingSlots };
    }

    // 2. Query doctor_availability for working day & shift configuration
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const { data: availList, error: availErr } = await supabase
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId);

    let startTime = '08:00';
    let endTime = '17:00';
    let duration = 30;

    if (!availErr && availList && availList.length > 0) {
      const dayRecord = availList.find((r: any) => r.day_of_week === dayOfWeek);
      if (dayRecord) {
        if (!dayRecord.is_active) {
          return {
            slots: [],
            message: `Doctor is not scheduled to work on ${dayNames[dayOfWeek]}s.`
          };
        }
        startTime = (dayRecord.start_time || '08:00').slice(0, 5);
        endTime = (dayRecord.end_time || '17:00').slice(0, 5);
        duration = Number(dayRecord.slot_duration) || 30;
      } else {
        const first = availList[0];
        startTime = (first.start_time || '08:00').slice(0, 5);
        endTime = (first.end_time || '17:00').slice(0, 5);
        duration = Number(first.slot_duration) || 30;
      }
    }

    // 3. Query existing non-cancelled appointments for this doctor on this date to mark booked slots
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;
    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('id, appointment_date, duration_minutes')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', startOfDay)
      .lte('appointment_date', endOfDay)
      .neq('status', 'cancelled');

    const bookedTimeMap = new Map<string, string>();
    if (existingAppts) {
      existingAppts.forEach((apt: any) => {
        const timePart = apt.appointment_date.split('T')[1]?.slice(0, 5);
        if (timePart) bookedTimeMap.set(timePart, apt.id);
      });
    }

    // 4. Generate slots for the day
    const newSlots: any[] = [];
    let slotTime = new Date(`${dateStr}T${startTime}:00`);
    const dayEndTime = new Date(`${dateStr}T${endTime}:00`);

    while (slotTime < dayEndTime) {
      const slotEndTime = new Date(slotTime.getTime() + duration * 60000);
      if (slotEndTime > dayEndTime) break;

      const timeHHMM = [
        String(slotTime.getHours()).padStart(2, '0'),
        String(slotTime.getMinutes()).padStart(2, '0')
      ].join(':');

      const appointmentId = bookedTimeMap.get(timeHHMM) || null;

      newSlots.push({
        doctor_id: doctorId,
        branch_id: branchId || null,
        slot_date: dateStr,
        start_time: slotTime.toISOString(),
        end_time: slotEndTime.toISOString(),
        is_booked: Boolean(appointmentId),
        appointment_id: appointmentId
      });

      slotTime = new Date(slotEndTime.getTime());
    }

    if (newSlots.length > 0) {
      // Try to persist so they get real UUIDs and are available across all modules
      const { data: insertedSlots, error: insertErr } = await supabase
        .from('appointment_slots')
        .insert(newSlots)
        .select('*');

      if (!insertErr && insertedSlots && insertedSlots.length > 0) {
        return { slots: insertedSlots };
      }

      // Fallback in-memory slots with client IDs
      return {
        slots: newSlots.map((s, idx) => ({ ...s, id: s.id || `slot-${dateStr}-${idx}` }))
      };
    }

    return { slots: [] };
  } catch (err: any) {
    console.error('Error fetching or generating doctor slots:', err);
    return { slots: [] };
  }
}
