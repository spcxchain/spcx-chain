'use strict';
const E=require('../validator/ethers.cjs');
const artifact=require('./artifacts/SPCXCValidatorStaking.json');
function rpc(url){return async(method,params=[])=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error('Local fixture RPC unavailable');const d=await response.json();if(d.error||d.result===undefined)throw Error('Local fixture RPC read failed');return d.result;};}
function sameRuntime(code){if(typeof code!=='string'||code.length!==artifact.runtime.length)return false;const b=Buffer.from(code.slice(2),'hex');for(const ref of Object.values(artifact.immutables).flat())b.fill(0,ref.start,ref.start+ref.length);return b.toString('hex')===artifact.runtime.slice(2);}
module.exports={E,rpc,sameRuntime};
