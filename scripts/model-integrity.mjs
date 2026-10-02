import {createHash} from 'node:crypto';

export const MODEL_URL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// SHA-256 of the version-1 artifact, checked against the upstream download.
export const MODEL_SHA256='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
export function verifyModel(bytes){
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==MODEL_SHA256)throw new Error('Hand model checksum mismatch. Refusing this artifact; run npm run assets to fetch the pinned version.');
}
