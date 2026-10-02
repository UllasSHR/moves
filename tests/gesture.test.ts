import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Gesture,TIPS,type Point,type Direction} from '../src/gesture';
function hand(y=0,x=0):Point[]{const p=Array.from({length:21},()=>({x:.5,y:.65,z:0}));TIPS.forEach((i,n)=>p[i]={x:.3+n*.1+x,y:.4+n*.02+y,z:n*.02});return p;}
for(const direction of ['up','down'] as Direction[])test(`ten ${direction} strokes preserve accumulation; return Y zero while X works`,()=>{const g=new Gesture();let time=0,total=0;const sign=direction==='up'?-1:1;g.update(hand(),time,900,direction,null,true);for(let stroke=0;stroke<10;stroke++){const before=total;for(let i=1;i<=5;i++)total+=g.update(hand(sign*i*.01),time+=40,900,direction,null,true).y;assert.ok((total-before)*-sign>40);for(let i=4;i>=0;i--){const d=g.update(hand(sign*i*.01,.03),time+=40,900,direction,null,true);assert.equal(d.y,0);if(i===4)assert.ok(d.x<0);}}});
test('diagonals emit both deltas together with correct sign',()=>{const g=new Gesture();g.update(hand(),0,900,'up',null,true);const d=g.update(hand(-.02,-.03),40,900,'up',null,true);assert.ok(d.x>0&&d.y>0);assert.match(g.state,/up \+ left/);});
test('pure axes and stationary tremor remain independent',()=>{const g=new Gesture();g.update(hand(),0,900,'up',null,true);const x=g.update(hand(0,-.02),40,900,'up',null,true);assert.ok(x.x>0);assert.equal(x.y,0);const y=g.update(hand(-.02,-.02),80,900,'up',null,true);assert.ok(y.y>0);assert.equal(y.x,0);for(let i=3;i<100;i++)assert.deepEqual(g.update(hand(-.02+(i%2?.001:-.001),-.02+(i%2?.001:-.001)),i*40,900,'up',null,true),{x:0,y:0});});
test('slow X accumulates while Y keeps moving; independent baselines',()=>{const g=new Gesture();g.update(hand(),0,900,'up',null,true);let x=0,y=0;for(let i=1;i<=40;i++){const d=g.update(hand(-i*.005,-i*.0005),i*40,900,'up',null,true);x+=d.x;y+=d.y;}assert.ok(x>12&&y>150);});
test('capability changes rebase dormant X while preserving Y',()=>{const g=new Gesture();g.update(hand(),0);g.update(hand(-.01,.1),40);g.setCapabilities(true,true);const d=g.update(hand(-.02,.2),80,900,'up',null,true);assert.equal(d.x,0);assert.ok(d.y>0);g.setCapabilities(false,true);assert.equal(g.update(hand(-.03,.3),120).x,0);g.setCapabilities(true,true);assert.equal(g.update(hand(-.04,.4),160,900,'up',null,true).x,0);});
test('one erratic tip cannot jerk either axis; unequal curls permitted',()=>{const g=new Gesture();g.update(hand(),0,900,'up',null,true);for(let n=1;n<30;n++){const p=hand();p[8]={x:n%2?-1:2,y:n%2?-1:2,z:0};assert.deepEqual(g.update(p,n*40,900,'up',null,true),{x:0,y:0});}});
test('loss identity config and lifecycle resets prevent jumps in both axes',()=>{const g=new Gesture();g.update(hand(),0,900,'up','Left',true);g.update(null,40,900,'up','Left',true);assert.deepEqual(g.update(hand(.1,.1),80,900,'up','Left',true),{x:0,y:0});assert.deepEqual(g.update(hand(-.1,-.1),120,900,'up','Right',true),{x:0,y:0});g.reset();assert.deepEqual(g.update(hand(.2,.2),160,900,'up',null,true),{x:0,y:0});assert.deepEqual(g.update(hand(.1,.1),200,1200,'down',null,true),{x:0,y:0});});
test('invalid tracking stops and large jump rebases both',()=>{const g=new Gesture();g.update(hand(),0,900,'up',null,true);assert.deepEqual(g.update([],40,900,'up',null,true),{x:0,y:0});assert.equal(g.state,'Tracking unavailable');g.update(hand(),80,900,'up',null,true);assert.deepEqual(g.update(hand(-.6,-.6),120,900,'up',null,true),{x:0,y:0});});
test('both vertical directions follow fingertip motion without switching; X defaults off',()=>{const g=new Gesture();g.update(hand(),0,900,'both');const up=g.update(hand(-.02,.03),40,900,'both');assert.ok(up.y>0);assert.equal(up.x,0);assert.equal(g.state,'Scrolling up');const down=g.update(hand(.01,.06),80,900,'both');assert.ok(down.y<0);assert.equal(down.x,0);assert.equal(g.state,'Scrolling down');assert.deepEqual(g.update(hand(.01,.06),120,900,'both'),{x:0,y:0});});
test('explicit sideways enable rebases X and both-mode diagonals reverse immediately',()=>{const g=new Gesture();g.update(hand(),0,900,'both');g.update(hand(-.01,.1),40,900,'both');g.setCapabilities(true,true);assert.equal(g.update(hand(-.02,.2),80,900,'both',null,true).x,0);const up=g.update(hand(-.04,.18),120,900,'both',null,true);assert.ok(up.x>0&&up.y>0);const down=g.update(hand(-.02,.2),160,900,'both',null,true);assert.ok(down.x<0&&down.y<0);g.setCapabilities(false,true);assert.equal(g.update(hand(0,.25),200,900,'both').x,0);});

test('automatic strokes ignore ten returns, pause rearms, then reverse without a button',()=>{
 const g=new Gesture();let t=0;g.update(hand(),t,900,'auto');
 for(const sign of [-1,1]){
  if(sign===1){for(let i=0;i<14;i++)assert.equal(g.update(hand(),t+=40,900,'auto').y,0);assert.equal(g.state,'Choose direction');}
  for(let n=0;n<10;n++){
   for(let i=1;i<=5;i++)assert.ok(g.update(hand(sign*i*.01),t+=40,900,'auto').y* -sign>0);
   for(let i=4;i>=0;i--)assert.equal(g.update(hand(sign*i*.01),t+=40,900,'auto').y,0);
  }
 }
});
test('short pauses do not reverse, quiet jitter rearms, slow cumulative movement does not',()=>{
 const g=new Gesture();let t=0;g.update(hand(),t,900,'auto');g.update(hand(-.02),t+=40,900,'auto');
 for(let i=0;i<8;i++)g.update(hand(-.02),t+=40,900,'auto');
 assert.equal(g.update(hand(),t+=40,900,'auto').y,0);
 for(let i=0;i<16;i++)g.update(hand(i%2?.001:-.001),t+=40,900,'auto');
 assert.equal(g.state,'Choose direction');assert.ok(g.update(hand(.02),t+=40,900,'auto').y<0);
 for(let i=1;i<=30;i++)g.update(hand(.02+i*.001),t+=40,900,'auto');
 assert.equal(g.update(hand(.01),t+=40,900,'auto').y,0);
});
test('tracking loss and timestamp gaps cannot count as a pause or create a jump',()=>{
 const g=new Gesture();g.update(hand(),0,900,'auto');g.update(hand(-.02),40,900,'auto');
 assert.deepEqual(g.update(hand(.1),700,900,'auto'),{x:0,y:0});
 assert.ok(g.update(hand(.12),740,900,'auto').y<0);
 g.update(null,780,900,'auto');assert.deepEqual(g.update(hand(-.2),820,900,'auto'),{x:0,y:0});
 assert.ok(g.update(hand(-.22),860,900,'auto').y>0);
});
