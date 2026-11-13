# v0.3.0
# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }

"""Replacement half of the disposable native code-slot proof."""

import genlayer as gl
from genlayer.types import *
import json


class Stageable(gl.contract.Contract):
    # Must remain byte-for-byte compatible with the bootstrap field order.
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
        # GenVM does not rerun __init__ during a code upgrade.  This method is
        # present only for schema/runtime validation of a deployable source.
        pass

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

    @gl.public.view
    def get_version(self) -> str:
        return "replacement-v2"

    @gl.public.write
    def increment(self, amount: u256) -> None:
        if amount <= 0 or amount > 1000:
            raise gl.vm.UserError("[EXPECTED] bounded increment")
        self.counter += amount
