import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.calls=[];
    const project={version:'1.0',metadata:{title:'Legacy',artist:'Test',tempoBpm:120,created:'2026-01-01T00:00:00Z',modified:'2026-01-01T00:00:00Z'},settings:{defaultLanguage:'de',highlightStrictness:'medium'},blocks:[{id:'legacy',type:'Verse',customTitle:'',language:'de',content:'Alpha Bravo Charlie'}]};
    w.__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{
      w.calls.push({command,...args});
      if(command==='plugin:dialog|open')return 'legacy.lyricproj';
      if(command==='plugin:dialog|save')return w.cancelSave ? null : 'saved.lyricproj';
      if(command==='plugin:fs|write_text_file') {
        if(w.failWrite) throw 'Kein Schreibzugriff';
        if(w.delayWrite) { w.writeStarted=true; await new Promise(resolve => { w.finishWrite=resolve; }); }
        return;
      }
      if(command==='find_rhymes_for_word')return [{syllables:1,words:[{word:w.suggestionWord ?? 'Delta',lang:'DE'}]}];
      if(command==='plugin:fs|read_text_file')return Array.from(new TextEncoder().encode(JSON.stringify(project)));
      if(command==='calculate_syllables')return [{min:1,max:2,estimated:false}];
      if(command==='analyze_rhymes'){
        if(args.text==='Pending'){w.pendingStarted=true;await new Promise(resolve=>{w.resolvePending=resolve;});}
        if(args.text!=='Alpha Bravo Charlie')return {matches:[]};
        return {matches:[
          {word:'Alpha',start:0,end:5,group_id:1,match_type:'yellow',partners:[{start:6,match_type:'yellow'}]},
          {word:'Bravo',start:6,end:11,group_id:1,match_type:'purple',partners:[{start:0,match_type:'yellow'},{start:12,match_type:'purple'}]},
          {word:'Charlie',start:12,end:19,group_id:1,match_type:'purple',partners:[{start:6,match_type:'purple'}]},
        ]};
      }
      return [];
    }};
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Öffnen',exact:true}).click();
  await expect(page.locator('[data-word-start]')).toHaveCount(3);
});

test('helper replaces the selected word and insertion supports undo', async ({page}) => {
  await page.locator('[data-word-start="7"]').dblclick();
  await page.getByRole('button', {name: 'Delta DE', exact: true}).click();
  const editor = page.locator('[contenteditable=true]');
  await expect(editor).toHaveText('Alpha Delta Charlie');
  await editor.press('Control+z');
  await expect(editor).toHaveText('Alpha Bravo Charlie');
  await editor.press('Control+End');
  await editor.pressSequentially(' ');
  await page.getByRole('button', {name: 'Delta DE', exact: true}).click();
  await expect(editor).toHaveText('Alpha Bravo Charlie Delta');
});

test('blocks accept up to ten removable tags', async ({page}) => {
  const tagInput = page.getByRole('textbox', {name:'Block-Tag hinzufügen'});
  await tagInput.fill('solo');
  await tagInput.press('Enter');
  await expect(page.getByText('solo', {exact:true})).toBeVisible();
  await page.getByText('solo', {exact:true}).dblclick();
  const editTag = page.getByRole('textbox', {name:'Block-Tag bearbeiten: solo'});
  await expect(editTag).toBeFocused();
  await editTag.fill('lead vocal');
  await editTag.press('Enter');
  await expect(page.getByText('lead vocal', {exact:true})).toBeVisible();
  await tagInput.fill('zweiter tag');
  await tagInput.press('Enter');
  await expect(page.getByText('zweiter tag', {exact:true})).toBeVisible();

  for (let i = 0; i < 8; i++) {
    const input = page.getByRole('textbox', {name:'Block-Tag hinzufügen'});
    await input.fill(`tag${i}`);
    await input.press('Enter');
  }
  await expect(page.getByRole('textbox', {name:'Block-Tag hinzufügen'})).toHaveCount(0);
  await page.getByRole('button', {name:'Tag „lead vocal“ entfernen'}).click();
  await expect(page.getByRole('textbox', {name:'Block-Tag hinzufügen'})).toBeVisible();
});

test('cue tags can be renamed with a double-click', async ({page}) => {
  const editor = page.locator('[contenteditable=true]').first();
  await editor.press('End');
  await editor.pressSequentially(' [solo]');
  const cue = editor.locator('[data-inline-cue="true"]');
  await cue.locator('[data-cue-label="true"]').dblclick();
  const editCue = page.getByRole('textbox', {name:'Cue „solo“ bearbeiten'});
  await expect(editCue).toBeFocused();
  await editCue.fill('adlib');
  await editCue.press('Enter');
  await expect(cue).toHaveText('adlib');
  await cue.locator('[data-cue-label="true"]').dblclick();
  const cancelCue = page.getByRole('textbox', {name:'Cue „adlib“ bearbeiten'});
  await cancelCue.fill('verwerfen');
  await cancelCue.press('Escape');
  await expect(cue).toHaveText('adlib');
});

test('bracketed cues become draggable chips and stay out of rhyme and syllable analysis', async ({page}) => {
  const editor = page.locator('[contenteditable=true]');
  const originalEditor = editor.first();
  await originalEditor.press('End');
  await originalEditor.pressSequentially(' [solo]');
  const cue = originalEditor.locator('[data-inline-cue="true"]');
  await expect(cue).toHaveText('solo');
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((call:any) => call.command === 'analyze_rhymes').at(-1)?.text)).toBe('Alpha Bravo Charlie ');
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((call:any) => call.command === 'calculate_syllables').at(-1)?.text)).toBe('Alpha Bravo Charlie ');
  await expect(cue).toHaveCSS('cursor', 'grab');

  await page.getByTitle('Duplizieren', {exact:true}).click();
  await expect(page.locator('[contenteditable=true]').nth(1).locator('[data-inline-cue="true"]')).toHaveText('solo');

  await cue.getByRole('button', {name:'Cue „solo“ duplizieren'}).click();
  await expect(originalEditor.locator('[data-inline-cue="true"]')).toHaveCount(2);
  const cueLabels = originalEditor.locator('[data-cue-label="true"]');
  await expect(cueLabels).toHaveCount(2);
  const firstCueBox = await cueLabels.nth(0).boundingBox();
  const secondCueBox = await cueLabels.nth(1).boundingBox();
  expect(firstCueBox).not.toBeNull();
  expect(secondCueBox).not.toBeNull();
  expect(secondCueBox!.x - (firstCueBox!.x + firstCueBox!.width)).toBeGreaterThanOrEqual(40);
  await originalEditor.locator('[data-inline-cue="true"]').nth(1)
    .getByRole('button', {name:'Cue „solo“ löschen'}).click();
  await expect(originalEditor.locator('[data-inline-cue="true"]')).toHaveCount(1);

  const targetEditor = editor.nth(1);
  await targetEditor.fill('Text am Ende');
  const sourceLabel = cue.locator('[data-cue-label="true"]');
  const sourceBox = await sourceLabel.boundingBox();
  const targetBox = await targetEditor.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + 72, targetBox!.y + 12, {steps:8});
  await expect(page.locator('.lyricforge-cue-drop-cursor')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.lyricforge-cue-drop-cursor')).toHaveCount(0);
  await expect(originalEditor.locator('[data-inline-cue="true"]')).toHaveCount(0);
  await expect(targetEditor.locator('[data-inline-cue="true"]')).toHaveCount(1);
});

test('saving reports errors and cancellation without marking edits as saved', async ({page}) => {
  await page.getByPlaceholder('Song Titel').fill('Geändert');
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Ungespeicherte Änderungen');
  await page.evaluate(() => { (window as any).failWrite=true; });
  await page.getByRole('button', {name:'Speichern',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Kein Schreibzugriff');
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Ungespeicherte Änderungen');
  await page.evaluate(() => { (window as any).failWrite=false; (window as any).cancelSave=true; });
  await page.getByRole('button', {name:'Speichern',exact:true}).click();
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Speichern abgebrochen');
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Ungespeicherte Änderungen');
  await page.evaluate(() => { (window as any).cancelSave=false; });
  await page.getByRole('button', {name:'Speichern',exact:true}).click();
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Gespeichert');
  await expect(page.getByRole('status', {name:'Speicherstatus'})).not.toContainText('Ungespeicherte Änderungen');
});

test('edits made during saving remain dirty and opening can be cancelled', async ({page}) => {
  await page.evaluate(() => { (window as any).delayWrite=true; });
  await page.getByRole('button', {name:'Speichern',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).writeStarted)).toBe(true);
  await page.getByPlaceholder('Song Titel').fill('Spätere Änderung');
  await page.evaluate(() => (window as any).finishWrite());
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Ungespeicherte Änderungen');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', {name:'Öffnen',exact:true}).click();
  await expect(page.getByPlaceholder('Song Titel')).toHaveValue('Spätere Änderung');
  expect(await page.evaluate(() => (window as any).calls.filter((c:any) => c.command==='plugin:dialog|open').length)).toBe(1);
});

test('export failures are visible and export never clears the dirty state', async ({page}) => {
  await page.getByPlaceholder('Song Titel').fill('Nicht gesichert');
  await page.evaluate(() => { (window as any).failWrite=true; });
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:'Als Markdown',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Markdown-Export fehlgeschlagen');
  await expect(page.getByRole('status', {name:'Speicherstatus'})).toContainText('Ungespeicherte Änderungen');
});

test('native close waits for the discard decision and keeps cancelled edits', async ({page}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri=true;
    w.callbacks={};
    w.listeners={};
    let id=0;
    w.__TAURI_INTERNALS__.metadata={currentWindow:{label:'main'}};
    w.__TAURI_INTERNALS__.transformCallback=(fn:any)=>{ w.callbacks[++id]=fn; return id; };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(_event:string,eventId:number)=>delete w.listeners[eventId]};
    const original=w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='plugin:event|listen') { w.listeners[args.handler]=args; return args.handler; }
      if(command==='plugin:dialog|message') return w.discardAnswer ?? 'Abbrechen';
      if(command==='plugin:window|destroy') { w.destroyed=true; return; }
      return original(command,args);
    };
    w.requestClose=async()=>{
      const listener:any=Object.values(w.listeners).find((x:any)=>x.event==='tauri://close-requested');
      await w.callbacks[listener.handler]({event:'tauri://close-requested',id:listener.handler,payload:null});
    };
  });
  await page.reload();
  await page.getByPlaceholder('Song Titel').fill('Nicht verwerfen');
  await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).listeners).length)).toBe(1);
  await page.evaluate(()=>(window as any).requestClose());
  expect(await page.evaluate(()=>(window as any).destroyed)).toBeUndefined();
  await expect(page.getByPlaceholder('Song Titel')).toHaveValue('Nicht verwerfen');
  await page.evaluate(()=>{(window as any).discardAnswer='Verwerfen';});
  await page.evaluate(()=>(window as any).requestClose());
  expect(await page.evaluate(()=>(window as any).destroyed)).toBe(true);
});

test('legacy block settings do not restrict analysis or All search', async ({page})=>{
  await expect(page.locator('select')).toHaveCount(1);
  const calls=await page.evaluate(()=>(window as any).calls);
  expect(calls.filter((c:any)=>['analyze_rhymes','calculate_syllables'].includes(c.command)).every((c:any)=>c.lang==='auto')).toBe(true);
  await page.locator('.hl-yellow').dblclick();
  await expect.poll(()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>c.command==='find_rhymes_for_word').at(-1)?.lang)).toBe('auto');
  await expect(page.getByText('[1–2]',{exact:true})).toBeVisible();
});

test('hover highlights direct partners only and leaves yellow quiet otherwise', async ({page})=>{
  const alpha=page.locator('[data-word-start="1"]');
  const bravo=page.locator('[data-word-start="7"]');
  const charlie=page.locator('[data-word-start="13"]');
  await expect(alpha).toHaveCSS('text-decoration-line','none');
  await alpha.hover();
  await expect(alpha).toHaveClass(/hover-active-yellow/);
  await expect(bravo).toHaveClass(/hover-active-yellow/);
  await expect(charlie).not.toHaveClass(/hover-active/);
  await page.getByRole('button',{name:'Export',exact:true}).hover();
  await expect(page.locator('.hover-active')).toHaveCount(0);
  await expect(alpha).toHaveCSS('text-decoration-line','none');
  await bravo.hover();
  await expect(charlie).toHaveClass(/hover-active-purple/);
});

test('disabled highlights stay off after edits and late responses are discarded', async ({page})=>{
  const editor=page.locator('[contenteditable=true]');
  await editor.fill('Pending');
  await expect.poll(()=>page.evaluate(()=>(window as any).pendingStarted)).toBe(true);
  await editor.fill('Alpha Bravo Charlie');
  await expect(page.locator('[data-word-start]')).toHaveCount(3);
  await page.evaluate(()=>(window as any).resolvePending());
  await expect(page.locator('[data-word-start]')).toHaveCount(3);
  await page.getByRole('button',{name:'Highlights An',exact:true}).click();
  await editor.fill('Alpha Bravo Charlie ');
  await expect(page.locator('[data-word-start]')).toHaveCount(0);
});

test('Shift+Enter preserves line breaks in saved content and both analyses', async ({page}) => {
  const editor = page.locator('[contenteditable=true]');
  await editor.fill('Haus');
  await editor.press('End');
  await editor.press('Shift+Enter');
  await editor.pressSequentially('Maus');
  for (const command of ['calculate_syllables', 'analyze_rhymes']) {
    await expect.poll(() => page.evaluate(command =>
      (window as any).calls.filter((c: any) => c.command === command).at(-1)?.text,
      command)).toBe('Haus\nMaus');
  }
  // Duplicating uses the stored project content, not the live editor document.
  await page.getByTitle('Duplizieren', {exact: true}).click();
  const copy = page.locator('[contenteditable=true]').nth(1);
  await expect(copy.locator('p')).toHaveText(['Haus', 'Maus']);
});

test('long titles, lyrics and suggestions cannot push the sidebar outside the window', async ({page}) => {
  await page.setViewportSize({width:960,height:800});
  await page.evaluate(() => { (window as any).suggestionWord = 'Donaudampfschifffahrt'.repeat(12); });
  await page.locator('.hl-yellow').dblclick();
  await page.getByPlaceholder('Song Titel').fill('Ein sehr langer Titel '.repeat(20));
  await page.locator('[contenteditable=true]').fill('EinlangesWort'.repeat(80));
  const sidebar=page.getByRole('complementary',{name:'Reim-Helfer'});
  await expect(sidebar.getByRole('button',{name:/Donaudampfschifffahrt/})).toBeVisible();
  expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const box=await sidebar.boundingBox();
  expect(box!.x+box!.width).toBeLessThanOrEqual(961);
  await expect(page.getByRole('button',{name:'Nur EN',exact:true})).toBeInViewport();
});

for(const width of [1920,1520,1280,960])test('sidebar keeps toolbar and export usable at '+width,async({page})=>{
  await page.setViewportSize({width,height:800});
  await page.locator('.hl-yellow').dblclick();
  const title=page.getByRole('heading',{name:'Reim-Helfer'});
  await expect(title).toBeVisible();
  const header=await page.locator('header').boundingBox();
  const helper=await title.boundingBox();
  expect(helper!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  const sidebar = page.getByRole('complementary', {name:'Reim-Helfer'});
  const box = await sidebar.boundingBox();
  const main = await page.getByRole('main').boundingBox();
  expect(Math.abs(box!.x + box!.width - width)).toBeLessThanOrEqual(1);
  expect(Math.abs(main!.x + main!.width - box!.x)).toBeLessThanOrEqual(1);
  expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Nur EN',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'Reim-Helfer schließen'})).toBeInViewport();
  const block = await page.locator('.group\\/block').first().boundingBox();
  expect(block!.width).toBeGreaterThan(main!.width - 40);
  await page.getByRole('button',{name:'Highlights An',exact:true}).click();
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:'Als Markdown',exact:true}).click({trial:true});
});
