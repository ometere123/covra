"""Direct Mode proof for the RC10 native alternate code slot.

This test uses the installed v0.3 SDK and Manager rc10 bundle.  It deliberately
does not pretend that a host-side class swap is an on-chain activation: the
test verifies the actual Root/code-slot storage writes, exact source bytes and
storage compatibility, while the companion Bradbury script exercises the same
transactions against the target node.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

import pytest
from gltest.direct import loader
from gltest.direct import sdk_loader


ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = ROOT / "testbed/staged-upgrade/StageableBootstrap.py"
REPLACEMENT = ROOT / "testbed/staged-upgrade/StageableReplacement.py"
MANAGER_SHA256 = "d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af"


def _verified_manager_sdk(contract_path=None, version=None):
    runtime = ROOT / ".runtime"
    archive = runtime / "genvm-universal.tar.xz"
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != MANAGER_SHA256:
            raise RuntimeError("Manager rc10 bundle checksum mismatch")
    dependencies = sdk_loader.parse_contract_header(Path(contract_path))
    paths = []
    visited = set()

    def include(family, digest):
        if (family, digest) in visited:
            return
        visited.add((family, digest))
        folder = runtime / "manager-rc10" / family / digest
        if not folder.is_dir():
            raise RuntimeError(f"Missing exact runtime dependency: {family}:{digest}")
        paths.append(folder)
        for child_family, child_digest in sdk_loader.parse_runner_manifest(folder).items():
            include(child_family, child_digest)

    for family, digest in dependencies.items():
        include(family, digest)
    for folder in paths:
        sys.path.insert(0, str(folder / "src" if (folder / "src").is_dir() else folder))
    return paths


def _inject_v03(vm):
    from genlayer import calldata
    from genlayer.types import Address, u256

    sender = vm.sender if isinstance(vm.sender, Address) else Address(vm.sender)
    contract_address = vm._contract_address
    if not isinstance(contract_address, Address):
        contract_address = Address(contract_address)
    origin = vm.origin
    if not isinstance(origin, Address):
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
    # Use an anonymous pipe instead of a named temporary file.  Windows keeps
    # the duplicated stdin handle open, which makes a tempfile unlink fail;
    # the pipe gives the loader the same fd-0 byte stream without leaving a
    # filesystem artifact behind.
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, encoded)
        os.close(write_fd)
        write_fd = -1
        vm._original_stdin_fd = os.dup(0)
        os.dup2(read_fd, 0)
    finally:
        if write_fd != -1:
            os.close(write_fd)
        os.close(read_fd)


def _refresh_v03_message(vm):
    import genlayer.message as message
    from genlayer.types import Address, u256

    sender = vm.sender if isinstance(vm.sender, Address) else Address(vm.sender)
    origin = vm.origin
    if not isinstance(origin, Address):
        origin = Address(origin)
    message.sender_address = sender
    message.origin_address = origin
    message.value = u256(vm._value)
    message.chain_id = u256(vm._chain_id)
    message.raw["datetime"] = vm._datetime


def _allocate_existing(contract_cls, vm, *args, **kwargs):
    from genlayer import storage
    from genlayer.vm import public_abi
    from genlayer.storage._internal.generate import (
        ORIGINAL_INIT_ATTR,
        _BuilderCtx,
        _storage_build,
    )

    # gltest's VM still owns its legacy storage manager.  Use the pinned
    # v0.3 InmemManager for this proof so Root.get_vacant_slot() returns the
    # actual RC10 Slot implementation (including cast/indirection) and reuse
    # the same manager when the replacement source is loaded.
    manager = getattr(vm, "_staged_manager", None)
    if manager is None:
        manager = storage.InmemManager()
        vm._staged_manager = manager
    storage.Root.MANAGER = manager
    descriptor = _storage_build(_BuilderCtx.empty(), contract_cls)
    root = storage.Root.get()
    # Contract fields live behind Root.contract_instance.  Allocating them at
    # the root slot would alias the root/code-slot metadata and corrupt the
    # string/VLA descriptors as soon as the installer writes its alternate
    # slot.
    contract_slot = root.slot().indirect(public_abi.root_offsets.CONTRACT)
    instance = descriptor.get(contract_slot, 0)
    if not getattr(vm, "_staged_skip_init", False):
        init = getattr(descriptor, "cls", None)
        init = getattr(init or contract_cls, "__init__", None)
        if hasattr(init, ORIGINAL_INIT_ATTR):
            init = getattr(init, ORIGINAL_INIT_ATTR)
        init(instance, *args, **kwargs)
    return instance


def _install_v03_loader(vm):
    contract_module = sys.modules.get("genlayer.contract")
    if contract_module is not None:
        contract_module.__known_contract__ = None
    original_inject = loader._inject_message_to_fd0
    original_allocate = loader._allocate_contract
    original_setup = sdk_loader.setup_sdk_paths
    sdk_loader.setup_sdk_paths = _verified_manager_sdk
    loader._inject_message_to_fd0 = _inject_v03
    loader._allocate_contract = lambda cls, _vm, *args, **kwargs: _allocate_existing(cls, _vm, *args, **kwargs)
    vm._refresh_gl_message = lambda: _refresh_v03_message(vm)
    return original_inject, original_allocate, original_setup


def _restore_v03_loader(originals):
    original_inject, original_allocate, original_setup = originals
    loader._inject_message_to_fd0 = original_inject
    loader._allocate_contract = original_allocate
    sdk_loader.setup_sdk_paths = original_setup


def _load_contract_from_path(vm, path):
    contract_module = sys.modules.get("genlayer.contract")
    if contract_module is not None:
        contract_module.__known_contract__ = None
    contract_cls = loader.load_contract_class(path, vm)
    vm._staged_skip_init = True
    try:
        return loader._make_contract_proxy(_allocate_existing(contract_cls, vm))
    finally:
        vm._staged_skip_init = False


def _load_replacement(vm):
    return _load_contract_from_path(vm, REPLACEMENT)


@pytest.mark.direct
def test_staged_code_slot_is_bounded_sequential_authenticated_and_storage_compatible(
    direct_deploy, direct_vm, direct_owner, direct_alice
):
    originals = _install_v03_loader(direct_vm)
    try:
        bootstrap = direct_deploy(BOOTSTRAP)
        replacement_bytes = REPLACEMENT.read_bytes()
        digest = "0x" + hashlib.sha256(replacement_bytes).hexdigest()
        chunks = [replacement_bytes[i : i + 700] for i in range(0, len(replacement_bytes), 700)]
        total = len(chunks)

        assert bootstrap.get_counter() == 0
        assert bootstrap.get_marker() == "bootstrap"
        assert json.loads(bootstrap.get_installation_status())["activated"] is False

        direct_vm.sender = direct_alice
        with pytest.raises(Exception, match="installer only"):
            bootstrap.stage_chunk(0, total, chunks[0], digest)

        direct_vm.sender = direct_owner
        with pytest.raises(Exception, match="sequential"):
            bootstrap.stage_chunk(1, total, chunks[1], digest)

        # A complete modified payload has the right chunk protocol but fails
        # the final source commitment.  It remains inactive and recoverable.
        modified = list(chunks)
        modified[-1] = modified[-1][:-1] + bytes([modified[-1][-1] ^ 1])
        for index, chunk in enumerate(modified):
            bootstrap.stage_chunk(index, total, chunk, digest)
        with pytest.raises(Exception, match="digest mismatch"):
            bootstrap.activate()
        assert json.loads(bootstrap.get_installation_status())["activated"] is False

        bootstrap.reset_installation()
        with pytest.raises(Exception, match="sequential"):
            bootstrap.stage_chunk(1, total, chunks[1], digest)

        # A partially staged source is recoverable, but can never activate.
        bootstrap.stage_chunk(0, total, chunks[0], digest)
        with pytest.raises(Exception, match="incomplete"):
            bootstrap.activate()
        bootstrap.reset_installation()

        bootstrap.increment(2)
        for index, chunk in enumerate(chunks):
            bootstrap.stage_chunk(index, total, chunk, digest)
        with pytest.raises(Exception, match="sequential"):
            bootstrap.stage_chunk(total - 1, total, chunks[-1], digest)

        # The complete, committed source activates by changing only Root's
        # code-slot pointer.  No constructor runs and the old state remains.
        bootstrap.activate()
        status = json.loads(bootstrap.get_installation_status())
        assert status["activated"] is True
        assert status["activation_digest"] == digest
        assert int(bootstrap.get_code_slot()) != 0
        assert bootstrap.get_counter() == 2

        from genlayer import storage

        root = storage.Root.get()
        assert bytes(root.get_resolved_code()) == replacement_bytes

        # Reload the contract against the active alternate source without
        # running its constructor.  The replacement exposes a new method,
        # preserves state, and no longer exposes installer write methods.
        replacement = _load_replacement(direct_vm)
        assert replacement.get_version() == "replacement-v2"
        assert replacement.get_counter() == 2
        assert replacement.get_marker() == "bootstrap"
        assert replacement.get_installation_status() == bootstrap.get_installation_status()
        with pytest.raises(AttributeError):
            replacement.stage_chunk
        with pytest.raises(AttributeError):
            replacement.activate
    finally:
        _restore_v03_loader(originals)
