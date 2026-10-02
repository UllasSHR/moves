import './native.css';
import {Gesture,TIPS,MAX_SAMPLE_GAP_MS,type Point,type Direction} from './gesture';

declare global {
 interface Window {
  webkit?:{messageHandlers:{moves:{postMessage:(value:unknown)=>void}}};
  movesNative:{start:(id:number)=>Promise<void>;stop:()=>void;configure:(horizontal:boolean,sensitivity:number)=>void;warmup:()=>Promise<void>};
 }
}
const $=(id:string)=>document.getElementById(id)!;
const video=$('video') as HTMLVideoElement,canvas=$('overlay') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
const gesture=new Gesture();
let worker:Worker|null=null,stream:MediaStream|null=null,session=0,nativeSession=0,timer=0;
let busy=false,lastFrame=-1,lastResult=0,horizontal=false,sensitivity=900,frames=0,statsTime=0;
const direction:Direction='auto';
let cancelLoading:(()=>void)|null=null;
const post=(body:Record<string,unknown>)=>window.webkit?.messageHandlers.moves.postMessage({...body,session:nativeSession});
$('toggle').addEventListener('click',()=>post({type:'toggle'}));
const previewToggle=$('preview-toggle');
previewToggle.addEventListener('click',()=>{
 const open=$('diagnostics').hidden;
 $('diagnostics').hidden=!open;
 previewToggle.setAttribute('aria-expanded',String(open));
 previewToggle.textContent=open?'Hide details':'Details';
});
// Layout changes never stop tracking. Fit errors as well as normal status.
new ResizeObserver(()=>post({type:'size',height:Math.ceil(document.querySelector('main')!.getBoundingClientRect().height+20)})).observe(document.querySelector('main')!);
function status(state:string,message:string){$('state').textContent=state;$('message').textContent=message;$('message').hidden=state==='Off'||state==='Ready';post({type:'status',state,message});}
function draw(points:Point[]|null){ctx.clearRect(0,0,320,240);$('camera-preview').dataset.tracking=points?'hand':stream?'waiting':'off';if(!points)return;ctx.fillStyle='#ffe08b';ctx.strokeStyle='#171c17';ctx.lineWidth=3;for(const i of TIPS){const p=points[i];if(!p||!Number.isFinite(p.x+p.y))continue;ctx.beginPath();ctx.arc(p.x*320,p.y*240,8,0,Math.PI*2);ctx.fill();ctx.stroke();}}
function stop(){session++;clearTimeout(timer);cancelLoading?.();cancelLoading=null;worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;busy=false;lastFrame=-1;lastResult=0;gesture.reset();draw(null);$('camera').textContent='CAMERA OFF';status('Off','Control–Option–M turns gesture scrolling on or off.');}
async function makeWorker(token:number){
 const current=new Worker('/tracker.js');worker=current;
 await new Promise<void>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Tracking model took too long to load.')),30000);
  const finish=(error?:Error)=>{clearTimeout(timeout);cancelLoading=null;error?reject(error):resolve();};
  cancelLoading=()=>finish(new Error('Stopped'));
  current.onerror=e=>finish(new Error(e.message));
  current.onmessage=({data})=>{if(data.type==='ready')finish();else if(data.type==='error')finish(new Error(data.message));};
  current.postMessage({type:'init',base:new URL('/',location.href).href});
 });
 if(token!==session)throw new Error('Stopped');return current;
}
async function warmup(){const token=++session;status('Checking','Checking the bundled hand tracker…');try{const current=await makeWorker(token);const frame=await createImageBitmap(canvas);if(token!==session){frame.close();return;}await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Tracker check timed out.')),15000);cancelLoading=()=>{clearTimeout(timeout);reject(new Error('Stopped'));};current.onmessage=({data})=>{clearTimeout(timeout);cancelLoading=null;data.type==='result'?resolve():reject(new Error(data.message??'Invalid tracker result'));};current.onerror=e=>{clearTimeout(timeout);cancelLoading=null;reject(new Error(e.message));};current.postMessage({type:'frame',frame,time:performance.now()},[frame]);});if(token===session){worker?.terminate();worker=null;status('Off','Tracker ready. Control–Option–M toggles scrolling.');post({type:'warmup',ok:true});}}catch(error){if(token===session){stop();status('Error',String(error));post({type:'warmup',ok:false,message:String(error)});}}}
async function start(id:number){
 stop();nativeSession=id;const token=++session;status('Starting','Loading your local hand tracker…');
 try{
  const current=await makeWorker(token);if(token!==session)return;
  const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},facingMode:'user'}});
  if(token!==session){media.getTracks().forEach(t=>t.stop());return;}
  stream=media;video.srcObject=media;await video.play();if(token!==session)return;
  media.getVideoTracks().forEach(t=>{t.onended=()=>{if(token===session)fail('Camera disconnected.');};t.onmute=()=>{if(token===session){gesture.reset();post({type:'reset'});status('Waiting','Camera interrupted. Waiting for fresh frames.');}};});
  current.onerror=e=>{if(token===session)fail(`Tracking failed: ${e.message}`);};
  current.onmessage=({data})=>{
   if(token!==session)return;busy=false;if(data.type==='error'){fail(String(data.message));return;}
   if(data.type!=='result')return;
   const now=performance.now();if(now-data.time>MAX_SAMPLE_GAP_MS){gesture.reset();post({type:'reset'});return;}
   lastResult=now;draw(data.points);
   const points:Point[]|null=data.points?.map((p:Point)=>({...p,x:1-p.x}))??null;
   const delta=gesture.update(points,data.time,sensitivity,direction,data.identity,horizontal,true);
   post({type:'motion',x:delta.x,y:delta.y,tracked:!!points,time:data.time});
   $('state').textContent=points?(gesture.state==='Choose direction'?'Choose direction':gesture.state==='Resetting'?'Repositioning':delta.x||delta.y?'Scrolling':'Ready'):'Waiting';
   $('message').hidden=true;
   $('message').textContent=points?(gesture.state==='Choose direction'?'Move up or down to choose. Repeat circles; returns are ignored.':gesture.state==='Resetting'?'Return ignored. Pause ½ second to change direction.':'Repeat your stroke. Pause ½ second, then move the other way to switch.'):'Bring one hand into view. Bent and uneven fingers are okay.';
   if(!statsTime)statsTime=now;frames++;if(now-statsTime>1000){$('timing').textContent=`${Math.round(frames*1000/(now-statsTime))} updates/s · ${Math.round(now-data.time)} ms tracking`;post({type:'health',tracked:!!points});frames=0;statsTime=now;}
  };
  $('camera').textContent='LIVE · LOCAL';lastResult=performance.now();frames=0;statsTime=0;status('Ready','Put your pointer over the pane you want to read.');post({type:'started'});tick(token);
 }catch(error){if(token===session)fail(error instanceof Error?error.message:String(error));}
}
function fail(message:string){stop();status('Error',message);post({type:'error',message});}
async function tick(token:number){
 if(token!==session||!stream)return;timer=window.setTimeout(()=>tick(token),16);
 const now=performance.now();if(lastResult&&now-lastResult>MAX_SAMPLE_GAP_MS){gesture.reset();post({type:'reset'});lastResult=0;}
 if(busy||video.readyState<2||video.currentTime===lastFrame)return;
 busy=true;lastFrame=video.currentTime;
 try{const frame=await createImageBitmap(video);if(token!==session||!worker){frame.close();return;}worker.postMessage({type:'frame',frame,time:now},[frame]);}catch(error){if(token===session)fail(String(error));}
}
function configure(x:boolean,gain:number){horizontal=x;sensitivity=gain;gesture.reset();post({type:'reset'});$('axes').textContent=`Automatic strokes · pause ½ second to switch. Sideways is ${x?'on':'off'}.`;}
window.movesNative={start,stop,configure,warmup};
window.addEventListener('pagehide',stop);
post({type:'loaded'});
