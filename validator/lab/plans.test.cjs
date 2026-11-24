'use strict';
const T=require('node:test'),assert=require('node:assert/strict');
const E=require('../ethers.cjs'),kit=require('../program.cjs');
const R=require('../chain-info.json')[0].rollup;
const P=new E.Interface(require('../artifacts/ParentProgram.json').abi);
const c='0x0000000000000000000000000000000000000099',p='0x0000000000000000000000000000000000000098',owner='0x0000000000000000000000000000000000000011',op='0x0000000000000000000000000000000000000022';
const assertion=E.id('assertion'),hash=E.id('tx'),h=E.id('block'),root=E.id('root'),send=E.id('send');
const pendingTag={number:'0x20',timestamp:'0x80'};
const Y={pa:p,ca:c,P:async n=>({seats:{owner,operator:op,until:999n},reviewer:owner,childMin:1n})[n]};
const blockLog=E.concat(Array.from({length:25},(_,i)=>i===13?h:i===14?root:E.ZeroHash));
function credit(opts={}){
 const r={status:'0x1',from:op,to:R.rollup,transactionHash:hash,blockNumber:'0x10',blockHash:h,logs:[{address:R.rollup,topics:[kit.assertionTopic,assertion]}],...opts.r};
 return {p:pendingTag,c:pendingTag,parent:async(method)=>({eth_getTransactionReceipt:r,eth_getBlockByNumber:{hash:h,timestamp:'0x64'},eth_call:'0x'})[method],rp:async name=>name==='getAssertion'?[0,0,0,true,opts.status??2n,E.ZeroHash]:16n};
}
T.test('Reviewer intent preserves receipt attribution, timestamp and finalized height',async()=>{
 const plan=await kit.creditPlan(credit(),Y,1,hash);assert.equal(plan.transaction.from,owner);assert.equal(plan.transaction.chainId,4663);const args=P.decodeFunctionData('credit',plan.transaction.data);assert.deepEqual([...args],[1n,assertion,hash,100n,16n]);
});
T.test('Wrong sender, pending assertion, deep reorg and unfinalized receipt rejected',async()=>{
 for(const opts of [{r:{from:owner}},{status:1n},{r:{blockHash:root}},{r:{blockNumber:'0x21'}}])await assert.rejects(()=>kit.creditPlan(credit(opts),Y,1,hash));
});
const iface=new E.Interface(['function roots(bytes32) view returns(bytes32)','function isSpent(uint256) view returns(bool)','function allowedOutboxes(address) view returns(bool)','function constructOutboxProof(uint64,uint64) view returns(bytes32,bytes32,bytes32[])','function executeTransaction(bytes32[],uint256,address,address,uint256,uint256,uint256,uint256,bytes)']);
function relay(opts={}){
 const msg=P.encodeFunctionData('acceptChild',[1,owner,2,999]);
 const l=kit.arb.encodeEventLog(kit.arb.getEvent('L2ToL1Tx'),[opts.caller||c,p,BigInt(send),1,5,12,100,0,msg]);
 const params={...l,address:'0x0000000000000000000000000000000000000064'};
 function call(data){
   const parsed=iface.parseTransaction({data});
   if(parsed.name==='executeTransaction')return '0x';
   const values={allowedOutboxes:[true],isSpent:[!!opts.spent],roots:[root],constructOutboxProof:[opts.bad?E.ZeroHash:send,root,[h]]};
   return iface.encodeFunctionResult(parsed.name,values[parsed.name]);
 }
 return {p:pendingTag,c:pendingTag,rp:async name=>name==='latestConfirmed'?assertion:16n,
  child:async(name,ps)=>name==='eth_getTransactionReceipt'?{status:'0x1',logs:[params]}:name==='eth_getBlockByHash'?{hash:h,sendRoot:root,sendCount:opts.count??2}:call(ps[0].data),
  parent:async(name,ps)=>name==='eth_getLogs'?[{data:blockLog}]:call(ps[0].data)};
}
T.test('Proof planner preserves arbitrary message calldata and simulates zero-value outbox execution',async()=>{
 const result=await kit.relayPlan(relay(),Y,hash,op);const a=iface.decodeFunctionData('executeTransaction',result.transaction.data);
 assert.equal(a[8],P.encodeFunctionData('acceptChild',[1,owner,2,999]));assert.equal(a[2],c);assert.equal(a[1],1n);assert.equal(a[7],0n);
});
T.test('Proof replay, missing confirmed root, wrong origin, and corrupted leaf',async()=>{
 assert.equal((await kit.relayPlan(relay({spent:true}),Y,hash,op)).state,'ALREADY_DELIVERED');
 assert.equal((await kit.relayPlan(relay({count:1}),Y,hash,op)).state,'WAITING_FOR_CONFIRMED_ROOT');
 await assert.rejects(()=>kit.relayPlan(relay({caller:op}),Y,hash,op));await assert.rejects(()=>kit.relayPlan(relay({bad:true}),Y,hash,op));
});
T.test('Two-chain deployments have separate nonces and no native value',async()=>{
 const n=async()=> '0x14',m=async()=> '0x02';
 const plan=await kit.deployPlan({child:m,parent:n},[op,owner,'50','0.01','1209600','604800','1']);
 assert.equal(plan.steps[0].chainId,4663);assert.equal(plan.steps[1].nonce,'0x2');assert.equal(plan.steps[0].value,'0x0');
 assert.equal(plan.expectedChildVault,E.getCreateAddress({from:op,nonce:2}));
});
T.test('Watchtower uses the published deployment, no posting and no operator wallet',()=>{
 const cfg=require('../watchtower.json');
 assert.equal(cfg.chain.id,46630022);assert.equal(cfg.node.staker.strategy,'Watchtower');assert.equal(cfg.node.staker.enable,true);assert.equal(cfg.node['block-validator'].enable,true);assert.equal(cfg.node.sequencer,false);assert.equal(cfg.node['batch-poster'].enable,false);assert(!cfg.node.staker['parent-chain-wallet']);assert.equal(cfg.node.bold['auto-deposit'],false);assert.equal(R['deployed-at'],121350260);
});
T.test('Join planning observes the child lock window boundaries',async()=>{
 const y={pa:p,ca:c,P:async n=>({current:1n,seats:{owner,operator:op,until:2000n,readyAt:0n},childMin:20n})[n],C:async n=>n==='locks'?{until:0n}:1000n};
 async function at(t){return kit.joinPlan({p:{number:'0x1',timestamp:'0x400'},c:{number:'0x2',timestamp:E.toQuantity(t)},child:async()=>'0x'},y,owner,op)}
 assert.equal((await at(999)).state,'WAITING_FOR_CHILD_TIMESTAMP');assert.equal((await at(1000)).state,'UNSIGNED_SIMULATED');
 assert.equal((await at(1999)).state,'UNSIGNED_SIMULATED');assert.equal((await at(2000)).state,'CHILD_LOCK_WINDOW_EXPIRED');
});
