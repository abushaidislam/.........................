import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E: Locale switch via Profile → Language.
 *
 * Preconditions:
 *  - Dev server running on http://localhost:8080
 *  - Lovable managed Supabase session injected into the sandbox
 *    (LOVABLE_BROWSER_AUTH_STATUS === "injected"). If not, the test is
 *    skipped instead of failing, since it requires an authenticated user.
 *
 * Flow:
 *  1. Restore Supabase session (cookies + localStorage) at the app origin.
 *  2. Visit /profile and confirm the English "Language" section renders.
 *  3. Open the Language sheet, pick 日本語 (Japanese).
 *  4. Confirm profile section label switches to "言語" and bottom tab
 *     "Vault" becomes "保管庫".
 *  5. Navigate to /vault and confirm the translated title "あなたのコード".
 *  6. Restore English (System) so the app state is left clean.
 */

const AUTH_STATUS = process.env.LOVABLE_BROWSER_AUTH_STATUS ?? "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? "";
const COOKIES_JSON = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON ?? "";

async function restoreSession(context: BrowserContext, page: Page, baseURL: string) {
  if (COOKIES_JSON) {
    const cookies = JSON.parse(COOKIES_JSON).map((c: Record<string, unknown>) => ({
      ...c,
      url: baseURL,
    }));
    await context.addCookies(cookies);
  }
  await page.goto(baseURL);
  if (STORAGE_KEY && SESSION_JSON) {
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [STORAGE_KEY, SESSION_JSON],
    );
  }
}

test.describe("Locale switch via Profile → Language", () => {
  test.skip(
    AUTH_STATUS !== "injected",
    `Requires an injected Supabase session (LOVABLE_BROWSER_AUTH_STATUS=${AUTH_STATUS || "unset"}).`,
  );

  test("switches page titles and labels between English and Japanese", async ({
    context,
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:8080";

    await restoreSession(context, page, origin);
    await page.goto("/profile", { waitUntil: "domcontentloaded" });

    // --- Baseline: English --------------------------------------------------
    await expect(page.getByText("Language", { exact: true }).first()).toBeVisible();
    // Bottom tabs render "Vault" / "Profile" in English by default.
    await expect(page.getByRole("link", { name: "Vault" })).toBeVisible();

    // --- Switch to Japanese -------------------------------------------------
    // The Language row opens the LocaleSheet. Its title is "Language".
    await page.getByRole("button", { name: /^Language/ }).click();
    // Choose 日本語 (native label rendered inside the sheet).
    await page.getByRole("button", { name: /日本語/ }).first().click();

    // Sheet closes and the value updates. Bottom tab "Vault" → "保管庫".
    await expect(page.getByRole("link", { name: "保管庫" })).toBeVisible();
    // Section header on profile becomes "言語".
    await expect(page.getByText("言語", { exact: true }).first()).toBeVisible();
    // <html lang> should track the active locale.
    await expect.poll(async () => await page.evaluate(() => document.documentElement.lang)).toBe(
      "ja",
    );

    // --- Vault title translates too -----------------------------------------
    await page.getByRole("link", { name: "保管庫" }).click();
    await expect(page).toHaveURL(/\/vault$/);
    await expect(page.getByText("あなたのコード", { exact: true })).toBeVisible();

    // --- Restore System (English on this test runner) -----------------------
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /言語/ }).first().click();
    await page.getByRole("button", { name: /System|システム/ }).first().click();
    await expect(page.getByRole("link", { name: /Vault|保管庫/ })).toBeVisible();
  });
});
