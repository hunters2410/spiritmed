import { supabase, supabaseAdmin } from './supabase';

interface TriggerNotificationParams {
  patientId: string;
  patientName: string;
  patientPhone?: string | null;
  patientEmail?: string | null;
  doctorName: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:MM
  appointmentStatus?: string;
  branchId?: string | null;
}

export async function triggerAppointmentNotifications({
  patientId,
  patientName,
  patientPhone,
  patientEmail,
  doctorName,
  appointmentDate,
  appointmentTime,
  appointmentStatus = 'booked',
  branchId,
}: TriggerNotificationParams) {
  const statusLabel = appointmentStatus.toUpperCase();
  const dateFormatted = appointmentDate;
  const timeFormatted = appointmentTime;

  let smsSent = false;
  let emailSent = false;

  // 1. Trigger SMS Notification
  if (patientPhone) {
    try {
      let smsBody = `Hello ${patientName}, your appointment with Dr. ${doctorName} on ${dateFormatted} at ${timeFormatted} has been ${statusLabel}. Thank you for choosing Spiritmed.`;

      // Check if branch has an active template
      if (branchId) {
        const { data: smsTpl } = await supabase
          .from('sms_templates')
          .select('message_body, is_active')
          .eq('branch_id', branchId)
          .eq('trigger_type', 'appointment_booked')
          .maybeSingle();

        if (smsTpl && smsTpl.is_active !== false && smsTpl.message_body) {
          smsBody = smsTpl.message_body
            .replace(/{patient_name}/g, patientName)
            .replace(/{doctor_name}/g, doctorName)
            .replace(/{date}/g, dateFormatted)
            .replace(/{time}/g, timeFormatted);
        }
      }

      // Log SMS to sms_logs
      await supabaseAdmin.from('sms_logs').insert([
        {
          branch_id: branchId || null,
          patient_id: patientId,
          recipient_phone: patientPhone,
          message_body: smsBody,
          trigger_type: 'appointment_booked',
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
      ]);
      smsSent = true;
    } catch (e) {
      console.error('SMS notification error:', e);
    }
  }

  // 2. Trigger Email Notification
  if (patientEmail) {
    try {
      let emailSubject = `Appointment Confirmation: Dr. ${doctorName} on ${dateFormatted}`;
      let emailBody = `Dear ${patientName},\n\nYour appointment with Dr. ${doctorName} has been scheduled for ${dateFormatted} at ${timeFormatted}.\nStatus: ${statusLabel}\n\nThank you for choosing Spiritmed Healthcare.`;

      // Check if branch has an active email template
      if (branchId) {
        const { data: emailTpl } = await supabase
          .from('email_templates')
          .select('subject, body, is_active')
          .eq('branch_id', branchId)
          .eq('trigger_type', 'appointment_booked')
          .maybeSingle();

        if (emailTpl && emailTpl.is_active !== false && emailTpl.body) {
          emailSubject = emailTpl.subject || emailSubject;
          emailBody = emailTpl.body
            .replace(/{patient_name}/g, patientName)
            .replace(/{doctor_name}/g, doctorName)
            .replace(/{date}/g, dateFormatted)
            .replace(/{time}/g, timeFormatted);
        }
      }

      // Log Email to email_logs
      await supabaseAdmin.from('email_logs').insert([
        {
          branch_id: branchId || null,
          recipient_email: patientEmail,
          recipient_name: patientName,
          subject: emailSubject,
          body: emailBody,
          status: 'sent',
          sent_at: new Date().toISOString(),
          reference_id: patientId,
          reference_type: 'patient_appointment',
        },
      ]);
      emailSent = true;
    } catch (e) {
      console.error('Email notification error:', e);
    }
  }

  return { smsSent, emailSent };
}
