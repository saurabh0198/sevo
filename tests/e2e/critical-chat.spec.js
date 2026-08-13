// @critical — the one journey Phase 1 explicitly asks for: sign in,
// send a message, get a real reply. Uses the actual login form (not
// injected storage state) against the throwaway account global-setup.js
// creates, so this also exercises the real sign-in flow end to end.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.join(__dirname, '.testuser.json');

test.describe('@critical send message -> get reply', () => {
  test('signs in and receives a real AI reply', async ({ page }) => {
    const { email, password } = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));

    await page.goto('/');

    await page.fill('#signinEmail', email);
    await page.fill('#signinPassword', password);
    // Exact match — "Sign in with Google" also contains "Sign in" as a
    // substring, so a plain :has-text() would match both buttons.
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Boot sequence (bootApp) can take a few seconds — real Supabase
    // auth + backend calls, not mocked.
    await expect(page.locator('#userInput')).toBeVisible({ timeout: 20000 });

    const testMessage = `Playwright critical test ${Date.now()}`;
    await page.fill('#userInput', testMessage);

    const repliesBefore = await page.locator('.msg.sevo').count();
    await page.click('#sendBtn');

    // Real reply — real backend, real AI provider chain (Gemini -> Groq
    // -> OpenRouter fallback), not mocked. Generous timeout for a cold
    // Render free-tier instance.
    await expect(page.locator('.msg.sevo')).toHaveCount(repliesBefore + 1, { timeout: 60000 });

    const replyText = await page.locator('.msg.sevo .msg-body').last().textContent();
    expect(replyText.trim().length).toBeGreaterThan(0);

    // The user's own message must actually be in the thread too, not
    // just the reply — proves the full round trip, not just that
    // *something* rendered.
    await expect(page.locator('.msg.user .msg-body', { hasText: testMessage })).toBeVisible();
  });
});
