export type Point = { x: number; y: number; z: number };
export type Axis = 'vertical' | 'horizontal';
export type Direction = 'up' | 'down' | 'both' | 'auto';
export type State = 'Idle' | 'Ready' | 'Choose direction' | 'Scrolling up' | 'Scrolling down' | 'Scrolling left' | 'Scrolling right' | 'Resetting' | 'Hand not visible' | 'Tracking unavailable';
export const DIRECTION_PAUSE_MS = 500;
export const MAX_SAMPLE_GAP_MS = 500;
export const TIPS = [8, 12, 16, 20] as const;
const median = (values: number[]) => {
  const sorted = [...values].sort((a,b)=>a-b), middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};
const valid = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

class AxisMotion {
  state: State = 'Idle';
  private anchor: (Point | undefined)[] | null = null;
  private lastTime: number | null = null;
  private anchorTime = 0;
  private identity: string | null = null;
  private direction: Direction | null = null;
  private sensitivity = 900;
  private axis: Axis = 'vertical';
  private autoDirection: 'up' | 'down' | null = null;
  private stillAnchor: (Point | undefined)[] | null = null;
  private stillSince = 0;

  reset(state: State = 'Idle') {
    this.state=state; this.anchor=null; this.lastTime=null; this.identity=null; this.direction=null;
    this.autoDirection=null;this.stillAnchor=null;
  }

  update(points: Point[] | null, time: number, sensitivity=900, direction: Direction='up', identity: string | null=null, axis: Axis='vertical'): number {
    if (!points) { this.reset('Hand not visible'); return 0; }
    const tips=TIPS.map(i=>valid(points[i])?{...points[i]}:undefined);
    if(tips.filter(valid).length<3 || !Number.isFinite(time)) { this.reset('Tracking unavailable'); return 0; }
    const elapsed=this.lastTime===null?0:time-this.lastTime;
    const changed=identity!==null&&this.identity!==null&&identity!==this.identity;
    const rebase=!this.anchor||elapsed<=0||elapsed>MAX_SAMPLE_GAP_MS||changed||direction!==this.direction||sensitivity!==this.sensitivity||axis!==this.axis;
    this.lastTime=time; if(identity!==null)this.identity=identity;
    this.direction=direction;this.sensitivity=sensitivity;this.axis=axis;
    const commit=()=>{this.anchor=tips;this.anchorTime=time;};
    if(rebase){commit();this.autoDirection=null;this.stillAnchor=tips;this.stillSince=time;this.state=direction==='auto'?'Choose direction':'Ready';return 0;}
    const pairs=tips.flatMap((p,i)=>valid(p)&&valid(this.anchor![i])?[{x:p.x-this.anchor![i]!.x,y:p.y-this.anchor![i]!.y}]:[]);
    if(pairs.length<3){commit();this.state='Ready';return 0;}
    // Median displacement, not fingertip height: unequal curls are allowed and
    // a single wandering/missing tip cannot control the page.
    const dx=median(pairs.map(p=>p.x)),dy=median(pairs.map(p=>p.y));
    if(Math.hypot(dx,dy)>Math.max(.3,(time-this.anchorTime)*.003)){commit();this.autoDirection=null;this.stillAnchor=tips;this.stillSince=time;this.state='Ready';return 0;}
    if(axis==='horizontal'){
      // Horizontal and vertical controllers retain independent deadbands.
      if(Math.abs(dx)<.003){this.state='Ready';return 0;}
      commit();
      this.state=dx<0?'Scrolling left':'Scrolling right';
      return Math.max(-40,Math.min(40,-dx*sensitivity));
    }
    let scrollDirection=direction;
    if(direction==='auto'){
      // Compare with a fixed quiet-period reference, not the previous frame:
      // small per-frame movement must not count as a half-second pause.
      const quietPairs=tips.flatMap((p,i)=>valid(p)&&valid(this.stillAnchor?.[i])?[{x:p.x-this.stillAnchor![i]!.x,y:p.y-this.stillAnchor![i]!.y}]:[]);
      const moved=quietPairs.length<3||Math.hypot(median(quietPairs.map(p=>p.x)),median(quietPairs.map(p=>p.y)))>.004;
      if(moved){this.stillAnchor=tips;this.stillSince=time;}
      else if(this.autoDirection&&time-this.stillSince>=DIRECTION_PAUSE_MS){
        this.autoDirection=null;commit();this.state='Choose direction';return 0;
      }
      if(!this.autoDirection){
        if(Math.abs(dy)<.006){this.state='Choose direction';return 0;}
        this.autoDirection=dy<0?'up':'down';
        this.stillAnchor=tips;this.stillSince=time;
      }
      scrollDirection=this.autoDirection;
    }
    // Keep the reference through tiny movement so slow strokes accumulate.
    // No temporal averaging, queued displacement, or trailing inertia.
    if(Math.abs(dy)<.003){this.state='Ready';return 0;}
    commit(); // BOTH directions rebase: recovery never waits for an old peak.
    if((scrollDirection==='up'&&dy>0)||(scrollDirection==='down'&&dy<0)){
      this.state='Resetting';return 0;
    }
    this.state=dy<0?'Scrolling up':'Scrolling down';
    return Math.max(-40,Math.min(40,-dy*sensitivity));
  }
}

export class Gesture {
  private x = new AxisMotion();
  private y = new AxisMotion();
  private horizontal = false;
  private vertical = true;
  state: string = 'Idle';
  reset(state: State = 'Idle') { this.x.reset(state); this.y.reset(state); this.state=state; }
  setCapabilities(horizontal:boolean,vertical:boolean){
    if(horizontal!==this.horizontal){this.x.reset();this.horizontal=horizontal;}
    if(vertical!==this.vertical){this.y.reset();this.vertical=vertical;}
  }
  update(points: Point[] | null,time: number,sensitivity=900,direction: Direction='up',identity: string|null=null,horizontal=false,vertical=true): {x:number;y:number} {
    this.setCapabilities(horizontal,vertical);
    const x=horizontal?this.x.update(points,time,sensitivity,direction,identity,'horizontal'):0;
    const y=vertical?this.y.update(points,time,sensitivity,direction,identity,'vertical'):0;
    const directions=[y?(y>0?'up':'down'):'',x?(x>0?'left':'right'):''].filter(Boolean);
    this.state=directions.length?'Scrolling '+directions.join(' + '):vertical?this.y.state:horizontal?this.x.state:points?'Ready':'Hand not visible';
    return {x,y};
  }
}
