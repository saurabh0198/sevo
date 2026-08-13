// Deletes the throwaway account created in global-setup.js — same
// admin-delete cleanup pattern used everywhere else in this project.
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://rwursqisimkcwdwvcbdw.supabase.co';
const CREDS_FILE = path.join(__dirname, '.testuser.json');

function readBackendEnvKey() {
  const content = fs.readFileSync('D:/SevoBackend/.env', 'utf8');
  const match = content.match(/^SUPABASE_KEY=(.+)$/m);
  return match ? match[1].trim() : null;
}

module.exports = async () => {
  if (!fs.existsSync(CREDS_FILE)) return;
  const { userId, email } = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  const serviceKey = readBackendEnvKey();

  if (serviceKey && userId) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      });
      console.log(`[global-teardown] Deleted throwaway test account: ${email}`);
    } catch (e) {
      console.warn(`[global-teardown] Failed to delete test account ${email}:`, e.message);
    }
  }
  fs.unlinkSync(CREDS_FILE);
};
