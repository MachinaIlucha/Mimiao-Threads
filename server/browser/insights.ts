import { withBrowser, assertOwnAccount } from './session.js';
import { postUrl } from './evidence.js';

// Only exact integers from the post's Summary. Rates and abbreviated counters
// are not counts, and sidebar post counters never belong to this observation.
export function parsePostInsights(text:string) {
 const sections=text.split(/(?:^|\n)Summary\n/);
 const summary=sections.length===2?sections[1].split('\nViews over time')[0]:'';
 const read=(label:string)=>{
  const value=summary.match(new RegExp(`(?:^|\\n)${label}\\n([^\\n]+)(?:\\n|$)`))?.[1].trim();
  if(!value||! /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(value))return null;
  const count=Number(value.replace(/[, \u00a0\u202f]/g,''));
  return Number.isSafeInteger(count)?count:null;
 };
 return {views:read('Views'),profile_visits:read('Profile visits'),follows:read('Follows')};
}

export async function readPostInsights(permalink:string) {
 const canonical=postUrl(permalink);if(!canonical)throw new Error('Invalid own post URL');
 const shortcode=canonical.split('/').at(-1)!;
 return withBrowser(async page=>{
  await page.goto(`https://www.threads.com/insights/post/${shortcode}?without_navigation=false`,{waitUntil:'domcontentloaded'});
  await assertOwnAccount(page);
  const actual=await page.getByRole('link',{name:'View post',exact:true}).getAttribute('href');
  if(!actual||postUrl(actual)!==canonical)throw new Error('Insights post identity mismatch');
  await page.getByText('Summary',{exact:true}).waitFor({timeout:20000});
  const deadline=Date.now()+15000;
  do {
   const result=parsePostInsights(await page.evaluate(()=>document.body.innerText));
   if(result.views!==null)return result;
   await new Promise(resolve=>setTimeout(resolve,1000));
  } while(Date.now()<deadline);
  throw new Error('Exact insights counters unavailable');
 });
}

export function browserCheckpoint(age:number):string|null {
 if(age>=1&&age<=2)return '1h';
 if(age>=24&&age<=28)return '24h';
 if(age>=72&&age<=76)return '72h';
 if(age>=168&&age<=172)return '7d';
 return null;
}
