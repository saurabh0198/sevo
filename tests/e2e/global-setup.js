// Creates one throwaway Supabase account before the @critical suite runs,
// signs in via the real login form (not injected storage state) so the
// test also exercises the actual sign-in flow, not just the chat itself.
// Reads the service_role key from the backend repo's .env — same key
// used throughout this project's manual throwaway-account testing.
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://rwursqisimkcwdwvcbdw.supabase.co';
const CREDS_FILE = path.join(__dirname, '.testuser.json');

function readBackendEnvKey() {
  const envPath = 'D:/SevoBackend/.env';
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^SUPABASE_KEY=(.+)$/m);
  if (!match) throw new Error('SUPABASE_KEY not found in D:/SevoBackend/.env — needed to create a throwaway test account.');
  return match[1].trim();
}

module.exports = async () => {
  const serviceKey = readBackendEnvKey();
  const email = `pw-${Date.now()}@example.com`;
  const password = 'PlaywrightThrowaway!1';

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create throwaway test account: ${res.status} ${await res.text()}`);
  }
  const user = await res.json();

  fs.writeFileSync(CREDS_FILE, JSON.stringify({ email, password, userId: user.id }, null, 2));
  console.log(`[global-setup] Created throwaway test account: ${email}`);
};
