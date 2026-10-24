#!/usr/bin/env python3
"""Deterministic, read-only brand export from the Surface visual owner.

This produces a *candidate*, not a public release or a signed attestation.
The licensed font is owned by Surface; its OFL license is read from one pinned
OS Git blob, without creating another tracked maintenance copy of the license.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_REPOSITORY = "ordaxsystems/ordax-surface"
LICENSE_REPOSITORY = "ordaxsystems/ordax-os"
LICENSE_PATH = "third_party/licenses/Inter-OFL-1.1.txt"
LICENSE_GIT_BLOB = "556792990d740c111b4fee7fe1938dc90bcee2ce"
BRAND_INPUTS = {
    "assets/ordax-symbol.png": "system/surface/ui/brand/ordax-symbol.png",
    "assets/ordax-landscape.png": "system/surface/ui/brand/midnight-landscape.png",
    "assets/fonts/inter-latin-wght-normal.woff2":
        "system/surface/ui/fonts/inter-latin-wght-normal.woff2",
}
SOURCE_CSS = (
    "system/surface/ui/tokens.css",
    "system/surface/ui/meridian.tokens.css",
)
EXPECTED_FILES = frozenset((
    "assets/ordax-design-tokens.css",
    "assets/ordax-font.css",
    "assets/ordax-symbol.png",
    "assets/ordax-landscape.png",
    "assets/fonts/inter-latin-wght-normal.woff2",
    "assets/fonts/Inter-OFL-1.1.txt",
))
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ExportError(RuntimeError):
    pass


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise ExportError("Git source proof failed: " + " ".join(args))
    return result.stdout.strip()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def blob_id(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def read_tracked(repo: Path, relative: str, commit: str) -> tuple[bytes, dict]:
    if not SHA40.fullmatch(commit) or git(repo, "rev-parse", "HEAD") != commit:
        raise ExportError("checkout does not match pinned commit")
    target = repo / relative
    if target.is_symlink() or not target.is_file() or not target.resolve().is_relative_to(repo.resolve()):
        raise ExportError("missing, linked or external source: " + relative)
    expected = git(repo, "rev-parse", f"HEAD:{relative}")
    payload = target.read_bytes()
    if expected != blob_id(payload):
        raise ExportError("dirty/modified source: " + relative)
    return payload, {
        "repository": SOURCE_REPOSITORY if repo == ROOT else LICENSE_REPOSITORY,
        "commit": commit,
        "path": relative,
        "git_blob": expected,
        "sha256": sha256(payload),
    }


def css_blocks(data: bytes) -> list[tuple[str, str]]:
    css = re.sub(r"/\*[\s\S]*?\*/", "", data.decode("utf-8"))
    blocks: list[tuple[str, str]] = []
    depth = 0
    start = 0
    inside = 0
    header = ""
    for i, c in enumerate(css):
        if c == "{":
            if depth == 0:
                header = css[start:i].strip()
                inside = i + 1
            depth += 1
        elif c == "}":
            depth -= 1
            if depth < 0:
                raise ExportError("unbalanced CSS braces")
            if depth == 0:
                blocks.append((re.sub(r"\s+", " ", header), css[inside:i].strip()))
                start = i + 1
    if depth:
        raise ExportError("unbalanced CSS braces")
    return blocks


def make_css(tokens: bytes, meridian: bytes) -> tuple[bytes, bytes]:
    token_blocks = css_blocks(tokens)
    font = [(h, body) for h, body in token_blocks if h == "@font-face"]
    if len(font) != 1:
        raise ExportError("expected exactly one canonical Inter font rule")
    font_body = font[0][1]
    if 'url("./fonts/inter-latin-wght-normal.woff2")' not in font_body:
        raise ExportError("font CSS no longer references pinned local Inter file")
    font_css = "/* Derived from Surface tokens.css; no remote font. */\n"
    font_css += "@font-face {\n" + font_body + "\n}\n"

    result = ["/* Generated from Surface canonical CSS variables; do not edit. */"]
    seen: set[str] = set()
    count = {"tokens": 0, "meridian": 0}
    for origin, blocks in (("tokens", token_blocks), ("meridian", css_blocks(meridian))):
        for selector, body in blocks:
            if origin == "tokens":
                include = selector.startswith((":root,", "[data-ordax-theme=", "[data-ordax-contrast="))
            else:
                include = selector.startswith("[data-meridian]")
            if not include:
                continue
            if selector in seen:
                raise ExportError("duplicated canonical CSS owner selector")
            seen.add(selector)
            declarations = []
            for fragment in body.split(";"):
                declaration = fragment.strip()
                if not declaration:
                    continue
                if not re.match(r"^--[a-z0-9-]+\s*:", declaration):
                    if ":" not in declaration:
                        raise ExportError("malformed CSS variable rule: " + selector)
                    # Presentation declarations (font/color/color-scheme) and
                    # global resets belong to the product, not the brand export.
                    continue
                declarations.append("  " + declaration + ";")
            if not declarations:
                raise ExportError("canonical token block has no CSS variables")
            result.append(selector + " {\n" + "\n".join(declarations) + "\n}")
            count[origin] += 1
    if count["tokens"] < 4 or count["meridian"] != 2:
        raise ExportError("canonical token selector set changed; review export")
    rendered = ("\n".join(result) + "\n").encode("utf-8")
    if b"url(" in rendered or b"@import" in rendered:
        raise ExportError("brand tokens must not reference external assets")
    return rendered, font_css.encode("utf-8")


def read_sources(os_repo: Path, os_commit: str) -> tuple[dict[str, bytes], list[dict], str]:
    surface_commit = git(ROOT, "rev-parse", "HEAD")
    if not SHA40.fullmatch(surface_commit):
        raise ExportError("invalid Surface revision")
    inputs = {}
    provenance = []
    for dest, source in BRAND_INPUTS.items():
        inputs[dest], meta = read_tracked(ROOT, source, surface_commit)
        provenance.append(meta)
    css = []
    for source in SOURCE_CSS:
        data, meta = read_tracked(ROOT, source, surface_commit)
        css.append(data)
        provenance.append(meta)
    inputs["assets/ordax-design-tokens.css"], inputs["assets/ordax-font.css"] = make_css(*css)
    license_bytes, meta = read_tracked(os_repo, LICENSE_PATH, os_commit)
    if meta["git_blob"] != LICENSE_GIT_BLOB or b"SIL OPEN FONT LICENSE Version 1.1" not in license_bytes:
        raise ExportError("OS license provenance does not match the approved font license")
    inputs["assets/fonts/Inter-OFL-1.1.txt"] = license_bytes
    provenance.append(meta)
    return inputs, sorted(provenance, key=lambda x: (x["repository"], x["path"])), surface_commit


def safe_entries(directory: Path) -> dict[str, bytes]:
    if not directory.is_dir() or directory.is_symlink():
        raise ExportError("package missing or linked")
    names = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file() or p.is_symlink()}
    if names != EXPECTED_FILES | {"manifest.json"}:
        raise ExportError("unexpected/missing brand file inventory")
    files = {}
    for name in EXPECTED_FILES | {"manifest.json"}:
        file = directory / name
        if file.is_symlink() or not file.is_file():
            raise ExportError("linked/missing brand artifact: " + name)
        files[name] = file.read_bytes()
    return files


def verify(directory: Path, expected_commit: str, expected_manifest_sha256: str) -> dict:
    if not SHA40.fullmatch(expected_commit) or not SHA256.fullmatch(expected_manifest_sha256):
        raise ExportError("trusted SHA-40 and SHA-256 inputs required to verify release candidate")
    files = safe_entries(directory)
    if sha256(files["manifest.json"]) != expected_manifest_sha256:
        raise ExportError("manifest does not match externally supplied digest")
    try:
        manifest = json.loads(files["manifest.json"])
    except ValueError as exc:
        raise ExportError("invalid manifest JSON") from exc
    if (manifest.get("$schema") != "ordax.surface-brand-artifact/1"
            or manifest.get("artifact_class") != "ordax-brand"
            or manifest.get("status") != "candidate-not-published"
            or manifest.get("source_repository") != SOURCE_REPOSITORY
            or manifest.get("source_commit") != expected_commit
            or manifest.get("immutable") is not True):
        raise ExportError("untrusted artifact owner/revision/status")
    rows = manifest.get("files")
    if not isinstance(rows, list) or len(rows) != len(EXPECTED_FILES):
        raise ExportError("invalid brand manifest file count")
    if {r.get("path") for r in rows if isinstance(r, dict)} != EXPECTED_FILES:
        raise ExportError("invalid brand manifest file paths")
    for row in rows:
        data = files[row["path"]]
        if row.get("size") != len(data) or row.get("sha256") != sha256(data):
            raise ExportError("brand payload integrity mismatch: " + row["path"])
    sources = manifest.get("sources")
    if (not isinstance(sources, list) or len(sources) != len(BRAND_INPUTS) + len(SOURCE_CSS) + 1
            or {x.get("path") for x in sources if isinstance(x, dict)} !=
               set(BRAND_INPUTS.values()) | set(SOURCE_CSS) | {LICENSE_PATH}):
        raise ExportError("missing or duplicated source provenance")
    for item in sources:
        if (not SHA40.fullmatch(str(item.get("commit")))
                or not SHA40.fullmatch(str(item.get("git_blob")))
                or not SHA256.fullmatch(str(item.get("sha256")))):
            raise ExportError("malformed source proof")
        if item["repository"] == SOURCE_REPOSITORY and item["commit"] != expected_commit:
            raise ExportError("mixed Surface revisions")
        if item["path"] == LICENSE_PATH and (
            item["repository"] != LICENSE_REPOSITORY or item["git_blob"] != LICENSE_GIT_BLOB
        ):
            raise ExportError("invalid external font license provenance")
    if b'url("./fonts/inter-latin-wght-normal.woff2")' not in files["assets/ordax-font.css"]:
        raise ExportError("missing same-origin brand font dependency")
    return manifest


def build(directory: Path, os_repo: Path, os_commit: str) -> dict:
    directory = directory.resolve()
    if directory.is_relative_to(ROOT) or directory.is_relative_to(os_repo.resolve()):
        raise ExportError("candidate output must be outside versioned source")
    if directory.exists():
        raise ExportError("output exists; refusing overwrite")
    directory.parent.mkdir(parents=True, exist_ok=True)
    inputs, sources, surface_commit = read_sources(os_repo.resolve(), os_commit)
    if set(inputs) != EXPECTED_FILES:
        raise ExportError("invalid exporter output inventory")
    manifest = {
        "$schema": "ordax.surface-brand-artifact/1",
        "artifact_class": "ordax-brand",
        "status": "candidate-not-published",
        "source_repository": SOURCE_REPOSITORY,
        "source_commit": surface_commit,
        "immutable": True,
        "sources": sources,
        "files": [
            {"path": path, "size": len(data), "sha256": sha256(data)}
            for path, data in sorted(inputs.items())
        ],
    }
    payload = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temp = Path(tempfile.mkdtemp(prefix=".ordax-brand-", dir=directory.parent))
    try:
        for relative, data in inputs.items():
            target = temp / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (temp / "manifest.json").write_bytes(payload)
        temp.rename(directory)
    finally:
        if temp.exists():
            import shutil
            shutil.rmtree(temp)
    digest = sha256(payload)
    verify(directory, surface_commit, digest)
    return {"source_commit": surface_commit, "manifest_sha256": digest, "files": len(inputs)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    make = sub.add_parser("build")
    make.add_argument("--out-dir", type=Path, required=True)
    make.add_argument("--os-source-dir", type=Path, required=True)
    make.add_argument("--os-source-commit", required=True)
    check = sub.add_parser("verify")
    check.add_argument("--package-dir", type=Path, required=True)
    check.add_argument("--expected-source-commit", required=True)
    check.add_argument("--manifest-sha256", required=True)
    args = parser.parse_args()
    if args.command == "build":
        result = build(args.out_dir, args.os_source_dir, args.os_source_commit)
    else:
        result = verify(args.package_dir, args.expected_source_commit, args.manifest_sha256)
        result = {"source_commit": result["source_commit"], "verified": True}
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ExportError, OSError, UnicodeError) as error:
        print("SURFACE_BRAND_ARTIFACT=REJECTED " + str(error))
        raise SystemExit(1)
