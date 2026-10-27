// Serialize entire operations; failure releases the next waiter without resending.
let tail:Promise<void>=Promise.resolve();
export async function serializeBrowser<T>(task:()=>Promise<T>):Promise<T>{
 const previous=tail;
 let release!:()=>void;
 tail=new Promise<void>(resolve=>{release=resolve;});
 await previous;
 try{return await task();}finally{release();}
}
