// Execute server.js with mocked Express, routes, dotenv and Redis. No sockets/DBs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
function startup(env={}){
 let resolveRedis,rejectRedis;const calls=[],exits=[];
 const ready=new Promise((resolve,reject)=>{resolveRedis=resolve;rejectRedis=reject;});
 const app={set:()=>{},use:()=>{},listen:(...args)=>{calls.push(args);args.at(-1)();}};
 const express=()=>app;express.json=()=>()=>{};
 const c={require:n=>n==='express'?express:n==='cors'?()=>()=>{}:n==='fs'?{readdirSync:()=>[]}:n==='dotenv'?{config:()=>{}}:n==='./config/redis'?{connectRedis:()=>ready}:n==='morgan'?()=>()=>{}:{},process:{env,exit:x=>exits.push(x)},console:{log:()=>{},error:()=>{}}};
 vm.runInNewContext(source,c);
 return {calls,exits,resolveRedis,rejectRedis};
}
test('default development listener waits for Redis and binds once to IPv4 wildcard',async()=>{
 const x=startup();assert.equal(x.calls.length,0);x.resolveRedis();await new Promise(r=>setImmediate(r));assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],8000);assert.equal(x.calls[0][1],'0.0.0.0');
});
test('explicit production HOST/PORT binds a single listener to loopback',async()=>{
 const x=startup({NODE_ENV:'production',HOST:'127.0.0.1',PORT:'8001'});x.resolveRedis();await new Promise(r=>setImmediate(r));assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],'8001');assert.equal(x.calls[0][1],'127.0.0.1');
});
test('Redis startup failure exits without opening an HTTP listener',async()=>{
 const x=startup();x.rejectRedis(new Error('mock'));await new Promise(r=>setImmediate(r));assert.equal(x.calls.length,0);assert.deepEqual(x.exits,[1]);
});
