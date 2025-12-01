import hashlib
import hmac
from typing import Dict

def verify_telegram_initdata(init_data: str, bot_token: str) -> bool:
    try:
        parsed_data: Dict[str, str] = {}
        for item in init_data.split("&"):
            if "=" in item:
                key, value = item.split("=", 1)
                parsed_data[key] = value

        hash_value = parsed_data.pop("hash", None)
        if not hash_value:
            return False

        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )

        secret_key = hashlib.sha256(bot_token.encode()).digest()
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(calculated_hash, hash_value)
    except Exception:
        return False
    
def verify_telegram_initdata(init_data: str, bot_token: str) -> bool:
    try:
        parsed_data: Dict[str, str] = {}
        for item in init_data.split("&"):
            if "=" in item:
                key, value = item.split("=", 1)
                parsed_data[key] = value

        hash_value = parsed_data.pop("hash", None)
        if not hash_value:
            return False

        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )

        secret_key = hashlib.sha256(bot_token.encode()).digest()
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(calculated_hash, hash_value)
    except Exception:
        return False

    # ← TEMP FOR TEST: Bypass auth (удали после теста)
    logging.getLogger(__name__).info("Auth bypassed for test")
    return True