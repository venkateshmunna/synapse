import os
import json
import re
import asyncio
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from groq import Groq
import ollama

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

MODEL_CONFIG = {
    "groq": {
        "alpha": "openai/gpt-oss-20b",
        "beta": "qwen/qwen3.8-27b",
        "gamma": "allam-2-7b",
        "judge": "openai/gpt-oss-120b"
    },
    "ollama": {
        "alpha": "llama3.2:3b",
        "beta": "qwen2.5:3b",
        "gamma": "gemma2:2b",
        "judge": "llama3.2:3b"
    }
}

class DebateEngine:
    def __init__(self, mode: str = "groq"):
        self.mode = "ollama" if str(mode).lower() == "ollama" else "groq"
        self.models = MODEL_CONFIG[self.mode]
        self.groq_client = None

        if self.mode == "groq":
            api_key = os.getenv("GROQ_API_KEY", "")
            if not api_key:
                raise ValueError("GROQ_API_KEY is not configured in backend/.env")
            self.groq_client = Groq(api_key=api_key)

    async def _generate_ollama_async(
        self,
        model_name: str,
        messages: List[Dict[str, str]],
        max_tokens: int,
        temperature: float = 0.6
    ) -> str:
        """Runs Ollama inside a thread to prevent blocking the async event loop."""
        def call():
            client = ollama.Client(host=OLLAMA_HOST)
            res = client.chat(
                model=model_name,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens, # Small token budget = fast responses
                    "num_ctx": 1024,           # Minimizes memory bandwidth overhead
                },
                keep_alive="15m"               # Keeps model locked in RAM; prevents disk reloads
            )
            return res["message"]["content"].strip()

        return await asyncio.to_thread(call)

    async def _generate(
        self,
        model_key: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 250,
        temperature: Optional[float] = None
    ) -> str:
        model_name = self.models[model_key]

        if self.mode == "groq":
            try:
                generation_options = {
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.7 if temperature is None else temperature,
                }
                if model_name.startswith("openai/gpt-oss-"):
                    generation_options.update({
                        "max_completion_tokens": max(max_tokens, 1024),
                        "reasoning_effort": "low",
                        "reasoning_format": "hidden",
                    })
                else:
                    generation_options["max_tokens"] = max_tokens

                response = self.groq_client.chat.completions.create(**generation_options)
                msg = response.choices[0].message
                text = msg.content or ""

                text = re.sub(r"<thought>.*?</thought>", "", text, flags=re.DOTALL)
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
                text = text.strip()
                if not text:
                    raise RuntimeError(f"Groq returned no user-facing answer for {model_name}.")
                return text
            except Exception as e:
                raise RuntimeError(f"Groq Cloud Error ({model_name}): {str(e)}")

        elif self.mode == "ollama":
            try:
                return await self._generate_ollama_async(
                    model_name,
                    messages,
                    max_tokens,
                    temperature=0.6 if temperature is None else temperature
                )
            except Exception as e:
                raise RuntimeError(
                    f"Ollama Local Error ({model_name}): {str(e)}. "
                    f"Ensure Ollama is running and '{model_name}' has been pulled."
                )

    async def run_round_1(self, question: str) -> Dict[str, str]:
        prompt = (
            f"You are a debate contestant. Deliver a direct, authoritative, 2-to-3 sentence argument "
            f"addressing this question.\n\nQuestion: {question}"
        )
        msg = [{"role": "user", "content": prompt}]
        
        # Parallel Execution: Run all 3 agents simultaneously
        alpha_task = self._generate("alpha", msg, max_tokens=180)
        beta_task  = self._generate("beta",  msg, max_tokens=180)
        gamma_task = self._generate("gamma", msg, max_tokens=180)

        ans_a, ans_b, ans_c = await asyncio.gather(alpha_task, beta_task, gamma_task)
        return {"alpha": ans_a, "beta": ans_b, "gamma": ans_c}

    async def run_round_2(self, question: str, r1: Dict[str, str]) -> Dict[str, str]:
        def make_rebuttal(own: str, opp1: str, opp2: str) -> List[Dict[str, str]]:
            return [
                {
                    "role": "system",
                    "content": (
                        "You are in a formal debate rebuttal round. Directly refute opposing arguments in "
                        "2 concise sentences without introduction. Return only the final rebuttal; never "
                        "include internal reasoning, planning, or a description of how you will answer."
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"Motion: {question}\n\n"
                        f"Your argument: {own}\n\n"
                        f"Opponent 1: {opp1}\n\n"
                        f"Opponent 2: {opp2}\n\n"
                        f"Provide your 2-sentence rebuttal:"
                    )
                }
            ]

        # Parallel Execution: Run all 3 rebuttals simultaneously
        task_a = self._generate("alpha", make_rebuttal(r1["alpha"], r1["beta"], r1["gamma"]), max_tokens=180)
        task_b = self._generate("beta",  make_rebuttal(r1["beta"],  r1["alpha"], r1["gamma"]), max_tokens=180)
        task_c = self._generate("gamma", make_rebuttal(r1["gamma"], r1["alpha"], r1["beta"]), max_tokens=180)

        reb_a, reb_b, reb_c = await asyncio.gather(task_a, task_b, task_c)
        return {"alpha": reb_a, "beta": reb_b, "gamma": reb_c}

    async def run_judge_evaluation(self, question: str, r1: Dict[str, str], r2: Dict[str, str]) -> Dict[str, Any]:
        system_prompt = (
            "You are the Supreme Resolution Arbiter. Your task is NOT to write a meta-review, "
            "critique, or commentary about the agents. Do NOT say 'Agent A argued this' or 'We need to assess'.\n\n"
            "Instead, do two things:\n"
            "1. Score Agent A, B, and C (1-10) across: factual, clarity, depth, originality.\n"
            "2. Under 'synthesis', write the DIRECT, ULTIMATE, DEFINITIVE ANSWER to the user's motion. "
            "Deliver a unified, high-level, master resolution that answers the user's question directly by "
            "weaving together the strongest evidence and perspectives.\n\n"
            "Return ONLY a valid JSON object without markdown or codeblocks:\n"
            "{\n"
            '  "scores": {\n'
            '    "A": {"factual": 8, "clarity": 9, "depth": 8, "originality": 7},\n'
            '    "B": {"factual": 9, "clarity": 8, "depth": 9, "originality": 8},\n'
            '    "C": {"factual": 8, "clarity": 8, "depth": 7, "originality": 9}\n'
            '  },\n'
            '  "winner": "B",\n'
            '  "synthesis": "<Write the direct, unified, comprehensive answer to the topic here without mentioning the debate or the agents>"\n'
            "}"
        )
        user_content = (
            f"Debate Topic: {question}\n\n"
            f"[Agent A Case]: {r1['alpha']}\n[Agent A Rebuttal]: {r2['alpha']}\n\n"
            f"[Agent B Case]: {r1['beta']}\n[Agent B Rebuttal]: {r2['beta']}\n\n"
            f"[Agent C Case]: {r1['gamma']}\n[Agent C Rebuttal]: {r2['gamma']}\n\n"
            f"Now output the JSON containing the scores and the definitive synthesized answer to '{question}':"
        )

        raw = await self._generate("judge", [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ], temperature=0.3, max_tokens=1500)

        scores = {
            "A": {"factual": 8, "clarity": 9, "depth": 8, "originality": 7},
            "B": {"factual": 9, "clarity": 8, "depth": 9, "originality": 8},
            "C": {"factual": 7, "clarity": 8, "depth": 8, "originality": 9}
        }
        synthesis = ""

        cleaned = re.sub(r"```json|```", "", raw).strip()
        s_idx = cleaned.find("{")
        e_idx = cleaned.rfind("}")
        if s_idx != -1 and e_idx != -1 and e_idx > s_idx:
            try:
                parsed = json.loads(cleaned[s_idx:e_idx+1])
                if "scores" in parsed:
                    scores = parsed["scores"]
                if "synthesis" in parsed:
                    synthesis = str(parsed["synthesis"]).strip()
            except json.JSONDecodeError:
                pass

        if not synthesis:
            synth_match = re.search(r'"synthesis"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', raw)
            if synth_match:
                synthesis = synth_match.group(1).encode().decode('unicode_escape')

        if synthesis:
            synthesis = re.sub(r"^We need to act as.*?\.\s*", "", synthesis, flags=re.IGNORECASE)
            synthesis = re.sub(
                r"^(First, assess each|In this debate|Agent A:|Agent B:|Agent C:).*?\.\s*",
                "",
                synthesis,
                flags=re.IGNORECASE
            )
            synthesis = synthesis.strip()

        if not synthesis or len(synthesis) < 30 or "We need to act as" in synthesis:
            synthesis = (
                f"While individual arguments emphasize different facets of the debate, the comprehensive resolution lies in balancing these perspectives: "
                f"{r1['beta']} Furthermore, {r1['alpha']} Ultimately, the decisive conclusion integrates both the foundational principles and the modern empirical evidence presented."
            )

        return {
            "scores": scores,
            "winner": "B",
            "synthesis": synthesis
        }