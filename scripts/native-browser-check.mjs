import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.messages=[];window.webkit={messageHandlers:{moves:{postMessage:m=>window.messages.push(m)}}};
 window.processed=0;window.testPoints=null;
 window.Worker=class{postMessage(data){if(data.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);else{data.frame.close();window.processed++;this.onmessage?.({data:{type:'result',points:window.testPoints,identity:'Left',time:data.time}});}}terminate(){}};
 window.testHand=(y=0,x=0)=>{const p=Array.from({length:21},()=>({x:.5,y:.65,z:0}));[8,12,16,20].forEach((i,n)=>p[i]={x:.3+n*.1+x,y:.4+n*.02+y,z:0});return p;};
});
await page.goto('http://127.0.0.1:5173/native.html');
await page.waitForFunction(()=>!!window.movesNative);
await page.setViewportSize({width:264,height:520});
assert.equal(await page.locator('#diagnostics').isVisible(),false);
assert.equal(await page.locator('#camera-preview').isVisible(),true);
assert.ok(await page.locator('main').evaluate(el=>el.getBoundingClientRect().height)<300);
assert.ok(await page.evaluate(()=>{
 const preview=document.querySelector('.preview').getBoundingClientRect(),feed=document.querySelector('.feed').getBoundingClientRect();
 return preview.width>=240&&Math.abs(preview.width/preview.height-4/3)<.01&&feed.width===preview.width&&feed.height===preview.height;
}),'The whole feed must fill a readable full-width rectangular preview');
await page.getByRole('button',{name:'Details',exact:true}).click();
assert.equal(await page.locator('#diagnostics').isVisible(),true);
assert.ok(await page.locator('main').evaluate(el=>el.getBoundingClientRect().height)>300);
await page.getByRole('button',{name:'Hide details',exact:true}).click();
assert.equal(await page.locator('#diagnostics').isVisible(),false);
assert.equal(await page.locator('#camera-preview').isVisible(),true);
assert.equal(await page.locator('#camera').textContent(),'CAMERA OFF');
await page.getByRole('button',{name:'Start scrolling'}).click();
assert.ok(await page.evaluate(()=>window.messages.some(m=>m.type==='toggle')));
assert.equal(await page.locator('#camera').textContent(),'CAMERA OFF');
await page.evaluate(()=>window.movesNative.start(1));
await page.waitForFunction(()=>window.messages.some(m=>m.type==='started'));
await page.getByRole('button',{name:'Details',exact:true}).click();
await page.getByRole('button',{name:'Hide details',exact:true}).click();
assert.ok(await page.locator('video').evaluate(el=>el.srcObject.getTracks().every(t=>t.readyState==='live')));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
async function pose(y,x=0){const next=await page.evaluate(({y,x})=>{window.testPoints=y===null?null:window.testHand(y,x);window.messages=[];return window.processed+2;},{y,x});await page.waitForFunction(n=>window.processed>=n,next);return page.evaluate(()=>window.messages.filter(m=>m.type==='motion'));}
await pose(0);let result=await pose(-.02,.03);assert.ok(result.some(m=>m.y>0));assert.ok(result.every(m=>m.x===0));
result=await pose(.02,.06);assert.ok(result.every(m=>m.y===0&&m.x===0));
result=await pose(.02,.06);assert.ok(result.every(m=>m.x===0&&m.y===0));
// Exercise the native page's automatic direction and tracking bridge, not just
// the shared controller: repeated rotary strokes must never undo progress.
for(const direction of ['up','down']){
 await pose(0);
 if(direction==='down')await page.waitForFunction(()=>document.querySelector('#state').textContent==='Choose direction');
 const sign=direction==='up'?-1:1;
 for(let i=0;i<10;i++){
  result=await pose(sign*.04);assert.ok(result.some(m=>m.y* -sign>0));
  result=await pose(0);assert.ok(result.every(m=>m.y===0));
 }
}
await pose(.02,.06);
await page.evaluate(()=>window.movesNative.configure(true,900));await pose(.02,.06);result=await pose(0,.08);assert.ok(result.some(m=>m.x>0&&m.y>0));
await page.evaluate(()=>window.dispatchEvent(new Event('blur')));result=await pose(.02,.06);assert.ok(result.some(m=>m.x<0));assert.ok(result.every(m=>m.y===0));
await page.evaluate(()=>window.movesNative.configure(false,900));await pose(0,.1);result=await pose(-.02,.12);assert.ok(result.every(m=>m.x===0));
await pose(null);result=await pose(.2,.3);assert.ok(result.every(m=>m.x===0&&m.y===0));
const tracks=await page.evaluateHandle(()=>document.querySelector('video').srcObject.getTracks());
await page.evaluate(()=>window.movesNative.stop());assert.ok(await tracks.evaluate(ts=>ts.every(t=>t.readyState==='ended')));assert.equal(await page.locator('video').evaluate(el=>el.srcObject),null);
assert.equal(await page.locator('#camera').textContent(),'CAMERA OFF');
await page.evaluate(()=>{const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.release=async()=>{const s=await real({video:true});window.lateTracks=s.getTracks();resolve(s);};});window.movesNative.start(2);});
await page.waitForFunction(()=>!!window.release);await page.evaluate(()=>window.movesNative.stop());await page.evaluate(()=>window.release());await page.waitForFunction(()=>window.lateTracks.every(t=>t.readyState==='ended'));
assert.equal(await page.locator('video').evaluate(el=>el.srcObject),null);assert.deepEqual(errors,[]);
console.log('PASS native bridge: ten repeated strokes each way with zero vertical return, pause switches direction without a selector, stationary stop, horizontal opt-in/disable, diagonals, background focus, reacquisition, camera shutdown, late-consent cancellation. No system input posted.');
await browser.close();
