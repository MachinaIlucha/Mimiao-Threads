import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
let csrf='';
export function setCsrf(value:string){csrf=value;}
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const form=body instanceof FormData;const response=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:{...(form?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-CSRF-Token':csrf})},body:body===undefined?undefined:form?body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(result.message||'Ошибка запроса');return result;
}
export function useData<T=any>(path:string){return useQuery<T>({queryKey:[path],queryFn:()=>api<T>(path),refetchInterval:30000});}
export function useAction(){const client=useQueryClient();return useMutation({mutationFn:({path,method='POST',body}:{path:string;method?:string;body?:unknown})=>api(path,method,body),onSuccess:()=>client.invalidateQueries()});}
export function time(value:string|null,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}){return value?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',...options}).format(new Date(value)):'—';}
export function dayKey(value:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export const number=(n:number|null|undefined)=>n===null||n===undefined?'—':new Intl.NumberFormat('ru-RU').format(n);
