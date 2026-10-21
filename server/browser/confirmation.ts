import {matchingPublication,type BrowserPostEvidence} from './evidence.js';

// Threads hydrates new cards after the pinned card becomes visible. Only repeat
// DOM reads here; never repeat the final Post click or relax matching evidence.
export async function waitForPublication(
 read:()=>Promise<BrowserPostEvidence[]>,text:string,baseline:string[],sentAt:string,mediaCount:number,
):Promise<BrowserPostEvidence|null>{
 const deadline=Date.now()+20000;
 while(true){
  const match=matchingPublication(await read(),text,baseline,sentAt,mediaCount);
  if(match)return match;
  const remaining=deadline-Date.now();
  if(remaining<=0)return null;
  await new Promise(resolve=>setTimeout(resolve,Math.min(1000,remaining)));
 }
}
