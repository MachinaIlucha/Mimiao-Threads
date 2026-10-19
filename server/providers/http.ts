import { ProviderError } from '../errors.js';
export async function requestJson<T=any>(url:string,init:RequestInit={},operation='provider',readOnly=true,timeoutMs=25_000):Promise<T> {
 for(let attempt=0;attempt<(readOnly?3:1);attempt++) {
  try {
   const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
   if(readOnly && (response.status===429||response.status>=500) && attempt<2){await response.body?.cancel();await new Promise(r=>setTimeout(r,Math.min(3000,500*2**attempt)));continue;}
   if(!response.ok){let code;try{code=String((await response.json() as any)?.error?.code||'');}catch{}throw new ProviderError(response.status,operation,!readOnly&&response.status>=500,code);}
   const data=await response.json();
   if(data?.error)throw new ProviderError(response.status,operation,!readOnly,String(data.error.code||''));
   return data as T;
  }catch(error){if(error instanceof ProviderError)throw error; if(readOnly&&attempt<2)continue;throw new ProviderError(0,operation,!readOnly);}
 }
 throw new ProviderError(0,operation);
}
