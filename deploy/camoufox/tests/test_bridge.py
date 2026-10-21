import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("CAMOUFOX_STUDIO_KEY", "test-only-key-" * 4)
os.environ.setdefault("CPM_DB_PATH", "/tmp/studio-bridge-tests/profiles.db")
import studio_bridge as bridge
from fastapi import HTTPException


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_unauthenticated_commands_cannot_launch_a_browser(self):
        for headers, status in [({}, 401), ({"X-Studio-Key": bridge.KEY, "origin": "http://evil.test"}, 403)]:
            with patch.object(bridge, "page_for_profile", new_callable=AsyncMock) as get_page:
                with self.assertRaises(HTTPException) as error:
                    await bridge.command(SimpleNamespace(headers=headers), bridge.Command(method="ensure"))
                self.assertEqual(error.exception.status_code, status)
                get_page.assert_not_called()

    async def test_ensure_never_navigates_or_retries_login(self):
        page = SimpleNamespace(goto=AsyncMock())
        result = await bridge.execute(page, bridge.Command(method="ensure"))
        self.assertIn("profile_id", result)
        page.goto.assert_not_called()

    async def test_navigation_rejects_untrusted_origins(self):
        page = SimpleNamespace(goto=AsyncMock())
        for url in ["http://www.threads.com/", "https://threads.com.evil.test/", "https://user@threads.com/", "file:///etc/passwd", "https://threads.com:444/"]:
            with self.assertRaises(HTTPException):
                await bridge.execute(page, bridge.Command(method="goto", args=[url, {}]))
        page.goto.assert_not_called()
        await bridge.execute(page, bridge.Command(method="goto", args=["https://www.threads.com/@mimiao.crm", {"waitUntil": "domcontentloaded"}]))
        page.goto.assert_awaited_once_with("https://www.threads.com/@mimiao.crm", wait_until="domcontentloaded")

    async def test_unknown_methods_are_rejected(self):
        with self.assertRaises(HTTPException):
            await bridge.execute(object(), bridge.Command(method="close"))

    async def test_fill_replaces_rich_editor_text_using_keyboard_events(self):
        target = SimpleNamespace(click=AsyncMock(), press=AsyncMock(), press_sequentially=AsyncMock(), fill=AsyncMock())
        calls = Mock()
        for name in ("click", "press", "press_sequentially", "fill"):
            calls.attach_mock(getattr(target, name), name)
        page = SimpleNamespace(get_by_role=Mock(return_value=target))
        text = "Що допомагає групі?\nНовий рядок 💜"
        await bridge.execute(page, bridge.Command(method="fill", args=[text], steps=[{"method":"get_by_role","args":["textbox"]}]))
        self.assertEqual([call[0] for call in calls.mock_calls], ["click", "press", "press", "press_sequentially"])
        self.assertEqual(target.press.await_args_list[0].args, ("ControlOrMeta+A",))
        self.assertEqual(target.press.await_args_list[1].args, ("Backspace",))
        target.press_sequentially.assert_awaited_once_with(text)
        target.fill.assert_not_called()

    async def test_lost_click_is_not_retried_and_error_text_is_private(self):
        page = SimpleNamespace(url="https://www.threads.com/")
        with patch.object(bridge, "page_for_profile", AsyncMock(return_value=page)), \
             patch.object(bridge, "execute", AsyncMock(side_effect=RuntimeError("private password"))) as execute:
            with self.assertRaises(HTTPException) as error:
                await bridge.command(SimpleNamespace(headers={"X-Studio-Key": bridge.KEY}), bridge.Command(method="click"))
            self.assertNotIn("private password", str(error.exception))
            execute.assert_awaited_once()

    async def test_media_cannot_escape_shared_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "media"
            root.mkdir()
            photo = root / "photo.jpg"
            photo.write_bytes(b"photo")
            secret = Path(directory) / "secret"
            secret.write_bytes(b"private")
            (root / "link.jpg").symlink_to(secret)
            with patch.object(bridge, "MEDIA_ROOT", root):
                self.assertEqual(bridge.media_files([str(photo)]), [str(photo)])
                for files in [[], [str(secret)], [str(root / "link.jpg")], [str(root / "../secret")]]:
                    with self.assertRaises(HTTPException):
                        bridge.media_files(files)

    async def test_automatic_backups_are_disabled(self):
        self.assertEqual(await bridge.ProfileBackupManager.create_due_backups(object()), [])


if __name__ == "__main__":
    unittest.main()
