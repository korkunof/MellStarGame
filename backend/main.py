# backend/main.py
import os
import json
import logging
import urllib.parse
from contextlib import asynccontextmanager
import asyncio
from random import shuffle
from datetime import datetime, timezone, timedelta
import hashlib

from fastapi import FastAPI, Request, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from dotenv import load_dotenv

# === Наши модули ===
from database import engine, AsyncSessionLocal
from models import User, Base, PurchasedAdSlot, UserSlot
from auth import verify_telegram_initdata
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists, and_, or_, not_

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

# Telegram bot parts are optional for prototype
try:
    from telegram import Update
    from telegram.ext import Application, CommandHandler, CallbackContext
    from telegram.constants import ParseMode
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
    application = None
    if BOT_TOKEN:
        application = Application.builder().token(BOT_TOKEN).build()

    async def start(update: Update, context: CallbackContext):
        web_url = FRONTEND_URL or f"{WEBHOOK_URL.rsplit('/', 1)[0]}/"
        keyboard = [[InlineKeyboardButton("Играть", web_app=WebAppInfo(url=web_url))]]
        await update.message.reply_text(
            "Привет! Это <b>MellStarGame</b>\nНажми «Играть»!",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )

    if application:
        application.add_handler(CommandHandler("start", start))
except Exception:
    application = None

# ======================
# Lifespan
# ======================
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if application and WEBHOOK_URL:
        await application.initialize()
        await application.bot.delete_webhook(drop_pending_updates=True)
        await application.bot.set_webhook(url=WEBHOOK_URL)

    yield

    if application:
        await application.shutdown()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# ======================
# DB session
# ======================
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ======================
# Helpers
# ======================
def seeded_value_for_user_slot(user_id: int, slot_id: int):
    """Deterministic pseudo-random number [0..1) based on user and slot to keep stable order."""
    h = hashlib.md5(f"{user_id}:{slot_id}".encode('utf-8')).hexdigest()
    # take first 15 hex digits -> int
    v = int(h[:15], 16)
    return v / float(0xFFFFFFFFFFFFFFF)

async def ensure_user(db: AsyncSession, user_id: int):
    user = await db.get(User, user_id)
    if not user:
        # create default user
        user = User(
            id=user_id,
            level=1,
            free_points=0,
            distributed_points=0,
            ref_points=0,
            payout_bonus=0,
            balance=0.0,
            current_slot_count=5,
            timer_speed_multiplier=1.0,
            payout_rate=1.0,
            timer_progress=0.0,
            timer_running=False,
            current_checkpoint=0,
            checkpoint_progress=0.0
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user

# ======================
# Webhook (telegram optional)
# ======================
@app.post("/webhook")
async def webhook(request: Request):
    if not application:
        return {"status": "ok", "note": "no-telegram"}
    update_json = await request.json()
    update = Update.de_json(update_json, application.bot)
    if update:
        await application.process_update(update)
    return {"status": "ok"}

# ======================
# API: get user
# ======================
@app.get("/api/user/{user_id}")
async def get_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    if init_data and not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Auth failed")

    user = await db.get(User, user_id)
    if not user:
        user = await ensure_user(db, user_id)

    return {
        "level": user.level,
        "free_points": user.free_points,
        "distributed_points": user.distributed_points,
        "ref_points": user.ref_points,
        "payout_bonus": user.payout_bonus,
        "balance": user.balance,
        "current_slot_count": user.current_slot_count,
        "timer_speed_multiplier": user.timer_speed_multiplier,
        "payout_rate": user.payout_rate,
        "current_boost_level": user.current_boost_level,
        "current_checkpoint": user.current_checkpoint,
        "checkpoint_progress": user.checkpoint_progress,
        "timer_progress": user.timer_progress,
        "timer_running": user.timer_running,
    }

# ======================
# API: save user
# ======================
@app.post("/api/user/{user_id}")
async def save_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed = {
        "level", "free_points", "distributed_points", "payout_bonus", "balance",
        "ref_points", "current_boost_level", "timer_started_at",
        "current_checkpoint", "checkpoint_progress",
        "current_slot_count", "timer_speed_multiplier", "payout_rate",
        "timer_progress", "timer_running"
    }

    for key, value in payload.items():
        if key in allowed and hasattr(user, key):
            setattr(user, key, value)

    await db.commit()
    return {"status": "saved"}

# ======================
# Helper: pick available PurchasedAdSlot for user (exclude completed history)
# ======================
async def get_available_slots_for_user(db: AsyncSession, user_id: int):
    # exclude slots that user already had completed
    subq_completed = select(UserSlot.slot_id).where(UserSlot.user_id == user_id, UserSlot.status == "completed")
    res = await db.execute(
        select(PurchasedAdSlot).where(
            PurchasedAdSlot.status == "active",
            ~PurchasedAdSlot.id.in_(subq_completed)
        )
    )
    return res.scalars().all()

# ======================
# API: get personal slots for user (assign if less than current_slot_count)
# ======================
@app.get("/api/user_slots/{user_id}")
async def get_user_slots(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    if init_data and not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Auth failed")

    user = await ensure_user(db, user_id)

    # get current user slots with interesting statuses
    cur_res = await db.execute(
        select(UserSlot).where(
            UserSlot.user_id == user_id,
            UserSlot.status.in_(["active", "subscribed", "need_subscribe"])
        )
    )
    current_user_slots = cur_res.scalars().all()
    count_current = len(current_user_slots)

    # if less than desired, assign more
    if count_current < (user.current_slot_count or 5):
        available_slots = await get_available_slots_for_user(db, user_id)

        # separate VIP and standard
        vip = [s for s in available_slots if (s.slot_type or '').lower() in ("vip", "premium")]
        std = [s for s in available_slots if (s.slot_type or '').lower() not in ("vip", "premium")]

        # stable per-user ordering inside groups using seeded deterministic value
        vip_sorted = sorted(vip, key=lambda s: seeded_value_for_user_slot(user_id, s.id))
        std_sorted = sorted(std, key=lambda s: seeded_value_for_user_slot(user_id, s.id))

        to_assign = (vip_sorted + std_sorted)[: max(0, (user.current_slot_count or 5) - count_current)]

        for s in to_assign:
            db.add(UserSlot(user_id=user_id, slot_id=s.id, status="active"))
        await db.commit()

        cur_res = await db.execute(
            select(UserSlot).where(
                UserSlot.user_id == user_id,
                UserSlot.status.in_(["active", "subscribed", "need_subscribe"])
            )
        )
        current_user_slots = cur_res.scalars().all()

    # build response objects joined with PurchasedAdSlot data
    result = []
    for us in current_user_slots:
        slot = await db.get(PurchasedAdSlot, us.slot_id)
        if slot:
            result.append({
                "slot_id": slot.id,
                "channel_username": slot.channel_name or slot.channel_username,
                "link": slot.link,
                "type": slot.slot_type,
                "status": us.status,
                "subscribed_at": us.subscribed_at.isoformat() if us.subscribed_at else None
            })

    # Now sort result: VIP first, then standard; inside groups deterministic by seeded value
    def slot_sort_key(r):
        t = 0 if (r.get("type") or "").lower() in ("vip", "premium") else 1
        seeded = seeded_value_for_user_slot(user_id, r["slot_id"])
        return (t, seeded)

    result_sorted = sorted(result, key=slot_sort_key)

    # Ensure we always return exactly user.current_slot_count slots (fill with empties)
    needed = (user.current_slot_count or 5)
    if len(result_sorted) < needed:
        # append placeholders
        for i in range(needed - len(result_sorted)):
            result_sorted.append({
                "slot_id": None,
                "channel_username": None,
                "link": None,
                "type": None,
                "status": "empty"
            })

    # compute timer_running on server-side: RUN only when all visible slots are subscribed
    non_empty_slots = [r for r in result_sorted if r["slot_id"] is not None]
    all_subscribed = len(non_empty_slots) > 0 and all(r["status"] == "subscribed" for r in non_empty_slots)
    if user.timer_running != all_subscribed:
        user.timer_running = all_subscribed
        await db.commit()

    return result_sorted

# ======================
# POST subscribe_slot
# ======================
@app.post("/api/subscribe_slot")
async def subscribe_slot(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    user_id = payload.get("user_id")
    slot_id = payload.get("slot_id")

    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    if init_data and not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Auth failed")

    if not user_id or not slot_id:
        raise HTTPException(status_code=400, detail="user_id and slot_id required")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    us_res = await db.execute(select(UserSlot).where(UserSlot.user_id == user_id, UserSlot.slot_id == slot_id))
    user_slot = us_res.scalar()
    if not user_slot:
        raise HTTPException(status_code=404, detail="UserSlot not found")

    if user_slot.status == "subscribed":
        return {"status": "already_subscribed", "timer_running": user.timer_running}

    # mark subscribed
    user_slot.status = "subscribed"
    user_slot.subscribed_at = datetime.utcnow()
    await db.commit()

    # schedule close task for this slot (per-user)
    background_tasks.add_task(close_slot_task, user_id, slot_id)

    # recompute timer_running: true only when all visible slots for this user are subscribed
    cur_res = await db.execute(
        select(UserSlot).where(
            UserSlot.user_id == user_id,
            UserSlot.status.in_(["active", "subscribed", "need_subscribe"])
        )
    )
    cur_slots = cur_res.scalars().all()
    visible_slots = [s for s in cur_slots]  # list of UserSlot
    # build statuses map
    if visible_slots:
        user.timer_running = all(s.status == "subscribed" for s in visible_slots)
    else:
        user.timer_running = False
    await db.commit()

    return {"status": "subscribed", "timer_running": user.timer_running}

# ======================
# Background: close a subscribed slot after 60s (test)
# ======================
async def close_slot_task(user_id: int, slot_id: int):
    await asyncio.sleep(60)
    async with AsyncSessionLocal() as db:
        us_res = await db.execute(select(UserSlot).where(UserSlot.user_id == user_id, UserSlot.slot_id == slot_id))
        user_slot = us_res.scalar()
        if user_slot and user_slot.status == "subscribed":
            user_slot.status = "completed"
            await db.commit()

            # assign replacement slot for this user immediately (need_subscribe)
            # pick one available PurchasedAdSlot user hasn't completed
            subq_completed = select(UserSlot.slot_id).where(UserSlot.user_id == user_id, UserSlot.status == "completed")
            av_res = await db.execute(
                select(PurchasedAdSlot).where(
                    PurchasedAdSlot.status == "active",
                    ~PurchasedAdSlot.id.in_(subq_completed)
                )
            )
            available_slots = av_res.scalars().all()
            # exclude the slot we just completed
            available_slots = [s for s in available_slots if s.id != slot_id]
            # vip first, deterministic order per user
            vip = [s for s in available_slots if (s.slot_type or '').lower() in ("vip", "premium")]
            std = [s for s in available_slots if (s.slot_type or '').lower() not in ("vip", "premium")]
            vip_sorted = sorted(vip, key=lambda s: seeded_value_for_user_slot(user_id, s.id))
            std_sorted = sorted(std, key=lambda s: seeded_value_for_user_slot(user_id, s.id))
            pick = (vip_sorted + std_sorted)[:1]
            if pick:
                new_slot = pick[0]
                db.add(UserSlot(user_id=user_id, slot_id=new_slot.id, status="need_subscribe"))
                await db.commit()

            # update user's timer_running (should become False because new need_subscribe)
            user = await db.get(User, user_id)
            if user:
                # fetch remaining visible slots
                cur_res = await db.execute(
                    select(UserSlot).where(
                        UserSlot.user_id == user_id,
                        UserSlot.status.in_(["active", "subscribed", "need_subscribe"])
                    )
                )
                cur_slots = cur_res.scalars().all()
                user.timer_running = len(cur_slots) > 0 and all(s.status == "subscribed" for s in cur_slots)
                await db.commit()

# ======================
# get user progress (for polling)
# ======================
@app.get("/api/user_progress/{user_id}")
async def get_user_progress(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"timer_progress": user.timer_progress, "timer_running": user.timer_running}

# ======================
# Create slot (no auth)
# ======================
@app.post("/api/slot")
async def create_slot(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()

    new_slot = PurchasedAdSlot(
        advertiser_id=payload.get("advertiser_id", 0),
        channel_username=payload.get("channel_username", "unknown"),
        channel_name=payload.get("channel_name", "unknown"),
        link=payload.get("link", ""),
        slot_type=payload.get("slot_type", "standard"),
        required_shows=payload.get("required_shows", 1000),
        price_paid=0,
        status="active"
    )

    db.add(new_slot)
    await db.commit()
    await db.refresh(new_slot)

    return {"status": "created", "slot_id": new_slot.id}

# ======================
# Delete user slot (for tests) - removes the user's UserSlot entry
# ======================
@app.post("/api/delete_user_slot")
async def delete_user_slot(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    user_id = payload.get("user_id")
    slot_id = payload.get("slot_id")
    if not user_id or not slot_id:
        raise HTTPException(status_code=400, detail="user_id and slot_id required")
    us_res = await db.execute(select(UserSlot).where(UserSlot.user_id == user_id, UserSlot.slot_id == slot_id))
    user_slot = us_res.scalar()
    if not user_slot:
        return {"status": "not_found"}
    await db.delete(user_slot)
    await db.commit()
    return {"status": "deleted"}

# ======================
# Root
# ======================
@app.get("/")
async def root(request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")

    user_id = None
    if init_data and verify_telegram_initdata(init_data, BOT_TOKEN):
        try:
            for part in init_data.split("&"):
                if part.startswith("user="):
                    user_str = urllib.parse.unquote(part[5:])
                    user_info = json.loads(user_str)
                    user_id = user_info.get("id")
                    if user_id:
                        db_user = await db.get(User, user_id)
                        if not db_user:
                            new_user = User(
                                id=user_id,
                                username=user_info.get("username"),
                                first_name=user_info.get("first_name"),
                                level=1,
                                free_points=0,
                                distributed_points=0,
                                ref_points=0,
                                payout_bonus=0,
                                balance=0.0,
                                current_slot_count=5,
                                timer_speed_multiplier=1.0,
                                payout_rate=1.0,
                                timer_progress=0.0,
                                timer_running=False,
                                current_checkpoint=0,
                                checkpoint_progress=0.0
                            )
                            db.add(new_user)
                            await db.commit()
                    break
        except Exception:
            pass

    return FileResponse("static/index.html")

# ======================
# Health
# ======================
@app.get("/health")
async def health():
    return {"status": "ok", "message": "MellStarGame ready"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
