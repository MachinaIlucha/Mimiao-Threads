export type PostCategory='teaching'|'life'|'founder'|'product';
export const POST_CATEGORIES:readonly PostCategory[]=['teaching','life','founder','product'];
/** Daily format mix: teaching=conflict story, life=one-line dilemma, founder=opinion, product=product note. */
export function formatTargets(count:number):Record<PostCategory,number> {
 const product=count>=4?1:0,founder=count>=3?1:0,life=Math.floor(count/4);
 return {teaching:Math.max(0,count-product-founder-life),life,founder,product};
}
export function remainingFormats(count:number,approved:readonly {category:string}[]):string {
 const targets=formatTargets(count);
 return POST_CATEGORIES.map(c=>`${c}=${Math.max(0,targets[c]-approved.filter(p=>p.category===c).length)}`).join(', ');
}
/** Stories take the latest slots of the day. Stable within each group. */
export function orderForSlots<T extends {category:string}>(posts:readonly T[]):T[] {
 return [...posts.filter(p=>p.category!=='teaching'),...posts.filter(p=>p.category==='teaching')];
}
