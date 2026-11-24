'use strict';
const E = require('./ethers.cjs');
const artifact = name => require('./artifacts/' + name + '.json');
const chain = require('./chain-info.json')[0];
const R = chain.rollup;
const token = '0x904ccdcee00a4f4596b1e92604c00274b75cb244';
const genesis = '0xa33c011eec2550e73849e2a882d754e4b23a53568475511726ecc69619077a3b';
const governor = '0x044b4815cf81dbe586e91b1243b597aaf8b75dae';
const wasm = '0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39';
const outbox = '0x62fb81987f31b93291c1346bcbb82befd303d566';
const assertionTopic = E.id('AssertionCreated(bytes32,bytes32,((bytes32,bytes32,(bytes32,uint256,address,uint64,uint64)),((bytes32[2],uint64[2]),uint8,bytes32),((bytes32[2],uint64[2]),uint8,bytes32)),bytes32,uint256,bytes32,uint256,address,uint64)');
const roll = new E.Interface(['function validatorWhitelistDisabled() view returns(bool)','function stakeToken() view returns(address)','function baseStake() view returns(uint256)','function wasmModuleRoot() view returns(bytes32)','function isValidator(address) view returns(bool)','function isStaked(address) view returns(bool)','function latestConfirmed() view returns(bytes32)','function getAssertionCreationBlockForLogLookup(bytes32) view returns(uint256)','function getAssertion(bytes32) view returns(uint64,uint64,uint64,bool,uint8,bytes32)']);
const erc = new E.Interface(['function symbol() view returns(string)','function decimals() view returns(uint8)','function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)']);
const arb = new E.Interface(['event L2ToL1Tx(address caller,address indexed destination,uint256 indexed hash,uint256 indexed position,uint256 arbBlockNum,uint256 ethBlockNum,uint256 timestamp,uint256 callvalue,bytes data)']);
const out = new E.Interface(['function roots(bytes32) view returns(bytes32)','function isSpent(uint256) view returns(bool)','function executeTransaction(bytes32[],uint256,address,address,uint256,uint256,uint256,uint256,bytes)']);
const parentABI = new E.Interface(artifact('ParentProgram').abi);
const childABI = new E.Interface(artifact('ChildStake').abi);
const same = (a,b) => typeof a==='string' && typeof b==='string' && a.toLowerCase()===b.toLowerCase();
const check = (v,msg) => {if(!v) throw Error(msg)};
const number = E.toQuantity;
function client(url){
    return async (method,params=[])=>{
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(25000),redirect:'error'});
        check(res.ok,method+' HTTP '+res.status);const body=await res.json();
        check(body.id===1&&!body.error&&Object.hasOwn(body,'result'),method+' failed at provider');return body.result;
    };
}
async function read(rpc,block,to,abi,name,args=[]){
    const ret=await rpc('eth_call',[{to,data:abi.encodeFunctionData(name,args)},block]);
    const v=abi.decodeFunctionResult(name,ret);return v.length===1?v[0]:v;
}
function sameRuntime(code,a){
    if(!code||code.length!==a.runtime.length)return false;
    const actual=Buffer.from(code.slice(2),'hex');
    for(const ref of Object.values(a.immutables).flat())actual.fill(0,ref.start,ref.start+ref.length);
    return actual.toString('hex')===a.runtime.slice(2);
}
async function pinned(parent,child,tag='finalized'){
    const [p,c,pid,cid,g]=await Promise.all([parent('eth_getBlockByNumber',[tag,false]),child('eth_getBlockByNumber',['latest',false]),parent('eth_chainId'),child('eth_chainId'),child('eth_getBlockByNumber',['0x0',false])]);
    check(p && c && BigInt(pid)===4663n && BigInt(cid)===46630022n && same(g?.hash,genesis),'Chain or genesis mismatch');
    const rp=(name,args)=>read(parent,p.number,R.rollup,roll,name,args);
    const [disabled,bond,asset,root,symbol,decimals]=await Promise.all([rp('validatorWhitelistDisabled'),rp('baseStake'),rp('stakeToken'),rp('wasmModuleRoot'),read(parent,p.number,token,erc,'symbol'),read(parent,p.number,token,erc,'decimals')]);
    check(same(asset,R['stake-token']) && symbol==='SPCXC' && decimals===18n && same(root,wasm),'Token or deployed rollup changed; review the release');
    return {parent,child,p,c,rp,summary:{parentChainId:4663,childChainId:46630022,parentStateTag:tag,parentBlock:Number(BigInt(p.number)),sampledChildBlock:Number(BigInt(c.number)),genesis,spcxc:token,rollup:R.rollup,allowlistEnabled:!disabled,protocolBondToken:asset,baseBondWETH:E.formatEther(bond),wasmModuleRoot:root}};
}
async function program(x){
    const parent=E.getAddress(process.env.SPCX_PROGRAM||''), child=E.getAddress(process.env.SPCX_VAULT||'');
    const P=(name,args)=>read(x.parent,x.p.number,parent,parentABI,name,args);
    const C=(name,args)=>read(x.child,x.c.number,child,childABI,name,args);
    const [pc,cc,asset,br,rollup,bound,reverse,gov,cm,pm,ct,pt]=await Promise.all([
        x.parent('eth_getCode',[parent,x.p.number]),x.child('eth_getCode',[child,x.c.number]),P('token'),P('bridge'),P('rollup'),P('childVault'),C('parent'),P('governor'),C('minimum'),P('childMin'),C('maxTerm'),P('term')]);
    check(sameRuntime(pc,artifact('ParentProgram')) && sameRuntime(cc,artifact('ChildStake')),'Program runtime mismatch');
    check(same(asset,token)&&same(br,R.bridge)&&same(rollup,R.rollup)&&same(bound,child)&&same(reverse,parent)&&same(gov,governor)&&cm===pm&&ct>=pt,'Program binding mismatch');
    return {P,C,pa:parent,ca:child};
}
function unsigned(chainId,from,to,abi,fn,args,value=0n){return {chainId,from,to,data:abi.encodeFunctionData(fn,args),value:number(value)}}
async function simulate(rpc,block,tx){
    const {from,to,value,data}=tx;await rpc('eth_call',[{from,to,value,data},block]);
    return {state:'UNSIGNED_SIMULATED',transaction:tx};
}
function receiptOK(r){check(r&&BigInt(r.status)===1n,'Transaction missing or unsuccessful')}
async function creditPlan(x,y,id,hash){
    check(E.isHexString(hash,32),'Expected assertion transaction hash');
    const seat=await y.P('seats',[id]);
    const r=await x.parent('eth_getTransactionReceipt',[hash]);receiptOK(r);
    check(same(hash,r.transactionHash)&&same(r.from,seat.operator)&&same(r.to,R.rollup)&&BigInt(r.blockNumber)<=BigInt(x.p.number),'Not finalized direct operator work on this rollup');
    const b=await x.parent('eth_getBlockByNumber',[r.blockNumber,false]);
    check(same(b?.hash,r.blockHash),'Receipt block mismatch');
    const logs=r.logs.filter(l=>same(l.address,R.rollup)&&same(l.topics[0],assertionTopic)&&!l.removed);
    check(logs.length===1&&E.isHexString(logs[0].topics[1],32),'Expected exactly one AssertionCreated');
    const a=logs[0].topics[1];
    const [node,block,reviewer]=await Promise.all([x.rp('getAssertion',[a]),x.rp('getAssertionCreationBlockForLogLookup',[a]),y.P('reviewer')]);
    check(node[4]===2n&&block===BigInt(r.blockNumber),'Assertion still pending or different creation block');
    return simulate(x.parent,x.p.number,unsigned(4663,reviewer,y.pa,parentABI,'credit',[id,a,hash,BigInt(b.timestamp),block]));
}
async function relayPlan(x,y,hash,relayer){
    check(E.isHexString(hash,32),'Expected lock transaction hash');
    const r=await x.child('eth_getTransactionReceipt',[hash]);receiptOK(r);
    const matches=r.logs.filter(l=>same(l.address,E.getAddress('0x'+'64'.padStart(40,'0')))&&same(l.topics[0],arb.getEvent('L2ToL1Tx').topicHash));
    check(matches.length===1,'Expected one canonical message');const m=arb.parseLog(matches[0]).args;
    check(same(m.caller,y.ca)&&same(m.destination,y.pa)&&m.callvalue===0n,'Wrong message endpoints');
    const [id,owner,amount,until]=parentABI.decodeFunctionData('acceptChild',m.data);
    const seat=await y.P('seats',[id]);
    check(same(owner,seat.owner)&&seat.until===until&&amount>=await y.P('childMin'),'Wrong seat or terms');
    const call=(name,args)=>read(x.parent,x.p.number,outbox,out,name,args);
    const isOutbox=await read(x.parent,x.p.number,R.bridge,new E.Interface(['function allowedOutboxes(address) view returns(bool)']),'allowedOutboxes',[outbox]);
    check(isOutbox,'Outbox no longer authorized');
    if(await call('isSpent',[m.position]))return {state:'ALREADY_DELIVERED',id};
    if(BigInt(x.p.timestamp)>=until)return {state:'EXPIRED_UNLOCK_PRINCIPALS',id};
    const a=await x.rp('latestConfirmed');const height=number(await x.rp('getAssertionCreationBlockForLogLookup',[a]));
    const events=await x.parent('eth_getLogs',[{address:R.rollup,fromBlock:height,toBlock:height,topics:[assertionTopic,a]}]);
    if(events.length===0)return {state:'WAITING_FOR_CONFIRMED_ROOT',id};
    check(events.length===1 && E.dataLength(events[0].data)===800,'Unexpected assertion log');
    const h=E.dataSlice(events[0].data,13*32,14*32),root=E.dataSlice(events[0].data,14*32,15*32);
    if(h===E.ZeroHash||root===E.ZeroHash)return {state:'WAITING_FOR_CONFIRMED_ROOT',id};
    const b=await x.child('eth_getBlockByHash',[h,false]);
    check(b && same(b.hash,h)&&same(b.sendRoot,root)&&b.sendCount!=null,'Confirmed child block unavailable');
    if(BigInt(b.sendCount)<=m.position||await call('roots',[root])===E.ZeroHash)return {state:'WAITING_FOR_CONFIRMED_ROOT',id};
    const iface=new E.Interface(['function constructOutboxProof(uint64,uint64) view returns(bytes32,bytes32,bytes32[])']);
    const [send,proven,nodes]=await read(x.child,x.c.number,'0x'+'c8'.padStart(40,'0'),iface,'constructOutboxProof',[BigInt(b.sendCount),m.position]);
    check(same(send,E.toBeHex(m.hash,32))&&same(proven,root)&&nodes.length<=64,'Outbox proof mismatch');
    return simulate(x.parent,x.p.number,unsigned(4663,relayer,outbox,out,'executeTransaction',[Array.from(nodes),m.position,m.caller,m.destination,m.arbBlockNum,m.ethBlockNum,m.timestamp,0,m.data]));
}
async function joinPlan(x,y,owner,operator){
    const id=await y.P('current',[operator]);const old=await y.P('seats',[id]);
    if(id===0n||old.until<=BigInt(x.p.timestamp)){
        if(!same(owner,operator)&&!same(await y.P('sponsor',[operator]),owner))
            return simulate(x.parent,x.p.number,unsigned(4663,operator,y.pa,parentABI,'setSponsor',[owner]));
        const amt=await y.P('parentMin');
        if(await read(x.parent,x.p.number,token,erc,'allowance',[owner,y.pa])<amt)
            return simulate(x.parent,x.p.number,unsigned(4663,owner,token,erc,'approve',[y.pa,amt]));
        return simulate(x.parent,x.p.number,unsigned(4663,owner,y.pa,parentABI,'open',[operator,amt]));
    }
    check(same(owner,old.owner),'Operator already has another sponsor');
    if(old.readyAt!==0n)return {state:'BOTH_STAKES_VERIFIED',seat:id,operator,expiresAt:old.until,allowlisted:await x.rp('isValidator',[operator])};
    const lock=await y.C('locks',[owner,id]);
    if(lock.until!==0n){check(lock.until===old.until,'Child lock expiry differs');return {state:'WAITING_FOR_OUTBOX_DELIVERY',seat:id};}
    const childTime=BigInt(x.c.timestamp), earliest=old.until-await y.C('maxTerm');
    if(childTime<earliest)return {state:'WAITING_FOR_CHILD_TIMESTAMP',seat:id,childTime,earliestChildTime:earliest,expiresAt:old.until};
    if(childTime>=old.until)return {state:'CHILD_LOCK_WINDOW_EXPIRED',seat:id,expiresAt:old.until};
    return simulate(x.child,x.c.number,unsigned(46630022,owner,y.ca,childABI,'lock',[id,old.until],await y.P('childMin')));
}
function governanceIntent(operator,enabled){
    const admin=new E.Interface(['function setValidator(address[],bool[])']);
    const exec=new E.Interface(['function executeCall(address,bytes)']);
    const calldata=admin.encodeFunctionData('setValidator',[[operator],[enabled]]);
    return unsigned(4663,governor,R['upgrade-executor'],exec,'executeCall',[R.rollup,calldata]);
}
async function governancePlan(x,y,address,enable){
    const op=E.getAddress(address);
    const existing='0xd9a10290f1b3fbbb01333d434d13c053e057d5b7';
    check(!same(op,existing),'The original infrastructure validator is outside this community program');
    check(x.summary.allowlistEnabled,'Rollup no longer uses an allowlist');
    const id=await y.P('current',[op]);check(id>0n,'No community seat');
    const seat=await y.P('seats',[id]);
    check(seat.readyAt>0n && same(seat.operator,op),'Both locks must have been verified');
    check((await y.P('eligible',[id]))===enable,'Seat eligibility differs from requested action');
    check((await x.rp('isValidator',[op]))!==enable,'Allowlist already matches');
    return simulate(x.parent,x.p.number,governanceIntent(op,enable));
}
async function deployPlan(x,args){
    const [deployer_,reviewer_,parent_,child_,term_,epoch_,reward_]=args;
    const deployer=E.getAddress(deployer_),reviewer=E.getAddress(reviewer_);
    const a=E.parseEther(parent_),b=E.parseEther(child_),term=BigInt(term_),epoch=BigInt(epoch_),reward=E.parseEther(reward_);
    check(reviewer!==E.ZeroAddress&&deployer!==E.ZeroAddress&&[a,b,term,epoch,reward].every(n=>n>0n),'Explicit positive terms required');
    const pn=BigInt(await x.parent('eth_getTransactionCount',[deployer,'pending'])),cn=BigInt(await x.child('eth_getTransactionCount',[deployer,'pending']));
    const pa=E.getCreateAddress({from:deployer,nonce:pn}),ca=E.getCreateAddress({from:deployer,nonce:cn});
    const factories=['ParentProgram','ChildStake'].map(n=>new E.ContractFactory(artifact(n).abi,artifact(n).bytecode));
    const p=await factories[0].getDeployTransaction(token,R.bridge,R.rollup,governor,reviewer,a,b,term,epoch,reward);
    const c=await factories[1].getDeployTransaction(pa,b,term);
    return {state:'UNSIGNED_DEPLOYMENT_PLAN',expectedParentProgram:pa,expectedChildVault:ca,
        steps:[{chainId:4663,from:deployer,nonce:number(pn),data:p.data,value:'0x0'},
            {chainId:46630022,from:deployer,nonce:number(cn),data:c.data,value:'0x0'}],
        next:'Check both contracts and constructor immutables using bind-plan after inclusion. Only then bind the pair.'};
}
async function bindPlan(x,pa,ca,reviewer){
    pa=E.getAddress(pa);ca=E.getAddress(ca);reviewer=E.getAddress(reviewer);
    const P=(name)=>read(x.parent,x.p.number,pa,parentABI,name), C=(name)=>read(x.child,x.c.number,ca,childABI,name);
    check(sameRuntime(await x.parent('eth_getCode',[pa,x.p.number]),artifact('ParentProgram'))&&sameRuntime(await x.child('eth_getCode',[ca,x.c.number]),artifact('ChildStake')),'Runtime mismatch');
    check(same(await P('governor'),governor)&&same(await P('reviewer'),reviewer)&&same(await P('token'),token)&&same(await P('rollup'),R.rollup)&&same(await P('bridge'),R.bridge)&&same(await C('parent'),pa)&&same(await P('childVault'),E.ZeroAddress),'Deployment identity or binding differs');
    const min=await P('childMin'),term=await P('term');
    check(min===await C('minimum')&&term===await C('maxTerm'),'Deployment terms differ');
    return {terms:{parentMinSPCXC:E.formatEther(await P('parentMin')),childMinSPCX:E.formatEther(min),termSeconds:term,epochSeconds:await P('epochSeconds'),rewardSPCXC:E.formatEther(await P('unitReward')),reviewer},...await simulate(x.parent,x.p.number,unsigned(4663,governor,pa,parentABI,'bindChild',[ca]))};
}
async function main(args){
    const [cmd,...rest]=args;
    const parent=client(process.env.SPCX_PARENT_RPC||'https://rpc.mainnet.chain.robinhood.com');
    const child=client(process.env.SPCX_CHILD_RPC||'https://rpc.spcxchain.network');
    let x;
    try{x=await pinned(parent,child)}catch(e){
        if(cmd!=='inspect')throw Error('Finalized RPC preflight failed. Supply an archive-capable SPCX_PARENT_RPC. '+e.message);
        x=await pinned(parent,child,'latest');
    }
    if(cmd==='inspect'){
        if(rest[0]){const op=E.getAddress(rest[0]);x.summary.operator={address:op,authorized:await x.rp('isValidator',[op]),protocolStaked:await x.rp('isStaked',[op])}}
        const block=await parent('eth_getBlockByNumber',[x.p.number,false]);
        check(same(block?.hash,x.p.hash),'Parent block changed; repeat inspect');
        return x.summary;
    }
    if(cmd==='deploy-plan')return deployPlan(x,rest);
    if(cmd==='bind-plan')return bindPlan(x,...rest);
    const y=await program(x);
    if(cmd==='admit-plan'||cmd==='expiry-plan')return governancePlan(x,y,rest[0],cmd==='admit-plan');
    if(cmd==='operator-check'){
        const op=E.getAddress(rest[0]),id=await y.P('current',[op]);
        const [eligible,listed,staked,balance,gas]=await Promise.all([y.P('eligible',[id]),x.rp('isValidator',[op]),x.rp('isStaked',[op]),read(parent,x.p.number,R['stake-token'],erc,'balanceOf',[op]),parent('eth_getBalance',[op,x.p.number])]);
        const bond=await x.rp('baseStake');
        return {seat:id,operator:op,programEligible:eligible,allowlisted:listed,alreadyStaked:staked,hasBaseBond:balance>=bond,gasWei:BigInt(gas),canConfigure:eligible&&(listed||!x.summary.allowlistEnabled)&&(staked||balance>=bond)&&BigInt(gas)>0n,scope:'Program term, allowlist, base bond and nonzero gas only. Additional challenge bonds and ongoing gas can be required.'};
    }
    if(cmd==='fund-plan'){
        const from=E.getAddress(rest[0]),epoch=BigInt(rest[1]),amount=E.parseEther(rest[2]);
        check(amount>0n && epoch>=BigInt(x.p.timestamp)/await y.P('epochSeconds'),'Epoch or amount invalid');
        const enough=await read(parent,x.p.number,token,erc,'allowance',[from,y.pa])>=amount;
        return simulate(parent,x.p.number,enough?unsigned(4663,from,y.pa,parentABI,'fund',[epoch,amount]):unsigned(4663,from,token,erc,'approve',[y.pa,amount]));
    }
    if(cmd==='claim-plan'){
        const owner=E.getAddress(rest[0]),amount=await y.P('rewards',[owner]);
        if(!amount)return {state:'NO_CREDIT'};
        return {rewardSPCXC:E.formatEther(amount),...await simulate(parent,x.p.number,unsigned(4663,owner,y.pa,parentABI,'claim',[]))};
    }
    if(cmd==='exit-plan'){
        const id=BigInt(rest[0]),side=rest[1],owner=E.getAddress(rest[2]);
        check(side==='parent'||side==='child','Choose parent or child');
        if(side==='parent')return simulate(parent,x.p.number,unsigned(4663,owner,y.pa,parentABI,'exit',[id]));
        return simulate(child,x.c.number,unsigned(46630022,owner,y.ca,childABI,'exit',[id]));
    }
    if(cmd==='seat-status'){
        const op=E.getAddress(rest[0]),id=await y.P('current',[op]);
        if(!id)return {state:'NO_SEAT',operator:op};
        const s=await y.P('seats',[id]),epoch=BigInt(x.p.timestamp)/await y.P('epochSeconds');
        return {seat:id,owner:s.owner,operator:op,eligible:await y.P('eligible',[id]),until:s.until,readyAt:s.readyAt,lockedSPCXC:E.formatEther(s.amount),provenChildSPCX:E.formatEther(s.childAmount),currentEpoch:epoch,currentEpochBudgetSPCXC:E.formatEther(await y.P('epochBudget',[epoch])),ownerClaimableSPCXC:E.formatEther(await y.P('rewards',[s.owner])),allowlisted:await x.rp('isValidator',[op]),protocolBondPosted:await x.rp('isStaked',[op])};
    }
    if(cmd==='join-plan')return joinPlan(x,y,E.getAddress(rest[0]),E.getAddress(rest[1]));
    if(cmd==='relay-plan')return relayPlan(x,y,rest[0],E.getAddress(rest[1]));
    if(cmd==='credit-plan')return creditPlan(x,y,BigInt(rest[0]),rest[1]);
    throw Error('Unknown command');
}
const json=v=>JSON.stringify(v,(_,n)=>typeof n==='bigint'?n.toString():n,2);
if(require.main===module)main(process.argv.slice(2)).then(v=>console.log(json(v))).catch(e=>{console.error('STOP:',e.message.replace(/https?:\/\/\S+/g,'[provider]'));process.exitCode=1});
module.exports={sameRuntime,program,joinPlan,relayPlan,creditPlan,pinned,client,unsigned,assertionTopic,arb,roll,read,simulate,deployPlan,governanceIntent};
