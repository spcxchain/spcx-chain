'use strict';
// Read-only publication evidence. No signer, wallet, key, or send-transaction method.
const fs=require('node:fs'),crypto=require('node:crypto');
const {E,sameRuntime}=require('./test-support.cjs');
const D=require('./deployment.json'),A=require('./artifacts/SPCXCValidatorStaking.json');
const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getTransactionByHash']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function need(ok,message){if(!ok)throw Error(message);}
async function json(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{'Accept':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});need(r.ok,'Public evidence endpoint unavailable');return r.json();}
function client(url){return async(method,params=[])=>{need(methods.has(method),'Only fixed read methods are permitted');const d=await json(url,{jsonrpc:'2.0',id:1,method,params});need(d.id===1&&!d.error&&d.result!==undefined,'Public RPC read failed');return d.result;};}
async function verify(){
 const parent=client(D.parentRPC),child=client(D.childRPC),abi=new E.Interface(A.abi);
 const [parentID,childID,b,receipt,tx]=await Promise.all([parent('eth_chainId'),child('eth_chainId'),parent('eth_getBlockByNumber',['latest',false]),parent('eth_getTransactionReceipt',[D.deploymentTransaction]),parent('eth_getTransactionByHash',[D.deploymentTransaction])]);
 need(BigInt(parentID)===4663n&&BigInt(childID)===46630022n,'Network identity differs');
 need(b?.number&&Math.abs(Date.now()/1000-Number(BigInt(b.timestamp)))<7200,'Parent head is not fresh');
 need(receipt&&same(receipt.transactionHash,D.deploymentTransaction)&&same(receipt.contractAddress,D.contract)&&BigInt(receipt.status)===1n&&same(receipt.from,D.reviewer)&&receipt.to===null,'Deployment receipt differs');
 const payload=A.bytecode+E.AbiCoder.defaultAbiCoder().encode(['address','address','address'],[D.token,D.rollup,D.reviewer]).slice(2);
 need(tx&&same(tx.hash,D.deploymentTransaction)&&same(tx.from,D.reviewer)&&tx.to===null&&BigInt(tx.value)===0n&&tx.input.toLowerCase()===payload.toLowerCase(),'Deployment creation input differs from published source');
 const [created,code,genesis]=await Promise.all([parent('eth_getBlockByNumber',[receipt.blockNumber,false]),parent('eth_getCode',[D.contract,b.number]),child('eth_getBlockByNumber',['0x0',false])]);
 need(same(created?.hash,receipt.blockHash)&&same(genesis?.hash,D.childGenesis),'Deployment block or child genesis differs');
 need(sameRuntime(code),'Deployed runtime differs from the artifact');
 const runtimeKeccak256=E.keccak256(code);if(D.runtimeKeccak256)need(same(runtimeKeccak256,D.runtimeKeccak256),'Pinned runtime hash differs');
 const read=async(name,args=[])=>{const d=abi.decodeFunctionResult(name,await parent('eth_call',[{to:D.contract,data:abi.encodeFunctionData(name,args)},b.number]));return d.length===1?d[0]:d;};
 const values={};for(const group of [['token','rollup','reviewer'],['MINIMUM_STAKE','LOCK_SECONDS','EPOCH_SECONDS'],['totalStaked','rewardReserve']])for(const [n,v]of await Promise.all(group.map(async n=>[n,await read(n)])))values[n]=v;
 need(same(values.token,D.token)&&same(values.rollup,D.rollup)&&same(values.reviewer,D.reviewer)&&values.MINIMUM_STAKE===1000n*10n**18n&&values.LOCK_SECONDS===86400n&&values.EPOCH_SECONDS===86400n,'Staking contract terms differ');
 const [c,program,host]=await Promise.all([json('https://mainnet.spcxchain.network/staking-api/config'),json('https://mainnet.spcxchain.network/staking-api/program-status'),json('https://spcxchain.network/mainnet/api/version')]);
 need(c.state==='active'&&same(c.contract,D.contract)&&c.parentChainId===4663&&c.minimumWei===values.MINIMUM_STAKE.toString()&&c.lockSeconds===86400&&same(program.contract,D.contract),'Public staking service differs');
 need(host.chainId===46630022&&host.mode==='public','Host API identity differs');
 const stable=await parent('eth_getBlockByNumber',[b.number,false]);need(same(stable?.hash,b.hash),'Parent observation changed');
 let finalized=null;try{const f=await parent('eth_getBlockByNumber',['finalized',false]);if(f?.number)finalized=BigInt(f.number)>=BigInt(receipt.blockNumber);}catch{}
 const hash=rel=>crypto.createHash('sha256').update(fs.readFileSync(__dirname+'/'+rel)).digest('hex');
 return {schema:1,component:D.component,version:D.version,checkedAt:new Date().toISOString(),parentChainId:4663,childChainId:46630022,contract:D.contract,token:D.token,rollup:D.rollup,reviewer:D.reviewer,deploymentTransaction:D.deploymentTransaction,deploymentBlock:Number(BigInt(receipt.blockNumber)),deploymentBlockHash:receipt.blockHash,deployedAt:new Date(Number(BigInt(created.timestamp))*1000).toISOString(),deploymentReceiptFinalized:finalized,runtimeKeccak256,sourceSHA256:hash('contracts/SPCXCValidatorStaking.sol'),artifactSHA256:hash('artifacts/SPCXCValidatorStaking.json'),compilerInputSHA256:hash('compiler-input.json'),compiler:A.compiler,evmVersion:A.evmVersion,minimumSPCXC:'1000',lockSeconds:86400,epochSeconds:86400,hostBuild:host.build,observation:{parentBlock:Number(BigInt(b.number)),parentBlockHash:b.hash,totalStakedWei:values.totalStaked.toString(),rewardReserveWei:values.rewardReserve.toString(),currentRewardEpoch:program.epoch,todayBudgetWei:program.todayBudgetWei,nextBudgetWei:program.nextBudgetWei},receiptLevel:'Robinhood deployment receipt and matching runtime; no reward payout claimed'};
}
module.exports={verify};
if(require.main===module)verify().then(d=>console.log(JSON.stringify(d,null,2))).catch(()=>{console.error('STOP: Live staking identity, source, receipt or public service could not be verified. No transaction was sent.');process.exitCode=1;});
