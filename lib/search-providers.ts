import { config } from "./server-config";
import { marketplaceForUrl, marketplaces, searchQuery } from "./marketplaces";
import { unknownEvidence, type Lane, type Listing } from "./finder-types";
const observed=()=>new Date().toISOString();
const amount=(v:unknown):number|null=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const text=(v:unknown)=>typeof v==="string"?v:"";
type EbayItem={itemId?:string;title?:string;itemWebUrl?:string;image?:{imageUrl?:string};price?:{value?:string;currency?:string};condition?:string;shippingOptions?:{shippingCost?:{value?:string;currency?:string}}[];seller?:{username?:string;feedbackScore?:number;feedbackPercentage?:string};buyingOptions?:string[]};
export async function searchEbay(query:string):Promise<Listing[]>{
 const token=config("EBAY_ACCESS_TOKEN");if(!token)return [];
 const url=new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");url.searchParams.set("q",query);url.searchParams.set("limit","30");url.searchParams.set("filter","buyingOptions:{FIXED_PRICE}");
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,"X-EBAY-C-MARKETPLACE-ID":"EBAY_US"},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(response.status===401?"eBay token expired or invalid. Refresh it in source setup.":`eBay search unavailable (${response.status}).`);
 const body=await response.json() as {itemSummaries?:EbayItem[]};
 return (body.itemSummaries??[]).filter(i=>i.itemWebUrl&&marketplaceForUrl(i.itemWebUrl)).map(i=>({id:`ebay-${i.itemId}`,title:text(i.title),platform:"eBay",url:i.itemWebUrl!,image:i.image?.imageUrl?.startsWith("https://")?i.image.imageUrl:undefined,price:amount(i.price?.value),currency:text(i.price?.currency)||"USD",shipping:null,size:"Not specified",condition:text(i.condition)||"Not specified",lane:"legit",seller:text(i.seller?.username)||"Seller unknown",evidence:{...unknownEvidence,reviews:amount(i.seller?.feedbackScore),positiveRate:amount(i.seller?.feedbackPercentage)===null?null:Number(i.seller?.feedbackPercentage)/100},availability:"available",match:"related",source:"live",checkedAt:observed(),notes:"Live eBay keyword result. Check the photos, model, size and condition; matching is not verified. Feedback score is not a sales count. Destination shipping and taxes must be checked on eBay.",authenticity:"Resale search candidate · authenticity unverified"}));
}
export async function searchBrave(query:string,lane:Lane):Promise<Listing[]>{
 const key=config("BRAVE_SEARCH_API_KEY");if(!key)return [];
 const domains=marketplaces.filter(m=>m.lanes.includes(lane)).map(m=>`site:${m.domain}`).join(" OR ");
 const url=new URL("https://api.search.brave.com/res/v1/web/search");url.searchParams.set("q",`${searchQuery(query,lane)} (${domains})`);url.searchParams.set("count","20");
 const response=await fetch(url,{headers:{Accept:"application/json","X-Subscription-Token":key},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(`Web search unavailable (${response.status}). Check your Brave Search key and quota.`);
 const body=await response.json() as {web?:{results?:{title?:string;url?:string;description?:string;thumbnail?:{src?:string}}[]}};
 return (body.web?.results??[]).flatMap((item,index)=>{const market=marketplaceForUrl(item.url??"");if(!market||!market.lanes.includes(lane))return [];const description=text(item.description).replace(/<[^>]*>/g,"");return [{id:`web-${index}-${encodeURIComponent(item.url!)}`,title:text(item.title).replace(/<[^>]*>/g,""),platform:market.name,url:item.url!,price:null,currency:"USD",shipping:null,size:"Not specified",condition:"Not specified",lane,seller:"Seller evidence unavailable",evidence:{...unknownEvidence},availability:"unknown" as const,match:"related" as const,source:"live" as const,checkedAt:observed(),notes:`Indexed search result; it may be a listing, category page, or stale result. Price, stock, seller metrics and authenticity require verification. ${description.slice(0,650)}`,authenticity:lane==="reps"?"Replica search candidate · classification unverified":"Resale search candidate · authenticity unverified"}];});
}
