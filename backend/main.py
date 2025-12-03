# backend/main.py
import os
import json
import logging
import urllib.parse
from contextlib import asynccontextmanager
import asyncio
from random import shuffle
from datetime import datetime

from fastapi import FastAPI, Request, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from telegram import Update
from telegram.ext import Application, CommandHandler, CallbackContext
from telegram.constants import ParseMode
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from dotenv import load_dotenv

# === Наши модули ===
from database import engine, AsyncSessionLocal
from models import User, Base, PurchasedAdSlot, UserSlot
from auth import verify_telegram_initdata
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ======================
# Config
# ======================
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

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
# Telegram Webhook
# ======================
@app.post("/webhook")
async def webhook(request: Request):
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

    result = await db.get(User, user_id)
    if not result:
        result = User(
            id=user_id,
            level=1,
            free_points=0,
            distributed_points=0,
            ref_points=0,
            payout_bonus=0,
            balance=0.0,
            current_slot_count=5,
            timer_speed_multiplier=1.0,
            payout_rate=1.0
        )
        db.add(result)
        await db.commit()
        await db.refresh(result)

    return {
        "level": result.level,
        "free_points": result.free_points,
        "distributed_points": result.distributed_points,
        "ref_points": result.ref_points,
        "payout_bonus": result.payout_bonus,
        "balance": result.balance,
        "current_slot_count": result.current_slot_count,
        "timer_speed_multiplier": result.timer_speed_multiplier,
        "payout_rate": result.payout_rate,
        "current_boost_level": result.current_boost_level,
        "current_checkpoint": result.current_checkpoint,
        "checkpoint_progress": result.checkpoint_progress,
        # include timer fields to allow frontend sync
        "timer_progress": result.timer_progress,
        "timer_running": result.timer_running,
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
# API: get personal slots for user (assign if less than current_slot_count)
# ======================
@app.get("/api/user_slots/{user_id}")
async def get_user_slots(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    if init_data and not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Auth failed")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current_us_res = await db.execute(
        select(UserSlot).where(
            UserSlot.user_id == user_id,
            UserSlot.status.in_(["active", "subscribed"])
        )
    )
    current_user_slots = current_us_res.scalars().all()
    count_current = len(current_user_slots)

    # assign more if needed
    if count_current < user.current_slot_count:
        subq = exists().where(
            UserSlot.slot_id == PurchasedAdSlot.id,
            UserSlot.user_id == user_id
        )
        available_res = await db.execute(
            select(PurchasedAdSlot).where(
                PurchasedAdSlot.status == "active",
                ~subq
            )
        )
        available_slots = available_res.scalars().all()

        vip = [s for s in available_slots if s.slot_type == "vip"]
        std = [s for s in available_slots if s.slot_type != "vip"]
        shuffle(vip)
        shuffle(std)
        to_assign = (vip + std)[: (user.current_slot_count - count_current) ]

        for s in to_assign:
            db.add(UserSlot(user_id=user_id, slot_id=s.id, status="active"))
        await db.commit()

        current_us_res = await db.execute(
            select(UserSlot).where(
                UserSlot.user_id == user_id,
                UserSlot.status.in_(["active", "subscribed"])
            )
        )
        current_user_slots = current_us_res.scalars().all()

    # timer_running computed (true only when no 'active' slots)
    has_pending = any(us.status == "active" for us in current_user_slots)
    if user.timer_running != (not has_pending):
        user.timer_running = not has_pending
        await db.commit()

    # build response
    result = []
    for us in sorted(current_user_slots, key=lambda us: us.slot_id):
        slot = await db.get(PurchasedAdSlot, us.slot_id)
        if slot:
            result.append({
                "slot_id": slot.id,
                "title": slot.channel_name,
                "link": slot.link,
                "type": slot.slot_type,
                "status": us.status
            })


    return result

# ======================
# Subscribe slot
# ======================
@app.post("/api/subscribe_slot")
async def subscribe_slot(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    user_id = payload.get("user_id")
    slot_id = payload.get("slot_id")

    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    if init_data and not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Auth failed")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    us_res = await db.execute(select(UserSlot).where(UserSlot.user_id == user_id, UserSlot.slot_id == slot_id))
    user_slot = us_res.scalar()
    if not user_slot:
        raise HTTPException(status_code=404, detail="UserSlot not found")

    if user_slot.status != "active":
        return {"status": "already processed", "timer_running": user.timer_running}

    user_slot.status = "subscribed"
    user_slot.subscribed_at = datetime.utcnow()
    await db.commit()

    # schedule close task for this slot (per-user)
    background_tasks.add_task(close_slot_task, user_id, slot_id)

    # recompute timer_running
    cur_res = await db.execute(
        select(UserSlot).where(
            UserSlot.user_id == user_id,
            UserSlot.status.in_(["active", "subscribed"])
        )
    )
    cur_slots = cur_res.scalars().all()
    user.timer_running = not any(us.status == "active" for us in cur_slots)
    await db.commit()

    return {"status": "subscribed", "timer_running": user.timer_running}

# background task to close a subscribed slot after 60s (test)
async def close_slot_task(user_id: int, slot_id: int):
    await asyncio.sleep(60)
    async with AsyncSessionLocal() as db:
        us_res = await db.execute(select(UserSlot).where(UserSlot.user_id == user_id, UserSlot.slot_id == slot_id))
        user_slot = us_res.scalar()
        if user_slot and user_slot.status == "subscribed":
            user_slot.status = "completed"
            await db.commit()
            # after completion, next get_user_slots will assign a new slot for user if there are available ones

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
                                payout_rate=1.0
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
