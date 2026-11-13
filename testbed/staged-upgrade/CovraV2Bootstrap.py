# v0.3.0
# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }

"""Small COVRA V2 installer with the V2 storage prefix.

This is a testnet-only bootstrap for the native RC10 alternate-code-slot
mechanism.  The first six persistent declarations intentionally match
CovraAdjudicator.py exactly and are initialized here because the replacement
contract's __init__ is not rerun during activation.  Installer metadata is
appended after the V2 prefix and is never read by the replacement.

The installer only accepts the fixed deployer, stages bounded sequential
chunks, verifies the complete SHA-256 digest and atomically switches Root's
code_slot.  It revokes the only upgrader after activation.
"""

import genlayer as gl
from genlayer.types import *
import hashlib
import json


MAX_CHUNK_BYTES = 1024
MAX_SOURCE_BYTES = 65536
MAX_CHUNKS = 96
ZERO_DIGEST = ""


def _valid_digest(value: str) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 66
        and value.startswith("0x")
        and all(ch in "0123456789abcdefABCDEF" for ch in value[2:])
    )


class CovraAdjudicator(gl.contract.Contract):
    # Exact V2 storage prefix.  Do not reorder or remove these fields.
    owner: Address
    cases: gl.storage.TreeMap[str, str]
    case_agents: gl.storage.TreeMap[str, u256]
    case_order: gl.storage.DynArray[str]
    case_count: u256
    approved_hosts: gl.storage.TreeMap[str, bool]

    # Installer-only fields are appended after the V2 prefix.
    installer: Address
    expected_digest: str
    total_chunks: u256
    next_chunk: u256
    staged_bytes: u256
    activated: bool
    activation_digest: str

    def __init__(self):
        self.owner = gl.message.sender_address
        self.case_count = u256(0)
        self.installer = gl.message.sender_address
        self.expected_digest = ZERO_DIGEST
        self.total_chunks = u256(0)
        self.next_chunk = u256(0)
        self.staged_bytes = u256(0)
        self.activated = False
        self.activation_digest = ZERO_DIGEST
        gl.storage.Root.get().upgraders.get().append(self.installer)

    def _require_installer(self) -> None:
        if gl.message.sender_address != self.installer:
            raise gl.vm.UserError("[EXPECTED] installer only")
        if self.activated:
            raise gl.vm.UserError("[EXPECTED] installation already activated")

    def _staged_code(self):
        return gl.storage.Root.get().get_vacant_slot().cast(gl.storage.VLA[gl.u8], 0)

    @gl.public.view
    def get_installation_status(self) -> str:
        return json.dumps({
            "activated": self.activated,
            "expected_digest": self.expected_digest,
            "total_chunks": int(self.total_chunks),
            "next_chunk": int(self.next_chunk),
            "staged_bytes": int(self.staged_bytes),
            "activation_digest": self.activation_digest,
        }, sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def get_code_slot(self) -> u256:
        return gl.storage.Root.get().code_slot

    @gl.public.view
    def get_installer(self) -> Address:
        return self.installer

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner

    @gl.public.view
    def get_case_count(self) -> u256:
        return self.case_count

    @gl.public.write
    def stage_chunk(
        self,
        index: u256,
        total_chunks: u256,
        chunk: bytes,
        source_digest: str,
    ) -> None:
        self._require_installer()
        if not _valid_digest(source_digest):
            raise gl.vm.UserError("[EXPECTED] invalid source digest")
        if index != self.next_chunk:
            raise gl.vm.UserError("[EXPECTED] chunk is not the next sequential chunk")
        if not 1 <= total_chunks <= MAX_CHUNKS:
            raise gl.vm.UserError("[EXPECTED] invalid chunk count")
        if self.total_chunks == 0:
            if index != 0:
                raise gl.vm.UserError("[EXPECTED] first chunk must be zero")
            self.total_chunks = total_chunks
            self.expected_digest = source_digest.lower()
        elif total_chunks != self.total_chunks or source_digest.lower() != self.expected_digest:
            raise gl.vm.UserError("[EXPECTED] chunk manifest mismatch")
        if not isinstance(chunk, bytes) or not 0 < len(chunk) <= MAX_CHUNK_BYTES:
            raise gl.vm.UserError("[EXPECTED] invalid bounded chunk")
        if self.staged_bytes + len(chunk) > MAX_SOURCE_BYTES:
            raise gl.vm.UserError("[EXPECTED] staged source too large")
        self._staged_code().extend(chunk)
        self.staged_bytes += len(chunk)
        self.next_chunk += 1

    @gl.public.write
    def reset_installation(self) -> None:
        self._require_installer()
        self._staged_code().truncate()
        self.expected_digest = ZERO_DIGEST
        self.total_chunks = u256(0)
        self.next_chunk = u256(0)
        self.staged_bytes = u256(0)
        self.activation_digest = ZERO_DIGEST

    @gl.public.write
    def activate(self) -> None:
        self._require_installer()
        if self.total_chunks == 0 or self.next_chunk != self.total_chunks:
            raise gl.vm.UserError("[EXPECTED] incomplete staged source")
        staged = self._staged_code()
        if len(staged) != self.staged_bytes:
            raise gl.vm.UserError("[EXPECTED] staged length mismatch")
        digest = "0x" + hashlib.sha256(bytes(staged)).hexdigest()
        if digest.lower() != self.expected_digest:
            raise gl.vm.UserError("[EXPECTED] staged source digest mismatch")
        root = gl.storage.Root.get()
        root.code_slot = root.get_vacant_slot().as_int()
        self.activation_digest = digest
        self.activated = True
        root.upgraders.get().truncate()
