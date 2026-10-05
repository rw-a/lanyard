import { expect, test } from '@playwright/test';
import { goTo, openApp, pasteCsv, storedGet } from './helpers';

test.describe('Data tab', () => {
  test('starts empty with a drop zone and the design shortcut', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'Drop your CSV here' })).toBeVisible();
    await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'Choose file…' })).toBeVisible();
    await expect(page.getByText(/start designing without data/)).toBeVisible();
  });

  test('loads the sample roster and shows the preview table and stats', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Load sample roster' }).click();

    await expect(page.getByText(/sample-camp-roster\.csv — 25 people, 6 columns/i)).toBeVisible();
    await expect(page.getByTestId('tab-data')).toContainText('25');

    const table = page.locator('.table').first();
    await expect(table.locator('thead th')).toHaveText(['#', 'Name', 'Accommodation', 'Group', 'Role', 'Dietary', 'Emergency contact']);
    await expect(table.locator('tbody tr')).toHaveCount(9); // 8 rows + "and 17 more"
    await expect(table).toContainText('and 17 more');

    // Per-column stats table: Name row lists Kai / … / Maximilian with lengths
    const stats = page.locator('.table.stats');
    const nameRow = stats.locator('tr', { hasText: 'Name' }).first();
    await expect(nameRow).toContainText('Kai');
    await expect(nameRow).toContainText('Maximilian Alexander von Habsburg-Lothringen');
    await expect(nameRow.locator('.len').first()).toHaveText('3');
    await expect(nameRow.locator('.len').last()).toHaveText('44');

    // Columns used by the template are chips; none should be flagged missing for the sample
    await expect(page.locator('.chip')).toHaveCount(3);
    await expect(page.locator('.chip.missing')).toHaveCount(0);
  });

  test('uploads a CSV file through the file picker', async ({ page }) => {
    await openApp(page);
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'roster.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Name,Accommodation,Group\nAda,Cabin 1,Red\nBob,Cabin 2,Blue\n'),
    });
    await expect(page.getByText(/roster\.csv — 2 people, 3 columns/)).toBeVisible();
    await expect(page.getByTestId('tab-data')).toContainText('2');
  });

  test('loads a CSV by drag and drop', async ({ page }) => {
    await openApp(page);
    const dropzone = page.locator('.dropzone');
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['Name,Cabin\nAda,1\nBob,2\nCy,3\n'], 'dropped.csv', { type: 'text/csv' }));
      return dt;
    });
    await dropzone.dispatchEvent('dragover', { dataTransfer: dt });
    await expect(dropzone).toHaveClass(/over/);
    await dropzone.dispatchEvent('drop', { dataTransfer: dt });
    await expect(dropzone).not.toHaveClass(/over/);
    await expect(page.getByText(/dropped\.csv — 3 people, 2 columns/)).toBeVisible();
  });

  test('pastes semicolon-separated text with a BOM, quotes and empty cells', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, '﻿First name;Last name;Cabin;Team\nAda;Lovelace;"Lakeside Lodge; Room 2";Red\nBo;Li;;Blue\n');
    await expect(page.getByText(/pasted\.csv — 2 people, 4 columns/)).toBeVisible();
    const table = page.locator('.table').first();
    await expect(table.locator('thead th')).toHaveText(['#', 'First name', 'Last name', 'Cabin', 'Team']);
    await expect(table).toContainText('Lakeside Lodge; Room 2');

    // The stats table reports the one empty Cabin cell
    const cabinRow = page.locator('.table.stats tr', { hasText: 'Cabin' });
    await expect(cabinRow.locator('td').last()).toHaveText('1');
  });

  test('"Ignore empty cells" toggles whether an empty value counts as shortest', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Name,Cabin\nAda,\nBob,Tent 4\nCy,Lodge 12\n');
    const cabinRow = page.locator('.table.stats tr', { hasText: 'Cabin' });
    await expect(cabinRow.locator('td').nth(1)).toContainText('Tent 4');
    await page.getByLabel('Ignore empty cells').uncheck();
    await expect(cabinRow.locator('td').nth(1)).toContainText('(empty)');
    await page.getByLabel('Ignore empty cells').check();
    await expect(cabinRow.locator('td').nth(1)).toContainText('Tent 4');
  });

  test('shows warnings for ragged rows but still loads the data', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'A,B\n1,2,3\n4,5\n');
    await expect(page.locator('.notice.warn')).toContainText(/Row 2 has 3 cells/);
    await expect(page.getByText(/pasted\.csv — 2 people, 2 columns/)).toBeVisible();
  });

  test('flags template fields that are missing from the loaded CSV', async ({ page }) => {
    await openApp(page);
    // First load: the pristine template rebinds to these headers.
    await pasteCsv(page, 'Name,Accommodation,Group\nAda,Cabin 1,Red\n');
    await expect(page.locator('.chip.missing')).toHaveCount(0);
    // Touch the template so it is no longer pristine, then load a CSV with different headers.
    await goTo(page, 'design');
    await page.locator('[data-testid="layer"][data-name="Name"]').click();
    await page.locator('[data-field="Layer name"] input').fill('Person');
    await goTo(page, 'data');
    await pasteCsv(page, 'Who,Where\nAda,Cabin 1\n');
    await expect(page.locator('.chip.missing')).toHaveCount(3);
    await expect(page.getByText(/Red columns are referenced by the template/)).toBeVisible();
  });

  test('removing the data returns to the empty state', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Load sample roster' }).click();
    await page.getByRole('button', { name: 'Remove data' }).click();
    await expect(page.getByText(/start designing without data/)).toBeVisible();
    await expect(page.getByTestId('tab-data')).not.toContainText('25');
    await expect.poll(() => storedGet(page, 'dataset')).toBeUndefined();
  });

  test('the paste box can be cancelled', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Paste text' }).click();
    await expect(page.locator('.paste-box')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use this data' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.paste-box')).toBeHidden();
  });
});
