// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;
contract Asset {
 mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transferFrom(address a,address b,uint256 n) external returns(bool){allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;return true;}
 function transfer(address b,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[b]+=n;return true;}
}
contract Sys { event Message(address sender,address dest,bytes data);function sendTxToL1(address d,bytes calldata b) external payable returns(uint256){emit Message(msg.sender,d,b);return 1;} }
contract BridgeMock {address public activeOutbox;address public l2ToL1Sender;
 function deliver(address dest,address sender,bytes calldata data) external{activeOutbox=address(this);l2ToL1Sender=sender;(bool ok,)=dest.call(data);require(ok);delete activeOutbox;delete l2ToL1Sender;}}
contract RollupMock {mapping(bytes32=>uint256) public getAssertionCreationBlockForLogLookup;mapping(bytes32=>uint8) public status;
 function set(bytes32 a,uint256 b,uint8 s) external{getAssertionCreationBlockForLogLookup[a]=b;status[a]=s;}
 function getAssertion(bytes32 a) external view returns(uint64,uint64,uint64,bool,uint8,bytes32){return(0,0,0,true,status[a],0);}}
