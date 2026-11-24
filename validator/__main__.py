#!/usr/bin/env python3
import argparse
import getpass
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ARCHIVE = Path(sys.argv[0]).resolve()
GENESIS = '0xa33c011eec2550e73849e2a882d754e4b23a53568475511726ecc69619077a3b'
IMAGE = 'offchainlabs/nitro-node:v3.12.1-70fa99a'
LOCAL = 'http://127.0.0.1:18658'
DEFAULT = '/opt/spcx-community-validator'
COMMANDS = ('inspect','agent','seat-status','fund-plan','claim-plan','exit-plan','deploy-plan','bind-plan','admit-plan','expiry-plan','init','start','status','active-config','operator-check','join-plan','relay-plan','credit-plan','rehearse','guide','export')
def require(ok, text):
    if not ok:
        raise ValueError(text)
def rpc(url, method, params):
    data = json.dumps(dict(jsonrpc='2.0',id=1,method=method,params=params)).encode()
    try:
        with urlopen(Request(url,data,{'Content-Type':'application/json'}), timeout=24) as response:
            result = json.load(response)
        return result['result']
    except Exception:
        raise ValueError(method+' unavailable; check the provider and its archive coverage') from None
def write(path, content):
    with path.open('x',encoding='utf8') as out:
        out.write(content if isinstance(content,str) else json.dumps(content,indent=2)+'\n')
    path.chmod(0o600)
def configure(source, wd, archive):
    require(not wd.exists(), 'Choose a new directory for init. Existing installations use start or status.')
    u=urlsplit(archive)
    require(u.scheme=='https' and u.hostname, 'Supply your own Robinhood mainnet archive HTTPS endpoint')
    require(int(rpc(archive,'eth_chainId',[]),16)==4663,'Wrong archive chain')
    rollup=json.loads((source/'chain-info.json').read_text())[0]['rollup']
    block=rpc(archive,'eth_getBlockByNumber',['finalized',False])
    require(block and int(block['number'],16)>=rollup['deployed-at'],'Parent finalized height unavailable')
    call={'to':rollup['rollup'],'data':'0x'+SELECTOR}
    require(rpc(archive,'eth_call',[call,block['number']]).lower()==WASM,'Finalized rollup WASM mismatch')
    code=rpc(archive,'eth_getCode',[rollup['rollup'],hex(rollup['deployed-at'])])
    require(code and len(code)>4,'Provider cannot serve rollup deployment state')
    require(os.geteuid() in (0,1000),'Initialize as root or UID 1000 for the Nitro volume permissions')
    wd.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=wd.parent) as temp:
        target=Path(temp)/'install'
        target.mkdir(mode=0o700)
        config=target/'config';config.mkdir(mode=0o700)
        node=json.loads((source/'watchtower.json').read_text())
        node['parent-chain']['connection']['url']=archive
        write(config/'node-config.json',node)
        write(config/'chain-info.json',(source/'chain-info.json').read_text())
        data=target/'data';data.mkdir(mode=0o700)
        if os.geteuid()==0:
            for item in [config,*config.iterdir(),data]:
                os.chown(item,1000,1000)
        write(target/'compose.json',compose(False))
        require(not wd.exists(),'Destination already exists')
        target.rename(wd)
    print('Prepared independent watchtower at '+str(wd)+'. Start it with the start command.')
def compose(active):
    return {'name':'spcx-community-validator','services':{'validator':{
        'image':IMAGE,'user':'1000:1000','restart':'unless-stopped','ports':['127.0.0.1:18658:8547'],
        'volumes':['./data:/home/user/.arbitrum','./'+('active-config' if active else 'config')+':/spcx-config:ro'],
        'command':['--conf.file','/spcx-config/node-config.json'],
        'logging':{'driver':'json-file','options':{'max-size':'20m','max-file':'3'}}}}}
def node_status():
    ref=os.environ.get('SPCX_CHILD_RPC','https://rpc.spcxchain.network')
    for url in [LOCAL,ref]:
        require(int(rpc(url,'eth_chainId',[]),16)==46630022 and rpc(url,'eth_getBlockByNumber',['0x0',False])['hash'].lower()==GENESIS,'Unexpected SPCX chain or genesis')
    local=int(rpc(LOCAL,'eth_blockNumber',[]),16)
    latest=int(rpc(ref,'eth_blockNumber',[]),16)
    height=hex(min(local,latest))
    anchor=rpc(LOCAL,'eth_getBlockByNumber',[height,False])['hash']
    matched=anchor.lower()==rpc(ref,'eth_getBlockByNumber',[height,False])['hash'].lower()
    syncing=rpc(LOCAL,'eth_syncing',[])
    return {'localHead':local,'networkHead':latest,'commonBlockMatches':matched,'syncing':syncing,'caughtUp':matched and local>=latest and syncing is False}
def prepare_active(source,wd,argv):
    require(len(argv)==2,'active-config needs an operator address and the path to its encrypted JSON keystore')
    op,keypath=argv
    require(re.fullmatch('0x[0-9a-fA-F]{40}',op),'Invalid operator')
    live=node_status()
    require(live['caughtUp'],'Sync the watchtower and verify its genesis and head first')
    require((wd/'config/node-config.json').is_file(),'Initialize this directory first')
    env=os.environ.copy()
    env['SPCX_PARENT_RPC']=json.loads((wd/'config/node-config.json').read_text())['parent-chain']['connection']['url']
    run=subprocess.run(['node',str(source/'program.cjs'),'operator-check',op],env=env,stdout=subprocess.PIPE,text=True,check=True)
    require(json.loads(run.stdout)['canConfigure'],'Mainnet stake program, bond or allowlist check pending')
    key=Path(keypath)
    require(key.is_file(),'Keystore missing')
    keydata=json.loads(key.read_text())
    require(keydata.get('version')==3 and ('crypto' in keydata or 'Crypto' in keydata) and keydata.get('address','').lower()==op[2:].lower(),'Encrypted V3 keystore or operator mismatch')
    cfgdir=wd/'active-config'
    require(not cfgdir.exists() and not (wd/'compose.active.json').exists(),'An active configuration already exists; review the existing files')
    pw=getpass.getpass('Operator keystore password (hidden): ')
    require(bool(pw),'Empty password')
    # Verify the encrypted key, without argv, stdout, or a secret-bearing environment variable.
    js="const E=require('./ethers.cjs');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',async()=>{try{const [k,p,a]=JSON.parse(s);const w=await E.Wallet.fromEncryptedJson(JSON.stringify(k),p);process.exit(w.address.toLowerCase()===a.toLowerCase()?0:1)}catch{process.exit(1)}})"
    checked=subprocess.run(['node','-e',js],cwd=source,input=json.dumps([keydata,pw,op]),text=True)
    require(checked.returncode==0,'Keystore decryption or address check failed')
    with tempfile.TemporaryDirectory(dir=wd) as td:
        stage=Path(td)/'active-config';stage.mkdir(mode=0o700)
        keys=stage/'wallet';keys.mkdir(mode=0o700)
        cfg=json.loads((wd/'config/node-config.json').read_text())
        cfg['node']['staker'].update({'strategy':'MakeNodes','parent-chain-wallet':{'pathname':'/spcx-config/wallet','account':op,'password':pw}})
        cfg['node']['bold'].update({'auto-deposit':True,'auto-increase-allowance':True})
        write(stage/'node-config.json',cfg);write(keys/'operator.json',keydata);write(stage/'chain-info.json',(wd/'config/chain-info.json').read_text())
        if os.geteuid()==0:
            for item in [stage,*stage.rglob('*')]:
                os.chown(item,1000,1000)
        stage.rename(cfgdir)
    write(wd/'compose.active.json',compose(True))
    print('Prepared active operator configuration. To start signing parent transactions and posting bonds, run Docker Compose with compose.active.json on the operator host.')
def main(source):
    parser=argparse.ArgumentParser(description='SPCX community validator pilot')
    parser.add_argument('--version',action='version',version='spcx-validator 0.1.1')
    parser.add_argument('command',choices=COMMANDS);parser.add_argument('--dir',default=DEFAULT);parser.add_argument('args',nargs='*')
    parser.add_argument('--once',action='store_true',help='Emit one agent observation')
    parser.add_argument('--interval',type=int,default=60,help='Agent polling interval in seconds')
    a=parser.parse_intermixed_args();cmd=a.command;wd=Path(a.dir).absolute()
    if cmd=='guide': print((source/'README.md').read_text())
    elif cmd=='export':
        require(len(a.args)==1 and not Path(a.args[0]).exists(),'Supply a new output folder')
        shutil.copytree(source,a.args[0],ignore=shutil.ignore_patterns('__pycache__'));print('Exported operator kit and contract sources')
    elif cmd=='init':configure(source,wd,os.environ.get('SPCX_PARENT_RPC') or getpass.getpass('Your Robinhood MAINNET archive HTTPS URL (hidden): '))
    elif cmd=='start':
        require((wd/'compose.json').is_file(),'Run init first')
        require(not (wd/'compose.active.json').exists(),'Active configuration present. Explicitly select compose.active.json or compose.json using Docker Compose.')
        subprocess.run(['docker','compose','-f',str(wd/'compose.json'),'up','-d'],cwd=wd,check=True)
    elif cmd=='status':print(json.dumps(node_status(),indent=2))
    elif cmd=='agent':
        require(len(a.args)==1 and re.fullmatch('0x[0-9a-fA-F]{40}',a.args[0]),'Supply one operator address')
        require(a.interval>=10,'Use a polling interval of 10 seconds or more')
        while True:
            sample={'observedAt':int(time.time()),'operator':a.args[0],'readOnly':True}
            try:
                sample['node']=node_status()
            except ValueError as err:
                sample['node']={'available':False,'detail':str(err)}
            if os.environ.get('SPCX_PROGRAM') and os.environ.get('SPCX_VAULT'):
                result=subprocess.run(['node',str(source/'program.cjs'),'seat-status',a.args[0]],capture_output=True,text=True)
                sample['seat']=json.loads(result.stdout) if result.returncode==0 else {'state':'RPC_OR_CONFIG_UNAVAILABLE'}
            else:sample['seat']={'state':'PROGRAM_NOT_CONFIGURED'}
            print(json.dumps(sample,separators=(',',':')),flush=True)
            if a.once:break
            time.sleep(a.interval)
    elif cmd=='active-config':prepare_active(source,wd,a.args)
    elif cmd=='rehearse':return subprocess.run(['node',str(source/'lab/test.cjs')],cwd=source).returncode or subprocess.run(['node','--test',str(source/'lab/plans.test.cjs')],cwd=source).returncode
    else:return subprocess.run(['node',str(source/'program.cjs'),cmd,*a.args],cwd=source).returncode
    return 0

WASM='0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39'
SELECTOR='8ee1a126'
if __name__=='__main__':
    os.umask(0o077)
    try:
        if zipfile.is_zipfile(ARCHIVE):
            with tempfile.TemporaryDirectory() as temp:
                with zipfile.ZipFile(ARCHIVE) as src:src.extractall(temp)
                sys.exit(main(Path(temp)))
        else:sys.exit(main(Path(__file__).resolve().parent))
    except (ValueError, OSError, subprocess.CalledProcessError) as err:
        print('STOP:',err,file=sys.stderr);sys.exit(1)
