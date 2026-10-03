const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const sources = ['backend/routes/boardingHouses.js', 'frontend/src/views/owner/OwnerAccreditation.vue', 'frontend/src/views/owner/Documents.vue'].map(file => ({ file, source: fs.readFileSync(path.join(root, file), 'utf8') }));
for (const {file, source} of sources) {
  const matches = [...source.matchAll(/const isValidPermitDate = \(value\) => \{[\s\S]*?\n\s*\};/g)];
  for (const [index, match] of matches.entries()) test(file + ' strict calendar validation ' + index, () => {
    const valid = vm.runInNewContext(match[0] + '\nisValidPermitDate');
    for (const date of ['2026-12-30','2024-02-29','2000-02-29','1000-01-01','9999-12-31','2020-01-01']) assert.equal(valid(date),true,date);
    for (const date of ['20226-12-30','0026-12-30','2026-02-29','1900-02-29','2026-04-31','2026-00-10','2026-13-10','2026-12-00','30/12/2026','2026-1-01','2026-12-30T00:00:00Z',[],{},null,123]) assert.equal(valid(date),false,String(date));
  });
}
const source = sources[0].source;
const validation = vm.runInNewContext(fs.readFileSync(path.join(root,'backend/config/inputValidation.js'),'utf8').replaceAll('export ','') + '\n({validateBody})', {TextEncoder});
function handler(route) {
 const start = source.indexOf('async (req, res) => {',source.indexOf("router.post('" + route + "'"));
 const end = source.indexOf('\n});',start);
 const calls = {database:0,uploads:0};
 const fn = vm.runInNewContext('(' + source.slice(start,end+2) + ')',{
   pool:{query(){calls.database++;throw Error('Unexpected database access');},getConnection(){calls.database++;throw Error('Unexpected connection');}},
   saveUploadedFile(){calls.uploads++;throw Error('Unexpected upload');}, console:{error(){},log(){}}
 });
 return {fn: (req,res) => validation.validateBody(route === '/accreditation' ? 'property' : 'document')(req,res,()=>fn(req,res)),calls};
}
for (const key of ['business_form','cedula','dti','barangay','building','zoning','sanitary','fire']) {
 for (const date of ['20226-12-30','0026-12-30','2026-02-30']) test('Application rejects ' + key + ' ' + date + ' before side effects',async()=>{
  const {fn,calls}=handler('/accreditation');
  const res={status(code){this.code=code;return this;},json(body){this.body=body;}};
  await fn({user:{id:1,role:'owner'},body:{house_name:'Test',location:'Nabua',price:'1000',contact_number:'09123456789',latitude:'13.4',longitude:'123.3', ['expiry_permit_'+key]:date},files:{}},res);
  assert.equal(res.code,400);assert.match(res.body.message,/expiry date is invalid/);assert.deepEqual(calls,{database:0,uploads:0});
 });
}
for (const custom of ['true','false']) test('Document update rejects invalid date before side effects, custom=' + custom,async()=>{
 const {fn,calls}=handler('/documents/update/:id');
 const res={status(code){this.code=code;return this;},json(body){this.body=body;}};
 await fn({user:{id:1,role:'owner'},body:{expiry_date:'20226-12-30',is_custom:custom},params:{id:'1'}},res);
 assert.equal(res.code,400);assert.deepEqual(calls,{database:0,uploads:0});
});
