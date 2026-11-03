"""Verify and unpack the official Manager rc10 bundle for SDK-backed tests.

Download only from genlayerlabs/genvm-manager v0.6.0-rc10. Never substitute
another runner when the contract's content-addressed dependency is absent.
"""
from pathlib import Path
import hashlib
import io
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1] / ".runtime"
EXPECTED = "d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af"
archive = ROOT / "genvm-universal.tar.xz"
digest = hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()
if digest != EXPECTED:
    raise SystemExit("Official rc10 bundle checksum mismatch or incomplete download")

destination = ROOT / "manager-rc10"
destination.mkdir(exist_ok=True)
with tarfile.open(archive, "r:xz") as bundle:
    members = [entry for entry in bundle if entry.name.startswith("runners/") and entry.name.endswith(".zip")]
    for member in members:
        family, prefix, suffix = member.name.split("/")[1:]
        target = destination / family / (prefix + suffix.removesuffix(".zip"))
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(bundle.extractfile(member).read())) as runner:
            for item in runner.infolist():
                resolved = (target / item.filename).resolve()
                if not resolved.is_relative_to(target.resolve()):
                    raise SystemExit("Unsafe runner archive member")
            runner.extractall(target)
        print("Verified runner", family, target.name)
required = destination / "py-genlayer" / "babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0"
if not required.is_dir():
    raise SystemExit("Verified bundle does not contain the pinned Bradbury runner")
print("Pinned Bradbury runner available:", required)
