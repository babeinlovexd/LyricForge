import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.calls=[];
    const project={version:'1.0',metadata:{title:'Legacy',artist:'Test',tempoBpm:120,created:'2026-01-01T00:00:00Z',modified:'2026-01-01T00:00:00Z'},settings:{defaultLanguage:'de',highlightStrictness:'medium'},blocks:[{id:'legacy',type:'Verse',customTitle:'',language:'de',content:'Alpha Bravo Charlie'}]};
    w.__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{
      w.calls.push({command,...args});
      if(command==='plugin:dialog|open')return 'legacy.lyricproj';
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

for(const width of [1280,960])test('sidebar keeps toolbar and export usable at '+width,async({page})=>{
  await page.setViewportSize({width,height:800});
  await page.locator('.hl-yellow').dblclick();
  const title=page.getByRole('heading',{name:'Reim-Helfer'});
  await expect(title).toBeVisible();
  const header=await page.locator('header').boundingBox();
  const helper=await title.boundingBox();
  expect(helper!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  await page.getByRole('button',{name:'Highlights An',exact:true}).click();
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:'Als Markdown',exact:true}).click({trial:true});
});
