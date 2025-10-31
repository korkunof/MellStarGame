from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackContext
from dotenv import load_dotenv
import os
import logging
from telegram.constants import ParseMode

# ===== ЛОГИ =====
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===== ЗАГРУЗКА ПЕРЕМЕННЫХ =====
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")  # например: https://mellstar-backend.onrender.com/webhook

if not BOT_TOKEN:
    logger.warning("⚠️ BOT_TOKEN не найден в .env — Telegram бот не будет инициализирован.")
    application = None
else:
    application = Application.builder().token(BOT_TOKEN).build()


# ===== ТЕЛЕГРАМ ХЭНДЛЕРЫ =====
async def start(update: Update, context: CallbackContext):
    logger.info(f"Получена команда /start от {update.effective_user.id}")

    web_url = (
        f"{WEBHOOK_URL.rsplit('/', 1)[0]}/static/index.html"
        if WEBHOOK_URL else "https://mellstar-game.vercel.app"
    )

    keyboard = [[InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=f"{os.getenv('FRONTEND_URL')}/index.html"))]]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        "Привет! Это <b>MellStarGameBot</b>.\n"
        "Нажми <b>Играть</b>, чтобы открыть игру 🚀",
        reply_markup=reply_markup,
        parse_mode=ParseMode.HTML
    )


# ===== LIFESPAN =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    if application:
        await application.initialize()

        # Устанавливаем webhook только если задан URL (чтобы не падало локально)
        if WEBHOOK_URL:
            try:
                await application.bot.set_webhook(WEBHOOK_URL)
                logger.info(f"✅ Webhook установлен: {WEBHOOK_URL}")
                info = await application.bot.get_webhook_info()
                logger.info(f"Webhook info: url={info.url}, pending={info.pending_update_count}")
            except Exception as e:
                logger.error(f"Ошибка при установке webhook: {e}")
    yield
    if application:
        try:
            await application.bot.delete_webhook()
            await application.shutdown()
            logger.info("🔻 Webhook удалён, бот остановлен.")
        except Exception as e:
            logger.error(f"Ошибка при завершении: {e}")


# ===== FASTAPI APP =====
app = FastAPI(lifespan=lifespan)

# CORS для фронта и Telegram
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статика
frontend_path = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path, html=True), name="static")


# ===== ROUTES =====
@app.get("/")
def home():
    return {"message": "✅ MellStarGameBot backend активен и готов!"}


@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not application:
        logger.warning("⚠️ Webhook вызван, но бот не инициализирован (нет BOT_TOKEN).")
        return {"status": "no bot"}

    try:
        data = await request.json()
        logger.info(f"Получен update: {data}")
        update = Update.de_json(data, application.bot)
        await application.process_update(update)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Ошибка при обработке webhook: {e}")
        return {"status": "error", "message": str(e)}


# ===== ПРОСТЫЕ ЭНДПОИНТЫ =====
@app.get("/user/{user_id}")
async def get_user(user_id: int):
    logger.info(f"GET /user/{user_id}")
    return {
        "userId": user_id,
        "slots": [{"name": "Пусто", "status": "empty"} for _ in range(5)],
        "progress": 0,
        "level": 1,
        "points": 0
    }


@app.post("/user/{user_id}")
async def save_user(user_id: int, data: dict):
    logger.info(f"POST /user/{user_id}: {data}")
    return {"status": "saved"}


# ===== MAIN =====
if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Локальный запуск FastAPI (без webhook)")
    uvicorn.run(app, host="0.0.0.0", port=3000)
