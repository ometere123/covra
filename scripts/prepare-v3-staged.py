"""Prepare and verify COVRA V3's offline staged-install artifacts.

Run with Python 3.12: python scripts/prepare-v3-staged.py --verify
The output directory must be new. No signing or RPC operations are performed.
"""

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts/genlayer/CovraAdjudicatorV3.py"
TEMPLATE = ROOT / "testbed/staged-upgrade/CovraV2Bootstrap.py"
HEADER = (
    '# v0.3.0\n'
    '# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }\n'
)
CHUNK_BYTES = 700
MAX_SOURCE_BYTES = 65536
MAX_CHUNKS = 96


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse(source):
    if not source.startswith(HEADER):
        raise ValueError("Unexpected runner header")
    return ast.parse(source)


def contract(tree):
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef)
               and [ast.unparse(base) for base in node.bases] == ["gl.contract.Contract"]]
    if len(classes) != 1:
        raise ValueError("Expected exactly one explicit GenLayer contract")
    return classes[0]


def fields(cls):
    return [node for node in cls.body if isinstance(node, ast.AnnAssign)]


def constructor(cls):
    return next(node for node in cls.body if isinstance(node, ast.FunctionDef)
                and node.name == "__init__")


def render(tree):
    return (HEADER + "\n" + ast.unparse(tree) + "\n").encode("utf-8")


def prepare(source, template):
    tree = parse(source.decode("utf-8").replace("\r\n", "\n"))
    replacement = contract(tree)
    init = constructor(replacement)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            if ast.get_docstring(node, clean=False) is not None and len(node.body) > 1:
                node.body.pop(0)
    compact = render(tree)
    if ast.dump(tree) != ast.dump(parse(compact.decode("utf-8"))):
        raise ValueError("Deployment artifact AST round trip changed")
    chunks = [compact[i:i + CHUNK_BYTES] for i in range(0, len(compact), CHUNK_BYTES)]
    if len(compact) > MAX_SOURCE_BYTES or not 1 <= len(chunks) <= MAX_CHUNKS:
        raise ValueError("Artifact exceeds the proven V2 installer bounds")

    template_tree = parse(template)
    bootstrap = contract(template_tree)
    installer_fields = fields(bootstrap)[6:]
    if [node.target.id for node in installer_fields] != [
        "installer", "expected_digest", "total_chunks", "next_chunk", "staged_bytes",
        "activated", "activation_digest",
    ]:
        raise ValueError("Installer template layout changed")
    reserved = {node.target.id for node in installer_fields}
    reserved.update(node.name for node in bootstrap.body if isinstance(node, ast.FunctionDef)
                    and node.name != "__init__")
    if reserved & ({node.target.id for node in fields(replacement)} |
                   {node.name for node in replacement.body if isinstance(node, ast.FunctionDef)}
                   - {"get_owner", "get_case_count"}):
        raise ValueError("Replacement collides with installer storage or methods")
    install_init = constructor(bootstrap).body
    if [ast.unparse(node.targets[0]) for node in install_init[:2]] != ["self.owner", "self.case_count"]:
        raise ValueError("Installer template initializer changed")
    bootstrap.name = replacement.name
    bootstrap.body = fields(replacement) + installer_fields + [
        node for node in bootstrap.body if isinstance(node, ast.FunctionDef)
    ]
    constructor(bootstrap).args = init.args
    constructor(bootstrap).body = init.body + install_init[2:]
    # Keep only imports and directly supported declarations. A constructor
    # requiring other helpers fails the pinned runtime test before publication.
    dependencies = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom))]
    template_tree.body = dependencies + template_tree.body
    stage = next(node for node in bootstrap.body if isinstance(node, ast.FunctionDef)
                 and node.name == "stage_chunk")
    stage.body[1:1] = ast.parse(
        f'if source_digest != "0x{digest(compact)}" or total_chunks != {len(chunks)}:\n'
        '    raise gl.vm.UserError("[EXPECTED] frozen V3 manifest mismatch")'
    ).body
    bootstrap_bytes = render(template_tree)
    if len(bootstrap_bytes) > 8192:
        raise ValueError("Bootstrap exceeds offline size budget")
    return compact, bootstrap_bytes, chunks


def schema(path):
    env = dict(os.environ, COVRA_GENLAYER_CONTRACT_PATH=str(path.resolve()),
               COVRA_EXPECTED_METHODS="")
    return json.loads(subprocess.check_output(
        [sys.executable, str(ROOT / "scripts/validate-bradbury-sdk.py")],
        cwd=ROOT, env=env, text=True, timeout=180,
    ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".runtime/v3-staged")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        raise SystemExit("Use Python 3.12 for reproducible generation")
    source = SOURCE.read_bytes()
    compact, bootstrap, chunks = prepare(source, TEMPLATE.read_text(encoding="utf-8"))
    manifest = {
        "version": "V3",
        "verification": "PREPARED_ONLY",
        "sourceSha256": digest(source),
        "artifactSha256": digest(compact),
        "bootstrapSha256": digest(bootstrap),
        "sourceBytes": len(compact),
        "chunkBytes": CHUNK_BYTES,
        "chunks": [{"index": i, "sha256": digest(chunk), "bytes": len(chunk)}
                   for i, chunk in enumerate(chunks)],
    }
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        artifact = work / "CovraAdjudicatorV3.py"
        installer = work / "CovraV3Bootstrap.py"
        artifact.write_bytes(compact)
        installer.write_bytes(bootstrap)
        if args.verify:
            readable = schema(SOURCE)
            packed = schema(artifact)
            boot = schema(installer)
            if readable["sourceSha256"] != manifest["sourceSha256"]:
                raise ValueError("Readable source changed during verification")
            if packed["sourceSha256"] != manifest["artifactSha256"]:
                raise ValueError("Compact schema validated different source")
            if readable["schema"] != packed["schema"]:
                raise ValueError("Compact and readable SDK schemas differ")
            if not {"get_protocol_version", "get_case_count", "get_decision_digest"} <= set(
                packed["schema"]["methods"]
            ):
                raise ValueError("Missing required V3 readbacks")
            if boot["sourceSha256"] != manifest["bootstrapSha256"]:
                raise ValueError("Bootstrap schema validated different source")
            subprocess.run(
                [sys.executable, "-m", "pytest", str(ROOT / "scripts/v3_staged_direct.py"),
                 "-q", "-s", "--tb=short", "-o", "faulthandler_timeout=30"],
                cwd=work, check=True, timeout=120,
                env=dict(os.environ, COVRA_V3_OFFLINE_ARTIFACT_DIR=str(work)),
            )
            if SOURCE.read_bytes() != source:
                raise ValueError("Readable source changed during verification")
            manifest["verification"] = "OFFLINE_SCHEMA_AND_SLOT_CHECKED"
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / "CovraAdjudicatorV3.py").write_bytes(compact)
    (args.output / "CovraV3Bootstrap.py").write_bytes(bootstrap)
    for i, chunk in enumerate(chunks):
        (args.output / f"chunk-{i:03d}.bin").write_bytes(chunk)
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()
