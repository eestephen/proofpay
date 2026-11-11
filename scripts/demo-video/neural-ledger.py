import asyncio, json, subprocess, edge_tts

OUT = r"C:\dev\ProofPay\demo-video\neural"
VOICE, RATE = "en-US-AvaNeural", "+6%"
lines = {
    "slide2": "Why it matters. Businesses lose an estimated five percent of revenue to fraud, and a typical fraud runs a year before it's caught. Four in five Singapore firms report late payments, mostly from slow approvals and invoicing.",
    "ledger": "The Ledger, on AG Grid: every payment and audit event across projects, with a budget chart.",
}

async def main():
    n = json.load(open(OUT + r"\neural.json"))
    for name, text in lines.items():
        path = f"{OUT}\\{name}.mp3"
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())
        item = {"name": name, "text": text, "file": path, "duration": dur}
        if name == "slide2":
            n["intro"][1] = item
        elif name == "demo1":
            d = next(x for x in n["demo"] if x["i"] == 1)
            d.update(item)
        else:
            n["ledger"] = item
        print(name, round(dur, 2))
    json.dump(n, open(OUT + r"\neural.json", "w"), indent=1)

asyncio.run(main())
