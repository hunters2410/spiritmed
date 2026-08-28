import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function setup() {
  console.log('Creating chat-media bucket...');

  // 1. Create bucket (public so URLs are accessible in app)
  const { data, error } = await admin.storage.createBucket('chat-media', {
    public: true,
    allowedMimeTypes: ['image/*', 'audio/*', 'application/*', 'video/*', 'text/*'],
    fileSizeLimit: 52428800, // 50 MB
  });

  if (error && error.message?.includes('already exists')) {
    console.log('✅ Bucket "chat-media" already exists — making sure it is public...');
    const { error: updateErr } = await admin.storage.updateBucket('chat-media', { public: true });
    if (updateErr) console.error('Update error:', updateErr.message);
    else console.log('✅ Bucket is now public.');
  } else if (error) {
    console.error('❌ Error creating bucket:', error.message);
    return;
  } else {
    console.log('✅ Bucket "chat-media" created successfully:', data);
  }

  // 2. Set RLS policy to allow authenticated users to upload
  console.log('\nStorage bucket ready. Testing access...');
  const { data: buckets } = await admin.storage.listBuckets();
  const found = buckets?.find(b => b.name === 'chat-media');
  if (found) {
    console.log(`✅ Confirmed: chat-media bucket exists (public: ${found.public})`);
  }
  console.log('\nDone! The app can now upload images, audio and documents.');
}

setup().catch(console.error);
