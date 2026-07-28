import { supabase } from '../lib/supabase';

export interface SmsPayload {
  recipientPhone: string;
  triggerType: 'appointment_booked' | 'appointment_confirmed' | 'payment_received' | 'resource_shared';
  variables: Record<string, string>;
  branchId: string;
  patientId?: string;
}

export const smsService = {
  /**
   * Send SMS using MSG91 Flow API
   */
  async sendSms({ recipientPhone, triggerType, variables, branchId, patientId }: SmsPayload) {
    try {
      // 1. Fetch SMS Configuration (Auth Key)
      const { data: configData, error: configError } = await supabase
        .from('system_configurations')
        .select('config_data')
        .eq('branch_id', branchId)
        .eq('config_type', 'sms')
        .eq('config_name', 'provider')
        .maybeSingle();

      if (configError) throw configError;
      
      const config = configData?.config_data;
      if (!config || config.provider !== 'msg91' || !config.api_key) {
        console.warn('SMS configuration incomplete or not set to MSG91');
        return { success: false, error: 'SMS configuration missing' };
      }

      // 2. Fetch Template Mapping for the trigger with dynamic fallback
      let messageBody = `Dear ${variables.patient_name || 'Patient'}, a secure resource "${variables.title || 'clinical file'}" has been shared with you. Watch now (No Login Required): ${variables.link || ''} . Expires: ${variables.expiry || ''}.`;
      let providerTemplateId = '';

      try {
        const { data: template, error: templateError } = await supabase
          .from('sms_templates')
          .select('*')
          .eq('branch_id', branchId)
          .eq('trigger_type', triggerType)
          .eq('is_active', true)
          .maybeSingle();

        if (!templateError && template) {
          messageBody = template.message_body || messageBody;
          providerTemplateId = template.provider_template_id || '';
        }
      } catch (err) {
        console.warn('Could not query sms_templates table, using dynamic fallback.', err);
      }

      // Replace variables in message body if they exist in the text template
      let finalBody = messageBody;
      Object.entries(variables).forEach(([key, val]) => {
        finalBody = finalBody.replace(new RegExp(`{{${key}}}`, 'g'), val);
        finalBody = finalBody.replace(new RegExp(`{${key}}`, 'g'), val);
      });

      // 3. Log the SMS with 'sending' status first
      let log: any = null;
      try {
        const { data: logData, error: logError } = await supabase.from('sms_logs').insert({
          branch_id: branchId,
          patient_id: patientId,
          phone_number: recipientPhone,
          message_body: finalBody,
          template_id: providerTemplateId || null,
          status: 'sending',
          provider: 'msg91'
        }).select().single();

        if (logError) {
          if (logError.code === '42P01') {
            console.log('sms_logs table not present, logging SMS action to mock cache:', finalBody);
            log = { id: `mock-sms-${Date.now()}`, message_body: finalBody };
          } else {
            throw logError;
          }
        } else {
          log = logData;
        }
      } catch (err) {
        console.warn('Could not insert SMS log to database, using mock.', err);
        log = { id: `mock-sms-${Date.now()}`, message_body: finalBody };
      }

      // 4. Invoke the Edge Function for secure sending
      console.log('Invoking Edge Function send-sms for logId:', log?.id);
      const { data: functionData, error: functionError } = await supabase.functions.invoke('send-sms', {
        body: { logId: log?.id, variables }
      });

      if (functionError) {
        console.warn('Edge function returned error:', functionError);
        return { success: false, error: `Database logged, but delivery trigger failed: ${functionError.message}` };
      }

      return { success: true, result: functionData };
    } catch (error: any) {
      console.error('SMS Service Error:', error);
      return { success: false, error: error.message };
    }
  }
};
