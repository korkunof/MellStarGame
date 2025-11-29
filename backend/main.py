# backend/main.py
import os
import json
import logging
import urllib.parse  # Для unquote initData
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends, HTTPException
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
from models import User
from auth import verify_telegram_initdata
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ======================
# Конфиг
# ======================
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

# Telegram бот
application = None
if BOT_TOKEN:
    application = Application.builder().token(BOT_TOKEN).build()

async def start(update: Update, context: CallbackContext):
    web_url = FRONTEND_URL or f"{WEBHOOK_URL.rsplit('/', 1)[0]}/"
    keyboard = [[InlineKeyboardButton("Играть", web_app=WebAppInfo(url=web_url))]]
    await update.message.reply_text(
        "Привет! Это <b>MellStarGame</b>\nНажми «Играть» и начни зарабатывать звёзды!",
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
    if application and WEBHOOK_URL:
        await application.initialize()
        await application.bot.set_webhook(url=WEBHOOK_URL)
        logger.info(f"Webhook установлен: {WEBHOOK_URL}")
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
# DB Dependency
# ======================
async def get_db():  # async def для async with
    async with AsyncSessionLocal() as session:
        yield session

# ======================
# Webhook Endpoint для Telegram (фикс 404)
# ======================
@app.post("/webhook")
async def webhook(request: Request):
    update = Update.de_json(await request.json(), application.bot)
    if update:
        await application.process_update(update)
    return {"status": "ok"}

# ======================
# API Endpoints
# ======================
@app.get("/api/user/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    logger.info(f"API GET /user/{user_id}: load/create")
    result = await db.get(User, user_id)
    if not result:
        result = User(
            id=user_id,
            level=1,
            free_points=0,
            ref_points=0,
            payout_bonus=0,
            balance=0.0
        )
        db.add(result)
        await db.commit()
        logger.info(f"Created new user via API: {user_id}")
        return {"new_user": True, "level": result.level, "free_points": result.free_points, "ref_points": result.ref_points, "payout_bonus": result.payout_bonus, "balance": result.balance, "current_boost_level": result.current_boost_level, "current_checkpoint": result.current_checkpoint, "checkpoint_progress": result.checkpoint_progress}
    else:
        logger.info(f"Existing user via API: {user_id}")
        return {"level": result.level, "free_points": result.free_points, "ref_points": result.ref_points, "payout_bonus": result.payout_bonus, "balance": result.balance, "current_boost_level": result.current_boost_level, "current_checkpoint": result.current_checkpoint, "checkpoint_progress": result.checkpoint_progress}

@app.post("/api/user/{user_id}")
async def save_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    logger.info(f"API POST /user/{user_id}: save {list(payload.keys())}")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    allowed = {
        "level", "free_points", "payout_bonus", "balance",
        "ref_points", "current_boost_level", "timer_started_at",
        "current_checkpoint", "checkpoint_progress"
    }
    for key, value in payload.items():
        if key in allowed and hasattr(user, key):
            setattr(user, key, value)

    await db.commit()
    return {"status": "saved"}

# ======================
# Главная + автосоздание при открытии WebApp
# ======================
@app.get("/")
async def root(request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")
    logger.info(f"Root GET: init_data len={len(init_data) if init_data else 0}, user-agent={request.headers.get('user-agent', 'unknown')}")

    created = False
    user_id = None  # Для лога в конце
    if init_data:
        if verify_telegram_initdata(init_data, BOT_TOKEN):
            logger.info("Root: initData auth OK, parsing...")
            try:
                for part in init_data.split("&"):
                    if part.startswith("user="):
                        encoded_user = part[5:]
                        user_str = urllib.parse.unquote(encoded_user)
                        user_info = json.loads(user_str)
                        user_id = user_info.get("id")
                        if user_id:
                            logger.info(f"Root: parsed user_id={user_id}, first_name={user_info.get('first_name')}, username={user_info.get('username')}")
                            db_user = await db.get(User, user_id)
                            if not db_user:
                                new_user = User(
                                    id=user_id,
                                    username=user_info.get("username"),
                                    first_name=user_info.get("first_name"),
                                    level=1,
                                    free_points=0,
                                    ref_points=0,
                                    payout_bonus=0,
                                    balance=0.0
                                )
                                db.add(new_user)
                                await db.commit()
                                created = True
                                logger.info(f"Root: CREATED new user {user_id} (first_name={user_info.get('first_name')})")
                            else:
                                logger.info(f"Root: existing user {user_id}")
                            break
                else:
                    logger.warning("Root: no 'user=' in initData parts")
            except json.JSONDecodeError as e:
                logger.error(f"Root: JSON decode fail after unquote: {e}, raw part[5:]={part[5:][:100] if 'part' in locals() else 'no part'}")
            except Exception as e:
                logger.error(f"Root: parse/unexpected error: {e}")
                await db.rollback()
        else:
            logger.warning("Root: initData auth FAIL (HMAC mismatch)")
    else:
        logger.warning("Root: no init_data header (not from Telegram WebApp?)")

    if created:
        logger.info(f"Root: User creation complete for {user_id}")

    return FileResponse("static/index.html")

# ======================
# Health
# ======================
@app.get("/health")
async def health():
    return {"status": "ok", "message": "MellStarGame ready"}

logger.info("Тест с новой машины!")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 10000)))