// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/CovraPools.sol";

/**
 * Dependency-free Foundry adversarial suite.
 * RUN: forge test --root contracts/base -vv
 * These are authored tests; no claim of live execution is made when Forge
 * is not available on the build machine.
 */
interface Vm {
    function chainId(uint256) external;
    function warp(uint256) external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 value) external { balanceOf[to] += value; }
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value; return true;
    }
    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "balance");
        balanceOf[msg.sender] -= value; balanceOf[to] += value; return true;
    }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value && allowance[from][msg.sender] >= value, "allowance");
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value; balanceOf[to] += value; return true;
    }
}

contract CovraPoolsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant QUOTE_KEY = 0xBEEF01;
    bytes32 private constant POLICY_ID = keccak256("covra-policy-fixture");
    bytes32 private constant CLAIM_ID = keccak256("covra-claim-fixture");
    bytes32 private constant EVIDENCE_ID = keccak256("covra-evidence");
    bytes32 private constant EVIDENCE_REVISED = keccak256("covra-revised-evidence");
    bytes32 private constant TERMS_HASH = keccak256("covra-frozen-terms");
    bytes32 private constant RISK_SPEC_HASH = keccak256("covra-specific-insured-exposure");
    address private constant BRADBURY_ADJUDICATOR = address(0x4221);
    address private constant EVIDENCE_ISSUER = address(0xE71D);

    MockUSDC private usdc;
    CovraPools private pools;
    address private insured;
    address private underwriter;
    address private beneficiary;
    uint256[5] private attestorKeys;
    address[5] private attestors;
    uint256 private clock;

    function setUp() public {
        vm.chainId(84532);
        vm.warp(1800000000);
        clock = block.timestamp;
        insured = vm.addr(0x101);
        underwriter = vm.addr(0x102);
        beneficiary = vm.addr(0x103);
        for (uint8 i; i < 5; ++i) {
            attestorKeys[i] = uint256(i) + 0xC0FFEE;
            attestors[i] = vm.addr(attestorKeys[i]);
        }
        usdc = new MockUSDC();
        pools = new CovraPools(
            address(usdc), vm.addr(QUOTE_KEY), BRADBURY_ADJUDICATOR, EVIDENCE_ISSUER,
            attestors, 84532
        );
        usdc.mint(underwriter, 500000000);
        usdc.mint(insured, 10000000);
        vm.prank(underwriter);
        usdc.approve(address(pools), type(uint256).max);
        vm.prank(insured);
        usdc.approve(address(pools), type(uint256).max);
        vm.prank(underwriter);
        pools.deposit(0, 100000000);
    }

    function _quote() internal view returns (CovraPools.Quote memory) {
        return CovraPools.Quote({
            policyId: POLICY_ID, insured: insured, beneficiary: beneficiary,
            coverageClass: 0, premium: 3000000, limit: 80000000,
            startsAt: uint64(clock+300), endsAt: uint64(clock+86400),
            claimDeadline: uint64(clock+2 days),
            termsHash: TERMS_HASH, riskSpecHash: RISK_SPEC_HASH, nonce: 1, quoteDeadline: uint64(clock+200)
        });
    }
    function _signQuote(CovraPools.Quote memory q) internal returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            pools.QUOTE_TYPEHASH(), q.policyId, q.insured, q.beneficiary,
            q.coverageClass, q.premium, q.limit, q.startsAt, q.endsAt,
            q.claimDeadline, q.termsHash, q.riskSpecHash, q.nonce, q.quoteDeadline
        ));
        bytes32 hash = keccak256(abi.encodePacked("\x19\x01",pools.domainSeparator(),structHash));
        (uint8 v,bytes32 r,bytes32 s) = vm.sign(QUOTE_KEY,hash);
        return abi.encodePacked(r,s,v);
    }
    function _purchase() internal {
        CovraPools.Quote memory q = _quote();
        bytes memory sig = _signQuote(q);
        vm.prank(insured);
        pools.purchase(q,sig);
    }
    function _lock() internal {
        _purchase();
        vm.warp(clock+600);
        vm.prank(insured);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
    }
    function _decision(uint8 verdict,uint96 amount,uint8 revision,bytes32 evidence)
        internal view returns (CovraPools.Decision memory)
    {
        return CovraPools.Decision({
            policyId: POLICY_ID, claimId: CLAIM_ID,
            bradburyDecisionId: keccak256("bradbury-final-decision"),
            genlayerTxId: keccak256("genlayer-final-transaction"),
            evidenceDigest: evidence, resultDigest: keccak256("finalized-result-digest"),
            termsHash: TERMS_HASH, riskSpecHash: RISK_SPEC_HASH,
            recipient: beneficiary, amount: amount,
            coverageClass: 0, verdict: verdict, revision: revision,
            finalizedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp+300),
            sourceChainId: 4221, adjudicator: BRADBURY_ADJUDICATOR
        });
    }
    function _signature(CovraPools.Decision memory d,uint256 key) internal returns(bytes memory) {
        bytes32 structHash=keccak256(abi.encode(
            pools.DECISION_TYPEHASH(),d.policyId,d.claimId,d.bradburyDecisionId,
            d.genlayerTxId,d.evidenceDigest,d.resultDigest,d.termsHash,d.riskSpecHash,
            d.recipient,d.amount,d.coverageClass,d.verdict,d.revision,
            d.finalizedAt,d.deadline,d.sourceChainId,d.adjudicator
        ));
        bytes32 hash=keccak256(abi.encodePacked("\x19\x01",pools.domainSeparator(),structHash));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);
        return abi.encodePacked(r,s,v);
    }
    function _quorum(CovraPools.Decision memory d) internal returns(bytes[] memory) {
        bytes[] memory sigs = new bytes[](3);
        address[3] memory order;
        for(uint8 i;i<3;++i){
            sigs[i]=_signature(d,attestorKeys[i]);order[i]=attestors[i];
        }
        for(uint8 i;i<3;++i){
            for(uint8 j=i+1;j<3;++j){
                if(order[j]<order[i]){
                    (order[i],order[j])=(order[j],order[i]);
                    (sigs[i],sigs[j])=(sigs[j],sigs[i]);
                }
            }
        }
        return sigs;
    }
    function _extensionQuorum(uint64 previousDeadline,uint64 newDeadline) internal returns(bytes[] memory) {
        bytes32 structHash=keccak256(abi.encode(
            pools.EXTENSION_TYPEHASH(),POLICY_ID,CLAIM_ID,previousDeadline,newDeadline
        ));
        bytes32 hash=keccak256(abi.encodePacked("\x19\x01",pools.domainSeparator(),structHash));
        bytes[] memory signatures=new bytes[](3);
        address[3] memory order;
        for(uint8 i;i<3;++i){
            (uint8 v,bytes32 r,bytes32 s)=vm.sign(attestorKeys[i],hash);
            signatures[i]=abi.encodePacked(r,s,v);
            order[i]=attestors[i];
        }
        for(uint8 i;i<3;++i) for(uint8 j=i+1;j<3;++j){
            if(order[j]<order[i]){
                (order[i],order[j])=(order[j],order[i]);
                (signatures[i],signatures[j])=(signatures[j],signatures[i]);
            }
        }
        return signatures;
    }
    function _assert(bool expression) internal pure {
        require(expression,"COVRA_TEST_ASSERTION");
    }

    function testCapitalIsReservedAndCannotBeWithdrawn() public {
        _purchase();
        _assert(pools.availableCapital(0)==23000000);
        vm.prank(underwriter);
        vm.expectRevert(CovraPools.NotEnoughAvailableLiquidity.selector);
        pools.withdraw(0,100000000);
    }

    function testSigningIdentitiesAreSeparatedAtConstruction() public {
        vm.expectRevert(CovraPools.InvalidInput.selector);
        new CovraPools(address(usdc), vm.addr(QUOTE_KEY), BRADBURY_ADJUDICATOR,
            address(this), attestors, 84532);

        address[5] memory evidenceIssuerRoster = attestors;
        evidenceIssuerRoster[0] = EVIDENCE_ISSUER;
        vm.expectRevert(CovraPools.InvalidInput.selector);
        new CovraPools(address(usdc), vm.addr(QUOTE_KEY), BRADBURY_ADJUDICATOR,
            EVIDENCE_ISSUER, evidenceIssuerRoster, 84532);

        address[5] memory quoteSignerRoster = attestors;
        quoteSignerRoster[0] = vm.addr(QUOTE_KEY);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        new CovraPools(address(usdc), vm.addr(QUOTE_KEY), BRADBURY_ADJUDICATOR,
            EVIDENCE_ISSUER, quoteSignerRoster, 84532);
    }

    function testDelegatedAgentCannotRedirectBeneficiary() public {
        address delegate = vm.addr(0x104);
        usdc.mint(delegate, 10000000);
        vm.prank(delegate);
        usdc.approve(address(pools), type(uint256).max);
        vm.prank(insured);
        pools.authorizeAgent(delegate, 6000000, uint64(clock + 1 days));

        CovraPools.Quote memory redirected = _quote();
        bytes memory redirectedSignature = _signQuote(redirected);
        vm.prank(delegate);
        vm.expectRevert(CovraPools.Unauthorized.selector);
        pools.purchase(redirected, redirectedSignature);

        // Same delegation can buy legitimate coverage for the insured.
        redirected.beneficiary = insured;
        bytes memory insuredSignature = _signQuote(redirected);
        vm.prank(delegate);
        pools.purchase(redirected, insuredSignature);
        (,uint96 usedPremium,,) = pools.agentPermissions(insured, delegate);
        _assert(usedPremium == 3000000);
    }

    function testOwnerOnlyClaimAndSingleLock() public {
        _purchase();
        vm.warp(clock+600);
        vm.prank(underwriter);
        vm.expectRevert(CovraPools.Unauthorized.selector);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
        vm.prank(insured);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
        vm.prank(insured);
        vm.expectRevert(CovraPools.AlreadyUsed.selector);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
    }

    function testClaimReserveSurvivesOrdinaryExpiryButNotInfiniteGrace() public {
        _lock();
        vm.warp(clock+3 days);
        vm.expectRevert(CovraPools.Expired.selector);
        pools.releaseExpired(POLICY_ID);
        vm.warp(clock+48 days);
        pools.releaseExpired(POLICY_ID);
        _assert(pools.availableCapital(0)==103000000);
    }

    function testThreeIndependentSignaturesPayBeneficiaryOnce() public {
        _lock();
        CovraPools.Decision memory d=_decision(1,3000000,0,EVIDENCE_ID);
        bytes[] memory sigs=_quorum(d);
        uint256 beforeBalance=usdc.balanceOf(beneficiary);
        pools.settle(d,sigs);
        _assert(usdc.balanceOf(beneficiary)==beforeBalance+3000000);
        _assert(pools.availableCapital(0)==100000000);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(d,sigs);
    }

    function testTwoSignersCannotMoveFunds() public {
        _lock();
        CovraPools.Decision memory d=_decision(1,3000000,0,EVIDENCE_ID);
        bytes[] memory sigs=new bytes[](2);
        sigs[0]=_signature(d,attestorKeys[0]);
        sigs[1]=_signature(d,attestorKeys[1]);
        vm.expectRevert(CovraPools.InvalidAttestation.selector);
        pools.settle(d,sigs);
    }

    function testEvidenceRevisionInvalidatesStaleCertifications() public {
        _lock();
        CovraPools.Decision memory oldDecision=_decision(1,3000000,0,EVIDENCE_ID);
        bytes[] memory oldSigs=_quorum(oldDecision);
        vm.prank(insured);
        pools.reviseClaimEvidence(POLICY_ID,EVIDENCE_REVISED);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(oldDecision,oldSigs);
        CovraPools.Decision memory revised=_decision(1,3000000,1,EVIDENCE_REVISED);
        pools.settle(revised,_quorum(revised));
        _assert(pools.usedClaims(CLAIM_ID));
    }

    function testFinalDenialReleasesReserveWithoutTransfer() public {
        _lock();
        CovraPools.Decision memory denied=_decision(2,0,0,EVIDENCE_ID);
        pools.settle(denied,_quorum(denied));
        _assert(usdc.balanceOf(beneficiary)==0);
        _assert(pools.availableCapital(0)==103000000);
    }

    function testBadVerdictAmountIsRejected() public {
        _lock();
        CovraPools.Decision memory denied=_decision(2,1000000,0,EVIDENCE_ID);
        bytes[] memory deniedSigs = _quorum(denied);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(denied,deniedSigs);
        CovraPools.Decision memory aboveLimit=_decision(1,81000000,0,EVIDENCE_ID);
        bytes[] memory aboveLimitSigs = _quorum(aboveLimit);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(aboveLimit,aboveLimitSigs);
    }

    function testWrongChainOrEvidenceCannotSettle() public {
        _lock();
        CovraPools.Decision memory d=_decision(1,3000000,0,EVIDENCE_ID);
        d.sourceChainId=61999;
        bytes[] memory wrongChainSigs = _quorum(d);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(d,wrongChainSigs);
        d.sourceChainId=4221;
        d.evidenceDigest=EVIDENCE_REVISED;
        bytes[] memory wrongEvidenceSigs = _quorum(d);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(d,wrongEvidenceSigs);
    }

    function testFullyDepletedPoolCannotTransferNewDepositorCapitalToLegacyShares() public {
        CovraPools.Quote memory q = _quote();
        q.limit = 100000000;
        bytes memory qSignature = _signQuote(q);
        vm.prank(insured);
        pools.purchase(q,qSignature);
        vm.prank(underwriter);
        pools.withdraw(0,2912622); // 3 USDC unreserved premium, leaving 100 locked
        _assert(pools.availableCapital(0)==0);
        vm.warp(clock+600);
        vm.prank(insured);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
        CovraPools.Decision memory d=_decision(1,100000000,0,EVIDENCE_ID);
        pools.settle(d,_quorum(d));
        _assert(pools.pool(0).assets==0);
        address fresh=vm.addr(0x999);
        usdc.mint(fresh,100000000);
        vm.prank(fresh);
        usdc.approve(address(pools),type(uint256).max);
        vm.prank(fresh);
        pools.deposit(0,100000000);
        _assert(pools.sharesOf(0,underwriter)==0); // old loss epoch is erased
        _assert(pools.sharesOf(0,fresh)==100000000);
        vm.prank(underwriter);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.withdraw(0,1);
        vm.prank(fresh);
        pools.withdraw(0,100000000);
        _assert(usdc.balanceOf(fresh)==100000000);
    }

    function testEmergencyPauseCannotBlockExistingClaimSettlement() public {
        _lock();
        pools.setPaused(true);
        CovraPools.Decision memory d=_decision(1,3000000,0,EVIDENCE_ID);
        pools.settle(d,_quorum(d));
        _assert(usdc.balanceOf(beneficiary)==3000000);
    }

    function testInsuredExposureDigestMustMatchAttestedSettlement() public {
        _lock();
        CovraPools.Decision memory d=_decision(1,3000000,0,EVIDENCE_ID);
        d.riskSpecHash=keccak256("different exposure");
        bytes[] memory wrongExposureSigs = _quorum(d);
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.settle(d,wrongExposureSigs);
    }

    function testClaimReserveCanBeExtendedOnlyByBoundedIndependentQuorum() public {
        _lock();
        uint64 prior=uint64(pools.claimResolutionDeadline(POLICY_ID));
        uint64 extended=prior+20 days;
        bytes[] memory insufficient=new bytes[](1);
        bytes[] memory valid=_extensionQuorum(prior,extended);
        insufficient[0]=valid[0];
        vm.expectRevert(CovraPools.InvalidAttestation.selector);
        pools.extendClaimResolution(POLICY_ID,extended,insufficient);
        pools.extendClaimResolution(POLICY_ID,extended,valid);
        _assert(pools.claimResolutionDeadline(POLICY_ID)==extended);
        vm.warp(prior+1);
        vm.expectRevert(CovraPools.Expired.selector);
        pools.releaseExpired(POLICY_ID);
        vm.warp(extended+1);
        pools.releaseExpired(POLICY_ID);
    }

    function testClaimAgentPermissionExpiresAndCanBeRevoked() public {
        _purchase();
        address agent=vm.addr(0x5151);
        vm.prank(insured);
        pools.authorizeClaimAgent(agent,uint64(clock+700));
        vm.warp(clock+600);
        vm.prank(agent);
        pools.openClaim(POLICY_ID,CLAIM_ID,EVIDENCE_ID);
        vm.prank(insured);
        pools.authorizeClaimAgent(agent,0);
        vm.prank(agent);
        vm.expectRevert(CovraPools.Unauthorized.selector);
        pools.reviseClaimEvidence(POLICY_ID,EVIDENCE_REVISED);
    }

    function testClaimIdCannotBeLockedAcrossPolicies() public {
        _purchase();
        CovraPools.Quote memory second = _quote();
        second.policyId = keccak256("covra-second-policy");
        second.limit = 1000000;
        second.premium = 1000000;
        bytes memory secondSignature = _signQuote(second);
        vm.prank(insured);
        pools.purchase(second, secondSignature);
        vm.warp(clock+600);
        vm.prank(insured);
        pools.openClaim(POLICY_ID, CLAIM_ID, EVIDENCE_ID);
        vm.prank(insured);
        vm.expectRevert(CovraPools.AlreadyUsed.selector);
        pools.openClaim(second.policyId, CLAIM_ID, EVIDENCE_REVISED);
    }

    function testClaimUsesRosterSnapshotAcrossDelayedReplacement() public {
        _lock();
        address replacement = vm.addr(0xABCD);
        pools.scheduleAttestorReplacement(attestors[0], replacement);
        vm.warp(clock + 600 + 2 days + 1);
        pools.executeAttestorReplacement();
        _assert(pools.attestorForClaim(CLAIM_ID, attestors[0]));
        _assert(!pools.attestorForClaim(CLAIM_ID, replacement));
        CovraPools.Decision memory d = _decision(1, 3000000, 0, EVIDENCE_ID);
        pools.settle(d, _quorum(d));
        _assert(pools.usedClaims(CLAIM_ID));
    }

    function testLegacyAttestorChangeCannotAlterFiveMemberRoster() public {
        vm.expectRevert(CovraPools.InvalidInput.selector);
        pools.scheduleAttestorChange(attestors[0], false);
        _assert(pools.attestorCount() == 5);
    }
}
