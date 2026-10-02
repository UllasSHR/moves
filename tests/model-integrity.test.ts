import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyModel} from '../scripts/model-integrity.mjs';

test('substituted and truncated hand models are rejected before packaging',()=>{
 assert.throws(()=>verifyModel(Buffer.from('substituted model')),/checksum mismatch/);
 assert.throws(()=>verifyModel(Buffer.alloc(0)),/checksum mismatch/);
});
