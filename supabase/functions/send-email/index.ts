import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts"
import { writeAll } from "https://deno.land/std@0.168.0/streams/conversion.ts";

// Polyfill for deprecated Deno.writeAll needed by some SMTP libraries
if (typeof Deno.writeAll === "undefined") {
  // @ts-ignore: Compatibility shim
  Deno.writeAll = writeAll;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { logId } = await req.json()

    if (!logId) {
      throw new Error('logId is required')
    }

    // 1. Fetch the email log
    const { data: log, error: logError } = await supabaseClient
      .from('email_logs')
      .select('*')
      .eq('id', logId)
      .single()

    if (logError || !log) {
      throw new Error(`Email log not found: ${logError?.message}`)
    }

    // 2. Fetch SMTP configuration
    // We fetch the 'email' config type for the specific branch if possible, 
    // or fallback to global if branch_id doesn't have specific config.
    const { data: config, error: configError } = await supabaseClient
      .from('system_configurations')
      .select('config_data')
      .eq('config_type', 'email')
      .eq('config_name', 'smtp')
      .maybeSingle()

    if (configError || !config) {
      throw new Error('SMTP configuration not found in system_configurations')
    }

    const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_encryption, from_email, from_name } = config.config_data

    // 3. Connect to SMTP Server with 15s timeout
    const client = new SmtpClient()
    
    try {
      console.log(`Connecting to SMTP: ${smtp_host}:${smtp_port} (TLS: ${smtp_encryption !== 'none'})`)
      
      // We wrap the connect in a timeout to prevent hanging
      const connectPromise = client.connect({
        hostname: smtp_host,
        port: parseInt(smtp_port),
        username: smtp_user,
        password: smtp_password,
        tls: smtp_encryption === 'ssl' || smtp_encryption === 'tls',
      })

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SMTP connection timed out after 15s')), 15000)
      )

      await Promise.race([connectPromise, timeoutPromise])
      console.log("SMTP Connected")

      // 4. Send Email
      await client.send({
        from: from_email, // Simplified 'from' for better compatibility
        to: log.recipient_email,
        subject: log.subject,
        content: log.body,
        html: log.body.replace(/\n/g, '<br>'),
      })

      await client.close()

      // 5. Update log as sent
      await supabaseClient
        .from('email_logs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', logId)

      return new Response(
        JSON.stringify({ success: true, message: 'Email sent successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )

    } catch (smtpError) {
      // Log failure in database
      await supabaseClient
        .from('email_logs')
        .update({ status: 'failed', error_message: smtpError.message })
        .eq('id', logId)
        
      throw smtpError
    }

  } catch (error) {
    console.error('Error in send-email function:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' // Force headers again
        }, 
        status: 200 // Return 200 so the client gets the JSON error payload
      }
    )
  }
})
