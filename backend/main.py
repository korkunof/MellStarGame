from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackContext
from dotenv import load_dotenv
import os
import logging
from telegram.constants import ParseMode

# === Наши новые модули ===
from database import engine, AsyncSessionLocal
from models import User, Referral
from auth import verify_telegram_initdata
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
FRONTEND_URL = os.getenv("FRONTEND_URL")

application = None
if BOT_TOKEN:
    application = Application.builder().token(BOT_TOKEN).build()

async def start(update: Update, context: CallbackContext):
    web_url = FRONTEND_URL or f"{WEBHOOK_URL.rsplit('/', 1)[0]}/static/index.html"
    keyboard = [[InlineKeyboardButton("Играть 🎮", web_app=WebAppInfo(url=web_url))]]
    await update.message.reply_text(
        "Привет! Это <b>MellStarGameBot</b>\nНажми играть и удерживай таймер 🚀",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode=ParseMode.HTML
    )

if application:
    application.add_handler(CommandHandler("start", start))

@asynccontextmanager
async def lifespan(app: FastAPI):
    if application and WEBHOOK_URL:
        await application.initialize()
        await application.bot.set_webhook(WEBHOOK_URL)
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

app.mount("/static", StaticFiles(directory="static", html=True), name="static")

@app.get("/")
async def home():
    return {"message": "MellStarGame backend готов! 🚀"}

@app.post("/webhook")
async def webhook(request: Request):
    if not application:
        return {"ok": False}
    data = await request.json()
    update = Update.de_json(data, application.bot)
    await application.process_update(update)
    return {"ok": True}

# === БАЗА ДАННЫХ ===
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

@app.get("/user/{user_id}")
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
        "current_checkpoint": result.current_checkpoint,
        "checkpoint_progress": result.checkpoint_progress,
        # ... можно добавить всё остальное
    }

@app.post("/user/{user_id}")
async def save_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    # Проверка подписи Telegram WebApp
    init_data = request.headers.get("X-Telegram-WebApp-InitData")
    if not init_data:
        raise HTTPException(403, "No init data")
    verify_telegram_initdata(init_data)

    payload = await request.json()

    user = await db.get(User, user_id)
    if not user:
        user = User(id=user_id)
        db.add(user)

    # Обновляем только разрешённые поля
    allowed_fields = {
        "level", "free_points", "payout_bonus", "balance",
        "ref_points", "current_boost_level",
        "timer_started_at", "current_checkpoint", "checkpoint_progress"
    }
    for key, value in payload.items():
        if key in allowed_fields and hasattr(user, key):
            setattr(user, key, value)

    await db.commit()
    return {"status": "saved"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 3000)), reload=True)