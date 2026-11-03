// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CovraPools
 * @notice Ring-fenced USDC coverage pools and independently attested claim settlement.
 * @dev TESTNET IMPLEMENTATION. Not audited, licensed, or approved for real customer funds.
 *      GenLayer does not directly custody or transfer Base USDC.
 */
contract CovraPools {
    error Unauthorized();
    error InvalidInput();
    error InvalidSignature();
    error InvalidAttestation();
    error NotEnoughCapacity();
    error NotEnoughAvailableLiquidity();
    error AlreadyUsed();
    error Expired();
    error Paused();
    error TransferFailed();

    event CapitalDeposited(uint8 indexed coverageClass, address indexed underwriter, uint256 usdcAmount, uint256 shares);
    event CapitalWithdrawn(uint8 indexed coverageClass, address indexed underwriter, uint256 usdcAmount, uint256 shares);
    event PoolRecapitalized(uint8 indexed coverageClass, uint64 newEpoch, uint256 writtenOffShares);
    event AgentAuthorized(address indexed owner, address indexed agent, uint96 maximumPremium, uint64 expiresAt);
    event AgentRevoked(address indexed owner, address indexed agent);
    event ClaimAgentAuthorized(address indexed owner, address indexed agent, uint64 expiresAt);
    event PolicyPurchased(
        bytes32 indexed policyId, address indexed insured, address indexed beneficiary,
        uint8 coverageClass, uint96 premium, uint96 limit, uint64 startsAt,
        uint64 endsAt, uint64 claimDeadline, bytes32 termsHash, bytes32 riskSpecHash
    );
    event PolicyExpired(bytes32 indexed policyId, uint96 releasedReserve);
    event ClaimLocked(bytes32 indexed policyId, bytes32 indexed claimId, bytes32 evidenceDigest, uint64 openedAt);
    event ClaimEvidenceRevised(bytes32 indexed policyId, bytes32 indexed claimId, bytes32 evidenceDigest, uint8 revision);
    event ClaimResolutionExtended(bytes32 indexed policyId, bytes32 indexed claimId, uint64 previousDeadline, uint64 newDeadline);
    event ClaimDenied(bytes32 indexed policyId, bytes32 indexed claimId, bytes32 indexed bradburyDecisionId, bytes32 resultDigest);
    event ClaimSettled(
        bytes32 indexed policyId, bytes32 indexed claimId, bytes32 indexed bradburyDecisionId,
        address beneficiary, uint96 amount, bytes32 genlayerTxId
    );
    event QuoteSignerChanged(address indexed previous, address indexed current);
    event PausedStateChanged(bool isPaused);
    event AttestorChangeScheduled(address indexed signer, bool enabled, uint256 effectiveAt);
    event AttestorChanged(address indexed signer, bool enabled);
    event AttestorReplacementScheduled(address indexed previousSigner, address indexed replacementSigner, uint256 effectiveAt);
    event AttestorRosterVersionChanged(uint256 indexed version, address indexed removedSigner, address indexed addedSigner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    struct Pool {
        uint128 assets;           // 6 decimal USDC, current accounted pool assets
        uint128 reserved;         // Max claim liabilities still open
        uint128 premiumsWritten;  // Lifetime premium intake
        uint128 paid;             // Lifetime settled claims
        uint256 totalShares;      // Nontransferable pro-rata LP accounting
    }
    struct Policy {
        address insured;
        address beneficiary;
        uint8 coverageClass;
        uint8 state; // 0 missing, 1 active, 2 settled-paid, 3 expired, 4 denied-final
        uint96 limit;
        uint64 startsAt;
        uint64 endsAt;
        uint64 claimDeadline;
        bytes32 termsHash;
        bytes32 riskSpecHash;
    }
    struct Quote {
        bytes32 policyId;
        address insured;
        address beneficiary;
        uint8 coverageClass;
        uint96 premium;
        uint96 limit;
        uint64 startsAt;
        uint64 endsAt;
        uint64 claimDeadline;
        bytes32 termsHash;
        bytes32 riskSpecHash;
        uint256 nonce;
        uint64 quoteDeadline;
    }
    struct Decision {
        bytes32 policyId;
        bytes32 claimId;
        bytes32 bradburyDecisionId;
        bytes32 genlayerTxId;
        bytes32 evidenceDigest;
        bytes32 resultDigest;
        bytes32 termsHash;
        bytes32 riskSpecHash;
        address recipient;
        uint96 amount;
        uint8 coverageClass;
        uint8 verdict; // 1 COVERED, 2 NOT_COVERED. Insufficient evidence may not settle.
        uint8 revision;
        uint64 finalizedAt;
        uint64 deadline;
        uint256 sourceChainId;
        address adjudicator;
    }
    struct ClaimLock {
        bytes32 claimId;
        bytes32 evidenceDigest;
        uint64 openedAt;
        uint8 revision;
        uint256 attestorRosterVersion;
    }
    struct AgentPermission {
        uint96 maxPremium;
        uint96 usedPremium;
        uint64 expiresAt;
        bool enabled;
    }

    uint256 public constant SOURCE_BRADBURY_CHAIN_ID = 4221;
    uint256 public constant ATTESTOR_CHANGE_DELAY = 2 days;
    uint256 public constant CLAIM_SETTLEMENT_GRACE = 45 days;
    uint256 public constant MAX_EXTENSION = 60 days;
    uint8 public constant ATTESTATION_QUORUM = 3;
    uint8 public constant ATTESTOR_ROSTER_SIZE = 5;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant QUOTE_TYPEHASH =
        keccak256(
            "Quote(bytes32 policyId,address insured,address beneficiary,uint8 coverageClass,uint96 premium,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash,uint256 nonce,uint64 quoteDeadline)"
        );
    bytes32 public constant DECISION_TYPEHASH =
        keccak256(
            "Decision(bytes32 policyId,bytes32 claimId,bytes32 bradburyDecisionId,bytes32 genlayerTxId,bytes32 evidenceDigest,bytes32 resultDigest,bytes32 termsHash,bytes32 riskSpecHash,address recipient,uint96 amount,uint8 coverageClass,uint8 verdict,uint8 revision,uint64 finalizedAt,uint64 deadline,uint256 sourceChainId,address adjudicator)"
        );
    bytes32 public constant EXTENSION_TYPEHASH = keccak256(
        "ClaimExtension(bytes32 policyId,bytes32 claimId,uint64 previousDeadline,uint64 newDeadline)"
    );

    address public immutable usdc;
    address public immutable bradburyAdjudicator;
    address public immutable evidenceIssuer;
    address public immutable deploymentAuthority;
    address public owner;
    address public pendingOwner;
    address public quoteSigner;
    bool public paused;

    Pool[5] private _pools;
    mapping(uint8 => mapping(address => uint256)) private _sharesOf;
    mapping(uint8 => mapping(address => uint64)) private _shareEpochOf;
    mapping(uint8 => uint64) public poolEpoch;
    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => bool) public usedPolicyIds;
    mapping(bytes32 => bool) public usedClaims;
    mapping(bytes32 => bytes32) public claimPolicyOf;
    mapping(bytes32 => ClaimLock) public claimLockOf;
    mapping(bytes32 => uint64) public claimExtendedUntil;
    mapping(address => mapping(address => AgentPermission)) public agentPermissions;
    mapping(address => mapping(address => uint64)) public claimAgents;
    mapping(address => bool) public attestor;
    mapping(address => bool) private _hasBeenAttestor;
    uint8 public attestorCount;
    uint256 public attestorRosterVersion;

    mapping(uint256 => mapping(address => bool)) private _attestorInRosterVersion;
    address[5] private _attestorRoster;
    address public pendingAttestorReplacement;
    address public pendingAttestorRemoval;
    uint256 public pendingAttestorReplacementAt;

    mapping(address => uint256) public attestorChangeAt;
    mapping(address => bool) public pendingAttestorState;

    uint256 private _entered = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    modifier nonReentrant() {
        if (_entered != 1) revert InvalidInput();
        _entered = 2;
        _;
        _entered = 1;
    }
    modifier whenActive() {
        if (paused) revert Paused();
        _;
    }

    constructor(
        address usdc_,
        address quoteSigner_,
        address adjudicator_,
        address evidenceIssuer_,
        address[5] memory initialAttestors,
        uint256 expectedChainId
    ) {
        if (
            block.chainid != expectedChainId ||
            usdc_ == address(0) ||
            quoteSigner_ == address(0) ||
            quoteSigner_ == msg.sender ||
            adjudicator_ == address(0) ||
            evidenceIssuer_ == address(0) ||
            evidenceIssuer_ == msg.sender ||
            evidenceIssuer_ == quoteSigner_
        ) revert InvalidInput();
        usdc = usdc_;
        quoteSigner = quoteSigner_;
        bradburyAdjudicator = adjudicator_;
        evidenceIssuer = evidenceIssuer_;
        deploymentAuthority = msg.sender;
        owner = msg.sender;
        attestorRosterVersion = 1;
        for (uint8 i; i < ATTESTOR_ROSTER_SIZE; ++i) {
            address signer = initialAttestors[i];
            if (
                signer == address(0) || signer == msg.sender || signer == quoteSigner_ ||
                signer == evidenceIssuer_ || attestor[signer]
            ) revert InvalidInput();
            attestor[signer] = true;
            _hasBeenAttestor[signer] = true;
            _attestorRoster[i] = signer;
            _attestorInRosterVersion[attestorRosterVersion][signer] = true;
        }
        attestorCount = ATTESTOR_ROSTER_SIZE;
    }

    function pool(uint8 classId) external view returns (Pool memory) {
        _checkClass(classId);
        return _pools[classId];
    }

    function availableCapital(uint8 classId) public view returns (uint256) {
        _checkClass(classId);
        Pool storage p = _pools[classId];
        return uint256(p.assets) - uint256(p.reserved);
    }

    /// @notice Previous epochs never own any capital deposited after a full loss.
    function sharesOf(uint8 classId, address depositor) public view returns (uint256) {
        return _shareEpochOf[classId][depositor] == poolEpoch[classId]
            ? _sharesOf[classId][depositor] : 0;
    }

    function deposit(uint8 classId, uint128 amount) external nonReentrant whenActive {
        _checkClass(classId);
        if (amount == 0) revert InvalidInput();
        Pool storage p = _pools[classId];
        if (p.assets == 0 && p.totalShares != 0) {
            uint256 writtenOff = p.totalShares;
            p.totalShares = 0;
            ++poolEpoch[classId];
            emit PoolRecapitalized(classId, poolEpoch[classId], writtenOff);
        }
        uint256 shares = p.totalShares == 0
            ? uint256(amount)
            : (uint256(amount) * p.totalShares) / uint256(p.assets);
        if (shares == 0) revert InvalidInput();
        uint256 beforeBalance = _balanceOf(address(this));
        _transferFrom(msg.sender, address(this), amount);
        if (_balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
        p.assets += amount;
        p.totalShares += shares;
        if (_shareEpochOf[classId][msg.sender] != poolEpoch[classId]) {
            _sharesOf[classId][msg.sender] = 0;
            _shareEpochOf[classId][msg.sender] = poolEpoch[classId];
        }
        _sharesOf[classId][msg.sender] += shares;
        emit CapitalDeposited(classId, msg.sender, amount, shares);
    }

    function withdraw(uint8 classId, uint256 shares) external nonReentrant {
        _checkClass(classId);
        Pool storage p = _pools[classId];
        if (shares == 0 || shares > sharesOf(classId,msg.sender) || p.totalShares == 0) revert InvalidInput();
        uint256 amount = (shares * uint256(p.assets)) / p.totalShares;
        if (amount == 0 || amount > availableCapital(classId)) revert NotEnoughAvailableLiquidity();
        _sharesOf[classId][msg.sender] -= shares;
        p.totalShares -= shares;
        p.assets -= uint128(amount);
        _transfer(msg.sender, amount);
        emit CapitalWithdrawn(classId, msg.sender, amount, shares);
    }

    function authorizeAgent(address agent, uint96 maxPremium, uint64 expiresAt) external {
        if (agent == address(0) || agent == msg.sender || maxPremium == 0 || expiresAt <= block.timestamp) {
            revert InvalidInput();
        }
        agentPermissions[msg.sender][agent] = AgentPermission(maxPremium, 0, expiresAt, true);
        emit AgentAuthorized(msg.sender, agent, maxPremium, expiresAt);
    }

    function revokeAgent(address agent) external {
        delete agentPermissions[msg.sender][agent];
        emit AgentRevoked(msg.sender, agent);
    }

    function authorizeClaimAgent(address agent, uint64 expiresAt) external {
        if (agent == address(0) || agent == msg.sender) revert InvalidInput();
        if (expiresAt != 0 && (expiresAt <= block.timestamp || expiresAt > block.timestamp + 365 days))
            revert InvalidInput();
        claimAgents[msg.sender][agent] = expiresAt;
        emit ClaimAgentAuthorized(msg.sender,agent,expiresAt);
    }

    function purchase(Quote calldata q, bytes calldata signature) external nonReentrant whenActive {
        _checkClass(q.coverageClass);
        if (
            q.insured == address(0) || q.beneficiary == address(0) ||
            q.policyId == bytes32(0) || q.termsHash == bytes32(0) || q.riskSpecHash == bytes32(0) ||
            q.premium == 0 || q.limit == 0 ||
            q.quoteDeadline < block.timestamp ||
            q.startsAt < block.timestamp ||
            q.startsAt > block.timestamp + 1 hours ||
            q.endsAt <= q.startsAt ||
            q.endsAt > q.startsAt + 365 days ||
            q.claimDeadline < q.endsAt ||
            q.claimDeadline > q.endsAt + 90 days
        ) revert InvalidInput();
        if (usedPolicyIds[q.policyId]) revert AlreadyUsed();
        if (_recover(_hashTypedData(_hashQuote(q)), signature) != quoteSigner) revert InvalidSignature();

        if (msg.sender != q.insured) {
            // The insured's premium allowance never authorizes an agent to
            // redirect claim proceeds. An owner can purchase directly with an
            // explicitly chosen third-party beneficiary.
            if (q.beneficiary != q.insured) revert Unauthorized();
            AgentPermission storage permission = agentPermissions[q.insured][msg.sender];
            if (!permission.enabled || permission.expiresAt < block.timestamp) revert Unauthorized();
            if (uint256(permission.usedPremium) + q.premium > permission.maxPremium) revert Unauthorized();
            permission.usedPremium += q.premium;
        }

        Pool storage p = _pools[q.coverageClass];
        if (uint256(p.assets) + q.premium < uint256(p.reserved) + q.limit) revert NotEnoughCapacity();
        uint256 beforeBalance = _balanceOf(address(this));
        _transferFrom(msg.sender, address(this), q.premium);
        if (_balanceOf(address(this)) != beforeBalance + q.premium) revert TransferFailed();

        usedPolicyIds[q.policyId] = true;
        p.assets += uint128(q.premium);
        p.premiumsWritten += uint128(q.premium);
        p.reserved += uint128(q.limit);
        policies[q.policyId] = Policy({
            insured: q.insured, beneficiary: q.beneficiary, coverageClass: q.coverageClass,
            state: 1, limit: q.limit, startsAt: q.startsAt, endsAt: q.endsAt,
            claimDeadline: q.claimDeadline, termsHash: q.termsHash, riskSpecHash: q.riskSpecHash
        });
        emit PolicyPurchased(
            q.policyId, q.insured, q.beneficiary, q.coverageClass, q.premium, q.limit,
            q.startsAt, q.endsAt, q.claimDeadline, q.termsHash, q.riskSpecHash
        );
    }

    /**
     * @notice Freeze an owner's timely claim into the same Base reserve ledger.
     * @dev Validators/attestors must verify event occurrence, evidence and the actual
     *      Bradbury case separately; this function establishes claimant authorization.
     */
    function openClaim(bytes32 policyId, bytes32 claimId, bytes32 evidenceDigest) external whenActive {
        Policy storage p = policies[policyId];
        if (p.state != 1 || (msg.sender != p.insured && claimAgents[p.insured][msg.sender] <= block.timestamp)) revert Unauthorized();
        if (block.timestamp < p.startsAt || block.timestamp > p.claimDeadline) revert Expired();
        if (claimId == bytes32(0) || evidenceDigest == bytes32(0)) revert InvalidInput();
        if (claimLockOf[policyId].claimId != bytes32(0) || usedClaims[claimId] || claimPolicyOf[claimId] != bytes32(0)) {
            revert AlreadyUsed();
        }
        claimPolicyOf[claimId] = policyId;
        claimLockOf[policyId] = ClaimLock(claimId, evidenceDigest, uint64(block.timestamp), 0, attestorRosterVersion);
        emit ClaimLocked(policyId, claimId, evidenceDigest, uint64(block.timestamp));
    }

    /**
     * @notice One evidence revision for the single permitted appeal.
     * @dev Changes invalidate previously signed settlement statements.
     */
    function reviseClaimEvidence(bytes32 policyId, bytes32 replacementDigest) external whenActive {
        Policy storage p = policies[policyId];
        ClaimLock storage locked = claimLockOf[policyId];
        if (p.state != 1 || (msg.sender != p.insured && claimAgents[p.insured][msg.sender] <= block.timestamp)) revert Unauthorized();
        if (locked.claimId == bytes32(0) || locked.revision != 0 ||
            replacementDigest == bytes32(0) || replacementDigest == locked.evidenceDigest ||
            block.timestamp > claimResolutionDeadline(policyId)) revert InvalidInput();
        locked.evidenceDigest = replacementDigest;
        locked.revision = 1;
        emit ClaimEvidenceRevised(policyId, locked.claimId, replacementDigest, 1);
    }

    function claimResolutionDeadline(bytes32 policyId) public view returns (uint256) {
        uint256 original=uint256(policies[policyId].claimDeadline)+CLAIM_SETTLEMENT_GRACE;
        uint256 extended=claimExtendedUntil[policyId];
        return extended>original?extended:original;
    }

    /// @dev A 3/5 independent quorum can protect a timely claim during a
    ///      validator/issuer outage. Extensions cannot exceed a firm 105-day cap.
    function extendClaimResolution(bytes32 policyId, uint64 newDeadline, bytes[] calldata signatures) external {
        Policy storage policy_=policies[policyId];
        ClaimLock storage locked=claimLockOf[policyId];
        if (policy_.state!=1||locked.claimId==bytes32(0)) revert InvalidInput();
        uint256 previous=claimResolutionDeadline(policyId);
        if (block.timestamp>previous||newDeadline<=previous||
            newDeadline>previous+30 days||
            newDeadline>uint256(policy_.claimDeadline)+CLAIM_SETTLEMENT_GRACE+MAX_EXTENSION) revert InvalidInput();
        if (signatures.length<ATTESTATION_QUORUM||signatures.length>attestorCount) revert InvalidAttestation();
        bytes32 digest=_hashTypedData(keccak256(abi.encode(
            EXTENSION_TYPEHASH,policyId,locked.claimId,uint64(previous),newDeadline
        )));
        address previousSigner;
        for (uint256 i;i<signatures.length;++i) {
            address signer=_recover(digest,signatures[i]);
            if (!_attestorInRosterVersion[locked.attestorRosterVersion][signer]||signer<=previousSigner) {
                revert InvalidAttestation();
            }
            previousSigner=signer;
        }
        claimExtendedUntil[policyId]=newDeadline;
        emit ClaimResolutionExtended(policyId,locked.claimId,uint64(previous),newDeadline);
    }

    function releaseExpired(bytes32 policyId) external {
        Policy storage policy_ = policies[policyId];
        if (policy_.state != 1) revert InvalidInput();
        if (block.timestamp <= policy_.claimDeadline) revert Expired();
        // A timely filed claim retains its reserved collateral for a bounded
        // settlement/appeal window. An unresolved claim cannot lock funds forever.
        if (claimLockOf[policyId].claimId != bytes32(0) &&
            block.timestamp <= claimResolutionDeadline(policyId)) revert Expired();
        policy_.state = 3;
        _pools[policy_.coverageClass].reserved -= uint128(policy_.limit);
        emit PolicyExpired(policyId, policy_.limit);
    }

    /**
     * @dev The signers must independently verify finalized Bradbury transaction/state,
     *      the specific Base policy and claim evidence. On-chain this is a THRESHOLD
     *      ATTESTATION TRUST MODEL, not a native GenLayer-to-Base light-client proof.
     */
    // Emergency pausing new exposure cannot remove an already covered claimant's right to settle.
    function settle(Decision calldata d, bytes[] calldata signatures) external nonReentrant {
        Policy storage policy_ = policies[d.policyId];
        ClaimLock storage locked = claimLockOf[d.policyId];
        if (policy_.state != 1 || d.sourceChainId != SOURCE_BRADBURY_CHAIN_ID ||
            locked.claimId == bytes32(0)) revert InvalidInput();
        if (
            d.adjudicator != bradburyAdjudicator || d.claimId != locked.claimId ||
            d.evidenceDigest != locked.evidenceDigest || d.revision != locked.revision ||
            d.termsHash != policy_.termsHash || d.riskSpecHash != policy_.riskSpecHash ||
            d.coverageClass != policy_.coverageClass ||
            d.bradburyDecisionId == bytes32(0) || d.genlayerTxId == bytes32(0) ||
            d.resultDigest == bytes32(0) ||
            (d.verdict != 1 && d.verdict != 2) ||
            (d.verdict == 1 && (d.amount == 0 || d.amount > policy_.limit)) ||
            (d.verdict == 2 && d.amount != 0) ||
            d.recipient != policy_.beneficiary ||
            d.finalizedAt < locked.openedAt ||
            d.finalizedAt > block.timestamp ||
            d.deadline < block.timestamp ||
            d.deadline > claimResolutionDeadline(d.policyId)
        ) revert InvalidInput();
        if (usedClaims[d.claimId] || claimPolicyOf[d.claimId] != d.policyId) revert AlreadyUsed();
        if (signatures.length < ATTESTATION_QUORUM || signatures.length > attestorCount) {
            revert InvalidAttestation();
        }
        bytes32 digest = _hashTypedData(_hashDecision(d));
        address previous;
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = _recover(digest, signatures[i]);
            if (!_attestorInRosterVersion[locked.attestorRosterVersion][signer] || signer <= previous) {
                revert InvalidAttestation();
            }
            previous = signer; // Strictly ascending: duplicates impossible
        }
        Pool storage p = _pools[policy_.coverageClass];
        if (d.verdict == 1 && p.assets < d.amount) revert NotEnoughAvailableLiquidity();
        usedClaims[d.claimId] = true;
        policy_.state = d.verdict == 1 ? 2 : 4;
        p.reserved -= uint128(policy_.limit);
        if (d.verdict == 1) {
            p.assets -= uint128(d.amount);
            p.paid += uint128(d.amount);
            _transfer(d.recipient, d.amount);
            emit ClaimSettled(d.policyId, d.claimId, d.bradburyDecisionId, d.recipient, d.amount, d.genlayerTxId);
        } else {
            emit ClaimDenied(d.policyId, d.claimId, d.bradburyDecisionId, d.resultDigest);
        }
    }

    function scheduleAttestorChange(address signer, bool enabled) external view onlyOwner {
        // Retained as an explicit compatibility surface, but arbitrary enable/
        // disable would make a live claim's signer set ambiguous. Use the
        // delayed replacement path below, which preserves exactly five members
        // and snapshots the roster version for each claim.
        signer;
        enabled;
        revert InvalidInput();
    }

    function executeAttestorChange(address signer) external pure {
        signer;
        revert InvalidInput();
    }

    function scheduleAttestorReplacement(address previousSigner, address replacementSigner) external onlyOwner {
        if (
            previousSigner == address(0) || replacementSigner == address(0) ||
            previousSigner == replacementSigner || !attestor[previousSigner] || attestor[replacementSigner] ||
            replacementSigner == owner || replacementSigner == pendingOwner ||
            replacementSigner == deploymentAuthority || replacementSigner == quoteSigner ||
            replacementSigner == evidenceIssuer ||
            pendingAttestorReplacementAt != 0
        ) revert InvalidInput();
        pendingAttestorRemoval = previousSigner;
        pendingAttestorReplacement = replacementSigner;
        pendingAttestorReplacementAt = block.timestamp + ATTESTOR_CHANGE_DELAY;
        emit AttestorReplacementScheduled(previousSigner, replacementSigner, pendingAttestorReplacementAt);
    }

    function executeAttestorReplacement() external {
        uint256 effectiveAt = pendingAttestorReplacementAt;
        address previousSigner = pendingAttestorRemoval;
        address replacementSigner = pendingAttestorReplacement;
        if (
            effectiveAt == 0 || block.timestamp < effectiveAt ||
            !attestor[previousSigner] || attestor[replacementSigner] ||
            replacementSigner == owner || replacementSigner == pendingOwner ||
            replacementSigner == deploymentAuthority || replacementSigner == quoteSigner ||
            replacementSigner == evidenceIssuer
        ) revert InvalidInput();

        uint256 nextVersion = attestorRosterVersion + 1;
        for (uint8 i; i < ATTESTOR_ROSTER_SIZE; ++i) {
            address signer = _attestorRoster[i];
            if (signer == previousSigner) signer = replacementSigner;
            _attestorRoster[i] = signer;
            _attestorInRosterVersion[nextVersion][signer] = true;
        }
        attestor[previousSigner] = false;
        attestor[replacementSigner] = true;
        _hasBeenAttestor[replacementSigner] = true;
        attestorRosterVersion = nextVersion;
        attestorCount = ATTESTOR_ROSTER_SIZE;
        delete pendingAttestorRemoval;
        delete pendingAttestorReplacement;
        delete pendingAttestorReplacementAt;
        emit AttestorChanged(previousSigner, false);
        emit AttestorChanged(replacementSigner, true);
        emit AttestorRosterVersionChanged(nextVersion, previousSigner, replacementSigner);
    }

    function attestorAt(uint8 index) external view returns (address) {
        if (index >= ATTESTOR_ROSTER_SIZE) revert InvalidInput();
        return _attestorRoster[index];
    }

    function attestorForClaim(bytes32 claimId, address signer) external view returns (bool) {
        bytes32 policyId = claimPolicyOf[claimId];
        if (policyId == bytes32(0)) return false;
        return _attestorInRosterVersion[claimLockOf[policyId].attestorRosterVersion][signer];
    }

    function setQuoteSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0) || newSigner == owner || newSigner == pendingOwner ||
            newSigner == deploymentAuthority || newSigner == evidenceIssuer ||
            newSigner == pendingAttestorReplacement || _hasBeenAttestor[newSigner]) revert InvalidInput();
        emit QuoteSignerChanged(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedStateChanged(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0) || newOwner == quoteSigner || newOwner == evidenceIssuer ||
            newOwner == pendingAttestorReplacement || _hasBeenAttestor[newOwner]) revert InvalidInput();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        if (msg.sender == quoteSigner || msg.sender == evidenceIssuer ||
            msg.sender == pendingAttestorReplacement || _hasBeenAttestor[msg.sender]) revert InvalidInput();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    function domainSeparator() external view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("COVRA"), keccak256("1"), block.chainid, address(this)));
    }

    function _hashQuote(Quote calldata q) private pure returns (bytes32) {
        return keccak256(abi.encode(
            QUOTE_TYPEHASH, q.policyId, q.insured, q.beneficiary, q.coverageClass,
            q.premium, q.limit, q.startsAt, q.endsAt, q.claimDeadline, q.termsHash, q.riskSpecHash,
            q.nonce, q.quoteDeadline
        ));
    }
    function _hashDecision(Decision calldata d) private pure returns (bytes32) {
        return keccak256(abi.encode(
            DECISION_TYPEHASH, d.policyId, d.claimId, d.bradburyDecisionId,
            d.genlayerTxId, d.evidenceDigest, d.resultDigest, d.termsHash, d.riskSpecHash,
            d.recipient, d.amount, d.coverageClass, d.verdict, d.revision,
            d.finalizedAt, d.deadline,
            d.sourceChainId, d.adjudicator
        ));
    }
    function _hashTypedData(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("COVRA"), keccak256("1"), block.chainid, address(this))),
            structHash
        ));
    }
    function _recover(bytes32 digest, bytes memory signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER || v < 27 || v > 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function _checkClass(uint8 classId) private pure {
        if (classId >= 5) revert InvalidInput();
    }
    function _balanceOf(address holder) private view returns (uint256 balance) {
        (bool ok, bytes memory data) = usdc.staticcall(abi.encodeWithSignature("balanceOf(address)", holder));
        if (!ok || data.length != 32) revert TransferFailed();
        balance = abi.decode(data, (uint256));
    }
    function _transferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            usdc.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
        if (!ok || (data.length > 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
    }
    function _transfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = usdc.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (data.length > 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
    }
}
