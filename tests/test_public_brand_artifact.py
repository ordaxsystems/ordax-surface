"""Offline provenance and repeatability tests for the independent brand exporter."""
from __future__ import annotations

import importlib.util
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
