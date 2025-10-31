from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackContext
from dotenv import load_dotenv
import os
import asyncio
import logging
from telegram.constants import ParseMode

# Настраиваем логирование для дебага
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не найден в .env")

WEBHOOK_URL = os.getenv("WEBHOOK_URL")
if not WEBHOOK_URL:
    raise ValueError("WEBHOOK_URL не найден в .env")

app = FastAPI()

# CORS для фронта и TG
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Монтируем фронт на /static (directory="frontend" — создай папку в backend/)
app.mount("/static", StaticFiles(directory="frontend", html=True), name="static")

# Создаём приложение бота
application = Application.builder().token(BOT_TOKEN).build()

async def start(update: Update, context: CallbackContext):
    logger.info(f"Получена команда /start от {update.effective_user.id}")
    
    # Кнопка для Web App
    keyboard = [[InlineKeyboardButton("Играть", web_app=WebAppInfo(url="https://mellstargame.loca.lt/static/index.html"))]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Привет! Это MellStarGameBot. Нажми 'Играть' для старта игры с таймером и Stars!",
        reply_markup=reply_markup,
        parse_mode=ParseMode.HTML
    )

# Добавляем хэндлер
application.add_handler(CommandHandler("start", start))

@app.get("/")
def read_root():
    return {"message": "Сервер MellStarGameBot готов!"}

# Эндпоинт для пользователя (заглушка, возвращает default data, позже DB)
@app.get("/user/{user_id}")
async def get_user(user_id: int):
    logger.info(f"GET /user/{user_id}")
    return {
        "slots": [{"name": "Слот пустой", "status": "empty", "link": "", "logo": ""} for _ in range(5)],
        "progress": 0,
        "level": 1,
        "points": 0,
        "allocatedPoints": 0,
        "referralPoints": 0,
        "boostLevel": 0,
        "refLevelBonus": 0,
        "payoutBonus": 0,
        "adSlots": [],
        "totalUsers": 100
    }

# POST для сохранения пользователя (заглушка, логирует, позже DB)
@app.post("/user/{user_id}")
async def post_user(user_id: int, data: dict):
    logger.info(f"POST /user/{user_id}: {data}")
    return {"status": "saved"}

# Заглушки для других эндпоинтов
@app.post("/buy-slot")
async def buy_slot(data: dict):
    logger.info(f"POST /buy-slot: {data}")
    return {"status": "bought"}

@app.get("/verify-sub/{user_id}/{link}")
async def verify_sub(user_id: int, link: str):
    logger.info(f"GET /verify-sub/{user_id}/{link}")
    return {"verified": True}  # Заглушка (true for test, later getChatMember)

@app.get("/total-users")
async def total_users():
    return {"totalUsers": 100}

@app.post("/payout/{user_id}/{amount}")
async def payout(user_id: int, amount: int):
    logger.info(f"POST /payout/{user_id}/{amount}")
    return {"status": "paid"}

@app.post("/webhook")
async def webhook(request: Request):
    try:
        # Логируем входящий запрос для дебага
        json_data = await request.json()
        logger.info(f"Получен webhook update: {json_data}")
        
        update = Update.de_json(json_data, application.bot)
        if update:
            logger.info(f"Обработка update: {update.update_id}")
            await application.process_update(update)
        else:
            logger.warning("Не удалось распарсить update")
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Ошибка в webhook: {e}")
        return {"status": "error", "message": str(e)}, 500

# Startup event для webhook setup (фикс event loop)
@app.on_event("startup")
async def startup_event():
    try:
        await application.initialize()
        await application.bot.set_webhook(WEBHOOK_URL)
        logger.info(f"Webhook настроен на: {WEBHOOK_URL}")
        info = await application.bot.get_webhook_info()
        logger.info(f"Webhook info: url={info.url}, pending={info.pending_update_count}")
    except Exception as e:
        logger.error(f"Ошибка startup: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)