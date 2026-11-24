'use strict';
const {spawn}=require('node:child_process');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const E=require('../ethers.cjs');
const kit=require('../program.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;const servers=[];
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
async function chain(id){
 const port=await freePort();
 const ps=spawn(process.env.ANVIL||'anvil',['--host','127.0.0.1','--port',String(port),'--chain-id',String(id),'--timestamp','1800000000','--silent'],{stdio:'ignore'});
 servers.push(ps);let failure;ps.on('error',e=>{failure=e});const url='http://127.0.0.1:'+port;
 const rpc=kit.client(url);
 for(let i=0;i<100;i++){
   if(failure)throw Error('Install Foundry anvil or set ANVIL to its executable');
   try{if(BigInt(await rpc('eth_chainId'))===BigInt(id))break;}catch{}
   await pause(35);
 }
 assert.equal(BigInt(await rpc('eth_chainId')),BigInt(id));
 const provider=new E.JsonRpcProvider(url,id,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1,polling:true,pollingInterval:40});provider.pollingInterval=40;
 const signers=await Promise.all([0,1,2,3,4].map(n=>provider.getSigner(n)));return {provider,rpc,signers};
}
const artifact=n=>require(['ParentProgram','ChildStake'].includes(n)?'../artifacts/'+n+'.json':'./'+n+'.json');
async function deploy(n,signer,...args){const a=artifact(n);const c=await new E.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c}
const mine=async tx=>(await tx).wait();
async function test(name,f){
 try{await f()}catch(error){throw Error(name+' — '+(error.shortMessage||error.message))}
 console.log('PASS '+name);passed++;
}
async function clock(chain){return BigInt((await chain.rpc('eth_getBlockByNumber',['latest',false])).timestamp)}
async function advanceTo(chain,timestamp){
 if(await clock(chain)<timestamp){
   await chain.rpc('evm_setNextBlockTimestamp',[Number(timestamp)]);
   await chain.rpc('evm_mine');
 }
}
const blocked=f=>assert.rejects(f,e=>e?.code==='CALL_EXCEPTION');
async function run(){
 const p=await chain(4663),c=await chain(46630022);
 const [gov,owner,operator,reviewer,other]=p.signers;
 const [,,childOperator]=c.signers;const childOwner=c.signers[1];
 const t=await deploy('Asset',gov),b=await deploy('BridgeMock',gov),r=await deploy('RollupMock',gov);
 const program=await deploy('ParentProgram',gov,t.target,b.target,r.target,gov.address,reviewer.address,100,20,100000,3600,7);
 const vault=await deploy('ChildStake',c.signers[0],program.target,20,100000);
 await c.rpc('anvil_setCode',['0x'+'64'.padStart(40,'0'),artifact('Sys').runtime]);
 await test('Both chain IDs, compiled runtimes and reciprocal vaults',async()=>{
   assert(kit.sameRuntime(await p.provider.getCode(program.target),artifact('ParentProgram')));
   assert(kit.sameRuntime(await c.provider.getCode(vault.target),artifact('ChildStake')));
   await mine(program.bindChild(vault.target));assert.equal(await vault.parent(),program.target);assert.equal(await program.childVault(),vault.target);
   await blocked(()=>program.bindChild.staticCall(other.address));
 });
 await mine(t.mint(owner.address,100));await mine(t.connect(owner).approve(program.target,100));
 await test('Agent consent and parent stake minimum enforced',async()=>{
   await blocked(()=>program.connect(owner).open.staticCall(operator.address,100));
   await mine(program.connect(operator).setSponsor(owner.address));
   await blocked(()=>program.connect(owner).open.staticCall(operator.address,99));
   // Place enrollment in a known epoch and deliberately start the child behind.
   const baseline=(await clock(p))>(await clock(c))?await clock(p):await clock(c);
   await advanceTo(p,(baseline/3600n+1n)*3600n+120n);
   await mine(program.connect(owner).open(operator.address,100));await blocked(()=>program.connect(owner).open.staticCall(operator.address,100));
 });
 const seat=await program.seats(1);let payload;
 await test('A lagging child rejects the lock until its clock reaches the enrollment window',async()=>{
   const earliest=seat.until-await vault.maxTerm();
   assert((await clock(c))<earliest);
   await assert.rejects(()=>vault.connect(childOwner).lock.staticCall(1,seat.until,{value:20}),e=>e.code==='CALL_EXCEPTION'&&e.reason==='terms');
   await advanceTo(c,earliest+1n);
   await vault.connect(childOwner).lock.staticCall(1,seat.until,{value:20});
 });
 await test('Child lock emits the precise cross-chain call and rejects duplicates',async()=>{
   await blocked(()=>vault.connect(childOwner).lock.staticCall(1,seat.until,{value:19}));
   const receipt=await mine(vault.connect(childOwner).lock(1,seat.until,{value:20}));const logs=receipt.logs;
   const m=new E.Interface(artifact('Sys').abi).parseLog(logs[0]).args;
   payload=program.interface.encodeFunctionData('acceptChild',[1,owner.address,20,seat.until]);assert.equal(m.data,payload);assert.equal(m.sender,vault.target);assert.equal(m.dest,program.target);
   await blocked(()=>vault.connect(childOwner).lock.staticCall(1,seat.until,{value:20}));assert.equal(await program.eligible(1),false);
 });
 await test('Outbox origin, expiry, seat owner, and proof replay checked',async()=>{
   await blocked(()=>program.connect(owner).acceptChild.staticCall(1,owner.address,20,seat.until));
   await blocked(()=>b.deliver.staticCall(program.target,other.address,payload));
   for(const args of [[1,other.address,20,seat.until],[1,owner.address,20,seat.until+1n],[1,owner.address,19,seat.until]])
       await blocked(()=>b.deliver.staticCall(program.target,vault.target,program.interface.encodeFunctionData('acceptChild',args)));
   await mine(b.deliver(program.target,vault.target,payload));assert.equal(await program.eligible(1),true);
   await blocked(()=>b.deliver.staticCall(program.target,vault.target,payload));
 });
 await test('Both principals locked throughout the enrolled term',async()=>{
    await blocked(()=>program.connect(owner).exit.staticCall(1));await blocked(()=>vault.connect(childOwner).exit.staticCall(1));assert.equal((await program.seats(1)).amount,100n);
 });
 const a=E.id('confirmed assertion'),txHash=E.id('work receipt'),otherA=E.id('second');const ready=(await program.seats(1)).readyAt;
 const work=ready+20n;await p.rpc('evm_setNextBlockTimestamp',[Number(work)]);await p.rpc('evm_mine');
 const epoch=work/3600n;
 await test('Missing budget and pending assertions earn zero',async()=>{
   await blocked(()=>program.connect(reviewer).credit.staticCall(1,a,txHash,work,9));
   await mine(t.mint(gov.address,21));await mine(t.approve(program.target,21));await mine(program.fund(epoch,21));
   await mine(r.set(a,9,1));await blocked(()=>program.connect(reviewer).credit.staticCall(1,a,txHash,work,9));
 });
 await mine(r.set(a,9,2));await mine(r.set(otherA,12,2));
 await test('Only reviewed confirmed work within the lock window earns credit',async()=>{
    await blocked(()=>program.connect(operator).credit.staticCall(1,a,txHash,work,9));
    await blocked(()=>program.connect(reviewer).credit.staticCall(1,a,txHash,ready,9));
    await blocked(()=>program.connect(reviewer).credit.staticCall(1,a,txHash,work,10));
    await mine(program.connect(reviewer).credit(1,a,txHash,work,9));assert.equal(await program.rewards(owner.address),7n);
 });
 await test('Duplicate assertion and second payment in one operator epoch rejected',async()=>{
    await blocked(()=>program.connect(reviewer).credit.staticCall(1,a,txHash,work,9));await blocked(()=>program.connect(reviewer).credit.staticCall(1,otherA,E.id('2'),work,12));
 });
 await test('Sponsor receives earned reward separately from both principals',async()=>{
    await blocked(()=>program.connect(operator).claim.staticCall());await mine(program.connect(owner).claim());assert.equal(await t.balanceOf(owner.address),7n);assert.equal(await t.balanceOf(program.target),114n);
    await blocked(()=>program.connect(owner).claim.staticCall());await blocked(()=>vault.connect(childOperator).exit.staticCall(1));
 });
 for(const chain of [p,c]){await chain.rpc('evm_setNextBlockTimestamp',[Number(seat.until+1n)]);await chain.rpc('evm_mine')}
 await test('Independent unlock on each chain; no operator custody',async()=>{
    assert.equal(await program.eligible(1),false);await blocked(()=>program.connect(operator).exit.staticCall(1));await mine(program.connect(owner).exit(1));assert.equal(await t.balanceOf(owner.address),107n);
    const before=await c.provider.getBalance(vault.target);await mine(vault.connect(childOwner).exit(1));assert.equal(before,20n);assert.equal(await c.provider.getBalance(vault.target),0n);
 });
 await test('Unused budget rolls forward after grace without touching rewards',async()=>{
    const when=(epoch+1n)*3600n+100001n;await p.rpc('evm_setNextBlockTimestamp',[Number(when)]);await p.rpc('evm_mine');const next=when/3600n+1n;
    await blocked(()=>program.connect(other).rollover.staticCall(epoch,next));await mine(program.rollover(epoch,next));assert.equal(await program.epochBudget(next),14n);
 });console.log(passed+' dual-chain rehearsal checks passed. Canonical bridge and rollup are simulated in the lab.');
}
run().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1}).finally(()=>{for(const s of servers)s.kill('SIGTERM')});
