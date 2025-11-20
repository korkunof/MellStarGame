from sqlalchemy import (
    Column, BigInteger, Integer, String, Float, DateTime, func, Boolean, Text
)
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)  # Telegram ID
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)

    level = Column(Integer, default=1)
    free_points = Column(Integer, default=0)           # нераспределённые очки уровня
    payout_bonus = Column(Integer, default=0)          # +X звёзд за цикл

    balance = Column(Float, default=0.0)               # звёзды (пока заглушка)

    # Таймер
    timer_started_at = Column(DateTime(timezone=True), nullable=True)
    current_checkpoint = Column(Integer, default=0)    # 0–5
    checkpoint_progress = Column(Float, default=0.0)   # секунд в текущем чекпоинте

    # Разгон и рефы
    ref_points = Column(Integer, default=0)            # сколько очков осталось
    current_boost_level = Column(Integer, default=0)   # 0–4 (до конца чекпоинта)

    referrer_id = Column(BigInteger, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class PurchasedAdSlot(Base):
    __tablename__ = "purchased_slots"

    id = Column(Integer, primary_key=True)
    advertiser_id = Column(BigInteger)
    channel_username = Column(String, index=True)      # @username или chat_id
    channel_name = Column(String)
    link = Column(String)
    slot_type = Column(String, default="стандарт")     # стандарт / VIP
    required_shows = Column(Integer)
    current_shows = Column(Integer, default=0)
    price_paid = Column(Float)
    status = Column(String, default="active")          # active / completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserSlot(Base):
    __tablename__ = "user_slots"

    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger, index=True)
    slot_id = Column(Integer, index=True)
    status = Column(String, default="active")          # active / need_subscribe / completed
    subscribed_at = Column(DateTime(timezone=True), nullable=True)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger)
    amount = Column(Float)
    reason = Column(String)  # "cycle_completed"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True)
    referrer_id = Column(BigInteger)
    referred_id = Column(BigInteger, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())