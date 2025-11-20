from fastapi import Request, HTTPException
from hashlib import sha256
import hmac
import os
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN").encode()

def verify_telegram_initdata(init_data: str) -> dict:
    parsed = dict(pair.split("=", 1) for pair in init_data.split("&") if pair)
    received_hash = parsed.pop("hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = sha256(BOT_TOKEN).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), sha256).hexdigest()

    if calculated…. if calculated_hash != received_hash:
        raise HTTPException(status_code=403, detail="Invalid hash")

    # Возвращаем данные пользователя
    import json
    user_json = parsed.get("user")
    if user_json:
        return json.loads(user_json)
    return {}