import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
let tracker:HandLandmarker;
self.onmessage=async({data})=>{
 try {
  if(data.type==='init'){
   tracker=await HandLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(data.base+'wasm'),{baseOptions:{modelAssetPath:data.base+'models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:0.5,minHandPresenceConfidence:0.5,minTrackingConfidence:0.5});
   self.postMessage({type:'ready'});
  } else {
   try {const result=tracker.detectForVideo(data.frame,data.time);const one=result.landmarks.length===1;const handedness=result.handedness[0]?.[0];self.postMessage({type:'result',points:one?result.landmarks[0]:null,identity:one&&handedness?.score>=0.9?handedness.categoryName:null,handCount:result.landmarks.length,time:data.time});}
   finally{data.frame.close();}
  }
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
