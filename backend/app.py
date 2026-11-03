import traceback
import re
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import json

from database import init_db, get_db, User, DebateRecord
from debate_engine import DebateEngine
from otp_service import generate_otp, verify_otp, send_email_code
from notify_service import notify_debate_completion

app = FastAPI(title="SYNAPSE API", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

# Serve full frontend directory
app.mount("/app", StaticFiles(directory="../frontend", html=True), name="frontend")

class RequestOTP(BaseModel):
    target: str

class VerifyOTPRequest(BaseModel):
    target: str
    code: str
    full_name: Optional[str] = "User"

class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class DebateRequest(BaseModel):
    question: str
    mode: Optional[str] = "groq"
    recipient: Optional[str] = None

class SaveDebateRequest(BaseModel):
    question: str
    mode: str
    r1: dict
    r2: dict
    scores: dict
    synthesis: str
    user_email: Optional[str] = None

@app.post("/api/auth/request-otp")
def request_otp_endpoint(req: RequestOTP):
    target = req.target.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", target):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    code = generate_otp(target)
    success = send_email_code(target, code)

    if not success:
        raise HTTPException(status_code=502, detail="Failed to send verification code.")
    return {"status": "success", "message": f"Verification code sent to {target}"}

@app.post("/api/auth/verify-otp")
def verify_otp_endpoint(req: VerifyOTPRequest, db: Session = Depends(get_db)):
    target = req.target.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", target):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not verify_otp(target, req.code):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")

    user = db.query(User).filter(User.email == target).first()
    if not user:
        user = User(
            full_name=req.full_name or target.split("@")[0],
            email=target,
            hashed_password="OTP_VERIFIED_USER"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "status": "success",
        "user": {"full_name": user.full_name, "identifier": target}
    }

@app.post("/api/auth/register")
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=User.hash_password(user_data.password)
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "user": {"full_name": new_user.full_name, "email": new_user.email}}

@app.post("/api/auth/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not user.verify_password(credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Verify your email and password."
        )
    return {"status": "success", "user": {"full_name": user.full_name, "email": user.email}}

@app.post("/api/debate/run")
async def run_debate(req: DebateRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Motion/question cannot be empty.")
    
    try:
        engine = DebateEngine(mode=req.mode)
        r1 = await engine.run_round_1(req.question)
        r2 = await engine.run_round_2(req.question, r1)
        evaluation = await engine.run_judge_evaluation(req.question, r1, r2)
        if req.recipient:
            notify_debate_completion(
                req.recipient,
                req.question,
                evaluation.get("synthesis", "")
            )
        return {
            "status": "success",
            "mode": req.mode,
            "round1": r1,
            "round2": r2,
            "evaluation": evaluation
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/debate/save")
def save_debate(req: SaveDebateRequest, db: Session = Depends(get_db)):
    try:
        rec = DebateRecord(
            question=req.question,
            engine_used=req.mode,
            round1_alpha=req.r1.get("alpha"),
            round1_beta=req.r1.get("beta"),
            round1_gamma=req.r1.get("gamma"),
            round2_alpha=req.r2.get("alpha"),
            round2_beta=req.r2.get("beta"),
            round2_gamma=req.r2.get("gamma"),
            scores_json=json.dumps(req.scores),
            synthesis=req.synthesis,
            is_saved=1
        )
        db.add(rec)
        db.commit()
        return {"status": "success", "id": rec.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)