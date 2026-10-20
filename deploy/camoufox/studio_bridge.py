"""Pinned CPM 0.6.0 integration. No Meta credentials, login attempts or retries."""
import asyncio
import hmac
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

# The owner explicitly opted out of automatic backups.
from camoufox_pm.core.backups import ProfileBackupManager


async def no_automatic_backups(self):
    return []


ProfileBackupManager.create_due_backups = no_automatic_backups

from camoufox_pm.main import app, lifespan as manager_lifespan
from camoufox_pm.api.dependencies import get_profile_manager, get_storage_manager
from camoufox_pm.api.principal import Principal
from camoufox_pm.core import auth

KEY = os.environ["CAMOUFOX_STUDIO_KEY"]
if len(KEY) < 32:
    raise RuntimeError("CAMOUFOX_STUDIO_KEY must contain at least 32 characters")
PROFILE_FILE = Path(os.environ.get("STUDIO_PROFILE_FILE", "/data/studio-profile-id"))
MEDIA_ROOT = Path(os.environ.get("MEDIA_DIR", "/app/data/media")).resolve()
lock = asyncio.Lock()
profile_id = ""
selected_page = None


@asynccontextmanager
async def lifespan(application):
    global profile_id
    async with manager_lifespan(application):
        storage = get_storage_manager()
        password = os.environ.pop("CPM_OWNER_PASSWORD", "")
        if not await storage.get_user_by_username("owner"):
            if len(password) < 16:
                raise RuntimeError("Initial CPM_OWNER_PASSWORD must be at least 16 characters")
            await storage.create_user(
                auth.new_user_id(), "owner", auth.hash_password(password),
                actor=Principal("system"),
            )
        manager = get_profile_manager()
        if PROFILE_FILE.exists():
            profile_id = PROFILE_FILE.read_text().strip()
            if not await manager.get_profile(profile_id):
                raise RuntimeError("Studio profile is missing; refusing to choose another account")
        else:
            profile = await manager.create_profile(
                "Mimiao Threads", generate_fingerprint=False,
                browser_settings={"os": "linux", "languages": ["en-US", "en"],
                                  "window_width": 1280, "window_height": 900},
                notes="Dedicated @mimiao.crm publishing profile. Do not delete while connected to Studio.",
            )
            profile_id = profile.id
            PROFILE_FILE.write_text(profile_id)
            PROFILE_FILE.chmod(0o600)
        yield


app.router.lifespan_context = lifespan


class Command(BaseModel):
    method: str
    args: list = Field(default_factory=list, max_length=4)
    steps: list = Field(default_factory=list, max_length=8)


def decode(value):
    if isinstance(value, dict):
        if set(value) == {"regex", "flags"}:
            flags = re.IGNORECASE if "i" in value["flags"] else 0
            return re.compile(value["regex"], flags)
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


def options(value):
    return {("wait_until" if k == "waitUntil" else k): v for k, v in (value or {}).items()}


def media_files(files):
    result = []
    if not isinstance(files, list) or not 1 <= len(files) <= 20:
        raise HTTPException(400, "Invalid attachments")
    for filename in files:
        candidate = Path(filename).resolve()
        if candidate.parent != MEDIA_ROOT or not candidate.is_file():
            raise HTTPException(400, "Attachment unavailable")
        result.append(str(candidate))
    return result


async def page_for_profile():
    global selected_page
    manager = get_profile_manager()
    if not manager.browser_sessions.is_running(profile_id):
        # Opening a fresh profile does not navigate to Instagram or retry login.
        await manager.launch_browser(profile_id, headless=False, window_size="1280x900")
        selected_page = None
    session = manager.browser_sessions.active_sessions[profile_id]
    context = session.camoufox.browser
    if selected_page is None or selected_page.is_closed():
        pages = context.pages
        if len(pages) > 1:
            raise HTTPException(409, "Leave one tab open in the Studio profile")
        selected_page = pages[0] if pages else await context.new_page()
        selected_page.set_default_timeout(15000)
        selected_page.set_default_navigation_timeout(45000)
    return selected_page


async def execute(page, command):
    method, args = command.method, decode(command.args)
    if method == "ensure":
        return {"profile_id": profile_id}
    # Navigation is limited to the ordinary Threads website.
    if method == "goto" and not command.steps:
        url = urlsplit(args[0])
        if url.scheme != "https" or url.hostname not in {"www.threads.com", "threads.com", "www.threads.net", "threads.net"} or url.username or url.port not in {None, 443}:
            raise HTTPException(400, "Unsupported navigation")
        await page.goto(args[0], **options(args[1]))
        return None
    target = page
    for step in command.steps:
        values = decode(step["args"])
        name = step["method"]
        if name in {"get_by_role", "get_by_text"}:
            target = getattr(target, name)(values[0], **options(values[1] if len(values) > 1 else {}))
        elif name == "locator":
            target = target.locator(values[0])
        elif name == "first":
            target = target.first
        else:
            raise HTTPException(400, "Unsupported locator")
    if method in {"count", "inner_text", "is_enabled"} and command.steps:
        return await getattr(target, method)()
    if method in {"wait_for", "click"} and command.steps:
        await getattr(target, method)(**options(args[0]))
    elif method == "get_attribute" and command.steps:
        return await target.get_attribute(args[0], **options(args[1]))
    elif method == "fill" and command.steps:
        await target.fill(args[0])
    elif method == "set_input_files" and command.steps:
        await target.set_input_files(media_files(args[0]))
    elif method in {"evaluate", "evaluate_all"}:
        # Code comes only from the authenticated Studio worker, never from UI input.
        return await getattr(target, method)(args[0])
    elif method == "wait_for_function" and not command.steps:
        handle = await page.wait_for_function(args[0], arg=args[1], **options(args[2]))
        await handle.dispose()
    else:
        raise HTTPException(400, "Unsupported operation")
    return None


@app.post("/studio/command", include_in_schema=False)
async def command(request: Request, body: Command):
    if not hmac.compare_digest(request.headers.get("X-Studio-Key", ""), KEY):
        raise HTTPException(401, "Authentication required")
    # Origin-bearing browser requests must never reach the worker control API.
    if request.headers.get("origin"):
        raise HTTPException(403, "Worker requests only")
    async with lock:
        try:
            async with asyncio.timeout(90):
                page = await page_for_profile()
                result = await execute(page, body)
                return {"url": page.url, "result": result}
        except HTTPException:
            raise
        except Exception:
            # Avoid leaking typed post text, URLs, passwords or DOM snippets.
            raise HTTPException(409, "Browser operation failed; inspect the profile") from None


# CPM mounts the static web UI at "/", so put this explicit route before it.
app.router.routes.insert(0, app.router.routes.pop())
