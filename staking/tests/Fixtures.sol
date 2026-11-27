// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract MockSPCXC {
    uint8 public constant decimals=18;string public constant symbol="SPCXC";
    mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;
    bool public fail;bool public taxed;bool public reenter;bool public reentryBlocked;
    function setReenter(bool value) external {reenter=value;}
    function modes(bool f,bool t) external {fail=f;taxed=t;}
    function mint(address to,uint256 n) external {balanceOf[to]+=n;}
    function approve(address to,uint256 n) external returns(bool){allowance[msg.sender][to]=n;return true;}
    function transferFrom(address from,address to,uint256 n) external returns(bool){if(fail)return false;require(allowance[from][msg.sender]>=n);allowance[from][msg.sender]-=n;balanceOf[from]-=n;balanceOf[to]+=taxed?n-1:n;if(reenter){(bool ok,bytes memory reason)=to.call(abi.encodeWithSignature("stake(uint256)",1000 ether));reentryBlocked=!ok&&keccak256(reason)==keccak256(abi.encodeWithSignature("Error(string)","reentrant"));}return true;}
    function transfer(address to,uint256 n) external returns(bool){if(fail)return false;balanceOf[msg.sender]-=n;balanceOf[to]+=n;return true;}
}
contract MockRollup {
    bool public validatorWhitelistDisabled;
    mapping(address=>bool) public isValidator;
    struct A{uint256 creation;uint8 status;}
    mapping(bytes32=>A) public assertions;
    function setValidator(address a,bool value) external{isValidator[a]=value;}
    function set(bytes32 id,uint256 n,uint8 s) external{assertions[id]=A(n,s);}
    function getAssertion(bytes32 id) external view returns(uint64,uint64,uint64,bool,uint8,bytes32){return(0,0,0,false,assertions[id].status,bytes32(0));}
    function getAssertionCreationBlockForLogLookup(bytes32 id) external view returns(uint256){return assertions[id].creation;}
}
