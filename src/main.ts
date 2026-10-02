import './style.css';
import {Gesture,MAX_SAMPLE_GAP_MS,TIPS,type Point,type Direction} from './gesture';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const video=$<HTMLVideoElement>('video'),canvas=$<HTMLCanvasElement>('overlay'),ctx=canvas.getContext('2d')!;
const start=$<HTMLButtonElement>('start'),stop=$<HTMLButtonElement>('stop'),pause=$<HTMLButtonElement>('pause');
const target=$<HTMLSelectElement>('target'),sensitivity=$<HTMLInputElement>('sensitivity'),direction=$<HTMLSelectElement>('direction');
const gesture=new Gesture();
let stream:MediaStream|null=null,worker:Worker|null=null,paused=false,session=0,raf=0,busy=false,ready=false,lastVideo=-1,lastResult=0,lastSent=0;
let loadTimer:ReturnType<typeof setTimeout>|undefined;
const show=(state:string,message:string)=>{$('state').textContent=state;$('message').textContent=message;$('dot').classList.toggle('active',state.startsWith('Scrolling'));};
let statsStart=0,statsFrames=0,lastMove='—';
function clearTracking(){gesture.reset();statsStart=0;statsFrames=0;lastMove='—';$('diagnostics').textContent='Tracking inactive';ctx.clearRect(0,0,canvas.width,canvas.height);}
function setPaused(value:boolean){paused=value;clearTracking();pause.textContent=paused?'Resume':'Pause';show(paused?'Paused':'Idle',paused?'Scrolling paused. Resume when you’re ready.':'Move your fingertips in the selected direction. Sideways movement works when content is wider than the pane. Vertical return motion is ignored.');}
function shutdown(message='Camera stopped. No frames are being processed.'){
 session++;clearTimeout(loadTimer);cancelAnimationFrame(raf);worker?.terminate();worker=null;
 stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
 ready=false;busy=false;paused=false;lastVideo=-1;clearTracking();
 start.disabled=false;stop.disabled=true;pause.disabled=true;pause.textContent='Pause';$('camera-label').textContent='CAMERA OFF';show('Idle',message);
}
function draw(points:Point[]|null){
 ctx.clearRect(0,0,320,240);if(!points)return;
 ctx.strokeStyle='#bfee95';ctx.lineWidth=2;ctx.fillStyle='#d5ffb4';
 for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]]){
 ctx.beginPath();chain.forEach((i,n)=>{const p=points[i];if(!p||!Number.isFinite(p.x+p.y))return;n?ctx.lineTo(p.x*320,p.y*240):ctx.moveTo(p.x*320,p.y*240);});ctx.stroke();
 }
 points.forEach((p,i)=>{if(!p||!Number.isFinite(p.x+p.y))return;ctx.fillStyle=(TIPS as readonly number[]).includes(i)?'#ffe08b':'#91b37c';ctx.beginPath();ctx.arc(p.x*320,p.y*240,(TIPS as readonly number[]).includes(i)?6:2,0,Math.PI*2);ctx.fill();});
}
function receive(points:Point[]|null,time:number,identity:string|null=null,handCount=points?1:0){
 if(paused||document.hidden)return;
 draw(points);const pane=$(target.value),capability=refreshCapability();
 // Mirror x to match the selfie preview; y is unchanged.
 const input=points?.map(p=>({...p,x:1-p.x}))??null;
 const delta=gesture.update(input,time,Number(sensitivity.value),direction.value as Direction,identity,capability.x,capability.y);
 const beforeX=pane.scrollLeft,beforeY=pane.scrollTop;
 pane.scrollLeft+=delta.x;pane.scrollTop+=delta.y;
 const moved=[pane.scrollTop!==beforeY?(delta.y>0?'up':'down'):'',pane.scrollLeft!==beforeX?(delta.x>0?'left':'right'):''].filter(Boolean);
 if(delta.x||delta.y)lastMove=moved.length?'Content '+moved.join(' + '):'At pane boundary';
 const messages:Record<string,string>={Idle:'Move your fingertips.',Ready:'Ready. Move your fingertips; no pose or pinch needed.',Resetting:'Vertical return ignored. Start the next stroke from here.', 'Hand not visible':handCount>1?'More than one hand detected. Keep one hand in view.':'No hand detected. Bring your hand into view.', 'Tracking unavailable':'Not enough usable fingertip positions. Waiting for tracking.'};
 show(gesture.state,gesture.state.startsWith('Scrolling')?`Content follows ${gesture.state.slice(10)}. Hold still to stop.`:messages[gesture.state]??'Ready.');
}

async function tick(now:number){
 if(!stream)return;
 raf=requestAnimationFrame(tick);
 if(paused||!ready||document.hidden)return;
 if(lastResult&&now-lastResult>MAX_SAMPLE_GAP_MS){clearTracking();show('Tracking unavailable','Camera or tracking delayed. Waiting for fresh frames.');lastResult=0;}
 if(busy||video.readyState<2||video.currentTime===lastVideo)return;
 busy=true;lastVideo=video.currentTime;lastSent=now;const token=session;
 try{
  const frame=await createImageBitmap(video);
  if(token!==session||paused||!worker){frame.close();if(token===session)busy=false;return;}
  worker.postMessage({type:'frame',frame,time:now},[frame]);
 }catch(error){if(token===session){shutdown();show('Error',`Camera frame failed: ${String(error)}`);}}
}
start.onclick=async()=>{
 if(stream||start.disabled)return;
 const token=++session;start.disabled=true;stop.disabled=false;show('Loading','Loading the local tracking model…');
 try{
  worker=new Worker('/tracker.js');
  const currentWorker=worker;
  await new Promise<void>((resolve,reject)=>{
   loadTimer=setTimeout(()=>reject(new Error('Model load timed out. Check local assets and reload.')),30000);
   currentWorker.onerror=e=>reject(new Error(e.message));
   currentWorker.onmessage=({data})=>{if(data.type==='ready')resolve();else if(data.type==='error')reject(new Error(data.message));};
   currentWorker.postMessage({type:'init',base:new URL('/',location.href).href});
  });
  clearTimeout(loadTimer);if(token!==session)return;
  show('Ready','Allow camera access in your browser to begin.');
  const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30},facingMode:'user'}});
  if(token!==session){media.getTracks().forEach(t=>t.stop());return;}
  stream=media;video.srcObject=media;await video.play();if(token!==session)return;
  media.getVideoTracks().forEach(t=>{t.onended=()=>shutdown('Camera disconnected. Start again to reconnect.');t.onmute=()=>{lastReset=performance.now();clearTracking();show('Tracking unavailable','Camera stream interrupted.');};});
  currentWorker.onerror=e=>{if(token===session){shutdown();show('Error',`Tracking worker failed: ${e.message}`);}};
  currentWorker.onmessage=({data})=>{
   if(token!==session)return;busy=false;
   if(data.type==='error'){shutdown();show('Error',`Tracking failed: ${data.message}`);return;}
   if(data.type==='result'){
    const now=performance.now();
    if(data.time<lastReset)return;
    if(now-data.time>MAX_SAMPLE_GAP_MS){clearTracking();show('Tracking unavailable','Tracking delayed. Waiting for fresh frames.');return;}
    lastResult=now;receive(data.points,data.time,data.identity,data.handCount);
    if(!paused&&!document.hidden){if(!statsStart)statsStart=now;statsFrames++;if(now-statsStart>=1000){$('diagnostics').textContent=`${Math.round(statsFrames*1000/(now-statsStart))} updates/s · ${Math.round(now-data.time)} ms processing · ${lastMove}`;statsStart=now;statsFrames=0;}}
   }
  };
  ready=true;pause.disabled=false;$('camera-label').textContent='LIVE · LOCAL';lastResult=performance.now();
  setPaused(document.hidden||!document.hasFocus());raf=requestAnimationFrame(tick);
 }catch(error){if(token!==session)return;shutdown();const name=error instanceof Error?error.name:'';show('Error',name==='NotAllowedError'?'Camera access denied. Allow it in browser site settings, then try again.':name==='NotFoundError'?'No camera found. Connect or enable a camera and try again.':`Could not start: ${String(error)}`);}
};
let lastReset=0;
function resetInput(){lastReset=performance.now();clearTracking();if(stream&&!paused)show('Idle','Settings changed. Start your next fingertip stroke.');}
stop.onclick=()=>shutdown();
pause.onclick=()=>{lastReset=performance.now();setPaused(!paused);};
function refreshCapability(){
 const pane=$(target.value),x=pane.scrollWidth>pane.clientWidth+1,y=pane.scrollHeight>pane.clientHeight+1;
 gesture.setCapabilities(x,y);
 $('axis-status').textContent=x?(y?'Vertical + horizontal':'Horizontal'):(y?'Vertical':'Content fits');
 $('movement-help').textContent=x?'Left/right and vertical strokes work together, including diagonals. Sideways movement during a vertical return still moves content.':'Use vertical strokes; opposite vertical movement resets. Hold still to stop.';
 return {x,y};
}
const resizeObserver=new ResizeObserver(refreshCapability);
for(const id of ['chat','diff'])resizeObserver.observe($(id));
const contentObserver=new MutationObserver(refreshCapability);
for(const id of ['chat','diff'])contentObserver.observe($(id),{childList:true,subtree:true,characterData:true});
document.fonts.ready.then(refreshCapability);
window.addEventListener('resize',refreshCapability);
target.onchange=()=>{resetInput();refreshCapability();for(const id of ['chat','diff'])$(id+'-pane').classList.toggle('selected',target.value===id);};
direction.onchange=resetInput;
sensitivity.oninput=()=>{$('gain').textContent=sensitivity.value;resetInput();};
function safetyPause(){if(stream){lastReset=performance.now();setPaused(true);}}
window.addEventListener('blur',safetyPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)safetyPause();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')safetyPause();});
window.addEventListener('pagehide',()=>shutdown());
const topics=[
 ['A seat is a promise','Two people see the same remaining seat. Both click Reserve. The UI can be perfectly up to date and still be wrong a moment later. Correctness belongs at the point where the reservation is committed.','What must still be true when the second request arrives?'],
 ['Put the invariant in the write','Read the available count, then update it only if capacity remains. Keep the check and write inside one transaction. A stale client may ask, but the database decides.','At most one confirmed reservation owns the last seat.'],
 ['Make a retry safe','A disconnected client cannot tell whether its first request committed. A stable request ID lets a retry return the original result instead of creating a second reservation.','The same intent should have the same result, even after reconnecting.'],
 ['Test the collision','Start both requests before either finishes. Wait for both outcomes, then inspect committed rows. One success and one rejection is useful evidence only when the stored state agrees.','Check the outcome and the invariant independently.'],
 ['Release is a state transition','Cancellation should move a confirmed reservation to cancelled exactly once. Repeated cancellation must not increase capacity twice. Think about the allowed transition before writing the handler.','What is true before, what action happens, and what is true after?'],
 ['Reconnect to the truth','A subscription is a view, not the owner of the data. After a gap, reload committed state and reconcile pending requests by their identifiers.','A missing response does not prove a failed commit.']
];
$('chat').innerHTML=topics.map(([title,body,question],i)=>`<section class="message user"><div class="avatar">YOU · QUESTION ${i+1}</div><p>${question}</p></section><section class="message"><div class="avatar">ASSISTANT</div><h2>${title}</h2><p>${body}</p><p>Try a small experiment. Predict the result, run the competing actions, then inspect the final state. Keep the proof close to the behavior it protects.</p><p><code>before → action → after</code></p></section>`).join('');
const lines:string[]=[];
for(const [i,[title]] of topics.entries())lines.push(`@@ ${i*24+1} · ${title} @@`,`  // Example diff for reading practice`,`- const available = await readCapacity(eventId);`,`- if (available > 0) await insertReservation(input);`,`+ return database.transaction(async (tx) => {`,`+   const previous = await tx.requests.find(requestId);`,`+   if (previous) return previous.result;`,`+`,`+   const seat = await tx.events.claimSeat({`,`+     id: eventId,`,`+     remaining: { greaterThan: 0 },`,`+   });`,`+   if (!seat) return { status: 'full' };`,`+`,`+   const reservation = await tx.reservations.create({`,`+     eventId,`,`+     userId,`,`+     requestId,`,`+     status: 'confirmed',`,`+   });`,`+   await tx.requests.remember(requestId, reservation);`,`+   return reservation;`,`+ });`,`  // Assert committed state after concurrent requests; verify request identity, remaining capacity, and cancellation transitions independently.`,`  `);
$('diff').innerHTML=lines.map((line,i)=>`<div class="line ${line.startsWith('+')?'add':line.startsWith('-')?'remove':line.startsWith('@@')?'hunk':''}"><span class="number">${i+1}</span>${line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</div>`).join('');
for(const id of ['chat','diff'])$(id).addEventListener('scroll',()=>{const el=$(id);$(id+'-position').textContent=Math.round(el.scrollTop/(el.scrollHeight-el.clientHeight)*100)+'%';});

refreshCapability();
