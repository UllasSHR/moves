import {execFileSync} from 'node:child_process';
import {mkdirSync,rmSync,cpSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {verifyModel} from './model-integrity.mjs';
if(process.platform!=='darwin')throw new Error('The native companion must be built on macOS. Use npm run dev for the browser lab.');
// Never silently fall back to an ad-hoc signature: its cdhash identity changes
// on updates and invalidates saved macOS Camera/control permissions.
const adhoc=process.argv.includes('--adhoc');
let identity='-';
if(!adhoc){
 const selector=process.env.MOVES_SIGN_ID||'Moves Local Development';
 const listed=execFileSync('security',['find-identity','-v','-p','codesigning'],{encoding:'utf8'});
 const identities=[...listed.matchAll(/\b([A-Fa-f0-9]{40})\s+"([^"]+)"/g)];
 const matches=identities.filter(m=>m[1].toLowerCase()===selector.toLowerCase()||m[2]===selector);
 if(matches.length!==1){console.error('A stable signing identity is required. Create "Moves Local Development" in Keychain Access (Self Signed Root, Code Signing), or set MOVES_SIGN_ID to an existing certificate SHA-1. No app was rebuilt. See native/SIGNING.md.');process.exit(1);}
 identity=matches[0][1];
}
if(process.argv.includes('--check-signing')){console.log(adhoc?'Ad-hoc mode: permissions may reset on every update.':'Stable certificate identity available: '+identity);process.exit(0);}
// File-provider metadata in synced Documents can invalidate bundle signing.
// Stage the generated app on the local temporary volume; source stays in this repo.
const app='/private/tmp/moves-native/Moves.app',contents=app+'/Contents';
if(!existsSync('public/models/hand_landmarker.task'))throw new Error('Run npm run assets first.');
verifyModel(readFileSync('public/models/hand_landmarker.task'));
execFileSync('npm',['run','build'],{stdio:'inherit'});
mkdirSync(contents+'/MacOS',{recursive:true});mkdirSync(contents+'/Resources',{recursive:true});
rmSync(contents+'/Resources/Web',{recursive:true,force:true});cpSync('dist',contents+'/Resources/Web',{recursive:true});
cpSync('THIRD_PARTY_NOTICES.md',contents+'/Resources/THIRD_PARTY_NOTICES.md');
cpSync('licenses/Apache-2.0.txt',contents+'/Resources/Apache-2.0.txt');
cpSync('LICENSE',contents+'/Resources/LICENSE.txt');
writeFileSync(contents+'/Info.plist',`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Moves</string><key>CFBundleIdentifier</key><string>com.ullas.moves.local</string><key>CFBundleName</key><string>Moves</string><key>CFBundleDisplayName</key><string>Moves</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>0.2.0</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/>
<key>NSCameraUsageDescription</key><string>Moves tracks your four fingertips on this Mac to scroll the pane under your pointer. No video is recorded or uploaded.</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>`);
const target=`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos14.0`;
execFileSync('xcrun',['swiftc','-target',target,'-swift-version','5','-O','-module-cache-path',resolve('native/.build/module-cache'),'native/main.swift','native/LoopbackServer.swift','native/ScrollOutput.swift','native/SelfTests.swift','-o',contents+'/MacOS/Moves'],{stdio:'inherit'});
// Clear inherited Finder metadata only in this generated application bundle.
execFileSync('xattr',['-cr',app],{stdio:'inherit'});
const requirements=adhoc?[]:['--requirements',`=designated => identifier "com.ullas.moves.local" and certificate leaf = H"${identity}"`];
execFileSync('codesign',['--force','--sign',identity,'--identifier','com.ullas.moves.local',...requirements,app],{stdio:'inherit'});
execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
execFileSync(contents+'/MacOS/Moves',['--self-test'],{stdio:'inherit'});
console.log('Built '+app+'\nOpen it with: open '+app);
