"""Offline pinned-SDK test of the exact generated bootstrap and source."""

import hashlib
import json
import os
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests/python"))
from test_staged_code_slot_direct import (  # noqa: E402
    _install_v03_loader,
    _load_contract_from_path,
    _restore_v03_loader,
)


@pytest.mark.direct
def test_v3_frozen_slot_installation(direct_deploy, direct_vm, direct_owner, direct_alice):
    directory = Path(os.environ["COVRA_V3_OFFLINE_ARTIFACT_DIR"])
    replacement = directory / "CovraAdjudicatorV3.py"
    code = replacement.read_bytes()
    digest = "0x" + hashlib.sha256(code).hexdigest()
    chunks = [code[i:i + 700] for i in range(0, len(code), 700)]
    originals = _install_v03_loader(direct_vm)
    try:
        bootstrap = direct_deploy(directory / "CovraV3Bootstrap.py")
        assert bootstrap.get_code_slot() == 0
        with pytest.raises(Exception, match="incomplete staged source"):
            bootstrap.activate()
        direct_vm.sender = direct_alice
        with pytest.raises(Exception, match="installer only"):
            bootstrap.stage_chunk(0, len(chunks), chunks[0], digest)
        direct_vm.sender = direct_owner
        with pytest.raises(Exception, match="frozen V3 manifest mismatch"):
            bootstrap.stage_chunk(0, len(chunks), chunks[0], "0x" + "0" * 64)
        with pytest.raises(Exception, match="not the next sequential chunk"):
            bootstrap.stage_chunk(1, len(chunks), chunks[0], digest)
        modified = bytes([chunks[0][0] ^ 1]) + chunks[0][1:]
        bootstrap.stage_chunk(0, len(chunks), modified, digest)
        for index, chunk in enumerate(chunks[1:], start=1):
            bootstrap.stage_chunk(index, len(chunks), chunk, digest)
        with pytest.raises(Exception, match="staged source digest mismatch"):
            bootstrap.activate()
        assert bootstrap.get_code_slot() == 0
        bootstrap.reset_installation()
        for index, chunk in enumerate(chunks):
            bootstrap.stage_chunk(index, len(chunks), chunk, digest)
        with pytest.raises(Exception, match="not the next sequential chunk"):
            bootstrap.stage_chunk(0, len(chunks), chunks[0], digest)
        bootstrap.activate()
        status = json.loads(bootstrap.get_installation_status())
        assert status["activated"] and status["activation_digest"] == digest
        from genlayer import storage

        root = storage.Root.get()
        assert bytes(root.get_resolved_code()) == code
        assert len(root.upgraders.get()) == 0
        activated = _load_contract_from_path(direct_vm, replacement)
        assert activated.get_protocol_version() == "COVRA_ADJUDICATOR_V3"
        assert activated.get_case_count() == 0
        assert activated.get_decision_digest("0x" + "0" * 64) == ""
        assert not hasattr(activated, "stage_chunk")
        assert not hasattr(activated, "activate")
        assert not hasattr(activated, "reset_installation")
    finally:
        _restore_v03_loader(originals)
