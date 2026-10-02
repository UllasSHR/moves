import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const errors=[];
async function page(){const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text());});return p;}
const p=await page();
await p.goto('http://127.0.0.1:5173');
await p.locator('#chat .message').first().waitFor();
assert.equal(await p.locator('.message').count(),12);
await p.locator('#chat').evaluate(el=>el.scrollTop=300);
assert.equal(await p.locator('#diff').evaluate(el=>el.scrollTop),0);
await p.selectOption('#target','diff');assert.ok(await p.locator('#diff-pane').evaluate(el=>el.classList.contains('selected')));
await p.screenshot({path:'test-results/desktop.png',fullPage:true});
await p.locator('#start').click();
await p.waitForFunction(()=>!document.querySelector('#pause').disabled||document.querySelector('#state').textContent==='Error',{},{timeout:45000});assert.notEqual(await p.locator('#state').textContent(),'Error',await p.locator('#message').textContent());
if(await p.locator('#pause').textContent()==='Resume')await p.locator('#pause').click();
await p.waitForFunction(()=>document.querySelector('#state').textContent==='Hand not visible');
await p.waitForFunction(()=>document.querySelector('#diagnostics').textContent.includes('updates/s'));
console.log('Artificial camera timing:',await p.locator('#diagnostics').textContent());
const resources=await p.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));
assert.ok(resources.every(url=>url.startsWith(locationURL())),JSON.stringify(resources));
function locationURL(){return 'http://127.0.0.1:5173/';}
await p.keyboard.press('Escape');assert.equal(await p.locator('#state').textContent(),'Paused');
await p.locator('#pause').click();
await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.locator('#state').textContent(),'Paused');
const tracks=await p.evaluateHandle(()=>document.querySelector('video').srcObject.getTracks());
await p.locator('#stop').click();
assert.ok(await tracks.evaluate(ts=>ts.every(t=>t.readyState==='ended')));
assert.equal(await p.locator('video').evaluate(el=>el.srcObject),null);
await p.locator('#start').click();await p.waitForFunction(()=>!document.querySelector('#pause').disabled,{},{timeout:45000});await p.locator('#stop').click();
await p.setViewportSize({width:390,height:844});await p.screenshot({path:'test-results/mobile.png',fullPage:true});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log('PASS real local model + WASM, fake video inference, pane selection, independent scroll, Escape, blur, track release, restart, mobile layout, no remote resources');
await p.close();
// Fingertip-only motion through the actual controller and DOM, not a physical trial.
const s=await page();
await s.addInitScript(()=>{
 window.processed=0;
 window.Worker=class {
  postMessage(data){if(data.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);else{data.frame.close();this.onmessage?.({data:{type:'result',points:window.testPoints??null,identity:window.testIdentity??'Left',time:data.time}});window.processed++;}}
  terminate(){}
 };
 window.testHand=(y=0,x=0)=>{const p=Array.from({length:21},()=>({x:.5,y:.65,z:0}));[8,12,16,20].forEach((i,n)=>p[i]={x:.3+n*.1+x,y:.4+n*.02+y,z:n*.02});return p;};
});
await s.goto('http://127.0.0.1:5173');await s.locator('#start').click();await s.waitForFunction(()=>!document.querySelector('#pause').disabled);if(await s.locator('#pause').textContent()==='Resume')await s.locator('#pause').click();
async function pose(y,x=0,identity='Left'){
 const next=await s.evaluate(({y,x,identity})=>{window.testIdentity=identity;window.testPoints=y===null?null:window.testHand(y,x);return window.processed+2;},{y,x,identity});await s.waitForFunction(n=>window.processed>=n,next);
}
const position=(id='chat')=>s.locator('#'+id).evaluate(el=>el.scrollTop);
await pose(0);
for(const direction of ['up','down']){
 await s.selectOption('#direction',direction);await pose(0);
 const sign=direction==='up'?-1:1;
 for(let i=0;i<10;i++){
  const before=await position();await pose(sign*.02);const after=await position();assert.ok((after-before)*-sign>=16,`${direction} stroke ${i}: ${before} -> ${after}`);
  await pose(sign*.01,.03);assert.equal(await position(),after);await pose(0);assert.equal(await position(),after);
 }
}
assert.equal(await position('diff'),0);
await s.selectOption('#direction','up');await pose(0);await pose(-.04);const held=await position();
await s.evaluate(()=>window.testPoints[8].y=-.8);await s.waitForTimeout(120);assert.equal(await position(),held);await pose(-.04);assert.equal(await position(),held);
await s.keyboard.press('Escape');await s.evaluate(()=>window.testPoints=window.testHand(.1));await s.waitForTimeout(120);assert.equal(await position(),held);
await s.locator('#pause').click();await pose(.1);assert.equal(await position(),held);
await s.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await s.locator('#state').textContent(),'Paused');
await s.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await s.locator('#state').textContent(),'Paused');await s.locator('#pause').click();await pose(.1);assert.equal(await position(),held);
await s.selectOption('#target','diff');await pose(-.04);assert.equal(await position('diff'),0);await pose(-.08);assert.ok(await position('diff')>=35);
await s.selectOption('#direction','down');await pose(-.08);const beforeDown=await position('diff');await pose(-.06);assert.ok(await position('diff')<beforeDown);
await pose(null);assert.equal(await s.locator('#state').textContent(),'Hand not visible');const beforeReturn=await position('diff');await pose(.15);assert.equal(await position('diff'),beforeReturn);await pose(-.1,0,'Right');assert.equal(await position('diff'),beforeReturn);
// Boundaries must clamp, with no stored movement debt when changing direction.
await s.locator('#diff').evaluate(el=>el.scrollTop=el.scrollHeight);await s.selectOption('#direction','up');await pose(0);const bottom=await position('diff');await pose(-.04);assert.equal(await position('diff'),bottom);
await s.selectOption('#direction','down');await pose(0);await pose(.02);assert.ok(await position('diff')<bottom);
await s.locator('#diff').evaluate(el=>el.scrollTop=0);await pose(.04);assert.equal(await position('diff'),0);
// Both axes together; raw +x is visible left in the mirrored preview.
await s.selectOption('#direction','up');await pose(0,0);
await s.locator('#diff').evaluate(el=>{el.scrollTop=100;el.scrollLeft=50;});
const left=()=>s.locator('#diff').evaluate(el=>el.scrollLeft);
const beforeDiagonal={x:await left(),y:await position('diff')};
await pose(-.02,.03);assert.ok(await left()>beforeDiagonal.x);assert.ok(await position('diff')>beforeDiagonal.y);
const diagonal={x:await left(),y:await position('diff')};await pose(-.02,.01);assert.ok(await left()<diagonal.x);assert.equal(await position('diff'),diagonal.y);
const beforeY=await left();await pose(-.04,.01);assert.equal(await left(),beforeY);
const beforeRecovery={x:await left(),y:await position('diff')};await pose(-.02,.03);assert.ok(await left()>beforeRecovery.x);assert.equal(await position('diff'),beforeRecovery.y);
// Right edge does not block Y; reversing X from edge works immediately.
await s.locator('#diff').evaluate(el=>el.scrollLeft=el.scrollWidth);const right=await left(),edgeY=await position('diff');await pose(-.04,.05);assert.equal(await left(),right);assert.ok(await position('diff')>edgeY);await pose(-.04,.03);assert.ok(await left()<right);
// Left edge does not block Y; bottom/top do not block X.
await s.locator('#diff').evaluate(el=>el.scrollLeft=0);const leftY=await position('diff');await pose(-.06,.01);assert.equal(await left(),0);assert.ok(await position('diff')>leftY);
await s.locator('#diff').evaluate(el=>el.scrollTop=el.scrollHeight);await pose(-.08,.04);assert.ok(await left()>0);
await s.selectOption('#direction','down');await pose(-.08,.04);await s.locator('#diff').evaluate(el=>el.scrollTop=0);const beforeTop=await left();await pose(-.06,.06);assert.ok(await left()>beforeTop);assert.equal(await position('diff'),0);
// Content fits -> X disabled. Restore long content -> baseline starts fresh.
const content=await s.locator('#diff').innerHTML();await s.locator('#diff').evaluate(el=>el.textContent='Short code');await pose(0,.1);await pose(-.02,.2);assert.equal(await left(),0);assert.match(await s.locator('#axis-status').textContent(),/Content fits/);
// Stage the new hand location while X is disabled. Otherwise the live worker
// can rebase on the OLD pose between the DOM change and the next pose call,
// and the next call is legitimate new movement rather than dormant backlog.
await pose(0,.25);await s.locator('#diff').evaluate((el,html)=>el.innerHTML=html,content);await pose(0,.25);assert.equal(await left(),0);await pose(0,.27);assert.ok(await left()>0);
// Real viewport size changes toggle horizontal overflow on a 90-column line.
await s.locator('#diff').evaluate(el=>{el.textContent='x'.repeat(90);el.style.whiteSpace='pre';});
await pose(0,.3);await s.setViewportSize({width:2000,height:1000});await pose(0,.3);assert.equal(await s.locator('#diff').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await pose(0,.4);assert.equal(await left(),0);
await pose(0,.45);await s.setViewportSize({width:1200,height:1000});await pose(0,.45);assert.equal(await s.locator('#diff').evaluate(el=>el.scrollWidth>el.clientWidth+1),true);assert.equal(await left(),0);await pose(0,.47);assert.ok(await left()>0);
await s.locator('#diff').evaluate((el,html)=>{el.innerHTML=html;el.style.whiteSpace='';},content);
await s.selectOption('#target','chat');const fixedX=await left(),chatBefore=await position();await pose(0,0);await pose(0,.1);assert.equal(await position(),chatBefore);assert.equal(await s.locator('#chat').evaluate(el=>el.scrollLeft),0);assert.equal(await left(),fixedX);
assert.equal(await s.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log('PASS simultaneous XY: diagonal, pure axes, X during Y recovery, independent bounds, fitted/overflowing content, viewport capability toggles, dormant-X rebasing, chat isolation');
await s.locator('#stop').click();console.log('PASS fingertip UI: 10 strokes EACH direction contribute; zero curved recovery, stationary/erratic tip, pane lock, lifecycle/config/loss/identity resets, both bounds');await s.close();
const denied=await page();await denied.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});await denied.goto('http://127.0.0.1:5173');await denied.locator('#start').click();await denied.waitForFunction(()=>document.querySelector('#state').textContent==='Error',{},{timeout:45000});assert.match(await denied.locator('#message').textContent(),/denied/);assert.equal(await denied.locator('#start').isEnabled(),true);await denied.close();
const failed=await page();await failed.route('**/models/*',route=>route.abort());await failed.goto('http://127.0.0.1:5173');await failed.locator('#start').click();await failed.waitForFunction(()=>document.querySelector('#state').textContent==='Error',{},{timeout:45000});assert.equal(await failed.locator('#start').isEnabled(),true);await failed.close();
const unavailable=await page();await unavailable.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Missing','NotFoundError');};});await unavailable.goto('http://127.0.0.1:5173');await unavailable.locator('#start').click();await unavailable.waitForFunction(()=>document.querySelector('#state').textContent==='Error');assert.match(await unavailable.locator('#message').textContent(),/No camera/);await unavailable.close();
const late=await page();await late.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=constraints=>new Promise(resolve=>{window.releaseCamera=async()=>{const stream=await original(constraints);window.lateTracks=stream.getTracks();resolve(stream);};});});await late.goto('http://127.0.0.1:5173');await late.locator('#start').click();await late.waitForFunction(()=>!!window.releaseCamera);await late.locator('#stop').click();await late.evaluate(()=>window.releaseCamera());await late.waitForFunction(()=>window.lateTracks.every(t=>t.readyState==='ended'));assert.equal(await late.locator('video').evaluate(el=>el.srcObject),null);assert.equal(await late.locator('#state').textContent(),'Idle');await late.close();console.log('PASS unavailable camera and Stop during pending camera consent releases late tracks');
assert.deepEqual(errors,[]);console.log('PASS denied camera and unavailable model recovery; no uncaught page errors');await browser.close();
