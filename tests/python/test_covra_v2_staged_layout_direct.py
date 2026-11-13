"""Direct Mode storage-compatibility proof for the COVRA V2 bootstrap.

This deliberately exercises the pinned v0.3 storage manager and reloads the
actual compact COVRA V2 source from the native alternate code slot.  It does
not call a host-side replacement class as a substitute for code-slot state.
The disposable Bradbury proof supplies the live transaction evidence.
"""

import hashlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from test_staged_code_slot_direct import (  # noqa: E402
    _install_v03_loader,
    _load_contract_from_path,
    _restore_v03_loader,
)


BOOTSTRAP = ROOT / "testbed/staged-upgrade/CovraV2Bootstrap.py"
REPLACEMENT = ROOT / "contracts/genlayer/generated/CovraAdjudicator.py"


@pytest.mark.direct
def test_covra_v2_bootstrap_preserves_storage_prefix_and_activates_real_source(
    direct_deploy, direct_vm, direct_owner
):
    originals = _install_v03_loader(direct_vm)
    try:
        bootstrap = direct_deploy(BOOTSTRAP)
        assert str(bootstrap.get_owner()).lower() == ("0x" + direct_owner.hex()).lower()
        assert bootstrap.get_case_count() == 0

        replacement_bytes = REPLACEMENT.read_bytes()
        digest = "0x" + hashlib.sha256(replacement_bytes).hexdigest()
        chunks = [replacement_bytes[i : i + 700] for i in range(0, len(replacement_bytes), 700)]
        for index, chunk in enumerate(chunks):
            bootstrap.stage_chunk(index, len(chunks), chunk, digest)

        bootstrap.activate()
        assert bootstrap.get_installation_status().find('"activated":true') >= 0
        assert bootstrap.get_code_slot() != 0

        from genlayer import storage

        assert bytes(storage.Root.get().get_resolved_code()) == replacement_bytes

        replacement = _load_contract_from_path(direct_vm, REPLACEMENT)
        assert replacement.get_protocol_version() == "COVRA_ADJUDICATOR_V2"
        assert replacement.get_case_count() == 0
        assert replacement.get_decision_digest("0x" + "0" * 64) == ""
        with pytest.raises(AttributeError):
            replacement.activate
        with pytest.raises(AttributeError):
            replacement.stage_chunk
    finally:
        _restore_v03_loader(originals)
