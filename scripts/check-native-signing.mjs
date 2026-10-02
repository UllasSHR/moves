import {spawnSync,execFileSync} from 'node:child_process';
import {mkdtempSync,cpSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const source='/private/tmp/moves-native/Moves.app';
function signature(app){
 const result=spawnSync('codesign',['-d','--verbose=4','-r-',app],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const details=result.stdout+'\n'+result.stderr;
 const requirement=details.match(/^designated => .+$/m)?.[0];
 const hash=details.match(/^CDHash=(.+)$/m)?.[1];
 const identity=requirement?.match(/certificate leaf = H"([a-f0-9]{40})"/i)?.[1];
 assert.ok(requirement&&hash&&identity,'Expected a certificate-pinned signature');
 return {requirement,hash,identity};
}
const first=signature(source);
execFileSync('codesign',['--verify','--deep','--strict',source]);
const updated=mkdtempSync('/private/tmp/moves-signing-check-')+'/Moves.app';
cpSync(source,updated,{recursive:true});
// A changed sealed resource models an app update without using the camera or
// changing the installed app. Its code hash must differ, but its identity must not.
writeFileSync(updated+'/Contents/Resources/signing-update-probe.txt','Different app bytes for signature-persistence verification.\n');
execFileSync('codesign',['--force','--sign',first.identity,'--requirements','='+first.requirement,updated],{stdio:'pipe'});
execFileSync('codesign',['--verify','--deep','--strict',updated]);
const second=signature(updated);
assert.notEqual(first.hash,second.hash);
assert.equal(first.requirement,second.requirement);
execFileSync('codesign',['--verify','-R','='+first.requirement.replace(/^designated => /,''),updated]);
console.log('PASS stable signing: changed app bytes have a different code hash but the same certificate-pinned identity, and both signatures verify. No permissions changed or input posted.');
