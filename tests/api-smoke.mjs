import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:5173';
const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const status=await (await fetch(base+'/api/status')).json();assert.deepEqual(Object.keys(status).sort(),['ebay','search','vision']);
let response=await post('/api/search',{query:'Rick Owens bias bootcut jeans',lane:'legit'});assert.equal(response.status,200);let body=await response.json();assert.ok(Array.isArray(body.listings));if(!status.ebay&&!status.search){assert.equal(body.mode,'reference');assert.equal(body.listings.length,4);}
response=await post('/api/search',{query:'x',lane:'legit'});assert.equal(response.status,400);
response=await post('/api/search',{query:'Rick Owens',lane:'invalid'});assert.equal(response.status,400);
response=await post('/api/search',{query:'unrelated sneaker test',lane:'legit'});body=await response.json();if(!status.ebay&&!status.search)assert.equal(body.listings.length,0);
response=await post('/api/search',{query:'Rick Owens bias bootcut jeans',lane:'reps'});body=await response.json();if(!status.search){assert.equal(body.mode,'links');assert.equal(body.listings.length,0);}
response=await post('/api/search',{query:'Rick Owens',lane:'legit'},{Origin:'https://untrusted.example'});assert.ok([400,403].includes(response.status));
response=await post('/api/identify',{image:'https://untrusted.example/image.png'});assert.equal(response.status,400);
if(!status.vision){response=await post('/api/identify',{image:'data:image/png;base64,aGVsbG8='});assert.equal(response.status,503);}
console.log('API smoke checks passed: sources, fallback, empty results, invalid input, origin boundary, image setup state.');
