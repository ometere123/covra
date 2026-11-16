"""Exercise V3 with the existing pinned Bradbury Direct Mode harness."""

import json
from datetime import datetime, timezone

import pytest

import test_adjudicator_direct as v2


def _warp(vm, timestamp):
    vm.warp(datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z"))


def _submit(monkeypatch, direct_deploy, direct_vm, direct_owner, complete_facts):
    monkeypatch.setattr(v2, "CONTRACT_PATH", "contracts/genlayer/CovraAdjudicatorV3.py")
    contract = v2._deploy(direct_deploy, direct_vm)
    direct_vm.sender = direct_owner
    contract.allow_evidence_host("issuer.example.com", True)
    case = v2._case_inputs(direct_owner, complete_facts=complete_facts)
    contract.submit_case(
        case["case_id"], case["policy_id"], case["case_id"], case["insured"],
        case["nonce"], 0, case["terms_hash"], case["risk_spec_json"], case["risk_spec_hash"],
        case["source"], case["evidence_commitment"], case["event_time"], 10000,
    )
    return contract, case


@pytest.fixture
def submitted(monkeypatch, direct_deploy, direct_vm, direct_owner):
    return _submit(monkeypatch, direct_deploy, direct_vm, direct_owner, False)


def test_distinct_hosts_do_not_establish_independence(
    monkeypatch, direct_deploy, direct_vm, direct_owner,
):
    contract, case = _submit(monkeypatch, direct_deploy, direct_vm, direct_owner, True)
    direct_vm.mock_web(r"status\.example\.com", {
        "method": "GET", "status": 200, "body": case["origin_body"],
    })
    for url, body in zip(case["source_urls"], case["source_records"]):
        direct_vm.mock_web(url.replace(".", r"\."), {
            "method": "GET", "status": 200, "body": body,
        })
    _adjudicate(contract, case, direct_vm)
    record = _read(contract, case)
    assert record["verdict"] == "INSUFFICIENT_EVIDENCE"
    assert "Verified independent operator" in record["reason"]
    assert contract.get_decision_digest(case["case_id"]) == ""


def test_unavailable_source_preserves_pending_state(submitted, direct_vm):
    contract, case = submitted
    direct_vm.mock_web(r"issuer\.example\.com", {"method": "GET", "status": 503, "body": ""})
    with pytest.raises(Exception, match="evidence host unavailable"):
        contract.adjudicate(case["case_id"])
    assert _read(contract, case)["state"] == "SUBMITTED"
    assert contract.get_decision_digest(case["case_id"]) == ""


def _read(contract, case):
    return json.loads(contract.get_case(case["case_id"]))


def _adjudicate(contract, case, vm):
    vm.mock_web(r"issuer\.example\.com", {"method": "GET", "status": 200, "body": case["body"]})
    contract.adjudicate(case["case_id"])


def test_cure_and_appeal_are_bounded(submitted, direct_vm):
    contract, case = submitted
    case_id = case["case_id"]
    assert contract.get_protocol_version() == "COVRA_ADJUDICATOR_V3"
    _adjudicate(contract, case, direct_vm)
    decision = _read(contract, case)
    assert decision["state"] == "NEEDS_EVIDENCE"
    assert decision["cure_deadline"] - decision["decided_at"] == 7 * 86400
    assert contract.get_decision_digest(case_id) == ""
    with pytest.raises(Exception, match="invalid commitment"):
        contract.cure_evidence(case_id, case["source"], case["evidence_commitment"])
    with pytest.raises(Exception, match="period still active"):
        contract.finalize_case(case_id)
    new_body = case["body"] + " "
    contract.cure_evidence(case_id, case["source"], v2._digest(new_body))
    assert _read(contract, case)["state"] == "EVIDENCE_CURE"
    direct_vm.clear_mocks()
    _adjudicate(contract, {**case, "body": new_body}, direct_vm)
    with pytest.raises(Exception, match="cure not available"):
        contract.cure_evidence(case_id, case["source"], v2._digest(new_body + " "))
    with pytest.raises(Exception, match="invalid commitment"):
        contract.appeal(case_id, case["source"], case["evidence_commitment"])
    contract.appeal(case_id, case["source"], v2._digest(new_body + " "))
    amended = _read(contract, case)
    assert amended["state"] == "APPEAL_PENDING"
    assert amended["revision"] == 2
    for field in ("policy_id", "claim_id", "event_time", "terms_hash", "risk_spec_hash"):
        assert amended[field] == decision[field]


def test_timeout_has_terminal_digest(submitted, direct_vm):
    contract, case = submitted
    _adjudicate(contract, case, direct_vm)
    decision = _read(contract, case)
    _warp(direct_vm, decision["cure_deadline"])
    with pytest.raises(Exception, match="period still active"):
        contract.finalize_case(case["case_id"])
    _warp(direct_vm, decision["cure_deadline"] + 1)
    contract.finalize_case(case["case_id"])
    final = _read(contract, case)
    assert final["state"] == final["verdict"] == "UNPROVEN_CLOSED"
    keys = (
        "policy_id", "claim_id", "terms_hash", "risk_spec_hash", "verdict", "revision",
        "evidence_hash", "finalized_at", "decision_schema", "confidence", "findings",
        "evidence_refs", "provenance", "exclusions", "contradictions", "uncertainty",
        "state", "event_time", "cure_deadline", "resolution_deadline", "decided_at",
    )
    fields = {key: final[key] for key in keys}
    fields.update(case_id=final["id"], coverage_class=final["risk"],
                  protocol_version="COVRA_ADJUDICATOR_V3")
    assert contract.get_decision_digest(case["case_id"]) == v2._digest(v2._canonical(fields))
    with pytest.raises(Exception, match="case already terminal"):
        contract.finalize_case(case["case_id"])
