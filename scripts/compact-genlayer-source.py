"""Generate a deterministic deployment artifact from a readable IC source.

Only Python comments and docstrings are removed. The pinned GenVM header is
retained verbatim. No imports, expressions, names, public methods, storage
declarations, or string literals used by the contract are rewritten.

The artifact must still pass the target SDK schema gate and the full Direct
Mode/adversarial suite before it can be considered for deployment.
"""

from __future__ import annotations

import ast
import hashlib
import sys
from pathlib import Path


HEADER_LINES = 2


def _is_docstring(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Expr)
        and isinstance(getattr(node, "value", None), ast.Constant)
        and isinstance(node.value.value, str)
    )


def _strip_docstrings(node: ast.AST) -> None:
    body = getattr(node, "body", None)
    if isinstance(body, list) and body and _is_docstring(body[0]):
        body.pop(0)
    for child in ast.iter_child_nodes(node):
        _strip_docstrings(child)


def compact(source_path: Path, output_path: Path) -> tuple[str, str]:
    source = source_path.read_text(encoding="utf-8")
    lines = source.splitlines()
    if len(lines) < HEADER_LINES or not lines[0].startswith("# v0.3."):
        raise SystemExit("source does not start with a pinned v0.3 runner header")
    if "py-genlayer:" not in lines[1]:
        raise SystemExit("source does not contain a pinned py-genlayer dependency")

    tree = ast.parse("\n".join(lines[HEADER_LINES:]), filename=str(source_path))
    _strip_docstrings(tree)
    body = ast.unparse(tree).rstrip() + "\n"
    artifact = "\n".join(lines[:HEADER_LINES]) + "\n\n" + body
    ast.parse(artifact, filename=str(output_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(artifact, encoding="utf-8", newline="\n")
    return (
        hashlib.sha256(source.encode("utf-8")).hexdigest(),
        hashlib.sha256(artifact.encode("utf-8")).hexdigest(),
    )


def main() -> int:
    source_path = Path(sys.argv[1] if len(sys.argv) > 1 else "contracts/genlayer/CovraAdjudicator.py")
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else "contracts/genlayer/generated/CovraAdjudicator.py")
    original_sha, compact_sha = compact(source_path, output_path)
    print({
        "source": str(source_path),
        "artifact": str(output_path),
        "sourceBytes": source_path.stat().st_size,
        "artifactBytes": output_path.stat().st_size,
        "sourceSha256": original_sha,
        "artifactSha256": compact_sha,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
