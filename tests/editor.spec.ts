import { test, expect } from '@playwright/test';
test('block language reaches analysis and disabled highlights stay disabled', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.calls = [];
    w.__TAURI_INTERNALS__ = { invoke: async (command: string, args: any) => {
      w.calls.push({command, ...args});
      if (command === 'calculate_syllables') return [1, 1];
      if (command === 'analyze_rhymes') return { matches: [{word:'Ich',start:0,end:3,group_id:1,match_type:'moss-green'}] };
      return [];
    }};
  });
  await page.goto('/');
  const language = page.locator('select').nth(1);
  for (const lang of ['auto','de','en','auto']) {
    await language.selectOption(lang);
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c:any) => c.command === 'analyze_rhymes').at(-1)?.lang)).toBe(lang);
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c:any) => c.command === 'calculate_syllables').at(-1)?.lang)).toBe(lang);
  }
  await expect(page.locator('[data-group-id]')).toHaveCount(1);
  await page.getByRole('button', {name:'Highlights An'}).click();
  await page.locator('[contenteditable=true]').fill('Haus Maus');
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c:any) => c.command === 'analyze_rhymes').at(-1)?.text)).toBe('Haus Maus');
  await expect(page.locator('[data-group-id]')).toHaveCount(0);
});

test('late analysis from the previous language cannot overwrite current highlights', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__TAURI_INTERNALS__ = { invoke: async (command: string, args: any) => {
      if (command === 'calculate_syllables') return [1];
      if (command === 'analyze_rhymes') {
        if (args.lang === 'de') { w.deStarted = true; await new Promise(resolve => { w.resolveDe = resolve; }); }
        return { matches: [{word:'Ich', start:0, end:3, group_id: args.lang === 'en' ? 2 : 1, match_type:'moss-green'}] };
      }
      return [];
    }};
  });
  await page.goto('/');
  await page.locator('select').nth(1).selectOption('de');
  await expect.poll(() => page.evaluate(() => (window as any).deStarted)).toBe(true);
  await page.locator('select').nth(1).selectOption('en');
  await expect(page.locator('[data-group-id="2"]')).toHaveCount(1);
  await page.evaluate(() => (window as any).resolveDe());
  await expect(page.locator('[data-group-id="1"]')).toHaveCount(0);
  await expect(page.locator('[data-group-id="2"]')).toHaveCount(1);
});
