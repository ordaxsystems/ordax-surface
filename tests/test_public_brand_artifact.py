"""Offline provenance and repeatability tests for the independent brand exporter."""
from __future__ import annotations

import importlib.util
import io
import tarfile
import os
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
SOURCE = HERE / "tools/public-artifacts/brand.py"
SPEC = importlib.util.spec_from_file_location("surface_brand_artifact", SOURCE)
brand = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(brand)


class BrandExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        value = os.environ.get("ORDAX_FROZEN_OS_LICENSE_SOURCE")
        if not value:
            raise RuntimeError("OS license checkout must be explicitly pinned, no implicit network fetch")
        cls.os_source = Path(value).resolve()
        cls.os_commit = os.environ["ORDAX_FROZEN_OS_LICENSE_COMMIT"]
        cls.surface_commit = brand.git(HERE, "rev-parse", "HEAD")

    def test_repeatability_and_correct_source_attribution(self):
        with tempfile.TemporaryDirectory() as temp:
            one, two = Path(temp) / "one", Path(temp) / "two"
            first = brand.build(one, self.os_source, self.os_commit)
            second = brand.build(two, self.os_source, self.os_commit)
            self.assertEqual(first, second)
            self.assertEqual(first["files"], 6)
            self.assertEqual(first["source_commit"], self.surface_commit)
            files1 = brand.safe_entries(one)
            files2 = brand.safe_entries(two)
            self.assertEqual(files1, files2)
            receipt = brand.verify(one, self.surface_commit, first["manifest_sha256"])
            self.assertEqual(receipt["status"], "candidate-not-published")
            self.assertEqual(receipt["source_repository"], "ordaxsystems/ordax-surface")
            license_source = [x for x in receipt["sources"] if x["path"] == brand.LICENSE_PATH]
            self.assertEqual(len(license_source), 1)
            self.assertEqual(license_source[0]["repository"], "ordaxsystems/ordax-os")
            self.assertEqual(license_source[0]["commit"], self.os_commit)
            self.assertTrue(all(
                x["commit"] == self.surface_commit for x in receipt["sources"]
                if x["repository"] == "ordaxsystems/ordax-surface"
            ))
            self.assertNotIn(b"@font-face", files1["assets/ordax-design-tokens.css"])
            self.assertNotIn(b"html[data-ordax-display-scale]", files1["assets/ordax-design-tokens.css"])
            self.assertIn(b"--md-canvas:", files1["assets/ordax-design-tokens.css"])
            self.assertIn(b"--ordax-text:", files1["assets/ordax-design-tokens.css"])
            self.assertEqual(files1["assets/fonts/Inter-OFL-1.1.txt"].count(b"SIL OPEN FONT LICENSE Version 1.1"), 1)

    def test_tampered_payload_and_manifest_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "candidate"
            receipt = brand.build(out, self.os_source, self.os_commit)
            css = out / "assets/ordax-font.css"
            css.write_bytes(css.read_bytes() + b"\n/* tampered */")
            with self.assertRaisesRegex(brand.ExportError, "payload integrity mismatch"):
                brand.verify(out, self.surface_commit, receipt["manifest_sha256"])
            with self.assertRaisesRegex(brand.ExportError, "output exists"):
                brand.build(out, self.os_source, self.os_commit)
            with self.assertRaisesRegex(brand.ExportError, "trusted SHA-40 and SHA-256"):
                brand.verify(out, self.surface_commit, "0")
            css.unlink()
            with self.assertRaisesRegex(brand.ExportError, "inventory"):
                brand.verify(out, self.surface_commit, receipt["manifest_sha256"])

    def test_wrong_os_revision_and_missing_trust_pin_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(brand.ExportError, "checkout does not match pinned"):
                brand.build(Path(temp) / "bad-source", self.os_source, "0" * 40)
            out = Path(temp) / "good-source"
            receipt = brand.build(out, self.os_source, self.os_commit)
            with self.assertRaisesRegex(brand.ExportError, "trusted SHA-40 and SHA-256"):
                brand.verify(out, "not-a-sha", receipt["manifest_sha256"])
            with self.assertRaisesRegex(brand.ExportError, "manifest does not match"):
                brand.verify(out, self.surface_commit, "0" * 64)

    def test_github_attestor_restricted_to_reviewed_main_and_exact_identity(self):
        workflow = (HERE / ".github/workflows/public-brand-candidate.yml").read_text()
        self.assertIn("attest-main-brand:", workflow)
        signer = workflow.split("  attest-main-brand:", 1)[1]
        self.assertIn("if: github.event_name == 'push' && github.ref == 'refs/heads/main'", signer)
        self.assertIn("needs: source-bound-brand", signer)
        self.assertIn("id-token: write", signer)
        self.assertIn("attestations: write", signer)
        self.assertIn("contents: read", signer)
        self.assertIn("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6", signer)
        self.assertIn("--signer-workflow ordaxsystems/ordax-surface/.github/workflows/public-brand-candidate.yml", signer)
        self.assertIn("--source-digest \"$GITHUB_SHA\"", signer)
        self.assertIn("--source-ref refs/heads/main", signer)
        self.assertIn("--deny-self-hosted-runners", signer)
        candidate = workflow.split("  attest-main-brand:", 1)[0]
        self.assertNotIn("id-token: write", candidate)
        self.assertNotIn("attestations: write", candidate)
        self.assertNotIn("permissions:\n  id-token: write", candidate)
        self.assertNotIn("gh release create", workflow)
        self.assertNotIn("push-to-registry: true", workflow)

    def test_signed_archive_shape_and_independent_pins(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            pack = directory / "brand"
            build_receipt = brand.build(pack, self.os_source, self.os_commit)
            archive = directory / "brand.tar.gz"
            # Include GNU tar's top-level '.' and parent directory entries.
            with tarfile.open(archive, mode="w:gz") as tar:
                tar.add(pack, arcname=".")
            pinned_digest = brand.sha256(archive.read_bytes())
            result = brand.verify_archive(
                archive, self.surface_commit,
                build_receipt["manifest_sha256"], pinned_digest,
            )
            self.assertEqual(result["source_commit"], self.surface_commit)
            with self.assertRaisesRegex(brand.ExportError, "externally approved"):
                brand.verify_archive(
                    archive, self.surface_commit,
                    build_receipt["manifest_sha256"], "0" * 64,
                )
            with self.assertRaisesRegex(brand.ExportError, "manifest does not match"):
                brand.verify_archive(
                    archive, self.surface_commit, "0" * 64, pinned_digest,
                )
            with self.assertRaisesRegex(brand.ExportError, "trusted source"):
                brand.verify_archive(
                    archive, "invalid", build_receipt["manifest_sha256"], pinned_digest,
                )

    def test_archive_rejects_links_traversal_and_duplicates_before_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cases = [
                ("traversal", [("../outside", "file")]),
                ("absolute", [("/tmp/outside", "file")]),
                ("symlink", [("./assets/ordax-symbol.png", "symlink")]),
                ("hardlink", [("./assets/ordax-symbol.png", "hardlink")]),
                ("duplicate", [("./manifest.json", "file"), ("./manifest.json", "file")]),
                ("unexpected", [("./assets/other.png", "file")]),
                ("invalid-depth", [("./assets/../manifest.json", "file")]),
            ]
            for label, items in cases:
                with self.subTest(label=label):
                    archive = root / (label + ".tar.gz")
                    with tarfile.open(archive, "w:gz") as tar:
                        for name, kind in items:
                            meta = tarfile.TarInfo(name)
                            if kind == "file":
                                meta.size = 4
                                tar.addfile(meta, io.BytesIO(b"test"))
                            else:
                                meta.type = (
                                    tarfile.SYMTYPE if kind == "symlink"
                                    else tarfile.LNKTYPE
                                )
                                meta.linkname = "../../outside"
                                tar.addfile(meta)
                    with self.assertRaisesRegex(
                        brand.ExportError, "unsafe|unexpected|duplicate"
                    ):
                        brand.verify_archive(
                            archive, self.surface_commit, "0" * 64,
                            brand.sha256(archive.read_bytes()),
                        )
                    self.assertFalse((root / "outside").exists())

    def test_durable_release_requires_explicit_manual_draft_and_signed_input(self):
        workflow = (HERE / ".github/workflows/public-brand-draft-release.yml").read_text()
        self.assertIn("on:\n  workflow_dispatch:", workflow)
        self.assertNotIn("\n  push:", workflow)
        self.assertNotIn("\n  pull_request:", workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)
        self.assertIn("test \"$CONFIRMATION\" = \"CREATE_DRAFT_ONLY\"", workflow)
        self.assertIn("test \"$(jq -r '.event' <<< \"$run_json\")\" = \"push\"", workflow)
        self.assertIn("test \"$(jq -r '.head_branch' <<< \"$run_json\")\" = \"main\"", workflow)
        self.assertIn(".head_sha' <<<", workflow)
        self.assertIn("attested-brand-main-$SOURCE_SHA", workflow)
        self.assertIn('echo "$ARCHIVE_SHA  $archive" | sha256sum --check', workflow)
        self.assertIn("gh attestation verify", workflow)
        self.assertIn("--source-ref refs/heads/main", workflow)
        self.assertIn("--source-digest \"$SOURCE_SHA\"", workflow)
        self.assertIn("brand.py verify-archive", workflow)
        self.assertIn("--archive-sha256 \"$ARCHIVE_SHA\"", workflow)
        self.assertIn("gh release create \"$tag\"", workflow)
        self.assertIn("--target \"$SOURCE_SHA\" --draft --prerelease --latest=false", workflow)
        self.assertIn("--json isDraft,isPrerelease,tagName,targetCommitish,assets", workflow)
        self.assertIn("(.isDraft == true)", workflow)
        self.assertIn("(.isPrerelease == true)", workflow)
        self.assertIn("(.tagName == $tag)", workflow)
        self.assertIn("(.targetCommitish == $sha)", workflow)
        self.assertIn("(.assets | length == 1)", workflow)
        self.assertIn("(.assets[0].name == $asset)", workflow)
        self.assertIn("(.assets[0].size == $size)", workflow)
        self.assertIn("gh release download \"$tag\"", workflow)
        self.assertIn('echo "$ARCHIVE_SHA  $downloaded" | sha256sum --check', workflow)
        self.assertIn('test -z "$tag_target" || test "$tag_target" = "$SOURCE_SHA"', workflow)
        self.assertNotIn('test "$tag_target" = "$SOURCE_SHA"', workflow)
        self.assertNotIn("gh release edit", workflow)
        self.assertNotIn("--draft=false", workflow)
        self.assertNotIn("--clobber", workflow)

    def test_source_css_mutation_guard_on_local_fixture(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            # The exporter reads the canonical font declaration strictly.
            data, _ = brand.read_tracked(
                HERE, "system/surface/ui/tokens.css", self.surface_commit
            )
            with self.assertRaisesRegex(brand.ExportError, "exactly one canonical Inter"):
                brand.make_css(data.replace(b"@font-face", b"@unknown"), b"")
            self.assertFalse(repo.joinpath("manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
