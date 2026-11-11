import asyncio, json, subprocess, edge_tts

OUT = r"C:\dev\ProofPay\demo-video\neural"
VOICE = "en-US-AvaNeural"
RATE = "+6%"

intro = [
    ("slide1", "This is ProofPay: AI agents that buy and pay, but only for verified work."),
    ("slide2", "Why it matters. Fraud examiners estimate businesses lose five percent of revenue to fraud, and a typical fraud runs a year before it's caught. And four in five Singapore firms report late payments, mostly from slow approvals and invoicing."),
    ("slide3", "ProofPay releases money in six steps. Proof is uploaded, Gemini checks it, and hard rules in code can only make it stricter. The owner approves, PayPal pays, and a signed webhook confirms. Let's see it live."),
]
outro = [
    ("slide10", "For a small firm paying out six hundred thousand dollars a year, we estimate about fifteen thousand dollars of benefit, for under nine hundred dollars of cost. That's an estimate to prove in a pilot."),
    ("slide12", "ProofPay. Proof first, then pay. Try it live, the passcode is in the README."),
]
async def say(name, text):
    path = f"{OUT}\\{name}.mp3"
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())
    return {"name": name, "text": text, "file": path, "duration": dur}

async def main():
    old = json.load(open(r"C:\dev\ProofPay\demo-video\narration.json", encoding="utf-8-sig"))
    demo = [(f"demo{o['i']}", o["text"]) for o in old if 1 <= o["i"] <= 8]
    res = {"intro": [], "demo": [], "outro": []}
    for k, items in (("intro", intro), ("demo", demo), ("outro", outro)):
        for n, t in items:
            res[k].append(await say(n, t))
    for d in res["demo"]:
        i = int(d["name"][4:])
        d["i"] = i
        d["slot"] = next(o["duration"] for o in old if o["i"] == i)
    json.dump(res, open(OUT + r"\neural.json", "w"), indent=1)
    for k in res:
        for d in res[k]:
            print(k, d["name"], round(d["duration"], 1), "slot", round(d.get("slot", 0), 1))

asyncio.run(main())
