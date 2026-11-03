import datetime
import hashlib
import os
import secrets
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = "sqlite:///./synapse.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def hash_password_salt(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{hashed}"

def verify_password_salt(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":")
        check = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        return secrets.compare_digest(hashed, check)
    except Exception:
        return False

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    debates = relationship("DebateRecord", back_populates="owner")

    def verify_password(self, password: str) -> bool:
        return verify_password_salt(password, self.hashed_password)

    @staticmethod
    def hash_password(password: str) -> str:
        return hash_password_salt(password)

class DebateRecord(Base):
    __tablename__ = "debates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    question = Column(Text, nullable=False)
    engine_used = Column(String(20), default="groq")
    round1_alpha = Column(Text)
    round1_beta = Column(Text)
    round1_gamma = Column(Text)
    round2_alpha = Column(Text)
    round2_beta = Column(Text)
    round2_gamma = Column(Text)
    scores_json = Column(Text)
    synthesis = Column(Text)
    is_saved = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="debates")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()