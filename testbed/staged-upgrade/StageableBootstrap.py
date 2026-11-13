# v0.3.0
# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }

"""Disposable proof of the RC10 native alternate-code-slot mechanism.

This contract is intentionally unrelated to COVRA and never holds value.  It
stages a complete replacement source in the runtime's documented vacant slot,
then atomically changes Root.code_slot after checking the complete SHA-256
commitment.  The bootstrapper removes its own upgrader authorization during
activation; the replacement source does not expose the installer methods.
"""

import genlayer as gl
from genlayer.types import *
import hashlib
import json


MAX_CHUNK_BYTES = 1024
MAX_SOURCE_BYTES = 65536
MAX_CHUNKS = 64
ZERO_DIGEST = ""


def _valid_digest(value: str) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 66
        and value.startswith("0x")
        and all(ch in "0123456789abcdefABCDEF" for ch in value[2:])
    )


class Stageable(gl.contract.Contract):
    # This field order is part of the proof's compatibility contract.  The
    # replacement source declares the same fields in the same order.
    installer: Address
    expected_digest: str
    total_chunks: u256
    next_chunk: u256
    staged_bytes: u256
    activated: bool
    activation_digest: str
    counter: u256
    marker: str

    def __init__(self):
        self.installer = gl.message.sender_address
        self.expected_digest = ZERO_DIGEST
        self.total_chunks = u256(0)
        self.next_chunk = u256(0)
        self.staged_bytes = u256(0)
        self.activated = False
        self.activation_digest = ZERO_DIGEST
        self.counter = u256(0)
        self.marker = "bootstrap"
        # Root.upgraders is the runtime authorization for writes to the locked
        # root/code slots.  It is intentionally revoked on activation.
        gl.storage.Root.get().upgraders.get().append(self.installer)

    def _require_installer(self) -> None:
        if gl.message.sender_address != self.installer:
            raise gl.vm.UserError("[EXPECTED] installer only")
        if self.activated:
            raise gl.vm.UserError("[EXPECTED] installation already activated")

    def _staged_code(self):
        # RC10's Root.get_vacant_slot() is the documented alternate storage
        # slot used for bootstrapping.  The runtime's code_slot points to this
        # exact slot after activation; no source copy occurs during activation.
        return gl.storage.Root.get().get_vacant_slot().cast(gl.storage.VLA[gl.u8], 0)

    def _status(self) -> dict:
        return {
            "activated": self.activated,
            "expected_digest": self.expected_digest,
            "total_chunks": int(self.total_chunks),
            "next_chunk": int(self.next_chunk),
            "staged_bytes": int(self.staged_bytes),
            "activation_digest": self.activation_digest,
        }

    @gl.public.view
    def get_installation_status(self) -> str:
        return json.dumps(self._status(), sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def get_counter(self) -> u256:
        return self.counter

    @gl.public.view
    def get_marker(self) -> str:
        return self.marker

    @gl.public.view
    def get_installer(self) -> Address:
        return self.installer

    @gl.public.view
    def get_code_slot(self) -> u256:
        return gl.storage.Root.get().code_slot

    @gl.public.write
    def increment(self, amount: u256) -> None:
        if amount <= 0 or amount > 1000:
            raise gl.vm.UserError("[EXPECTED] bounded increment")
        self.counter += amount

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
        # The pointer write is constant-size.  The next GenVM invocation loads
        # source from this slot; this transaction never copies the 42KB source.
        root.code_slot = root.get_vacant_slot().as_int()
        self.activation_digest = digest
        self.activated = True
        # Revoking the only upgrader makes the root/code-slot transition final.
        root.upgraders.get().truncate()
