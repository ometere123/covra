"""AST lint plus v0.3 SDK semantic/schema validation against the verified Manager bundle.

The legacy genvm-lint loader expects TAR and genlayer.py.get_schema. This adapter
loads exact declared ZIP dependencies and calls the actual v0.3 __get_schema__ API.
It does not emulate VM execution, web requests, storage types or consensus.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from gltest.direct import sdk_loader
from genvm_linter.lint import lint_contract

root = Path(__file__).resolve().parents[1]
contract = root / "contracts/genlayer/CovraAdjudicator.py"
archive = root / ".runtime/genvm-universal.tar.xz"
with archive.open("rb") as stream:
    if hashlib.file_digest(stream, "sha256").hexdigest() != "d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af":
        raise SystemExit("Official Manager bundle checksum mismatch")
dependencies = sdk_loader.parse_contract_header(contract)
seen = set()
paths = []
def include(family, digest):
    if (family, digest) in seen:
        return
    seen.add((family, digest))
    folder = root / ".runtime/manager-rc10" / family / digest
    if not folder.is_dir():
        raise RuntimeError("Missing exact dependency " + family + ":" + digest)
    paths.append(folder)
    for child_family, child_digest in sdk_loader.parse_runner_manifest(folder).items():
        include(child_family, child_digest)
for family, digest in dependencies.items():
    include(family, digest)
for folder in paths:
    sys.path.insert(0, str(folder / "src" if (folder / "src").is_dir() else folder))

lint = lint_contract(contract)
if not lint.ok:
    print(json.dumps({"ok": False, "lint": lint.to_dict()}))
    raise SystemExit(1)
spec = importlib.util.spec_from_file_location("covra_schema_validation", contract)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
schema = json.loads(module.CovraAdjudicator.__get_schema__())
expected = {"allow_evidence_host", "authorize_case_agent", "submit_case", "adjudicate", "appeal",
    "finalize_case", "get_case", "get_case_count", "get_case_id_at", "get_decision_digest"}
if set(schema["methods"]) != expected:
    raise SystemExit("Unexpected public ABI")
print(json.dumps({"ok": True, "lint": lint.to_dict(), "semanticBackend": "actual-v0.3-sdk-__get_schema__",
    "runner": dependencies, "sourceSha256": hashlib.sha256(contract.read_bytes()).hexdigest(), "schema": schema}, indent=2))
