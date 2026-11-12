"""Direct Mode tests using the installed gltest runner.

These tests load the actual Intelligent Contract and do not replace GenVM with
the host-side shim used by test_adjudicator_logic.py.
"""

import pytest
import os
import hashlib
import json
import tempfile
import sys
from pathlib import Path
from datetime import datetime, timezone
from gltest.direct import loader
from gltest.direct import sdk_loader


def _verified_manager_sdk(contract_path=None, version=None):
    root = Path(__file__).resolve().parents[2] / ".runtime"
    archive = root / "genvm-universal.tar.xz"
    if not archive.exists() or hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() != "d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af":
        raise RuntimeError("Run scripts/prepare-genvm-runtime.py with the official Manager rc10 bundle")
    dependencies = sdk_loader.parse_contract_header(Path(contract_path))
    paths = []
    visited = set()
    def include(family, digest):
        if (family, digest) in visited:
            return
        visited.add((family, digest))
        folder = root / "manager-rc10" / family / digest
        if not folder.is_dir():
            raise RuntimeError("Missing exact runtime dependency: " + family + ":" + digest)
        paths.append(folder)
        for dep_family, dep_digest in sdk_loader.parse_runner_manifest(folder).items():
            include(dep_family, dep_digest)
    for family, digest in dependencies.items():
        include(family, digest)
    for folder in paths:
        sys.path.insert(0, str(folder / "src" if (folder / "src").exists() else folder))
    return paths


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value):
    return "0x" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _case_inputs(
    direct_owner,
    complete_facts=True,
    nonce="00000000-0000-0000-0000-000000000001",
):
    insured = "0x" + direct_owner.hex()
    case_id = _digest("COVRA-CLAIM:" + insured + ":" + nonce)
    policy_id = "0x" + "22" * 32
    terms_hash = "0x" + "33" * 32
    reference_hash = "0x" + "44" * 32
    risk_spec = {
        "coverageClass": 0,
        "subject": "task-123",
        "referenceHash": reference_hash,
        "statement": "A task deadline breach triggers this test coverage.",
        "evidenceIssuerHost": "issuer.example.com",
    }
    risk_spec_json = _canonical(risk_spec)
    risk_spec_hash = _digest(risk_spec_json)
    observation_path = "1" if complete_facts else "2"
    source = "https://issuer.example.com/observations/" + observation_path
    facts = {
        "task_id": "task-123",
        "task_spec_hash": reference_hash,
        "missed_deadline": True,
        "contracted_penalty_micro_usdc": 100,
    }
    if not complete_facts:
        facts.pop("missed_deadline")
    origin_path = "1" if complete_facts else "2"
    origin_url = "https://status.example.com/observations/" + origin_path
    origin_body = _canonical({
        "task_id": facts["task_id"],
        "task_spec_hash": facts["task_spec_hash"],
        "observed_at": "2026-10-31T00:00:00.000Z",
        "source": "public-testbed-status",
    })
    now = int(datetime.now(timezone.utc).timestamp())
    envelope = {
        "schema": "covra-evidence",
        "policy_id": policy_id,
        "claim_id": case_id,
        "terms_hash": terms_hash,
        "risk_spec_hash": risk_spec_hash,
        "risk_spec": risk_spec,
        "coverage_class": 0,
        "event_time": "2026-10-31T00:00:00.000Z",
        "observation_id": "obs-001",
        "observed_at": _now_iso(),
        "observation_mode": "OBSERVED_PUBLIC",
        "source_details": {
            "issuer_host": "issuer.example.com",
            "endpoint": source,
            "retrieval_method": "https_get",
            "source_payload_digest": _digest(_canonical(facts)),
            "origin_url": origin_url,
            "origin_payload_digest": _digest(origin_body),
            "provenance_class": "THIRD_PARTY_PUBLIC",
            "independent_observer_count": 2,
            "source_authority": "Public third-party testbed observer",
        },
        "facts": facts,
        "issuer": {
            "wallet": "0x" + "11" * 20,
            "signature": "0x" + "00" * 65,
            "signed_at": now,
            "expires_at": now + 3600,
        },
    }
    body = _canonical(envelope)
    return {
        "case_id": case_id,
        "policy_id": policy_id,
        "terms_hash": terms_hash,
        "risk_spec_json": risk_spec_json,
        "risk_spec_hash": risk_spec_hash,
        "source": source,
        "evidence_commitment": _digest(body),
        "event_time": envelope["event_time"],
        "body": body,
        "origin_body": origin_body,
        "insured": insured,
        "nonce": nonce,
    }


def _decision(case, verdict="COVERED", severity=80, confidence=82):
    statuses = {
        "source_support": "ESTABLISHED",
        "contradictions": "NOT_ESTABLISHED",
        "exclusions": "NOT_ESTABLISHED",
    }
    findings = []
    for finding_id in (
        "insured_subject", "signed_specification", "deadline_missed",
        "penalty_established", "source_support", "provenance", "timestamps",
        "contradictions", "exclusions",
    ):
        status = statuses.get(finding_id, "ESTABLISHED")
        findings.append({
            "id": finding_id,
            "status": status,
            "evidence_refs": [case["source"]],
        })
    return {
        "schema": "covra-decision-v2",
        "verdict": verdict,
        "severity": severity,
        "confidence": confidence,
        "findings": findings,
        "evidence_refs": [case["source"]],
        "provenance": "THIRD_PARTY_PUBLIC",
        "exclusions": [],
        "contradictions": [],
        "uncertainty": [],
        "reason": "The structured testbed observations establish the frozen objective facts.",
    }


def _deploy(direct_deploy, direct_vm):
    # Each direct deployment represents a fresh GenVM process. The old gltest
    # loader does not reset v0.3's per-process main-contract registration.
    contract_module = sys.modules.get("genlayer.contract")
    if contract_module is not None:
        contract_module.__known_contract__ = None
    original_inject = loader._inject_message_to_fd0
    original_allocate = loader._allocate_contract
    original_sdk_setup = sdk_loader.setup_sdk_paths
    sdk_loader.setup_sdk_paths = _verified_manager_sdk

    def v03_safe_inject(vm):
        """Encode the stdin message with the v0.3 SDK used by this contract.

        gltest's Windows helper currently imports the legacy ``genlayer.py``
        calldata encoder. The v0.3 ``genlayer`` package decodes a different
        wire representation, so use the target SDK for this test-only bridge.
        """
        from genlayer import calldata
        from genlayer.types import Address, u256

        sender = vm.sender
        if isinstance(sender, bytes):
            sender = Address(sender)
        contract_address = vm._contract_address
        if isinstance(contract_address, bytes):
            contract_address = Address(contract_address)
        origin = vm.origin
        if isinstance(origin, bytes):
            origin = Address(origin)
        message = {
            "contract_address": contract_address,
            "sender_address": sender,
            "origin_address": origin,
            "stack": [],
            "value": u256(vm._value),
            "datetime": vm._datetime,
            "is_init": False,
            "chain_id": u256(vm._chain_id),
            "entry_kind": 0,
            "entry_data": b"",
            "entry_stage_data": None,
        }
        encoded = calldata.encode(message)
        fd, path = tempfile.mkstemp()
        try:
            os.write(fd, encoded)
            os.lseek(fd, 0, os.SEEK_SET)
            vm._original_stdin_fd = os.dup(0)
            os.dup2(fd, 0)
        finally:
            os.close(fd)
            os.unlink(path)

    def windows_safe_inject(vm):
        try:
            v03_safe_inject(vm)
        except PermissionError:
            if os.name != "nt":
                raise

    def v03_allocate(contract_cls, vm, *args, **kwargs):
        # The installed gltest loader first probes its legacy genlayer.py
        # storage API. That branch bypasses the v0.3 storage allocator,
        # leaving __type_desc__ unset. Use the v0.3 SDK's documented in-memory
        # allocator for direct execution.
        from genlayer import storage
        v03_refresh_message()
        return storage.inmem_allocate(contract_cls, *args, **kwargs)

    def v03_refresh_message():
        # gltest currently refreshes only its legacy genlayer.gl module after
        # vm.sender changes. v0.3 contracts read the genlayer.message module.
        import genlayer.message as message
        from genlayer.types import Address, u256

        sender = direct_vm.sender
        if isinstance(sender, bytes):
            sender = Address(sender)
        origin = direct_vm.origin
        if isinstance(origin, bytes):
            origin = Address(origin)
        message.sender_address = sender
        message.origin_address = origin
        message.value = u256(direct_vm._value)
        message.chain_id = u256(direct_vm._chain_id)
        message.raw["datetime"] = direct_vm._datetime

    direct_vm._refresh_gl_message = v03_refresh_message

    loader._inject_message_to_fd0 = windows_safe_inject
    loader._allocate_contract = v03_allocate
    try:
        contract = direct_deploy("contracts/genlayer/CovraAdjudicator.py")
        # The installed helper patches genlayer.gl.vm, while the v0.3 SDK
        # exposes the supported operation at genlayer.vm.run_nondet. Invoke
        # the validator in-process so Direct Mode still exercises both sides.
        from genlayer import vm as gl_vm
        import genlayer as gl
        from genlayer.nondet.web import Response

        def direct_web(url):
            direct_vm._covra_web_reads = getattr(direct_vm, "_covra_web_reads", 0) + 1
            mock = direct_vm._match_web_mock(url, "GET")
            if mock is None:
                return None
            body = mock.get("body", b"")
            if isinstance(body, str):
                body = body.encode("utf-8")
            return Response(status=int(mock.get("status", 200)), headers={}, body=body)

        def direct_prompt(prompt, **_config):
            return json.loads(direct_vm._match_llm_mock(prompt))

        # gltest's WASI bridge still decodes gl_call requests with its removed
        # genlayer.py package. Adapt only the external nondeterministic inputs;
        # the contract, storage descriptors and v0.3 run_nondet validator still
        # execute directly.
        gl.nondet.web.get = direct_web
        gl.nondet.exec_prompt = direct_prompt

        def direct_run(leader, validator, /):
            import cloudpickle
            leader = cloudpickle.loads(cloudpickle.dumps(leader))
            validator = cloudpickle.loads(cloudpickle.dumps(validator))
            result = leader()
            transform = getattr(direct_vm, "_covra_candidate_transform", lambda value: value)
            if not validator(gl_vm.Return(transform(result))):
                raise AssertionError("Direct Mode validator rejected leader result")
            return result
        gl_vm.run_nondet = direct_run
        return contract
    finally:
        loader._inject_message_to_fd0 = original_inject
        loader._allocate_contract = original_allocate
        sdk_loader.setup_sdk_paths = original_sdk_setup


@pytest.mark.direct
def test_covra_adjudicator_initializes_and_restricts_host_changes(
    direct_deploy, direct_vm, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm)

    assert contract.get_case_count() == 0

    direct_vm.sender = direct_owner
    contract.allow_evidence_host("issuer.example.com", True)
    assert contract.approved_hosts["issuer.example.com"] is True

    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.allow_evidence_host("attacker.example.com", True)


def test_covra_adjudicator_direct_positive_and_negative_adjudication(
    direct_deploy, direct_vm, direct_owner
):
    contract = _deploy(direct_deploy, direct_vm)
    direct_vm.sender = direct_owner
    contract.allow_evidence_host("issuer.example.com", True)

    positive = _case_inputs(direct_owner, complete_facts=True)
    contract.submit_case(
        positive["case_id"], positive["policy_id"], positive["case_id"],
        positive["insured"], positive["nonce"], 0, positive["terms_hash"],
        positive["risk_spec_json"], positive["risk_spec_hash"], positive["source"],
        positive["evidence_commitment"], positive["event_time"], 10000,
    )
    direct_vm.mock_web("issuer\\.example\\.com/observations/1", {
        "method": "GET", "status": 200, "body": positive["body"]
    })
    direct_vm.mock_web("status\\.example\\.com/observations/1", {
        "method": "GET", "status": 200, "body": positive["origin_body"]
    })
    direct_vm.mock_llm("COVRA", json.dumps(_decision(positive)))
    contract.adjudicate(positive["case_id"])
    assert json.loads(contract.get_case(positive["case_id"]))["verdict"] == "COVERED"

    negative = _case_inputs(
        direct_owner,
        complete_facts=False,
        nonce="00000000-0000-0000-0000-000000000002",
    )
    contract.submit_case(
        negative["case_id"], negative["policy_id"], negative["case_id"],
        negative["insured"], negative["nonce"], 0,
        negative["terms_hash"], negative["risk_spec_json"], negative["risk_spec_hash"],
        negative["source"], negative["evidence_commitment"], negative["event_time"], 10000,
    )
    direct_vm.mock_web("issuer\\.example\\.com/observations/2", {
        "method": "GET", "status": 200, "body": negative["body"]
    })
    direct_vm.mock_web("status\\.example\\.com/observations/2", {
        "method": "GET", "status": 200, "body": negative["origin_body"]
    })
    contract.adjudicate(negative["case_id"])
    assert json.loads(contract.get_case(negative["case_id"]))["verdict"] == "INSUFFICIENT_EVIDENCE"

    assert contract.get_case_count() == 2
    assert contract.get_case_id_at(0) == positive["case_id"]
    assert contract.get_case("unknown") == ""
    assert contract.get_decision_digest(positive["case_id"]) == ""
    with pytest.raises(Exception):
        contract.finalize_case(positive["case_id"])
    contract.appeal(positive["case_id"], negative["source"], negative["evidence_commitment"])
    appealed = json.loads(contract.get_case(positive["case_id"]))
    assert appealed["revision"] == 1 and appealed["state"] == "SUBMITTED"
    with pytest.raises(Exception):
        contract.appeal(positive["case_id"], positive["source"], positive["evidence_commitment"])
    # The new bytes identify the other case: adjudication must fail closed.
    contract.adjudicate(positive["case_id"])
    direct_vm.warp("2027-01-01T12:00:00Z")
    contract.finalize_case(positive["case_id"])
    finalized = json.loads(contract.get_case(positive["case_id"]))
    fields = {"case_id": finalized["id"], "policy_id": finalized["policy_id"],
              "claim_id": finalized["claim_id"], "terms_hash": finalized["terms_hash"],
              "risk_spec_hash": finalized["risk_spec_hash"], "verdict": finalized["verdict"],
              "revision": finalized["revision"], "evidence_hash": finalized["evidence_hash"],
              "coverage_class": finalized["risk"], "finalized_at": finalized["finalized_at"],
              "decision_schema": finalized["decision_schema"], "confidence": finalized["confidence"],
              "findings": finalized["findings"], "evidence_refs": finalized["evidence_refs"],
              "provenance": finalized["provenance"], "exclusions": finalized["exclusions"],
              "contradictions": finalized["contradictions"], "uncertainty": finalized["uncertainty"]}
    assert contract.get_decision_digest(positive["case_id"]) == _digest(_canonical(fields))


def test_pinned_sdk_semantics_and_schema(direct_deploy, direct_vm, direct_owner):
    contract = _deploy(direct_deploy, direct_vm)
    cls = sys.modules["_contract_CovraAdjudicator"].CovraAdjudicator
    schema = json.loads(cls.__get_schema__())
    assert len(schema["methods"]) == 11
    assert schema["methods"]["submit_case"]["readonly"] is False
    assert schema["methods"]["get_case"]["readonly"] is True
    contract.authorize_case_agent("0x" + "22" * 20, 0)
    assert contract.get_case_count() == 0
    assert contract.get_protocol_version() == "COVRA_ADJUDICATOR_V2"


def _submitted(direct_deploy, direct_vm, direct_owner):
    contract = _deploy(direct_deploy, direct_vm)
    direct_vm.sender = direct_owner
    contract.allow_evidence_host("issuer.example.com", True)
    case = _case_inputs(direct_owner)
    contract.submit_case(case["case_id"], case["policy_id"], case["case_id"],
        case["insured"], case["nonce"], 0, case["terms_hash"], case["risk_spec_json"],
        case["risk_spec_hash"], case["source"], case["evidence_commitment"], case["event_time"], 10000)
    return contract, case


@pytest.mark.parametrize("status", [400, 404, 500, 503])
def test_http_failures_do_not_persist_a_decision(direct_deploy, direct_vm, direct_owner, status):
    contract, case = _submitted(direct_deploy, direct_vm, direct_owner)
    direct_vm.mock_web("issuer\\.example\\.com", {"method": "GET", "status": status, "body": case["body"]})
    with pytest.raises(Exception):
        contract.adjudicate(case["case_id"])
    assert json.loads(contract.get_case(case["case_id"]))["state"] == "SUBMITTED"
    assert contract.get_decision_digest(case["case_id"]) == ""


@pytest.mark.parametrize("body", ["", "{}", "tampered", "x" * 131073], ids=["empty", "replaced-json", "tampered", "oversized"])
def test_changed_empty_and_oversized_evidence_fail_closed(direct_deploy, direct_vm, direct_owner, body):
    contract, case = _submitted(direct_deploy, direct_vm, direct_owner)
    direct_vm.mock_web("issuer\\.example\\.com", {"method": "GET", "status": 200, "body": body})
    with pytest.raises(Exception):
        contract.adjudicate(case["case_id"])
    assert json.loads(contract.get_case(case["case_id"]))["verdict"] == "PENDING"


@pytest.mark.parametrize("change", ["wrong_verdict", "finding_status", "provenance", "missing_reason", "extra_field"])
def test_malicious_leader_and_disagreement_rejected(direct_deploy, direct_vm, direct_owner, change):
    contract, case = _submitted(direct_deploy, direct_vm, direct_owner)
    direct_vm.mock_web("issuer\\.example\\.com", {"method": "GET", "status": 200, "body": case["body"]})
    direct_vm.mock_web("status\\.example\\.com", {"method": "GET", "status": 200, "body": case["origin_body"]})
    direct_vm.mock_llm("COVRA", json.dumps(_decision(case)))
    def manipulate(value):
        value = dict(value)
        if change == "wrong_verdict": value["verdict"] = "NOT_COVERED"
        if change == "finding_status": value["findings"] = [
            {**finding, "status": "UNVERIFIED"} if finding["id"] == "deadline_missed" else finding
            for finding in value["findings"]
        ]
        if change == "provenance": value["provenance"] = "COVRA_CONTROLLED"
        if change == "missing_reason": value["reason"] = ""
        if change == "extra_field": value["transfer"] = "attacker"
        return value
    direct_vm._covra_candidate_transform = manipulate
    with pytest.raises(AssertionError, match="validator rejected"):
        contract.adjudicate(case["case_id"])
    assert direct_vm._covra_web_reads == 4  # Leader and validator each fetch issuer and origin bytes.
    assert json.loads(contract.get_case(case["case_id"]))["state"] == "SUBMITTED"


@pytest.mark.parametrize("payload", [
    "not-json", "[]", "{}",
    '{"schema":"covra-decision-v2","verdict":"APPROVED","severity":80,"confidence":80,"findings":[],"evidence_refs":["source"],"provenance":"THIRD_PARTY_PUBLIC","exclusions":[],"contradictions":[],"uncertainty":[],"reason":"reason"}',
    '{"schema":"covra-decision-v2","verdict":"COVERED","severity":true,"confidence":80,"findings":[],"evidence_refs":["source"],"provenance":"THIRD_PARTY_PUBLIC","exclusions":[],"contradictions":[],"uncertainty":[],"reason":"reason"}',
    '{"schema":"covra-decision-v2","verdict":"COVERED","severity":101,"confidence":80,"findings":[],"evidence_refs":["source"],"provenance":"THIRD_PARTY_PUBLIC","exclusions":[],"contradictions":[],"uncertainty":[],"reason":"reason"}',
    '{"schema":"covra-decision-v2","verdict":"COVERED","severity":80,"confidence":80,"findings":[],"evidence_refs":["source"],"provenance":"THIRD_PARTY_PUBLIC","exclusions":[],"contradictions":[],"uncertainty":[],"reason":7}',
    '{"schema":"covra-decision-v2","verdict":"COVERED","severity":80,"confidence":80,"findings":[],"evidence_refs":[],"provenance":"THIRD_PARTY_PUBLIC","exclusions":[],"contradictions":[],"uncertainty":[],"reason":"reason"}',
], ids=["invalid-json", "array", "empty-object", "invalid-verdict", "boolean-severity", "excess-severity", "reason-type", "citation-type"])
def test_malformed_model_output_cannot_create_a_decision(direct_deploy, direct_vm, direct_owner, payload):
    contract, case = _submitted(direct_deploy, direct_vm, direct_owner)
    direct_vm.mock_web("issuer\\.example\\.com", {"method": "GET", "status": 200, "body": case["body"]})
    direct_vm.mock_llm("COVRA", payload)
    with pytest.raises(Exception):
        contract.adjudicate(case["case_id"])
    assert json.loads(contract.get_case(case["case_id"]))["state"] == "SUBMITTED"


def test_exact_sdk_delegation_revocation_duplicate_and_unknown_cases(direct_deploy, direct_vm, direct_owner, direct_alice):
    contract = _deploy(direct_deploy, direct_vm)
    direct_vm.sender = direct_owner
    contract.allow_evidence_host("issuer.example.com", True)
    case = _case_inputs(direct_owner)
    args = (case["case_id"], case["policy_id"], case["case_id"], case["insured"], case["nonce"],
        0, case["terms_hash"], case["risk_spec_json"], case["risk_spec_hash"], case["source"],
        case["evidence_commitment"], case["event_time"], 10000)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.submit_case(*args)
    assert contract.get_case_count() == 0
    direct_vm.sender = direct_owner
    now = sys.modules["_contract_CovraAdjudicator"].transaction_timestamp()
    agent = "0x" + direct_alice.hex()
    contract.authorize_case_agent(agent, now + 600)
    direct_vm.sender = direct_alice
    contract.submit_case(*args)
    assert contract.get_case_count() == 1
    with pytest.raises(Exception):
        contract.submit_case(*args)
    direct_vm.sender = direct_owner
    contract.authorize_case_agent(agent, 0)
    assert contract.case_agents[case["insured"] + ":" + agent] == 0
    for method, params in [(contract.adjudicate, ("unknown",)), (contract.finalize_case, ("unknown",)),
            (contract.appeal, ("unknown", case["source"], case["evidence_commitment"]))]:
        with pytest.raises(Exception):
            method(*params)
    for index in [-1, 1]:
        with pytest.raises(Exception):
            contract.get_case_id_at(index)
