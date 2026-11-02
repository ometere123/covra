"""Host-side logic checks only; these are NOT GenVM consensus tests."""

import importlib.util
import json
import pathlib
import sys
import time
import types
import unittest
from collections import defaultdict
from datetime import datetime, timezone


class UserError(Exception):
    pass


def load_contract():
    fake = types.ModuleType("genlayer")
    fake.contract = types.SimpleNamespace(Contract=object)
    fake.TreeMap = dict
    fake.DynArray = list
    fake.storage = types.SimpleNamespace(TreeMap=dict, DynArray=list)
    fake.message = types.SimpleNamespace(
        sender_address="0x" + "a" * 40,
        raw={"datetime": "2026-10-31T12:00:00.000Z"},
    )
    fake.public = types.SimpleNamespace(write=lambda fn: fn, view=lambda fn: fn)
    fake.vm = types.SimpleNamespace(UserError=UserError, Result=object, Return=object)
    fake.nondet = types.SimpleNamespace(web=types.SimpleNamespace(get=lambda _: None))
    fake_types = types.ModuleType("genlayer.types")
    fake_types.TreeMap = dict
    fake_types.DynArray = list
    fake_types.Address = str
    fake_types.u256 = int
    fake.u256 = int
    sys.modules["genlayer"] = fake
    sys.modules["genlayer.types"] = fake_types
    source = pathlib.Path(__file__).resolve().parents[2] / "contracts/genlayer/CovraAdjudicator.py"
    spec = importlib.util.spec_from_file_location("covra_contract_logic", source)
    contract = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(contract)
    return contract, fake


class AdjudicatorLogicTests(unittest.TestCase):
    def setUp(self):
        self.module, self.gl = load_contract()
        self.insured = "0x" + "1" * 40
        self.agent = "0x" + "2" * 40
        self.owner = self.gl.message.sender_address
        self.gl.message.sender_address = self.insured
        self.contract = self.module.CovraAdjudicator()
        self.contract.owner = self.owner
        self.contract.cases = defaultdict(str)
        self.contract.case_agents = defaultdict(int)
        self.contract.approved_hosts = defaultdict(bool, {"issuer.example.org": True,
                                                        "other.example.org": True})
        self.contract.case_order = []

    def record(self):
        return {
            "id": "0x" + "a" * 64,
            "policy_id": "0x" + "b" * 64,
            "claim_id": "0x" + "a" * 64,
            "terms_hash": "0x" + "c" * 64,
            "risk_spec_hash": "0x" + "d" * 64,
            "risk_spec": {"evidenceIssuerHost": "issuer.example.org"},
            "insured_wallet": self.insured,
            "submitter": self.agent,
            "source": "https://issuer.example.org/claim/old",
            "evidence_hash": "0x" + "e" * 64,
            "risk": 1,
            "event_time": "2026-10-30T10:00:00.000Z",
            "state": "DECIDED",
            "appeal_used": False,
            "revision": 0,
            "verdict": "COVERED",
            "decided_at": int(time.time()) - 30,
        }

    def put(self, record):
        self.contract.cases[record["id"]] = json.dumps(record)
        return record["id"]

    def test_http_status_fails_closed_and_obsolete_status_code_is_not_used(self):
        record = self.record()
        self.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=503, body=b"")
        with self.assertRaisesRegex(UserError, "TRANSIENT"):
            self.contract._assess_independently(record)
        self.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=404, body=b"")
        with self.assertRaisesRegex(UserError, "EXTERNAL"):
            self.contract._assess_independently(record)
        self.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=200, body=b"")
        with self.assertRaisesRegex(UserError, "empty or oversized"):
            self.contract._assess_independently(record)
        self.gl.nondet.web.get = lambda _: types.SimpleNamespace(status_code=503, body=b"")
        with self.assertRaisesRegex(UserError, "invalid status"):
            self.contract._assess_independently(record)

    def test_time_checks_use_deterministic_genvm_message_datetime(self):
        expected = int(datetime(2026, 10, 31, 12, tzinfo=timezone.utc).timestamp())
        self.assertEqual(self.module.transaction_timestamp(), expected)
        self.gl.message.raw["datetime"] = "not-a-timestamp"
        with self.assertRaisesRegex(UserError, "invalid transaction timestamp"):
            self.module.transaction_timestamp()

    def test_issuer_url_cannot_use_other_port_or_fragment(self):
        self.assertTrue(self.contract._is_allowed_source("https://issuer.example.org/report"))
        self.assertFalse(self.contract._is_allowed_source("https://issuer.example.org:443/report"))
        self.assertFalse(self.contract._is_allowed_source("https://issuer.example.org/report#redirect"))
        self.assertFalse(self.contract._is_allowed_source("https://issuer.example.org@other.example.org/report"))
        self.gl.message.sender_address = self.owner
        with self.assertRaisesRegex(UserError, "invalid host"):
            self.contract.allow_evidence_host("issuer.example.org:443", True)

    def test_appeal_cannot_change_frozen_issuer(self):
        case_id = self.put(self.record())
        with self.assertRaisesRegex(UserError, "appeal issuer differs"):
            self.contract.appeal(case_id, "https://other.example.org/new", "0x" + "f" * 64)
        self.assertFalse(json.loads(self.contract.cases[case_id])["appeal_used"])

    def test_appeal_requires_new_digest(self):
        case_id = self.put(self.record())
        with self.assertRaisesRegex(UserError, "invalid commitment"):
            self.contract.appeal(case_id, "https://issuer.example.org/new", "0x" + "e" * 64)

    def test_revoked_submitter_cannot_consume_appeal(self):
        case_id = self.put(self.record())
        self.gl.message.sender_address = self.agent
        with self.assertRaisesRegex(UserError, "not authorized"):
            self.contract.appeal(case_id, "https://issuer.example.org/new", "0x" + "f" * 64)
        self.contract.case_agents[self.insured + ":" + self.agent] = int(time.time()) + 60
        self.contract.appeal(case_id, "https://issuer.example.org/new", "0x" + "f" * 64)
        amended = json.loads(self.contract.cases[case_id])
        self.assertEqual(amended["revision"], 1)
        self.assertEqual(amended["state"], "SUBMITTED")
        self.assertTrue(amended["appeal_used"])

    def test_contract_administrator_cannot_appeal_others_claim(self):
        case_id = self.put(self.record())
        self.gl.message.sender_address = self.owner
        with self.assertRaisesRegex(UserError, "not authorized"):
            self.contract.appeal(case_id, "https://issuer.example.org/new", "0x" + "f" * 64)

    def test_evidence_observation_identity_and_source_are_bound(self):
        record = self.record()
        record["risk_spec"] = {
            "coverageClass": 1, "subject": "provider-1", "referenceHash": "0x" + "e" * 64,
            "statement": "A frozen provider outage observation.", "evidenceIssuerHost": "issuer.example.org",
        }
        facts = {
            "provider_id": "provider-1", "monitoring_method_hash": "0x" + "e" * 64,
            "outage_minutes": 120, "independent_probes": 3,
        }
        envelope = {
            "schema": "covra-evidence", "policy_id": record["policy_id"], "claim_id": record["claim_id"],
            "terms_hash": record["terms_hash"], "risk_spec_hash": record["risk_spec_hash"],
            "risk_spec": record["risk_spec"], "coverage_class": 1, "observation_id": "fixture-python-1",
            "event_time": record["event_time"], "observed_at": record["event_time"],
            "observation_mode": "OBSERVED_PUBLIC",
            "source_details": {
                "issuer_host": "issuer.example.org", "endpoint": record["source"],
                "retrieval_method": "https_get", "source_payload_digest": "0x" + "f" * 64,
                "origin_url": "https://status.example.org/incident/1",
                "origin_payload_digest": "0x" + "a" * 64,
            },
            "issuer": {"wallet": "0x" + "1" * 40,
                       "signed_at": self.module.transaction_timestamp() - 1,
                       "expires_at": self.module.transaction_timestamp() + 3600,
                       "signature": "0x" + "0" * 130},
            "facts": facts,
        }
        self.assertTrue(self.module.objective_evidence(record, envelope))
        envelope["observation_mode"] = "SIMULATED_DEMO"
        self.assertFalse(self.module.objective_evidence(record, envelope))
        envelope["observation_mode"] = "OBSERVED_PUBLIC"
        envelope["source_details"]["endpoint"] = "https://other.example.org/changed"
        self.assertFalse(self.module.objective_evidence(record, envelope))


if __name__ == "__main__":
    unittest.main()
