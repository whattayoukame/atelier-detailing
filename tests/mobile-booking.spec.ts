import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Loopback is considered secure; simulate missing randomUUID on loopback.
  // With TEST_BASE_URL set to a LAN HTTP URL, exercise actual browser behavior.
  if (!process.env.TEST_BASE_URL) {
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined });
    });
  }
});

test('home CTA, catalog, personal booking and owner cabinet open without crashes', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/s/atelier/');
  await expect(page.locator('.hero-liquid')).toBeVisible();
  await page.locator('.hero-liquid').click();
  await expect(page).toHaveURL(/\/s\/atelier\/booking$/);
  await expect(page.getByRole('heading', {name:/Запись в студию/})).toBeVisible();

  await page.getByRole('navigation', {name:'Основная навигация'}).getByText('Услуги').click();
  await expect(page).toHaveURL(/\/s\/atelier\/services$/);
  await page.getByRole('link', {name:/Записаться на Комплексный детейлинг/}).click();
  await expect(page).toHaveURL(/\/s\/atelier\/booking\?service=/);
  await expect(page.locator('.service-option.active')).toContainText('Комплексный детейлинг');

  await page.getByRole('navigation', {name:'Основная навигация'}).getByText('Моя запись').click();
  await expect(page.getByText('Пока нет активной записи')).toBeVisible();
  await page.getByRole('link', {name:/Записаться/}).last().click();
  await expect(page.locator('.booking-fields')).toBeVisible();

  await page.getByRole('link', {name:/Открыть кабинет/}).click();
  await expect(page).toHaveURL(/\/s\/atelier\/admin$/);
  await expect(page.locator('.owner-page').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a customer can reserve and cancel a slot in the LAN HTTP compatibility mode', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/s/atelier/booking');
  await expect(page.locator('.booking-fields')).toBeVisible();
  if (process.env.TEST_BASE_URL) {
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  }

  const slots = page.locator('.time-grid button:not(.busy):not([disabled])');
  let found = false;
  // Start at least two calendar days later, because cancellation requires 24h notice.
  for (let index = 2; index < 14; index++) {
    await page.locator('.day-strip button').nth(index).click();
    // Closed days have an empty grid, which is correctly hidden by CSS.
    await expect(page.locator('.booking-step').nth(1).locator('.time-grid')).toBeAttached();
    if (await slots.count()) { found = true; break; }
  }
  expect(found, 'At least one available appointment in the next 14 days').toBe(true);
  await slots.first().click();
  await page.getByPlaceholder('Александр').fill('Тестовый Клиент');
  await page.getByPlaceholder('+7 999 123-45-67').fill('+7 999 123-45-67');
  await page.getByPlaceholder('Например, BMW 5 серии').fill('BMW 5 серии');
  await page.getByRole('button', {name:/Подтвердить запись/}).click();
  await expect(page).toHaveURL(/\/s\/atelier\/my$/);
  await expect(page.getByText('Вы записаны!')).toBeVisible();
  await expect(page.getByText('Тестовый Клиент')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:/Отменить запись/}).click();
  await expect(page.getByText('Запись отменена')).toBeVisible();
  expect(errors).toEqual([]);
});
