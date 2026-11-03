# SYNAPSE: Multi-LLM Debate & Answer Synthesis Platform

SYNAPSE is a local-first, multi-agent AI framework designed to overcome single-model cognitive bias. It coordinates independent language models in structured adversarial rounds to stress-test claims, challenge reasoning fallacies, and synthesize high-veracity solutions.

## Architecture

* **Agent Alpha (Logic & Structure):** Meta Llama 3 (Cloud: `llama-3.1-8b-instant`, Local: `llama3.2:3b`)
* **Agent Beta (Analysis & Precision):** Alibaba Qwen 2.5 (Cloud: `qwen-2.5-32b`, Local: `qwen2.5:3b`)
* **Agent Gamma (Perspective & Dialectics):** Google Gemma 2 (Cloud: `gemma2-9b-it`, Local: `gemma2:2b`)
* **Impartial Judge & Synthesizer:** Evaluates arguments on factual veracity, clarity, depth, and originality.

## Privacy & Zero-Data-Leak Mode

SYNAPSE features a dual-engine architecture:
* **Cloud Mode (Groq):** Real-time, ultra-low-latency inference via Groq API.
* **Local Mode (Ollama):** 100% private, on-device model orchestration. Zero tokens or prompt data leave the host system.

## Setup & Local Installation

### 1. Prerequisites
* Python 3.10+
* Ollama runtime (`https://ollama.com`)

### 2. Configure SMS notifications with Fast2SMS
Sign-in OTPs are sent by email using the SMTP settings. Fast2SMS is used only for optional debate-completion SMS notifications. Add these values to `backend/.env`:

```env
FAST2SMS_API_KEY=your_fast2sms_api_key
FAST2SMS_DLT_SENDER_ID=your_approved_sender_id
FAST2SMS_DLT_MESSAGE_ID=your_approved_dlt_message_id
```

Configure an approved DLT notification template with two variables, in order: debate motion, then synthesized answer. Phone numbers for notifications must be Indian mobile numbers; the app accepts a 10-digit number or the `+91` prefix.

### 3. Download Recommended 16 GB RAM Local Models
```bash
ollama pull llama3.2:3b
ollama pull qwen2.5:3b
ollama pull gemma2:2b