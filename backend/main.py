# backend/main.py
import os
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

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
WEBHOOK_URL = os.getenv("WEBHOOK_URL")          # например https://mellstar-backend.onrender.com/webhook
FRONTEND_URL = os.getenv("FRONTEND_URL", "")    # можно оставить пустым — будем отдавать сами

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
# Lifespan — установка webhook
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


# ======================
# DB сессия
# ======================
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# ======================
# Webhook для Telegram
# ======================
@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not application:
        return {"ok": False}
    data = await request.json()
    update = Update.de_json(data, application.bot)
    await application.process_update(update)
    return {"ok": True}


# ======================
# API: получение данных пользователя
# ======================
@app.get("/api/user/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.get(User, user_id)
    if not result:
        return {"new_user": True}
    return {
        "level": result.level,
        "free_points": result.free_points,
        "payout_bonus": result.payout_bonus,
        "balance": result.balance,
        "ref_points": result.ref_points,
        "current_boost_level": result.current_boost_level,
        "timer_started_at": result.timer_started_at.isoformat() if result.timer_started_at else None,
        "current_checkpoint": result.current_checkpoint,
        "checkpoint_progress": result.checkpoint_progress,
    }


# ======================
# API: сохранение данных пользователя
# ======================
@app.post("/api/user/{user_id}")
async def save_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData")
    if not init_data or not verify_telegram_initdata(init_data, BOT_TOKEN):
        raise HTTPException(403, "Invalid auth")

    payload = await request.json()

    user = await db.get(User, user_id)
    if not user:
        user = User(id=user_id)
        db.add(user)

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
# ОТДАЧА ФРОНТЕНДА + АВТОМАТИЧЕСКОЕ СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ
# ======================
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str, db: AsyncSession = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-WebApp-InitData", "")

    user_id = None
    user_info = None

    if init_data and verify_telegram_initdata(init_data, BOT_TOKEN):
        for part in init_data.split("&"):
            if part.startswith("user="):
                try:
                    user_info = json.loads(part[5:])
                    user_id = user_info.get("id")
                except:
                    pass
                break

        if user_id:
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
                logger.info(f"Новый пользователь создан автоматически: {user_id}")

    # Отдача статики
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    file_path = os.path.join(static_dir, full_path) if full_path else os.path.join(static_dir, "index.html")

    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join(static_dir, "index.html"))


# ======================
# Health check
# ======================
@app.get("/health")
async def health():
    return {"status": "ok", "backend": "MellStarGame running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 10000)), reload=True)