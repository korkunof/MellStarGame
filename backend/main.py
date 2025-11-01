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

# ===== ЗАГРУЗКА .ENV =====
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")  # например: https://mellstar-backend.onrender.com/webhook
FRONTEND_URL = os.getenv("FRONTEND_URL")  # например: https://mell-star-game.vercel.app

# ===== ИНИЦИАЛИЗАЦИЯ БОТА =====
application = None
if BOT_TOKEN:
    application = Application.builder().token(BOT_TOKEN).build()
else:
    logger.warning("⚠️ BOT_TOKEN не найден в .env — бот не будет активирован.")

# ===== ХЭНДЛЕР /start =====
async def start(update: Update, context: CallbackContext):
    user_id = update.effective_user.id if update.effective_user else "unknown"
    logger.info(f"Получена команда /start от {user_id}")

    web_url = FRONTEND_URL or (f"{WEBHOOK_URL.rsplit('/', 1)[0]}/static/index.html" if WEBHOOK_URL else "")
    if not web_url:
        web_url = "https://example.vercel.app/static/index.html"

    keyboard = [[InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=web_url))]]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        "Привет! Это <b>MellStarGameBot</b>.\nНажми <b>Играть</b>, чтобы открыть игру 🚀",
        reply_markup=reply_markup,
        parse_mode=ParseMode.HTML
    )

if application:
    application.add_handler(CommandHandler("start", start))

# ===== ЖИЗНЕННЫЙ ЦИКЛ =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    if application:
        await application.initialize()
        if WEBHOOK_URL:
            try:
                await application.bot.set_webhook(WEBHOOK_URL)
                logger.info(f"✅ Webhook установлен: {WEBHOOK_URL}")
            except Exception as e:
                logger.error(f"Ошибка установки webhook: {e}")
    yield
    if application:
        try:
            await application.shutdown()
            logger.info("🔻 Application завершён корректно.")
        except Exception as e:
            logger.error(f"Ошибка при завершении application: {e}")

# ===== FASTAPI =====
app = FastAPI(lifespan=lifespan)

# Разрешаем CORS для Telegram WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== МОНТИРУЕМ СТАТИКУ =====
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path, html=True), name="static")
    logger.info(f"📁 Статика подключена: {static_path}")
else:
    logger.warning("⚠️ Папка static не найдена!")

# ===== ROUTES =====
@app.get("/")
def home():
    return {"message": "✅ MellStarGameBot backend активен и готов!"}

@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not application:
        return {"status": "no bot"}
    try:
        data = await request.json()
        update = Update.de_json(data, application.bot)
        await application.process_update(update)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Ошибка при webhook: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

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

# ===== ЛОКАЛЬНЫЙ ЗАПУСК =====
if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Локальный запуск FastAPI (без webhook)")
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 3000)))
