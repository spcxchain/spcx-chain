#!/usr/bin/env python3
"""Build the operator CLI from the checked-out sources and install it atomically."""
import argparse
import os
import sys
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

SOURCE = Path(__file__).resolve().parent / "validator"
FILES = (
    "__main__.py", "README.md", "chain-info.json", "watchtower.json",
    "ethers.cjs", "Ethers-LICENSE.md", "program.cjs", "compile.cjs",
    "contracts/ValidatorProgram.sol", "artifacts/ChildStake.json",
    "artifacts/ParentProgram.json", "lab/Asset.json", "lab/BridgeMock.json",
    "lab/Fixtures.sol", "lab/RollupMock.json", "lab/Sys.json",
    "lab/plans.test.cjs", "lab/test.cjs",
)


def install(bin_dir):
    bin_dir.mkdir(parents=True, exist_ok=True)
    target = bin_dir / "spcx-validator"
    with tempfile.NamedTemporaryFile(dir=bin_dir, prefix=".spcx-validator-", delete=False) as output:
        temp = Path(output.name)
    try:
        with temp.open("wb") as stream:
            stream.write(b"#!/usr/bin/env python3\n")
            with ZipFile(stream, "w") as archive:
                for filename in sorted(FILES):
                    entry = ZipInfo(filename, (1980, 1, 1, 0, 0, 0))
                    entry.create_system = 3
                    entry.external_attr = 0o100644 << 16
                    archive.writestr(entry, (SOURCE / filename).read_bytes(), compress_type=ZIP_DEFLATED)
        temp.chmod(0o755)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", type=Path, default=Path.home() / ".local" / "bin")
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        parser.exit(1, "Python 3.10 or newer is required.\n")
    try:
        target = install(args.bin_dir.expanduser().resolve())
    except OSError as exc:
        parser.exit(1, f"Installation failed: {exc}\n")
    print(f"Installed {target}")


if __name__ == "__main__":
    main()
