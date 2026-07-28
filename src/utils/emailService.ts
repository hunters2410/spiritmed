import { supabase } from '../lib/supabase';

interface EmailOptions {
    recipientEmail: string;
    recipientName?: string;
    subject?: string;
    body?: string;
    templateId?: string;
    triggerType?: string;
    placeholders?: Record<string, string>;
    branchId: string;
    senderId?: string;
    referenceId?: string;
    referenceType?: string;
    fileUrl?: string;
}

/**
 * emailService handles email resolution and logging.
 * In a production environment, this should trigger an Edge Function 
 * or a backend service to perform the actual SMTP send.
 */
export const emailService = {
    async sendEmail(options: EmailOptions) {
        try {
            let finalBody = options.body || '';
            let finalSubject = options.subject || '';

            // 1. Resolve Template if provided
            if (options.templateId || options.triggerType) {
                let query = supabase.from('email_templates').select('*');
                
                if (options.templateId) {
                    query = query.eq('id', options.templateId);
                } else {
                    query = query
                        .eq('branch_id', options.branchId)
                        .eq('trigger_type', options.triggerType)
                        .eq('is_active', true);
                }

                const { data: template } = await query.maybeSingle();
                
                if (template) {
                    finalBody = template.body;
                    finalSubject = template.subject;
                }
            }

            if (!finalBody || !finalSubject) {
                throw new Error('Email body and subject are required (could not resolve from template or options)');
            }

            // 2. Replace placeholders in body and subject
            if (options.placeholders) {
                Object.entries(options.placeholders).forEach(([key, value]) => {
                    // Support both {key} and {{key}}
                    const regexDouble = new RegExp(`{{${key}}}`, 'g');
                    const regexSingle = new RegExp(`{${key}}`, 'g');
                    
                    finalBody = finalBody.replace(regexDouble, value || '').replace(regexSingle, value || '');
                    finalSubject = finalSubject.replace(regexDouble, value || '').replace(regexSingle, value || '');
                });
            }

            // 3. Log to Database
            console.log('Logging email to database...');
            const { data, error } = await supabase.from('email_logs').insert({
                branch_id: options.branchId,
                recipient_email: options.recipientEmail,
                recipient_name: options.recipientName,
                subject: finalSubject,
                body: finalBody,
                status: 'sent', // Set as 'sending' if using an async worker
                sender_id: options.senderId,
                reference_id: options.referenceId,
                reference_type: options.referenceType,
                file_url: options.fileUrl
            }).select().single();

            if (error) {
                console.error('Database log error:', error);
                throw error;
            }

            console.log('Invoking Edge Function send-email for logId:', data?.id);
            // Trigger actual send via Supabase Edge Function
            const { data: functionData, error: functionError } = await supabase.functions.invoke('send-email', {
                body: { logId: data?.id }
            });

            console.log('Edge Function Response:', { functionData, functionError });

            if (functionError) {
                console.warn('Edge function returned error:', functionError);
                return { success: false, error: `Database logged, but delivery trigger failed: ${functionError.message}` };
            }

            if (functionData && functionData.success === false) {
                return { success: false, error: functionData.error || 'Unknown delivery error' };
            }

            console.log('Edge function invocation successful');
            return { success: true, log: data };
        } catch (error: any) {
            console.error('Email service error:', error);
            return { success: false, error: error.message };
        }
    }
};
