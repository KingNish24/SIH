import { test, expect } from '@playwright/test';

test('landing page loads', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#main-content')).toBeVisible();
});

for (const portal of ['/aicte', '/institution', '/university', '/student']) {
  test(`anonymous ${portal} redirects to /login`, async ({ request }) => {
    const res = await request.get(portal, { maxRedirects: 0 });
    expect([301, 302, 303, 307]).toContain(res.status());
    expect(res.headers()['location']).toContain('/login');
  });
}

test('verifier loads without sign in', async ({ page }) => {
  const res = await page.goto('/verifier');
  expect(res?.status()).toBe(200);
  expect(page.url()).not.toContain('/login');
});

const policyPages = [
  '/privacy', '/terms', '/accessibility', '/hyperlinking-policy',
  '/hi', '/hi/privacy', '/hi/terms', '/hi/accessibility', '/hi/hyperlinking-policy',
];
for (const p of policyPages) {
  test(`${p} returns 200 with h1`, async ({ page }) => {
    const res = await page.goto(p);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });
}

test('footer policy links are real anchors', async ({ page }) => {
  await page.goto('/');
  for (const href of ['/privacy', '/terms', '/accessibility', '/hyperlinking-policy']) {
    await expect(page.locator(`footer a[href="${href}"]`)).toHaveCount(1);
  }
});

test('language switcher works both ways', async ({ page }) => {
  await page.goto('/privacy');
  await page.locator('a[hreflang="hi"]').click();
  await expect(page).toHaveURL(/\/hi\/privacy$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.locator('a[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('sitemap.xml and robots.txt', async ({ request }) => {
  const sm = await request.get('/sitemap.xml');
  expect(sm.status()).toBe(200);
  expect(await sm.text()).toContain('<urlset');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap:');
});

// Security headers come from public/_headers (Cloudflare only) or middleware (another agent's work).
// The local dev server may not send them. Run with BASE_URL=<deployed URL> to check them for real.
const headersExpected = process.env.BASE_URL ? test : test.fixme;
headersExpected('security headers present', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options'] ?? h['content-security-policy']).toBeTruthy();
  expect(h['referrer-policy']).toBeTruthy();
});
