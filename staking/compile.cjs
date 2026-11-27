'use strict';
// Reproduce the exact deployment input, including the original fixture source paths.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const solc=require(process.env.SPCX_SOLC_MODULE||'solc');
assert(solc.version().startsWith('0.8.24+commit.e11b9ed9'),'Use solc 0.8.24');
const input=JSON.parse(fs.readFileSync(path.join(__dirname,'compiler-input.json')));
for(const [relative,value]of Object.entries(input.sources))assert.equal(fs.readFileSync(path.join(__dirname,relative),'utf8'),value.content,'Source differs: '+relative);
const output=JSON.parse(solc.compile(JSON.stringify(input)));
assert(!(output.errors||[]).some(e=>e.severity==='error'),'Solidity compilation failed');
const actual=output.contracts['contracts/SPCXCValidatorStaking.sol'].SPCXCValidatorStaking;
const expected=require('./artifacts/SPCXCValidatorStaking.json');
assert.deepEqual(actual.abi,expected.abi);assert.equal('0x'+actual.evm.bytecode.object,expected.bytecode);assert.equal('0x'+actual.evm.deployedBytecode.object,expected.runtime);assert.deepEqual(actual.evm.deployedBytecode.immutableReferences,expected.immutables);
console.log('PASS solc 0.8.24: ABI, creation bytecode, runtime and immutable locations match');
