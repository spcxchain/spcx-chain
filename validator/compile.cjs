const sol=require('solc/soljson.js'),fs=require('fs');
const compile=sol.cwrap('solidity_compile','string',['string','number','number']);
const sources={};for(const n of ['contracts/ValidatorProgram.sol','lab/Fixtures.sol'])sources[n]={content:fs.readFileSync(n,'utf8')};
const out=JSON.parse(compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}),0,0));
for(const e of out.errors||[]){console.log(e.formattedMessage);if(e.severity==='error')process.exit(1);}
for(const [src,group] of Object.entries(out.contracts))for(const [n,x] of Object.entries(group))if(x.evm.bytecode.object)fs.writeFileSync((src.startsWith('lab/')?'lab/':'artifacts/')+n+'.json',JSON.stringify({abi:x.abi,bytecode:'0x'+x.evm.bytecode.object,runtime:'0x'+x.evm.deployedBytecode.object,immutables:x.evm.deployedBytecode.immutableReferences}));
