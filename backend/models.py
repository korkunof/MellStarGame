# backend/models.py
from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    String,
    Float,
    DateTime,
    Boolean,
    Text,
    func
)
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)  # Telegram ID
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)

    level = Column(Integer, default=1)
    free_points = Column(Integer, default=0)
    distributed_points = Column(Integer, default=0)  # ← НОВОЕ: Распределённые очки
    payout_bonus = Column(Integer, default=0)  # Допвыплаты (бонус к выплате)
    balance = Column(Float, default=0.0)

    timer_started_at = Column(DateTime(timezone=True), nullable=True)
    current_checkpoint = Column(Integer, default=0)
    checkpoint_progress = Column(Float, default=0.0)

    ref_points = Column(Integer, default=0)  # Реферальные очки
    current_boost_level = Column(Integer, default=0)
    referrer_id = Column(BigInteger, nullable=True)

    # ← НОВОЕ: Показатели за уровень
    current_slot_count = Column(Integer, default=5)  # Кол-во ячеек слотов
    timer_speed_multiplier = Column(Float, default=1.0)  # Скорость таймера
    payout_rate = Column(Float, default=1.0)  # Выплата звёзд (мультипликатор)

    # === НОВЫЕ ПОЛЯ ДЛЯ ПРОТОТИПА ТАЙМЕРА ===
    timer_progress = Column(Float, default=0.0)  # 0..100 %
    timer_running = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class PurchasedAdSlot(Base):
    __tablename__ = "purchased_slots"

    id = Column(Integer, primary_key=True)
    advertiser_id = Column(BigInteger)
    channel_username = Column(String, index=True)
    channel_name = Column(String)
    link = Column(String)
    slot_type = Column(String, default="standard")  # standard / vip / premium
    required_shows = Column(Integer)
    current_shows = Column(Integer, default=0)
    price_paid = Column(Float)
    status = Column(String, default="active")  # active / completing / completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserSlot(Base):
    __tablename__ = "user_slots"

    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger, index=True)
    slot_id = Column(Integer, index=True)
    status = Column(String, default="active")  # active / subscribed / completing / completed / need_subscribe
    subscribed_at = Column(DateTime(timezone=True), nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger)
    amount = Column(Float)
    reason = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True)
    referrer_id = Column(BigInteger)
    referred_id = Column(BigInteger, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())