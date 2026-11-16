// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CovraPoolsV3} from "../src/CovraPoolsV3.sol";
import {Vm, MockUSDC} from "./CovraPools.t.sol";

interface VmV3 is Vm {
    function etch(address target, bytes calldata code) external;
}

contract CovraPoolsV3Test {
    VmV3 private constant vm = VmV3(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant TOKEN = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    bytes32 private constant PROVIDER = keccak256("provider");
    bytes32 private constant CAUSE = keccak256("root cause");
    bytes32 private constant METHOD = keccak256("approved evidence method");
    bytes32 private constant TERMS = keccak256("v3 terms");
    bytes32 private constant CLAIM = keccak256("claim");
    bytes32 private constant EVIDENCE = keccak256("original evidence");
    uint96 private constant LIMIT = 100e6;
    CovraPoolsV3 private pools;
    MockUSDC private token;
    bytes32 private group;
    bytes32 private secondGroup;

    function setUp() public {
        vm.chainId(84532);
        vm.warp(1_800_000_000);
        vm.etch(TOKEN, address(new MockUSDC()).code);
        token = MockUSDC(TOKEN);
        address[5] memory roster;
        for (uint256 i; i < 5; ++i) roster[i] = vm.addr(i + 1);
        uint128[5] memory classCaps = [uint128(1000e6), 1000e6, 1000e6, 1000e6, 1000e6];
        bytes32[5] memory terms = [TERMS, TERMS, TERMS, TERMS, TERMS];
        CovraPoolsV3.RiskGroup[] memory groups = new CovraPoolsV3.RiskGroup[](2);
        groups[0] = CovraPoolsV3.RiskGroup(PROVIDER, CAUSE, METHOD, 31);
        groups[1] = CovraPoolsV3.RiskGroup(PROVIDER, keccak256("different cause"), METHOD, 31);
        pools = new CovraPoolsV3(TOKEN, vm.addr(99), address(4221), address(55), roster,
            CovraPoolsV3.ExposureCaps(LIMIT, classCaps, 1000e6, 1000e6, 2000e6), terms, groups);
        group = pools.riskGroupId(PROVIDER, CAUSE);
        secondGroup = pools.riskGroupId(PROVIDER, groups[1].commonCauseId);
        token.mint(address(this), 2100e6);
        token.approve(address(pools), type(uint256).max);
        pools.deposit(0, 1000e6);
        pools.deposit(1, 1000e6);
    }

    function _typed(bytes32 hash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", pools.domainSeparator(), hash));
    }

    function _sign(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _quorum(bytes32 digest) private returns (bytes[] memory signatures) {
        uint256[3] memory keys = [uint256(1), 2, 3];
        for (uint256 i; i < 3; ++i)
            for (uint256 j = i + 1; j < 3; ++j)
                if (vm.addr(keys[i]) > vm.addr(keys[j])) (keys[i], keys[j]) = (keys[j], keys[i]);
        signatures = new bytes[](3);
        for (uint256 i; i < 3; ++i) signatures[i] = _sign(keys[i], digest);
    }

    function _openGroup(bytes32 id) private {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        pools.openRiskGroup(id, deadline, _quorum(_typed(keccak256(abi.encode(
            pools.GROUP_TYPEHASH(), id, uint256(1), deadline
        )))));
    }

    function _quote(uint256 nonce, uint8 classId) private view returns (CovraPoolsV3.Quote memory q) {
        q.policyId = bytes32(nonce);
        q.insured = address(this);
        q.beneficiary = address(this);
        q.coverageClass = classId;
        q.premium = 1e6;
        q.limit = LIMIT;
        q.startsAt = uint64(block.timestamp + 20 minutes);
        q.endsAt = q.startsAt + 1 days;
        q.claimDeadline = q.endsAt + 14 days;
        q.termsHash = TERMS;
        q.riskSpecHash = keccak256("frozen subject");
        q.riskGroupId = group;
        q.evidenceMethodHash = METHOD;
        q.nonce = nonce;
        q.quoteDeadline = uint64(block.timestamp + 5 minutes);
    }

    function _quoteSignature(CovraPoolsV3.Quote memory q) private returns (bytes memory) {
        return _sign(99, _typed(keccak256(abi.encode(pools.QUOTE_TYPEHASH(), q))));
    }

    function testGroupStartsClosedAndRetirementKeepsExistingReserve() public {
        CovraPoolsV3.Quote memory q = _quote(1, 0);
        bytes memory signature = _quoteSignature(q);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.purchase(q, signature);
        _openGroup(group);
        pools.purchase(q, signature);
        pools.retireRiskGroup(group);
        require(pools.portfolioExposure() == LIMIT && !pools.groupOpened(group));
        vm.warp(q.claimDeadline + 1);
        pools.releaseExpired(q.policyId);
        require(pools.portfolioExposure() == 0 && pools.commonCauseExposure(CAUSE) == 0);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.releaseExpired(q.policyId);
    }

    function testProviderCapAcrossClassesGroupsAndWallets() public {
        _openGroup(group);
        _openGroup(secondGroup);
        for (uint256 i = 1; i <= 11; ++i) {
            CovraPoolsV3.Quote memory q = _quote(i, uint8(i % 2));
            q.insured = address(uint160(1000 + i));
            q.beneficiary = q.insured;
            if (i % 2 == 0) q.riskGroupId = secondGroup;
            token.mint(q.insured, q.premium);
            vm.prank(q.insured);
            token.approve(address(pools), q.premium);
            bytes memory signature = _quoteSignature(q);
            if (i == 11) vm.expectRevert(CovraPoolsV3.NotEnoughCapacity.selector);
            vm.prank(q.insured);
            pools.purchase(q, signature);
        }
        require(pools.providerExposure(PROVIDER) == 1000e6);
        require(pools.portfolioExposure() == pools.pool(0).reserved + pools.pool(1).reserved);
        vm.expectRevert(CovraPoolsV3.NotEnoughAvailableLiquidity.selector);
        pools.withdraw(0, 1000e6);
    }

    function _claim() private returns (CovraPoolsV3.Quote memory q) {
        _openGroup(group);
        q = _quote(1, 1);
        pools.purchase(q, _quoteSignature(q));
        vm.warp(q.startsAt);
        pools.openClaim(q.policyId, CLAIM, EVIDENCE);
    }

    function _decision(CovraPoolsV3.Quote memory q) private view returns (CovraPoolsV3.Decision memory d) {
        d.policyId = q.policyId;
        d.claimId = CLAIM;
        d.bradburyDecisionId = CLAIM;
        d.genlayerTxId = keccak256("finalized transaction");
        d.evidenceDigest = EVIDENCE;
        d.resultDigest = keccak256("finalized result");
        d.termsHash = TERMS;
        d.riskSpecHash = q.riskSpecHash;
        d.recipient = q.beneficiary;
        d.coverageClass = q.coverageClass;
        d.verdict = 3;
        d.decidedAt = q.startsAt;
        d.cureDeadline = q.startsAt + 7 days;
        d.finalizedAt = uint64(block.timestamp);
        d.deadline = uint64(block.timestamp + 1 hours);
        d.sourceChainId = 4221;
        d.adjudicator = address(4221);
        d.rosterVersion = 1;
    }

    function _certificate(CovraPoolsV3.Decision memory d) private returns (bytes[] memory) {
        return _quorum(_typed(keccak256(abi.encode(pools.DECISION_TYPEHASH(), d))));
    }

    function testUnprovenClosureRequiresElapsedCureAndDistinctQuorum() public {
        CovraPoolsV3.Quote memory q = _claim();
        vm.warp(q.startsAt + 7 days);
        CovraPoolsV3.Decision memory d = _decision(q);
        bytes[] memory signatures = _certificate(d);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.settle(d, signatures);
        vm.warp(block.timestamp + 1);
        d = _decision(q);
        signatures = _certificate(d);
        signatures[1] = signatures[0];
        vm.expectRevert(CovraPoolsV3.InvalidAttestation.selector);
        pools.settle(d, signatures);
        signatures = _certificate(d);
        pools.settle(d, signatures);
        (,,, uint8 state,,,,,,) = pools.policies(q.policyId);
        require(state == 5 && pools.pool(1).reserved == 0 && pools.pool(1).paid == 0);
        require(pools.portfolioExposure() == 0 && pools.providerExposure(PROVIDER) == 0);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.settle(d, signatures);
    }

    function testCureInvalidatesStaleEvidenceAndCannotRepeat() public {
        CovraPoolsV3.Quote memory q = _claim();
        CovraPoolsV3.EvidenceRevision memory revision = CovraPoolsV3.EvidenceRevision(
            q.policyId, CLAIM, EVIDENCE, keccak256("new evidence"), 1, 1, q.startsAt, q.startsAt + 7 days, 1
        );
        bytes[] memory signatures = _quorum(_typed(keccak256(abi.encode(pools.REVISION_TYPEHASH(), revision))));
        pools.reviseClaimEvidence(revision, signatures);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.reviseClaimEvidence(revision, signatures);
        vm.warp(q.startsAt + 7 days + 1);
        CovraPoolsV3.Decision memory d = _decision(q);
        signatures = _certificate(d);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.settle(d, signatures);
        require(pools.portfolioExposure() == LIMIT);
    }

    function testDenialChecksFinalityBindingAndPreservesAssets() public {
        CovraPoolsV3.Quote memory q = _claim();
        vm.warp(q.startsAt + 72 hours - 1);
        CovraPoolsV3.Decision memory d = _decision(q);
        d.verdict = 2;
        d.cureDeadline = 0;
        bytes[] memory signatures = _certificate(d);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.settle(d, signatures);

        vm.warp(block.timestamp + 1);
        d.finalizedAt = uint64(block.timestamp);
        d.recipient = address(1234);
        signatures = _certificate(d);
        vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
        pools.settle(d, signatures);

        d.recipient = q.beneficiary;
        signatures = _certificate(d);
        uint256 balanceBefore = token.balanceOf(address(pools));
        pools.settle(d, signatures);
        (,,, uint8 state,,,,,,) = pools.policies(q.policyId);
        require(state == 4 && token.balanceOf(address(pools)) == balanceBefore);
        require(pools.portfolioExposure() == 0);
    }

    function testLockedClaimExpiresOnlyAfterBoundedResolutionDeadline() public {
        CovraPoolsV3.Quote memory q = _claim();
        uint256 deadline = pools.claimResolutionDeadline(q.policyId);
        vm.warp(deadline);
        vm.expectRevert(CovraPoolsV3.Expired.selector);
        pools.releaseExpired(q.policyId);
        vm.warp(deadline + 1);
        pools.releaseExpired(q.policyId);
        require(pools.pool(1).reserved == 0 && pools.portfolioExposure() == 0);
        require(pools.providerExposure(PROVIDER) == 0 && pools.commonCauseExposure(CAUSE) == 0);
        pools.withdraw(1, 1000e6);
        require(pools.pool(1).assets == 0);
    }

    function testFuzzValidatedPayoutAndReserveConservation(uint32 secondsObserved) public {
        secondsObserved %= 1 days + 1;
        CovraPoolsV3.Quote memory q = _claim();
        vm.warp(q.startsAt + 72 hours + 1);
        CovraPoolsV3.Decision memory d = _decision(q);
        d.cureDeadline = 0;
        d.verdict = 1;
        d.observedSeconds = secondsObserved;
        d.amount = secondsObserved < 1800 ? 0 : secondsObserved < 3600 ? LIMIT / 4 :
            secondsObserved < 7200 ? LIMIT / 2 : LIMIT;
        uint256 assetsBefore = pools.pool(1).assets;
        uint256 beneficiaryBefore = token.balanceOf(q.beneficiary);
        bytes[] memory signatures = _certificate(d);
        if (d.amount == 0) {
            vm.expectRevert(CovraPoolsV3.InvalidInput.selector);
            pools.settle(d, signatures);
            require(pools.portfolioExposure() == LIMIT);
        } else {
            pools.settle(d, signatures);
            require(pools.pool(1).assets == assetsBefore - d.amount);
            require(token.balanceOf(q.beneficiary) == beneficiaryBefore + d.amount);
            require(pools.portfolioExposure() == 0);
        }
    }
}
