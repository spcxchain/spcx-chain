// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IERC20Stake {
    function balanceOf(address) external view returns(uint256);
    function decimals() external view returns(uint8);
    function transfer(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
}
interface IRollupStake {
    function isValidator(address) external view returns(bool);
    function validatorWhitelistDisabled() external view returns(bool);
    function getAssertion(bytes32) external view returns(uint64,uint64,uint64,bool,uint8,bytes32);
    function getAssertionCreationBlockForLogLookup(bytes32) external view returns(uint256);
}
/// @notice Community enrollment stake; it does not replace Nitro's protocol bond/permissions.
/// Principal is never used for rewards. No administrator can withdraw principal or rewards.
contract SPCXCValidatorStaking {
    IERC20Stake public immutable token;
    IRollupStake public immutable rollup;
    address public immutable reviewer;
    uint256 public constant MINIMUM_STAKE=1000 ether;
    uint256 public constant LOCK_SECONDS=1 days;
    uint256 public constant EPOCH_SECONDS=1 days;
    uint256 public totalStaked;
    uint256 public rewardReserve;
    uint256 private entered=1;
    struct Position {uint256 amount;uint256 unlockAt;uint256 since;uint256 sinceBlock;}
    mapping(address=>Position) public positions;
    mapping(uint256=>uint256) public epochBudget;
    mapping(uint256=>uint256) public totalPoints;
    mapping(uint256=>mapping(address=>uint256)) public points;
    mapping(uint256=>mapping(address=>bool)) public claimed;
    mapping(bytes32=>bool) public usedAssertion;
    event Staked(address indexed owner,uint256 amount,uint256 balance,uint256 unlockAt);
    event Withdrawn(address indexed owner,uint256 amount,uint256 remaining);
    event EpochFunded(uint256 indexed epoch,address indexed funder,uint256 amount);
    event WorkCredited(uint256 indexed epoch,address indexed validator,bytes32 indexed assertion,bytes32 workTx,uint256 workTime,uint256 parentBlock);
    event RewardClaimed(uint256 indexed epoch,address indexed owner,uint256 amount);
    event EmptyEpochRolled(uint256 indexed fromEpoch,uint256 indexed toEpoch,uint256 amount);
    modifier guard(){require(entered==1,"reentrant");entered=2;_;entered=1;}
    constructor(address asset,address rollup_,address reviewer_) {
        require(block.chainid==4663,"parent chain");
        require(asset.code.length>0&&rollup_.code.length>0&&reviewer_!=address(0),"config");
        require(IERC20Stake(asset).decimals()==18,"token decimals");
        token=IERC20Stake(asset);rollup=IRollupStake(rollup_);reviewer=reviewer_;
    }
    function move(bytes memory data) private {
        (bool ok,bytes memory result)=address(token).call(data);
        require(ok&&(result.length==0||(result.length==32&&abi.decode(result,(bool)))),"token transfer");
    }
    function take(uint256 amount) private {
        uint256 before_=token.balanceOf(address(this));
        move(abi.encodeCall(IERC20Stake.transferFrom,(msg.sender,address(this),amount)));
        require(token.balanceOf(address(this))==before_+amount,"unsupported token");
    }
    function pay(address owner,uint256 amount) private {
        uint256 before_=token.balanceOf(address(this));
        move(abi.encodeCall(IERC20Stake.transfer,(owner,amount)));
        require(token.balanceOf(address(this))+amount==before_,"unsupported token");
    }
    function stake(uint256 amount) external guard {
        Position storage p=positions[msg.sender];
        require(amount>0&&p.amount+amount>=MINIMUM_STAKE,"minimum stake");
        p.amount+=amount;p.unlockAt=block.timestamp+LOCK_SECONDS;
        // A top-up starts a new qualifying window for the whole position.
        p.since=block.timestamp;p.sinceBlock=block.number;totalStaked+=amount;
        take(amount);emit Staked(msg.sender,amount,p.amount,p.unlockAt);
    }
    function eligible(address owner) public view returns(bool){
        Position storage p=positions[owner];return p.amount>=MINIMUM_STAKE&&block.timestamp>=p.unlockAt;
    }
    function activeValidator(address owner) external view returns(bool){return eligible(owner)&&(rollup.isValidator(owner)||rollup.validatorWhitelistDisabled());}
    function withdraw(uint256 amount) external guard {
        Position storage p=positions[msg.sender];
        require(amount>0&&amount<=p.amount&&block.timestamp>=p.unlockAt,"stake locked");
        require(p.amount==amount||p.amount-amount>=MINIMUM_STAKE,"minimum remainder");
        p.amount-=amount;totalStaked-=amount;
        if(p.amount==0){p.unlockAt=0;p.since=0;p.sinceBlock=0;}
        pay(msg.sender,amount);emit Withdrawn(msg.sender,amount,p.amount);
    }
    function fundEpoch(uint256 epoch,uint256 amount) external guard {
        require(epoch>=block.timestamp/EPOCH_SECONDS&&epoch<=block.timestamp/EPOCH_SECONDS+30&&amount>0,"epoch or amount");
        require(epochBudget[epoch]+amount<=type(uint128).max,"budget too large");
        epochBudget[epoch]+=amount;rewardReserve+=amount;take(amount);
        emit EpochFunded(epoch,msg.sender,amount);
    }
    /// Reviewer binds creator/receipt/time; confirmed assertion and creation block are rechecked onchain.
    /// Work belongs to the epoch when confirmation is reviewed, avoiding premature closure of delayed assertions.
    function creditWork(address validator,bytes32 assertion,bytes32 workTx,uint256 workTime,uint256 parentBlock) external {
        require(msg.sender==reviewer&&workTx!=bytes32(0)&&assertion!=bytes32(0)&&!usedAssertion[assertion],"review or replay");
        Position storage p=positions[validator];
        require(eligible(validator)&&(rollup.isValidator(validator)||rollup.validatorWhitelistDisabled()),"validator not eligible");
        require(workTime>=p.unlockAt&&workTime<=block.timestamp&&parentBlock>0,"work before eligibility");
        (,,,,uint8 status,)=rollup.getAssertion(assertion);
        require(status==2&&rollup.getAssertionCreationBlockForLogLookup(assertion)==parentBlock,"work not confirmed");
        uint256 epoch=block.timestamp/EPOCH_SECONDS;require(totalPoints[epoch]<type(uint64).max,"epoch point cap");usedAssertion[assertion]=true;
        points[epoch][validator]+=1;totalPoints[epoch]+=1;
        emit WorkCredited(epoch,validator,assertion,workTx,workTime,parentBlock);
    }
    function claimable(uint256 epoch,address owner) public view returns(uint256){
        if(epoch>=block.timestamp/EPOCH_SECONDS||claimed[epoch][owner]||totalPoints[epoch]==0)return 0;
        return epochBudget[epoch]*points[epoch][owner]/totalPoints[epoch];
    }
    function claimReward(uint256 epoch) external guard {
        uint256 amount=claimable(epoch,msg.sender);require(amount>0,"no reward");
        claimed[epoch][msg.sender]=true;rewardReserve-=amount;pay(msg.sender,amount);
        emit RewardClaimed(epoch,msg.sender,amount);
    }
    // An epoch with no credited work may roll forward; credited epochs stay claimable indefinitely.
    function rollEmptyEpoch(uint256 fromEpoch,uint256 toEpoch) external {
        require(msg.sender==reviewer,"reviewer only");
        require(fromEpoch<block.timestamp/EPOCH_SECONDS&&totalPoints[fromEpoch]==0,"not empty closed epoch");
        require(toEpoch>=block.timestamp/EPOCH_SECONDS&&toEpoch<=block.timestamp/EPOCH_SECONDS+30,"target epoch");
        uint256 amount=epochBudget[fromEpoch];require(amount>0,"empty budget");
        epochBudget[fromEpoch]=0;epochBudget[toEpoch]+=amount;emit EmptyEpochRolled(fromEpoch,toEpoch,amount);
    }
}
