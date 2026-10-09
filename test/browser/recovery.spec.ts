import { test, expect } from '@playwright/test';
test('real WASM tool loop survives worker termination and page reload', async ({ page }) => {
  const failures: string[] = []; page.on('pageerror', e => failures.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Run ↗'})).toBeEnabled();
  await page.getByRole('button',{name:'Run ↗'}).click();
  await expect(page.locator('#status')).toContainText('saved');
  await page.getByRole('button',{name:'Interrupt runtime'}).click();
  await expect(page.locator('#status')).toContainText('Interrupted');
  await page.getByRole('button',{name:'Reopen & resume'}).click();
  await expect(page.locator('#messages')).toContainText('21 × 2 = 42.',{timeout:20000});
  await page.reload();
  await expect(page.locator('#messages')).toContainText('21 × 2 = 42.');
  await expect(page.locator('#error')).toBeEmpty();
  const evidence=await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('worker')));
  expect(evidence).toBeTruthy(); expect(failures).toEqual([]);
});
test('a second tab cannot become a concurrent journal writer', async ({page,context})=>{
  await page.goto('/');await expect(page.locator('#send')).toBeEnabled();
  const second=await context.newPage();await second.goto('/');
  await expect(second.locator('#error')).toContainText('already open');await second.close();
});

test('closing a tab during unfinished work resumes in a new tab',async({page,context})=>{
  await page.goto('/');await expect(page.locator('#send')).toBeEnabled();
  await page.locator('#send').click();
  await expect(page.locator('#messages .user')).toHaveCount(1);
  await page.close();
  const reopened=await context.newPage();await reopened.goto('/');
  await expect(reopened.locator('#messages')).toContainText('21 × 2 = 42.',{timeout:20000});
  await expect(reopened.locator('#error')).toBeEmpty();
});

test('browser Worker uses real HTTP model requests and native tools',async({page})=>{
  const {createServer}=await import('node:http');
  const requests:any[]=[];
  const server=createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4173');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);requests.push(body);
    const done=body.messages.at(-1).role==='tool';
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({choices:[{finish_reason:done?'stop':'tool_calls',message:done?{content:'42 via browser HTTP'}:{tool_calls:[{id:'browser-call',type:'function',function:{name:'multiply',arguments:'{"a":21,"b":2}'}}]}}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await page.goto('/');await expect(page.locator('#send')).toBeEnabled();
    await page.getByText('Model connection',{exact:true}).click();
    const address=server.address() as {port:number};
    await page.locator('#endpoint').fill(`http://127.0.0.1:${address.port}/v1`);
    await page.locator('#model').fill('test-model');
    await page.locator('#interrupt').click();await page.locator('#reopen').click();
    await expect(page.locator('#send')).toBeEnabled();await page.locator('#send').click();
    await expect(page.locator('#messages')).toContainText('42 via browser HTTP');
    expect(requests).toHaveLength(2);expect(requests[0].model).toBe('test-model');
    expect(requests[0].tools[0].function.name).toBe('multiply');expect(requests[1].messages.at(-1).content).toBe('42');
    await page.reload();await expect(page.locator('#mode')).toHaveText('CONNECTED MODEL');
    await expect(page.locator('#messages')).toContainText('42 via browser HTTP');
    await expect(page.locator('#error')).toBeEmpty();
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
