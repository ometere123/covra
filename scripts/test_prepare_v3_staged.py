"""Portable generator regressions. The pinned SDK gate uses actual V3 code."""

import ast
import runpy
import unittest

tool = runpy.run_path("scripts/prepare-v3-staged.py")
prepare = tool["prepare"]
template = tool["TEMPLATE"].read_text(encoding="utf-8")
source = tool["HEADER"] + """
import genlayer as gl
from genlayer.types import *

class Example(gl.contract.Contract):
    owner: Address
    case_count: u256
    v3_revision: u256

    def __init__(self):
        self.owner = gl.message.sender_address
        self.case_count = u256(0)
        self.v3_revision = u256(3)
"""


class StagedPreparationTests(unittest.TestCase):
    def test_reproducible_and_digest_is_frozen(self):
        artifact, bootstrap, chunks = prepare(source.encode(), template)
        self.assertEqual((artifact, bootstrap, chunks),
                         prepare(source.replace("\n", "\r\n").encode(), template))
        self.assertEqual(artifact, b"".join(chunks))
        self.assertIn(tool["digest"](artifact).encode(), bootstrap)
        packed_class = tool["contract"](ast.parse(artifact))
        boot_class = tool["contract"](ast.parse(bootstrap))
        self.assertEqual([ast.dump(f) for f in tool["fields"](packed_class)],
                         [ast.dump(f) for f in tool["fields"](boot_class)[:3]])
        self.assertEqual([ast.dump(n) for n in tool["constructor"](packed_class).body],
                         [ast.dump(n) for n in tool["constructor"](boot_class).body[:3]])

    def test_wrong_runner_rejected(self):
        with self.assertRaisesRegex(ValueError, "runner header"):
            prepare(source.replace("v0.3.0", "v0.3.1").encode(), template)

    def test_storage_collision_rejected(self):
        with self.assertRaisesRegex(ValueError, "collides"):
            prepare(source.replace("v3_revision", "activated").encode(), template)

    def test_oversized_source_rejected(self):
        oversized = source + "\nBIG = " + repr("a" * 66000)
        with self.assertRaisesRegex(ValueError, "installer bounds"):
            prepare(oversized.encode(), template)


if __name__ == "__main__":
    unittest.main()
