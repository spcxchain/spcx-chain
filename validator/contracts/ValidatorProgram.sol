// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IAsset {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner,address recipient,uint256 amount) external returns (bool);
    function transfer(address recipient,uint256 amount) external returns (bool);
}
interface IArbSys { function sendTxToL1(address to,bytes calldata data) external payable returns(uint256); }
interface IBridge { function activeOutbox() external view returns(address); }
interface IOutbox { function l2ToL1Sender() external view returns(address); }
interface IRollup {
    function getAssertion(bytes32 id) external view returns(uint64,uint64,uint64,bool,uint8,bytes32);
    function getAssertionCreationBlockForLogLookup(bytes32 id) external view returns(uint256);
}

contract ChildStake {
    address public immutable parent;
    uint256 public immutable minimum;
    uint256 public immutable maxTerm;
    IArbSys constant SYS=IArbSys(address(100));
    struct Lock { uint256 amount; uint256 until; }
    mapping(address=>mapping(uint256=>Lock)) public locks;
    event Locked(address indexed owner,uint256 indexed seat,uint256 amount,uint256 until,uint256 message);
    event Exited(address indexed owner,uint256 indexed seat,uint256 amount);
    constructor(address parent_,uint256 minimum_,uint256 maxTerm_){
        require(parent_!=address(0)&&minimum_>0&&maxTerm_>0,"config");
        parent=parent_; minimum=minimum_; maxTerm=maxTerm_;
    }
    function lock(uint256 seat,uint256 until) external payable {
        require(seat>0&&msg.value>=minimum&&until>block.timestamp&&until<=block.timestamp+maxTerm,"terms");
        require(locks[msg.sender][seat].until==0,"seat used");
        locks[msg.sender][seat]=Lock(msg.value,until);
        bytes memory data=abi.encodeCall(ParentProgram.acceptChild,(seat,msg.sender,msg.value,until));
        uint256 message=SYS.sendTxToL1(parent,data);
        emit Locked(msg.sender,seat,msg.value,until,message);
    }
    function exit(uint256 seat) external {
        Lock storage l=locks[msg.sender][seat];
        require(l.amount!=0&&block.timestamp>=l.until,"locked");
        uint256 amount=l.amount;l.amount=0;
        (bool paid,)=msg.sender.call{value:amount}("");require(paid,"transfer");
        emit Exited(msg.sender,seat,amount);
    }
}

contract ParentProgram {
    IAsset public immutable token;
    IBridge public immutable bridge;
    IRollup public immutable rollup;
    address public immutable governor;
    address public immutable reviewer;
    uint256 public immutable parentMin;
    uint256 public immutable childMin;
    uint256 public immutable term;
    uint256 public immutable epochSeconds;
    uint256 public immutable unitReward;
    address public childVault;
    uint256 public count;
    struct Seat { address owner; address operator; uint256 amount; uint256 until; uint256 childAmount; uint256 readyAt; uint256 readyBlock; }
    mapping(uint256=>Seat) public seats;
    mapping(address=>address) public sponsor;
    mapping(address=>uint256) public current;
    mapping(uint256=>uint256) public epochBudget;
    mapping(address=>mapping(uint256=>bool)) public credited;
    mapping(bytes32=>bool) public usedAssertion;
    mapping(address=>uint256) public rewards;
    event Opened(uint256 indexed seat,address indexed owner,address indexed operator,uint256 amount,uint256 until);
    event Eligible(uint256 indexed seat,uint256 from,uint256 until);
    event Reward(uint256 indexed seat,bytes32 indexed assertion,bytes32 indexed workTx,uint256 epoch,uint256 amount);
    event Rolled(uint256 indexed fromEpoch,uint256 indexed toEpoch,uint256 amount);
    event Funded(uint256 indexed epoch,uint256 amount);
    event Withdrawn(address indexed owner,uint256 amount,bool reward);
    constructor(address asset,address bridge_,address rollup_,address governor_,address reviewer_,
                uint256 parentMin_,uint256 childMin_,uint256 term_,uint256 epoch_,uint256 reward_){
        require(asset.code.length>0&&bridge_.code.length>0&&rollup_.code.length>0,"contracts");
        require(governor_!=address(0)&&reviewer_!=address(0)&&parentMin_>0&&childMin_>0&&term_>0&&epoch_>0&&reward_>0,"config");
        token=IAsset(asset);bridge=IBridge(bridge_);rollup=IRollup(rollup_);governor=governor_;reviewer=reviewer_;
        parentMin=parentMin_;childMin=childMin_;term=term_;epochSeconds=epoch_;unitReward=reward_;
    }
    // Set once, after checking the deployed child runtime and its immutable parent.
    function bindChild(address vault) external {require(msg.sender==governor&&childVault==address(0)&&vault!=address(0),"binding");childVault=vault;}
    function setSponsor(address owner) external { sponsor[msg.sender]=owner; }
    function take(uint256 amount) private {
        uint256 before_=token.balanceOf(address(this));
        require(token.transferFrom(msg.sender,address(this),amount)&&token.balanceOf(address(this))==before_+amount,"unsupported token");
    }
    function open(address operator,uint256 amount) external returns(uint256 id){
        require(childVault!=address(0)&&operator!=address(0)&&amount>=parentMin,"terms");
        require(operator==msg.sender||sponsor[operator]==msg.sender,"operator consent");
        require(seats[current[operator]].until<=block.timestamp,"already enrolled");
        id=++count;uint256 until=block.timestamp+term;
        current[operator]=id;seats[id]=Seat(msg.sender,operator,amount,until,0,0,0);
        take(amount);emit Opened(id,msg.sender,operator,amount,until);
    }
    function acceptChild(uint256 id,address owner,uint256 amount,uint256 until) external {
        require(msg.sender==address(bridge)&&childVault!=address(0)&&IOutbox(bridge.activeOutbox()).l2ToL1Sender()==childVault,"outbox origin");
        Seat storage s=seats[id];
        require(s.owner==owner&&owner!=address(0)&&amount>=childMin&&s.until==until&&s.readyAt==0,"seat mismatch");
        require(block.timestamp<until,"expired");s.childAmount=amount;s.readyAt=block.timestamp;s.readyBlock=block.number;
        emit Eligible(id,block.timestamp,until);
    }
    function eligible(uint256 id) external view returns(bool){
        Seat storage s=seats[id];return s.readyAt!=0&&block.timestamp<s.until;
    }
    function exit(uint256 id) external {
        Seat storage s=seats[id];require(msg.sender==s.owner&&s.amount!=0&&block.timestamp>=s.until,"locked");
        uint256 amount=s.amount;s.amount=0;require(token.transfer(msg.sender,amount),"transfer");emit Withdrawn(msg.sender,amount,false);
    }
    function fund(uint256 epoch,uint256 amount) external {
        require(epoch>=block.timestamp/epochSeconds&&amount>0,"epoch");take(amount);
        epochBudget[epoch]+=amount;emit Funded(epoch,amount);
    }
    // Only unallocated funds can move. The old epoch stays available for delayed
    // confirmations for at least one additional lock term after its end.
    function rollover(uint256 fromEpoch,uint256 toEpoch) external {
        require(msg.sender==governor && (fromEpoch+1)*epochSeconds+term<block.timestamp,"grace");
        require(toEpoch>=block.timestamp/epochSeconds,"past destination");
        uint256 amount=epochBudget[fromEpoch];require(amount!=0,"empty");
        epochBudget[fromEpoch]=0;epochBudget[toEpoch]+=amount;emit Rolled(fromEpoch,toEpoch,amount);
    }
    // The reviewer attests the canonical receipt sender, event and timestamp. The rollup
    // independently enforces status 2 (confirmed). Time and block fields have distinct units on Arbitrum.
    function credit(uint256 id,bytes32 assertion,bytes32 workTx,uint256 workTime,uint256 parentBlock) external {
        require(msg.sender==reviewer&&workTx!=bytes32(0)&&!usedAssertion[assertion],"review");
        Seat storage s=seats[id];uint256 epoch=workTime/epochSeconds;
        require(s.readyAt!=0&&workTime>s.readyAt&&workTime<s.until&&workTime<=block.timestamp,"work window");
        require(!credited[s.operator][epoch]&&epochBudget[epoch]>=unitReward,"budget or cap");
        (,,,,uint8 status,)=rollup.getAssertion(assertion);
        require(status==2&&rollup.getAssertionCreationBlockForLogLookup(assertion)==parentBlock,"confirmed work");
        usedAssertion[assertion]=true;credited[s.operator][epoch]=true;epochBudget[epoch]-=unitReward;rewards[s.owner]+=unitReward;
        emit Reward(id,assertion,workTx,epoch,unitReward);
    }
    function claim() external {
        uint256 amount=rewards[msg.sender];require(amount>0,"no credit");rewards[msg.sender]=0;
        require(token.transfer(msg.sender,amount),"transfer");emit Withdrawn(msg.sender,amount,true);
    }
}
