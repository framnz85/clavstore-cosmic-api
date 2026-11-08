// Run only with an explicit disposable Unix socket. No .env or models imported.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const socket=process.env.REGISTRATION_TEST_REDIS_SOCKET;
if(!/^\/tmp\/clavstore-ip-limit-test\.[\w]+\/redis\.sock$/.test(socket||'')) throw Error('Explicit isolated test Redis socket required');
const redis=require('redis').createClient({socket:{path:socket,connectTimeout:2000,reconnectStrategy:false}});
redis.on('error',()=>{});
const source=fs.readFileSync(require('node:path').join(__dirname,'../controllers/estore.js'),'utf8');
const ctx={require,Buffer,URL,AbortSignal,setTimeout,clearTimeout,process:{env:{}},exports:{}};
vm.runInNewContext(source.slice(0,source.indexOf('const ObjectId'))+'exports.guard=storeRegistration;',ctx);
const g=ctx.exports.guard;
const env={TURNSTILE_SECRET_KEY:'mock-only',ESTORE_REG_IP_HOURLY_LIMIT:'3',ESTORE_REG_IP_DAILY_LIMIT:'5',ESTORE_REG_EMAIL_DAILY_LIMIT:'100'};
let serial=0;
const request=(ip='192.0.2.1')=>({socket:{remoteAddress:ip},connection:{remoteAddress:ip},headers:{},get:()=>crypto.randomUUID()});
const email=()=>`test${serial++}@example.test`;
const valid=async()=>({ok:true,json:async()=>({success:true,challenge_ts:new Date().toISOString()})});
const protect=(req,client=redis,e=env,verify=valid)=>g.protect(req,{email:email()},client,e,verify);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const ipKeys=ip=>[`estore-reg:{registration}:ip-hour:${hash(ip)}`,`estore-reg:{registration}:ip-day:${hash(ip)}`];
before(async()=>{await redis.connect();});
after(async()=>{await redis.quit();});
test('requests 1-3 allowed; request 4 returns 429 and Retry-After; another IP is separate',async()=>{
 const ip='192.0.2.1';
 for(let i=0;i<3;i++)await protect(request(ip));
 const error=await protect(request(ip)).then(()=>assert.fail('fourth admitted'),e=>e);
 assert.equal(error.status,429);assert(error.retryAfter>0);
 const response={status(n){this.code=n;return this},set(k,v){this[k]=v;return this},json(v){return v}};
 g.respond(response,error);assert.equal(response.code,429);assert(Number(response['Retry-After'])>0);
 await protect(request('192.0.2.2'));
});
test('daily request 6 is rejected after hourly attempts age out',async()=>{
 const ip='192.0.2.3';for(let i=0;i<3;i++)await protect(request(ip));
 const [seconds]=await redis.sendCommand(['TIME']);
 // Simulate an elapsed hour, while preserving the real daily-window set.
 for(const member of await redis.zRange(ipKeys(ip)[0],0,-1))await redis.zAdd(ipKeys(ip)[0],{score:Number(seconds)*1000-3600001,value:member});
 await protect(request(ip));await protect(request(ip));
 await assert.rejects(protect(request(ip)),e=>e.status===429&&e.retryAfter>80000);
});
test('concurrent requests cannot bypass the hourly limit',async()=>{
 const results=await Promise.allSettled(Array.from({length:15},()=>protect(request('192.0.2.4'))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,3);
 assert(results.filter(x=>x.status==='rejected').every(x=>x.reason.status===429));
 assert.equal(await redis.zCard(ipKeys('192.0.2.4')[0]),3); // bounded memory
});
test('rolling hour retains recent attempts after older attempts expire',async()=>{
 const ip='192.0.2.5',key=ipKeys(ip)[0];const [seconds]=await redis.sendCommand(['TIME']);const now=Number(seconds)*1000;
 await redis.zAdd(key,[{score:now-3600001,value:'expired-first'},{score:now-1800000,value:'recent-second'},{score:now-1000,value:'recent-third'}]);
 await protect(request(ip)); // two recent attempts plus this request
 await assert.rejects(protect(request(ip)),e=>e.status===429&&e.retryAfter>3500);
 assert.equal(await redis.zScore(key,'expired-first'),null);
});
test('invalid CAPTCHA counts once per eligible request; internal retry does not count twice',async()=>{
 const ip='192.0.2.6',r=request(ip);r.get=()=>'';
 await assert.rejects(protect(r),e=>e.code==='CAPTCHA_REQUIRED');
 await assert.rejects(protect(r),e=>e.code==='CAPTCHA_REQUIRED');
 assert.equal(await redis.zCard(ipKeys(ip)[0]),1);
 for(let i=0;i<2;i++)await assert.rejects(protect(request(ip),redis,env,async()=>({ok:true,json:async()=>({success:false})})),e=>e.code==='CAPTCHA_INVALID');
 await assert.rejects(protect(request(ip)),e=>e.status===429);
});
test('Redis outage and stalled command fail closed',async()=>{
 await assert.rejects(protect(request('192.0.2.7'),{isReady:false}),e=>e.status===503);
 await assert.rejects(protect(request('192.0.2.7'),{isReady:true,eval:()=>new Promise(()=>{})},{...env,ESTORE_REG_REDIS_TIMEOUT_MS:'10'}),e=>e.status===503);
});
test('legacy fixed counters migrate conservatively with no duplicate key family',async()=>{
 const ip='192.0.2.8',key=ipKeys(ip)[0];await redis.set(key,'3',{EX:3600});
 await assert.rejects(protect(request(ip)),e=>e.status===429);
 assert.equal(await redis.type(key),'zset');assert((await redis.ttl(key))>3500);
});
test('forwarded IP ignored unless the connecting proxy is explicitly trusted',async()=>{
 const r=request('192.0.2.9');r.headers['x-forwarded-for']='203.0.113.1';await protect(r);
 assert.equal(await redis.zCard(ipKeys('192.0.2.9')[0]),1);
 const trusted=request('127.0.0.1');trusted.headers['x-forwarded-for']='203.0.113.2';
 await protect(trusted,redis,{...env,ESTORE_REG_TRUSTED_PROXIES:'127.0.0.1/32'});
 assert.equal(await redis.zCard(ipKeys('203.0.113.2')[0]),1);
});
test('all three endpoints use the one existing limiter before saving',()=>{
 for(const name of ['createEstore','addNewEstore','copyingEstore']){
  const a=source.indexOf(`exports.${name} =`),b=source.indexOf('\nexports.',a+1),part=source.slice(a,b);
  assert(part.includes('storeRegistration.protect('));assert(part.indexOf('storeRegistration.protect(')<part.indexOf('await estore.save()'));
 }
});
test('equivalent IPv6 spellings share a quota and Siteverify receives an unbracketed address',async()=>{
 const seen=[];
 const verify=async(_,options)=>{seen.push(JSON.parse(options.body).remoteip);return valid();};
 await protect(request('2001:db8:0:0:0:0:0:1'),redis,env,verify);
 await protect(request('2001:db8::1'),redis,env,verify);
 assert.deepEqual(seen,['2001:db8::1','2001:db8::1']);
 assert.equal(await redis.zCard(ipKeys('2001:db8::1')[0]),2);
});
