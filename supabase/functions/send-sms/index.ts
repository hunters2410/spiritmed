import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

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

    const { logId, variables } = await req.json()

    if (!logId) {
      throw new Error('logId is required')
    }

    // 1. Fetch the SMS log
    const { data: log, error: logError } = await supabaseClient
      .from('sms_logs')
      .select('*')
      .eq('id', logId)
      .single()

    if (logError || !log) {
      throw new Error(`SMS log not found: ${logError?.message}`)
    }

    // 2. Fetch MSG91 configuration for this branch
    const { data: configData, error: configError } = await supabaseClient
      .from('system_configurations')
      .select('config_data')
      .eq('branch_id', log.branch_id)
      .eq('config_type', 'sms')
      .eq('config_name', 'provider')
      .maybeSingle()

    if (configError) throw configError
    
    const config = configData?.config_data
    if (!config || config.provider !== 'msg91' || !config.api_key) {
      throw new Error('SMS configuration incomplete or not set for this branch')
    }

    // 3. Prepare MSG91 Flow API Request
    const flowPayload = {
      template_id: log.template_id,
      recipients: [
        {
          mobiles: log.phone_number.replace(/\+/g, ''),
          ...variables
        }
      ]
    }

    console.log(`Sending SMS to ${log.phone_number} using template ${log.template_id}`)

    // 4. Call MSG91 API
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': config.api_key
      },
      body: JSON.stringify(flowPayload)
    })

    const result = await response.json()
    const isSuccess = response.ok && (result.type === 'success' || result.status === 'success')

    // 5. Update log status
    await supabaseClient
      .from('sms_logs')
      .update({ 
        status: isSuccess ? 'sent' : 'failed', 
        error_message: isSuccess ? null : JSON.stringify(result) 
      })
      .eq('id', logId)

    if (!isSuccess) {
      console.warn('MSG91 returned error:', result)
    }

    return new Response(
      JSON.stringify({ success: isSuccess, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error in send-sms function:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
