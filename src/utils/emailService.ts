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
                        .eq('trigger_type', options.triggerType);
                }

                const { data: template } = await query.maybeSingle();
                
                if (template) {
                    if (template.is_active === false) {
                        console.log(`Email trigger "${options.triggerType}" is disabled for branch ${options.branchId}`);
                        return { success: false, error: `Email trigger "${options.triggerType}" is disabled` };
                    }
                    finalBody = template.body;
                    finalSubject = template.subject;
                }
            }

            if (!finalBody || !finalSubject) {
                throw new Error('Email body and subject are required (could not resolve from template or options)');
            }

            // Fetch Branch Clinic Name dynamically from Settings
            let clinicName = '';
            if (options.branchId) {
                const { data: branch } = await supabase
                    .from('branches')
                    .select('name')
                    .eq('id', options.branchId)
                    .maybeSingle();
                if (branch?.name) {
                    clinicName = branch.name;
                }
            }

            // Always resolve clinic_name placeholder if not explicitly provided
            const allPlaceholders: Record<string, string> = {
                clinic_name: clinicName || 'Clinic',
                ...(options.placeholders || {})
            };

            // 2. Replace placeholders in body and subject
            Object.entries(allPlaceholders).forEach(([key, value]) => {
                // Support both {key} and {{key}}
                const regexDouble = new RegExp(`{{${key}}}`, 'g');
                const regexSingle = new RegExp(`{${key}}`, 'g');
                
                finalBody = finalBody.replace(regexDouble, value || '').replace(regexSingle, value || '');
                finalSubject = finalSubject.replace(regexDouble, value || '').replace(regexSingle, value || '');
            });

            // Replace legacy hardcoded 'SpiritMed' or 'SpiritMed Medical System' or 'SpiritMed Team' with dynamic clinic name
            if (clinicName) {
                finalBody = finalBody
                    .replace(/SpiritMed Medical System/gi, clinicName)
                    .replace(/SpiritMed Medical/gi, clinicName)
                    .replace(/SpiritMed Team/gi, `${clinicName} Team`)
                    .replace(/SpiritMed/gi, clinicName);

                finalSubject = finalSubject
                    .replace(/SpiritMed Medical System/gi, clinicName)
                    .replace(/SpiritMed Medical/gi, clinicName)
                    .replace(/SpiritMed/gi, clinicName);
            }

            // Resolve branch_id if missing
            let targetBranchId = options.branchId;
            if (!targetBranchId) {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { data: userProfile } = await supabase
                            .from('users')
                            .select('branch_id')
                            .eq('id', user.id)
                            .maybeSingle();
                        if (userProfile?.branch_id) {
                            targetBranchId = userProfile.branch_id;
                        }
                    }
                } catch (e) {
                    console.warn('Could not resolve user branch_id for email log:', e);
                }
            }

            // 3. Log to Database with sanitized payload
            console.log('Logging email to database...');
            const logPayload: Record<string, any> = {
                recipient_email: options.recipientEmail,
                subject: finalSubject,
                body: finalBody,
                status: 'pending'
            };

            if (targetBranchId) logPayload.branch_id = targetBranchId;
            if (options.recipientName) logPayload.recipient_name = options.recipientName;
            if (options.senderId) logPayload.sender_id = options.senderId;
            if (options.referenceId) logPayload.reference_id = options.referenceId;
            if (options.referenceType) logPayload.reference_type = options.referenceType;
            if (options.fileUrl) logPayload.file_url = options.fileUrl;

            const { data, error } = await supabase.from('email_logs').insert(logPayload).select().single();

            if (error) {
                console.error('Database log error:', error.message || error, error.details || '', error.hint || '');
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
