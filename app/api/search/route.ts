import { readJson, connections } from "@/lib/server-config";
import { searchBrave, searchEbay } from "@/lib/search-providers";
import { matchesReference, referenceListings } from "@/lib/reference-listings";
import type { Listing, SearchResponse } from "@/lib/finder-types";
import { deduplicateListings } from "@/lib/listing-identity";
export async function POST(request:Request){
 let input;try{input=await readJson(request);}catch(error){return Response.json({error:error instanceof Error?error.message:"Invalid request"},{status:400});}
 if(typeof input?.query!=="string"||input.query.trim().length<2||input.query.length>180||!["legit","reps"].includes(input.lane))return Response.json({error:"Enter 2–180 characters and choose Legit or Reps."},{status:400});
 const {query,lane}=input;const ready=connections();
 const results=await Promise.allSettled([lane==="legit"?searchEbay(query):Promise.resolve([]),searchBrave(query,lane)]);
 const listings:Listing[]=[],errors:string[]=[];
 for(const result of results){if(result.status==="fulfilled")listings.push(...result.value);else errors.push(result.reason instanceof Error?result.reason.message:"A source could not be reached.");}
 const unique=deduplicateListings(listings);
 const hasLive=unique.length>0;const references=!hasLive&&lane==="legit"&&matchesReference(query);
 const body:SearchResponse={listings:hasLive?unique:references?referenceListings:[],mode:hasLive?"live":references?"reference":"links",errors,message:hasLive?"Connected search results · verify matching, stock and seller evidence on the source.":references?"Researched listings · Sep 12, 2026 · recheck price and availability on the source. Live discovery is not configured or returned no matches.":(!ready.search&&(!ready.ebay||lane==="reps"))?"Live discovery is not configured. Open the marketplace searches below or add a listing to compare.":"No results returned from connected sources. Try a shorter title or open a marketplace below."};
 return Response.json(body,{headers:{"Cache-Control":"no-store"}});
}
